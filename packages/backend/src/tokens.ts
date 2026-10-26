import { createHmac, timingSafeEqual } from "node:crypto";
import type { Channel } from "./contracts.ts";

export function digestIdentifier(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function constantEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function unsubscribeToken(
  secret: string,
  contactId: string,
  channel: Channel,
  destinationHash: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({ contactId, channel, destinationHash, expires: now + 180 * 86_400_000 }),
  ).toString("base64url");
  return `${payload}.${digestIdentifier(secret, payload)}`;
}
export function readUnsubscribeToken(
  secret: string,
  token: string,
  now = Date.now(),
): { contactId: string; channel: Channel; destinationHash: string } | null {
  if (token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (
    extra ||
    !payload ||
    !signature ||
    !constantEqual(digestIdentifier(secret, payload), signature)
  )
    return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      typeof value.contactId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(value.contactId) ||
      !["email", "sms"].includes(value.channel) ||
      typeof value.destinationHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.destinationHash) ||
      !Number.isFinite(value.expires) ||
      value.expires < now
    )
      return null;
    return {
      contactId: value.contactId,
      channel: value.channel,
      destinationHash: value.destinationHash,
    };
  } catch {
    return null;
  }
}
