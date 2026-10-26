import Link from "next/link";
import { redirect } from "next/navigation";

import AuthPreview from "@/components/auth-preview";
import { liveMode, memberUrl, pageMetadata } from "@/lib/site";

export const metadata = {
  ...pageMetadata(
    "Get started",
    "Start with a free Jesus in Practice account and choose a scripture collection, delivery preference, and a rhythm that fits your day.",
    "/signup",
  ),
  robots: { index: false, follow: false },
};

export default function Signup() {
  if (liveMode) redirect(memberUrl("/signup"));
  return (
    <section className="entry-layout container">
      <div>
        <p className="eyebrow">Put your learning into practice</p>
        <h1>
          Your everyday life.
          <br />A practical next step.
        </h1>
        <p className="lead">
          Choose your scripture, find your rhythm, and explore practices you can carry into the day.
        </p>
        <ul className="check-list" style={{ marginTop: 28 }}>
          <li>Choose the KJV Bible, Book of Mormon, or both</li>
          <li>Explore email and text delivery preferences</li>
          <li>Save practices and reflect at your own pace</li>
        </ul>
        <p className="fine-print">
          Already explored the demo?{" "}
          <Link className="text-link" href="/signin">
            Try sign-in
          </Link>
        </p>
        <a className="text-link section-link" href={memberUrl("/onboarding")}>
          Skip sign-in preview and explore <span aria-hidden="true">↗</span>
        </a>
      </div>
      <AuthPreview mode="signup" />
    </section>
  );
}
