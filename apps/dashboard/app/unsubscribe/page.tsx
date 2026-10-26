import { readUnsubscribeToken } from "@jesus-in-practice/backend/tokens";

import { isLive, secret, supportEmail } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" as const };
export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; complete?: string }>;
}) {
  const { token = "", complete } = await searchParams;
  if (complete === "1")
    return (
      <main style={{ maxWidth: 640, margin: "64px auto", padding: 24 }}>
        <p className="eyebrow">Jesus in Practice</p>
        <h1>Practice messages turned off</h1>
        <p>
          Your unsubscribe request is complete. Your account and saved practices remain available.
        </p>
        <a className="text-link" href="/signin">
          Back to your account
        </a>
      </main>
    );
  let valid = false;
  try {
    valid = !!readUnsubscribeToken(secret("UNSUBSCRIBE_SIGNING_SECRET"), token);
  } catch {
    /* Configuration unavailable: offer support, never claim a change. */
  }
  let contact: string | null = null;
  try {
    contact = supportEmail();
  } catch {
    // A credential-free demo has no operator mailbox.
  }
  return (
    <main className="onboarding-wrap" style={{ maxWidth: 640, margin: "64px auto", padding: 24 }}>
      <p className="eyebrow">Jesus in Practice</p>
      <h1>Unsubscribe from practice messages</h1>
      {valid ? (
        <>
          <p>
            Confirm below to stop messages for the channel in this link. Your account and saved
            practices stay available.
          </p>
          <form action={`/api/unsubscribe?token=${encodeURIComponent(token)}`} method="post">
            <button className="button" type="submit">
              Stop these messages
            </button>
          </form>
        </>
      ) : (
        <p>
          This link is invalid, expired, or temporarily unavailable. No preferences were changed.{" "}
          {contact ? (
            <>
              Contact <a href={`mailto:${contact}`}>{contact}</a> for help.
            </>
          ) : isLive() ? (
            <>
              Please try again later, or review message consent in your{" "}
              <a href="/settings/account">account settings</a>.
            </>
          ) : (
            "This demonstration has no support mailbox or message delivery."
          )}
        </p>
      )}
    </main>
  );
}
