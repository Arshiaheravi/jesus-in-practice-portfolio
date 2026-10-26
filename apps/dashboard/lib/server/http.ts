import "server-only";

import { randomUUID } from "node:crypto";

import type { z } from "@jesus-in-practice/backend/validation";
import { NextResponse } from "next/server";

import { origin, requireLive, ServiceError } from "./config";

export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function assertOrigin(request: Request) {
  if (
    request.headers.get("origin") !== origin() ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ServiceError("FORBIDDEN", "This request must come from the member app.", 403);
}
export async function boundedText(request: Request, maximum = 16_384, timeoutMs = 10_000) {
  if (Number(request.headers.get("content-length") || 0) > maximum)
    throw new ServiceError("TOO_LARGE", "This request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new ServiceError("REQUEST_TIMEOUT", "The request took too long to arrive.", 408)),
      timeoutMs,
    );
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        throw new ServiceError("TOO_LARGE", "This request is too large.", 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  assertOrigin(request);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ServiceError("VALIDATION", "Send a JSON request.", 415);
  let data: unknown;
  try {
    data = JSON.parse(await boundedText(request));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("VALIDATION", "The request could not be read.");
  }
  const result = schema.safeParse(data);
  if (!result.success)
    throw new ServiceError("VALIDATION", "Check the information you entered and try again.");
  return result.data;
}
export function route(handler: (request: Request) => Promise<Response>, live = true) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    try {
      if (live) requireLive();
      const response = await handler(request);
      response.headers.set("X-Request-Id", requestId);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    } catch (error) {
      let code = "UNAVAILABLE",
        status = 503,
        message = "We couldn't complete this request. Please try again.";
      if (error instanceof ServiceError) ({ code, status, message } = error);
      else if (error instanceof Error && error.name === "InvalidWebhookError") {
        code = "INVALID_SIGNATURE";
        status = 400;
        message = "Webhook verification failed.";
      } else if (error instanceof Error && "code" in error) {
        const known = String(error.code).toUpperCase();
        if (["COMMERCE_POLICY_REQUIRED", "WAIVER_UNAVAILABLE"].includes(known)) {
          code = known;
          status = 409;
          message =
            "This charge cannot be waived. Check the approved commerce policy and current reservation status.";
        }
        if (known === "CONFIRMATION_REQUIRED") {
          code = "VALIDATION";
          status = 400;
          message = "Confirm the exact action before continuing.";
        }
        if (known === "OPERATOR_REQUIRED") {
          code = known;
          status = 403;
          message = "This account does not have access to this operator action.";
        }
        if (known === "NOT_FOUND") {
          code = known;
          status = 404;
          message = "This record could not be found.";
        }
        if (known === "PRACTICE_UNAVAILABLE") {
          code = known;
          status = 409;
          message =
            "This practice is no longer available. Refresh the library to choose a current practice.";
        }
        if (["INVALID_OPERATION", "INVALID_REASON"].includes(known)) {
          code = "VALIDATION";
          status = 400;
          message = "Check the request identifier, amount, and review reason.";
        }
        if (
          [
            "REFUND_UNAVAILABLE",
            "INSUFFICIENT_FUNDS",
            "REFUND_PENDING",
            "REFUND_MISMATCH",
            "PAYMENT_MISMATCH",
            "RECONCILIATION_REQUIRED",
            "RECONCILIATION_INCOMPLETE",
          ].includes(known)
        ) {
          code = known;
          status = 409;
          message =
            "This payment needs further review. Refresh its current status; no uncertain credit is released.";
        }
        if (error.name === "ContentError") {
          code = known;
          status = known.startsWith("AI_") ? 503 : 409;
          message = known.startsWith("AI_")
            ? "A draft could not be generated. Your inputs are kept. Check the AI configuration or try again later."
            : "This content action is not available. Check source permissions, passage coverage, and the latest review status.";
          if (known === "NOT_FOUND") {
            status = 404;
            message = "This content record could not be found.";
          }
          if (known === "PRACTICE_RESERVED") {
            status = 400;
            message = "Choose a new practice identifier; bundled practices cannot be replaced.";
          }
        }
        if (["CONFLICT", "WALLET_NOT_EMPTY", "PENDING_OPERATIONS"].includes(known)) {
          code = known;
          status = 409;
          message =
            known === "CONFLICT"
              ? "Your account changed in another tab. Reload the latest information before saving."
              : "Contact support to resolve your SMS credit or pending activity before deleting your account.";
        }
        if (known === "RATE_LIMIT") {
          code = known;
          status = 429;
          message = "Please wait before trying again.";
        }
        if (["INVALID_CURSOR", "INVALID_AMOUNT", "UNVERIFIED_CONTACT"].includes(known)) {
          code = "VALIDATION";
          status = 400;
          message =
            known === "UNVERIFIED_CONTACT"
              ? "Verify your contact details first."
              : "Check the information you entered.";
        }
        if (
          [
            "ACCOUNT_FINANCIAL_REVIEW",
            "ACCOUNT_DELETING",
            "WALLET_BLOCKED",
            "CONTACT_SUPPRESSED",
            "CHECKOUT_CONFLICT",
            "OPERATION_CONFLICT",
          ].includes(known)
        ) {
          code = known;
          status = 409;
          message =
            known === "CONTACT_SUPPRESSED"
              ? "This destination is blocked from messages. Contact support before enabling it."
              : "This account needs a support review before this action can continue.";
        }
      }
      // Log correlation and a safe category only, never inputs, tokens, notes or provider payloads.
      if (status >= 500)
        console.error(JSON.stringify({ requestId, code, event: "request_failed" }));
      const response = json({ error: { code, message, requestId } }, status);
      response.headers.set("X-Request-Id", requestId);
      if (status === 429) response.headers.set("Retry-After", "60");
      return response;
    }
  };
}
