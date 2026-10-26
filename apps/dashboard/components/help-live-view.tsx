import Link from "next/link";

import { PageHeading } from "@/components/ui";
import { websiteLink } from "@/lib/links";

import { smsCreditTerms } from "../../../shared/commerce-copy";

export default function HelpLiveView() {
  return (
    <>
      <PageHeading
        eyebrow="HOW YOUR PRACTICE WORKS"
        title="Help & guidance"
        description="Understand your account, scripture sources, and reminder choices."
      />
      <div className="help-layout">
        <nav className="panel help-nav" aria-label="Help topics">
          <a href="#sources">Scripture & sources</a>
          <a href="#reminders">Email & SMS</a>
          <a href="#preview">Account & privacy</a>
        </nav>
        <div className="help-content">
          <section id="sources">
            <h2>Scripture & sources</h2>
            <details open>
              <summary>What am I reading?</summary>
              <p>
                Each practice links to an exact Bible or Book of Mormon passage, followed by an
                original explanation, a hypothetical everyday example, and a practical action. These
                explanations are not quotations from scripture.
              </p>
            </details>
            <details>
              <summary>Can I choose my source?</summary>
              <p>
                Yes. <Link href="/settings/preferences">Preferences</Link> lets you select the King
                James Bible, the Book of Mormon, or both. Each practice names its source. The
                catalogue combines 24 starter practices with any currently eligible,
                editor-published lessons. AI may assist drafting from an approved scripture edition,
                but a human must review and publish each lesson before it appears here. Choosing
                another practice selects from the loaded published set; it does not create an
                unreviewed response.
              </p>
            </details>
            <details>
              <summary>How should I use the actions?</summary>
              <p>
                Read the passage in context and adapt the suggested action to your ability,
                circumstances, and safety. Forgiveness and service do not require giving up
                boundaries or contacting someone unsafe.
              </p>
            </details>
          </section>
          <section id="reminders">
            <h2>Email & prepaid SMS</h2>
            <details open>
              <summary>What is free, and what costs money?</summary>
              <p>
                Your account and practice emails are free. SMS uses prepaid CAD credit at the rate
                displayed in your <Link href="/wallet">SMS wallet</Link>. Long messages can use
                several billable segments. There is no subscription or automatic top-up.
              </p>
            </details>
            <details>
              <summary>Does SMS credit expire, and can I request a refund?</summary>
              <p>
                {smsCreditTerms.noExpiry} {smsCreditTerms.refund}{" "}
                <a href={websiteLink("/support")}>Contact support about unused credit</a> before
                closing your account. Reserved credit remains unavailable while related activity is
                unresolved. Closing an account does not automatically issue a refund. Read the{" "}
                <a href={websiteLink("/terms")}>SMS credit terms</a> for details.
              </p>
            </details>
            <details>
              <summary>Why am I not receiving reminders?</summary>
              <p>
                Check your <Link href="/schedule">schedule</Link>, selected days and time zone, and{" "}
                <Link href="/settings/account">channel consent</Link>. SMS also needs a verified
                phone and sufficient credit. Provider outages, suppression, and messages in progress
                can affect delivery. A saved schedule is not confirmation that a message was
                delivered. <Link href="/deliveries">Messages</Link> shows scheduled messages and
                provider-reported results. A delivered status does not show whether someone read the
                message.
              </p>
            </details>
            <details>
              <summary>How do I stop reminders?</summary>
              <p>
                Pause reminders from Your rhythm, withdraw the relevant channel consent in Account &
                consent, use the email unsubscribe link, or reply STOP to SMS. Pausing keeps your
                consent choices; withdrawing consent disables that channel.
              </p>
            </details>
            <details>
              <summary>Why has a payment not appeared?</summary>
              <p>
                Credit is added after server confirmation of payment. Returning from checkout is not
                confirmation by itself. Refresh your wallet before retrying a payment whose result
                is uncertain.
              </p>
            </details>
          </section>
          <section id="preview">
            <h2>Account & privacy</h2>
            <details>
              <summary>Where is my data stored?</summary>
              <p>
                Account preferences, activity, and reflections are stored by the service and require
                sign-in. They are not imported from the browser preview. Optional reflections are
                not included in reminder messages. Avoid unnecessary sensitive details.
              </p>
            </details>
            <details>
              <summary>What happens when a save fails?</summary>
              <p>
                Your draft stays on screen. If your account changed elsewhere, cancel to load the
                latest settings before editing again. Reflections let you choose whether to load the
                newer text or explicitly replace it. A timeout can have an uncertain outcome;
                refresh to check before retrying.
              </p>
            </details>
            <details>
              <summary>Can I export or delete my account?</summary>
              <p>
                Use <Link href="/settings/account">Account & consent</Link> to export data, sign
                out, or request account deletion. Export private reflections carefully. Read the{" "}
                <a href={websiteLink("/privacy")}>privacy information</a> for service and retention
                details.
              </p>
            </details>
          </section>
          <Link className="button button-primary" href="/dashboard">
            Back to today
          </Link>
        </div>
      </div>
    </>
  );
}
