import type {
  MemberBootstrap,
  MemberCommand,
  WalletEntry,
} from "@jesus-in-practice/backend/contracts";

import type { DemoState } from "@/lib/demo-model";
export type {
  MemberBootstrap,
  MemberCommand,
  WalletEntry,
} from "@jesus-in-practice/backend/contracts";

export const liveMode = process.env.NEXT_PUBLIC_APP_MODE === "live";

export interface HistoryItem {
  id: string;
  date: string;
  recordId: string;
}
export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
  total: number;
}
export interface DeliveryItem {
  id: string;
  practiceId: string;
  channel: "email" | "sms";
  status:
    | "queued"
    | "claimed"
    | "sending"
    | "submitted"
    | "delivered"
    | "failed"
    | "unknown"
    | "cancelled";
  scheduledAt: string;
  updatedAt: string;
  quoteCents: number | null;
  segments: number | null;
  failureCode: string | null;
}
export interface DeliveryPage {
  items: DeliveryItem[];
  nextCursor: string | null;
  total: number;
}
export type WalletData = MemberBootstrap["wallet"] & {
  entries: WalletEntry[];
  nextCursor: string | null;
  blockedReason?: string | null;
};

export class MemberApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  constructor(message: string, code: string, status: number, requestId?: string) {
    super(message);
    this.name = "MemberApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export async function memberRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new MemberApiError(
        typeof result?.error?.message === "string"
          ? result.error.message
          : "This request could not be completed. Please try again.",
        typeof result?.error?.code === "string" ? result.error.code : "UNAVAILABLE",
        response.status,
        typeof result?.error?.requestId === "string" ? result.error.requestId : undefined,
      );
    }
    if (result === null)
      throw new MemberApiError(
        "The service returned an unreadable response. Please refresh and try again.",
        "INVALID_RESPONSE",
        502,
      );
    return result as T;
  } catch (error) {
    if (error instanceof MemberApiError) throw error;
    if (init.signal?.aborted) throw error;
    throw new MemberApiError(
      controller.signal.aborted
        ? "The request timed out. Refresh to check whether your change was saved before trying again."
        : "Unable to connect. Check your connection and try again. Your draft has been kept.",
      controller.signal.aborted ? "TIMEOUT" : "NETWORK",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export function postMember<T>(path: string, body: unknown) {
  return memberRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}
export function memberError(error: unknown): string {
  if (error instanceof MemberApiError && error.code === "CONFLICT")
    return "Your account changed elsewhere. Your draft is still here. Refresh, then cancel to load the latest values before editing again.";
  return error instanceof Error
    ? error.message
    : "This change could not be saved. Please try again.";
}

/** Convert one existing UI edit into one explicit, atomic account command. */
function inferCommand(before: DemoState, after: DemoState): MemberCommand {
  if (
    after.onboarded !== before.onboarded ||
    (JSON.stringify(after.schedule) !== JSON.stringify(before.schedule) &&
      (after.source !== before.source ||
        JSON.stringify(after.topics) !== JSON.stringify(before.topics)))
  )
    return {
      type: "onboarding",
      source: after.source,
      topics: after.topics,
      channel: after.channel,
      timezone: after.timezone,
      schedule: after.schedule,
    };
  if (JSON.stringify(after.schedule) !== JSON.stringify(before.schedule))
    return {
      type: "schedule",
      schedule: after.schedule,
      channel: after.channel,
      timezone: after.timezone,
    };
  if (
    after.source !== before.source ||
    JSON.stringify(after.topics) !== JSON.stringify(before.topics) ||
    after.channel !== before.channel ||
    after.timezone !== before.timezone
  )
    return {
      type: "preferences",
      source: after.source,
      topics: after.topics,
      channel: after.channel,
      timezone: after.timezone,
    };
  const changedSaved = Array.from(new Set([...before.saved, ...after.saved])).filter(
    (id) => before.saved.includes(id) !== after.saved.includes(id),
  );
  if (changedSaved.length === 1)
    return {
      type: "saved",
      practiceId: changedSaved[0],
      saved: after.saved.includes(changedSaved[0]),
    };
  const changedCompletion = [...after.completed, ...before.completed].find(
    (item) =>
      before.completed.some((value) => value.id === item.id && value.date === item.date) !==
      after.completed.some((value) => value.id === item.id && value.date === item.date),
  );
  if (changedCompletion)
    return {
      type: "completion",
      practiceId: changedCompletion.id,
      date: changedCompletion.date,
      completed: after.completed.some(
        (value) => value.id === changedCompletion.id && value.date === changedCompletion.date,
      ),
    };
  const changedNotes = Array.from(
    new Set([...Object.keys(before.notes), ...Object.keys(after.notes)]),
  ).filter((id) => (before.notes[id] || "") !== (after.notes[id] || ""));
  if (changedNotes.length === 1)
    return {
      type: "reflection",
      practiceId: changedNotes[0],
      text: after.notes[changedNotes[0]] || "",
    };
  throw new MemberApiError(
    "This account change is not supported. Refresh and try again.",
    "VALIDATION",
    400,
  );
}

export function commandForChange(before: DemoState, after: DemoState): MemberCommand {
  const command = inferCommand(before, after);
  const allowed: Record<MemberCommand["type"], (keyof DemoState)[]> = {
    onboarding: ["onboarded", "source", "topics", "channel", "timezone", "schedule"],
    preferences: ["source", "topics", "channel", "timezone"],
    schedule: ["schedule", "channel", "timezone"],
    saved: ["saved"],
    completion: ["completed"],
    reflection: ["notes"],
  };
  if (
    (Object.keys(before) as (keyof DemoState)[]).some(
      (key) =>
        JSON.stringify(before[key]) !== JSON.stringify(after[key]) &&
        !allowed[command.type].includes(key),
    )
  )
    throw new MemberApiError("Save one kind of account change at a time.", "VALIDATION", 400);
  if (command.type === "completion") {
    const additions = after.completed.filter(
      (item) =>
        !before.completed.some(
          (previous) => previous.id === item.id && previous.date === item.date,
        ),
    );
    const removals = before.completed.filter(
      (item) => !after.completed.some((next) => next.id === item.id && next.date === item.date),
    );
    if (
      additions.length > 1 ||
      removals.length > 1 ||
      (additions.length && removals.length && before.completed.length !== 2000)
    )
      throw new MemberApiError("Record one practice at a time.", "VALIDATION", 400);
  }
  return command;
}
