import Link from "next/link";
import { redirect } from "next/navigation";

import AuthPreview from "@/components/auth-preview";
import { liveMode, memberUrl, pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata(
    liveMode ? "Sign in" : "Sign in preview",
    liveMode
      ? "Sign in to your Jesus in Practice account."
      : "Explore the passwordless sign-in interface for Jesus in Practice. This demonstration does not verify identity or create a real account.",
    "/signin",
  ),
  robots: { index: false, follow: false },
};

export default function Signin() {
  if (liveMode) redirect(memberUrl("/signin"));
  return (
    <section className="entry-layout container">
      <div>
        <p className="eyebrow">Welcome back</p>
        <h1>
          There is always
          <br />
          room to begin again.
        </h1>
        <p className="lead">
          Return to a saved practice, adjust your rhythm, or simply find one small good thing to
          try.
        </p>
        <p className="fine-print" style={{ marginTop: 24 }}>
          New here?{" "}
          <Link className="text-link" href="/signup">
            Get started
          </Link>
        </p>
        <a className="text-link section-link" href={memberUrl()}>
          Open demo without sign-in <span aria-hidden="true">↗</span>
        </a>
      </div>
      <AuthPreview mode="signin" />
    </section>
  );
}
