import Link from "next/link";

import { Brand } from "@/components/app-shell";
import AuthLiveView from "@/components/auth-live-view";
import { websiteLink } from "@/lib/links";
import { liveMode } from "@/lib/member-api";

export default function AccessView({ reset = false }: { reset?: boolean }) {
  if (liveMode) return <AuthLiveView />;
  return (
    <main className="access-page">
      <Brand />
      <section className="panel access-panel">
        <p className="eyebrow">YOUR PRACTICE SPACE</p>
        <h1>{reset ? "No password to reset just yet." : "Your next practice starts here."}</h1>
        <p>
          {reset
            ? "This preview doesn’t create accounts or store passwords. Your saved choices are tied to this browser, so you can return to them directly."
            : "Explore your practice space without an account. If you’ve been here before in this browser, your saved choices will be waiting."}
        </p>
        <Link className="button button-primary" href="/dashboard">
          Continue to my preview
        </Link>
        <Link className="button button-secondary" href="/onboarding">
          Set up my practice
        </Link>
        <p className="field-hint">
          Secure sign-in, verified contact details, and account recovery will be connected in the
          backend stage.
        </p>
      </section>
      <a className="text-link" href={websiteLink()}>
        Back to the website
      </a>
    </main>
  );
}
