import Link from "next/link";
import { redirect } from "next/navigation";

import { liveMode, memberUrl, pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata(
    "Sign-in help",
    "Jesus in Practice is designed for passwordless sign-in. Return to the preview to explore a code-based sign-in flow.",
    "/reset-password",
  ),
  robots: { index: false, follow: false },
};

export default function ResetPassword() {
  if (liveMode) redirect(memberUrl("/signin"));
  return (
    <section className="section centered-state container">
      <p className="eyebrow">Sign-in help</p>
      <h1>One less password to remember.</h1>
      <p>
        The planned experience uses a code sent to your email or phone. This frontend preview
        demonstrates that flow without sending a message or creating an account.
      </p>
      <div className="button-row">
        <Link className="button" href="/signin">
          Try sign-in preview
        </Link>
        <Link className="button button-secondary" href="/support">
          Help & answers
        </Link>
      </div>
    </section>
  );
}
