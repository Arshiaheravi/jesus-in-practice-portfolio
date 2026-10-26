/** Accepted means the provider owns the request, not that a recipient received it. */
export type SendResult =
  | { outcome: "accepted"; providerId: string; status: string }
  | { outcome: "rejected"; code: string; retryable: boolean }
  | { outcome: "unknown"; code: string };

export class ProviderTimeoutError extends Error {
  constructor() {
    super("Provider response timed out; the operation may have been accepted.");
    this.name = "ProviderTimeoutError";
  }
}

export class InvalidWebhookError extends Error {
  constructor() {
    super("Webhook verification failed.");
    this.name = "InvalidWebhookError";
  }
}

/** Bounds the caller's wait. A timeout never proves that a provider cancelled work. */
export async function withDeadline<T>(operation: () => Promise<T>, timeoutMs = 15_000): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) {
    throw new Error("Provider timeout must be between 1 and 15000 milliseconds.");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProviderTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function opaqueId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("Invalid operation identifier.");
  return value;
}

export function trustedUrl(value: string, options: { allowFragment?: boolean } = {}): URL {
  if (/[\u0000-\u0020\u007f<>]/.test(value)) throw new Error("Invalid URL characters.");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password ||
    (url.hash && !options.allowFragment)
  ) {
    throw new Error("A secure absolute URL is required.");
  }
  return url;
}

export function nonempty(value: string, name: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value || /[\r\n]/.test(value)) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

export function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { status?: unknown; statusCode?: unknown };
  const value = record.statusCode ?? record.status;
  return typeof value === "number" ? value : undefined;
}

/** Unknown transport/server failures must not trigger an unkeyed resend. */
export function sendFailure(error: unknown, prefix: string): SendResult {
  const status = providerStatus(error);
  if (status === 429) return { outcome: "rejected", code: `${prefix}_RATE_LIMIT`, retryable: true };
  if (status && status >= 400 && status < 500 && status !== 408) {
    return { outcome: "rejected", code: `${prefix}_REJECTED`, retryable: false };
  }
  return {
    outcome: "unknown",
    code: error instanceof ProviderTimeoutError ? `${prefix}_TIMEOUT` : `${prefix}_UNCERTAIN`,
  };
}
