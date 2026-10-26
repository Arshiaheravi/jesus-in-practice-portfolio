import OperatorDetails from "@/components/operator-details";

export const dynamic = "force-dynamic";
import PageHeading from "@/components/page-heading";
import { supportEmail } from "@/lib/operator";
import { liveMode, pageMetadata } from "@/lib/site";

import { smsCreditTerms } from "../../../../shared/commerce-copy";

export const metadata = pageMetadata(
  "Terms and service information",
  "Understand original scripture reflections, free accounts and email, optional prepaid SMS credit, consent and the limits of the current service.",
  "/terms",
);

export default function Terms() {
  return (
    <div className="container">
      <PageHeading
        eyebrow={liveMode ? "Using the service" : "Using this preview"}
        title="A clear starting point."
      >
        <p>
          Understand the content, your delivery choices and the approved prepaid SMS terms. Payment
          and delivery availability are shown separately in your account.
        </p>
      </PageHeading>
      <div className="notice">
        <strong>Payment and delivery launch gates remain.</strong> SMS pricing and unused-credit
        terms are set out below. Tax treatment and the remaining provider and service checks must be
        completed before purchases and delivery are enabled. This page does not activate them.
      </div>
      <div className="prose">
        <OperatorDetails />
        <h2>The experience available here</h2>
        <p>
          {liveMode
            ? "The member application supports sign-in and server-stored preferences, saved practices and optional reflections when configured. Delivery and payment features have separate availability gates. Creating an account or saving a schedule does not guarantee that a message has been sent."
            : "You can browse practices, try setup, change local preferences, save practices and keep local reflections. Account verification is simulated. No actual account, scheduled delivery or charge is created. Save buttons in the member demo store changes only in the current browser."}
        </p>
        <h2>Scripture and reflection</h2>
        <p>
          Practices contain original explanations, illustrative examples and suggestions inspired by
          identified passages. They are not scripture quotations or authoritative religious
          instruction. Traditions may interpret passages differently. Read the source and make your
          own informed choices.
        </p>
        <p>
          Jesus in Practice is independent and is not endorsed by a church or denomination. The Book
          of Mormon collection is optional and clearly labelled. The initial library is a selected
          collection, not complete coverage of either book. No live AI generation is promised.
        </p>
        <h2>Use your judgment and respect others</h2>
        <p>
          Adapt each practice to your ability, circumstances, means and safety. Respect consent and
          boundaries. Forgiveness does not require returning to an unsafe relationship; generosity
          does not require financial hardship. You can skip any practice.
        </p>
        <p>
          Content is educational and reflective. It does not replace qualified medical, mental
          health, legal or financial advice, and it does not promise a particular result.
        </p>
        <h2>Free accounts and email; optional prepaid SMS</h2>
        <p>
          Accounts and practice emails are free, subject to service and abuse-prevention limits. SMS
          uses optional prepaid service credit in Canadian dollars, with one-time $10, $25 or $50
          top-ups. There is no recurring subscription or automatic recharge. Email does not consume
          SMS credit.
        </p>
        <p>
          The launch rate is ${smsCreditTerms.launchRateCad} CAD per SMS segment. The current rate,
          any applicable taxes and the purchase total must be disclosed before checkout. Tax
          treatment is still being finalised, and purchases remain unavailable until it is
          confirmed. One lesson may use multiple segments. The account records reservations and
          charges; an uncertain delivery is reconciled before it can be treated as a definite
          failure. Provider acceptance does not prove receipt or reading.
        </p>
        <p>
          Credit is for this service, not a bank account or transferable cash balance.{" "}
          {smsCreditTerms.noExpiry} {smsCreditTerms.refund} Reserved credit remains unavailable for
          refund while the related activity is unresolved. Contact support to request a refund
          before deleting an account that has credit. Account closure does not automatically issue a
          refund.
        </p>
        <h2>Consent, schedules and delivery</h2>
        <p>
          Lesson email and SMS require separate opt-ins. A verified contact method, signup or
          payment is not consent by itself. The initial SMS service is for verified Canadian
          numbers. You can pause a schedule or withdraw a channel choice; unsubscribe links and STOP
          do not require signing in.
        </p>
        <p>
          Delivery depends on providers, network conditions, account limits and service
          availability. A submitted message may still arrive after a pause or opt-out. The service
          is not intended for urgent, safety-critical or essential reminders. If a message is late,
          do not assume that requesting another is free of duplicate-delivery risk.
        </p>
        <h2>Third-party links and materials</h2>
        <p>
          Scripture and attribution links lead to external websites controlled by their operators.
          Real photographs are credited to their sources. Images of people or religious artwork do
          not imply endorsement or membership. Third-party materials retain their own licences and
          attribution requirements.
        </p>
        <h2>Data, availability and support</h2>
        <p>
          Keep a copy of any information you need. Preview browser data may be cleared and is not
          backed up by the service. Live account data has separate access, deletion and retention
          requirements described in the <a href="/privacy">privacy notice</a>. Changes or outages
          may affect availability; no uninterrupted-service guarantee is made.
        </p>
        <p>
          {supportEmail ? (
            <>
              For help, payment questions or an account request, contact{" "}
              <a href={"mailto:" + supportEmail}>{supportEmail}</a> or read{" "}
            </>
          ) : (
            "This demonstration has no support mailbox. You can read "
          )}
          <a href="/support">help and answers</a>. Do not send passwords, sign-in codes or card
          details.
        </p>
      </div>
    </div>
  );
}
