import Link from "next/link";

import FeedbackForm from "@/components/feedback-form";
import HelpSearch from "@/components/help-search";
import OperatorDetails from "@/components/operator-details";
import PageHeading from "@/components/page-heading";
import { supportEmail } from "@/lib/operator";
import { liveMode, memberUrl, pageMetadata } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata(
  "Help and answers",
  "Find answers about practices, scripture sources, privacy, free email, prepaid SMS credit and delivery preferences.",
  "/support",
);

export default function Support() {
  return (
    <div className="container">
      <PageHeading eyebrow="Help & answers" title="Find the answer. Keep going.">
        <p>
          Find your way around, understand your choices, and see what is available in your account.
        </p>
      </PageHeading>
      <div className="help-layout">
        <HelpSearch />
        <aside className="help-aside">
          <h2>Looking for a setting?</h2>
          <p>
            Your schedule, saved practices, and preferences are in the member{" "}
            {liveMode ? "app" : "demo"}.
          </p>
          <a className="button button-secondary button-small" href={memberUrl()}>
            {liveMode ? "Open member app" : "Open demo"} <span aria-hidden="true">↗</span>
          </a>
          <p style={{ marginTop: 24 }}>Learn how your data is stored and how your choices work.</p>
          <Link className="text-link" href="/privacy">
            Read the privacy notice <span aria-hidden="true">↗</span>
          </Link>
        </aside>
      </div>
      <OperatorDetails />
      <section className="section" id="feedback" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="eyebrow">Help make it better</p>
        <h2>Something we should know?</h2>
        <p className="lead" style={{ marginTop: 20, fontSize: ".94rem" }}>
          {supportEmail ? (
            <>
              Email{" "}
              <a className="text-link" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
              , or prepare a note below to open in your email app.
            </>
          ) : (
            "Prepare a local note below. This demo has no support mailbox, so you can copy your draft without sending it."
          )}{" "}
          The draft tool does not send anything automatically. Keep sign-in codes, card details and
          sensitive reflections out of your message.
        </p>
        <FeedbackForm supportEmail={supportEmail} />
      </section>
    </div>
  );
}
