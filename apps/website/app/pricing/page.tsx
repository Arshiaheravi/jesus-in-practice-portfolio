import Link from "next/link";

import PageHeading from "@/components/page-heading";
import { liveMode, memberUrl, pageMetadata } from "@/lib/site";

import { smsCreditTerms } from "../../../../shared/commerce-copy";

export const metadata = pageMetadata(
  "Free email and prepaid SMS",
  "Start with a free account and free scripture emails. Add optional prepaid SMS credit in Canadian dollars, with no subscription or automatic recharge.",
  "/pricing",
);

const features = [
  "Your choice of scripture collection",
  "Plain meaning, a real-life example and an action",
  "Practice library and saved favourites",
  "A schedule you choose and can pause",
];

export default function Pricing() {
  return (
    <div className="container">
      <PageHeading eyebrow="A simple choice" title="Begin freely. Add texts if you want.">
        <p>
          Your account and practice emails are free. Text messages are optional and use prepaid
          credit in Canadian dollars. No subscription. No automatic recharge.
        </p>
      </PageHeading>
      <div className="plan-grid">
        <section className="plan-card">
          <p className="eyebrow">A thoughtful note in your inbox</p>
          <h2>Account + email</h2>
          <p>
            Learn from a scripture passage, see how the idea applies to everyday life, and choose
            one practical step.
          </p>
          <div className="plan-price">
            <strong>Free</strong>
            <span>No payment card needed. Delivery limits apply.</span>
          </div>
          <ul className="check-list">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
            <li>Separate email consent and an unsubscribe link</li>
          </ul>
          <Link className="button button-secondary" href="/signup">
            {liveMode ? "Create a free account" : "Explore free setup"}{" "}
            <span aria-hidden="true">↗</span>
          </Link>
        </section>
        <section className="plan-card featured">
          <p className="eyebrow">An idea you can carry into your day</p>
          <h2>Optional SMS</h2>
          <p>
            Add texts to a verified Canadian number. Keep email, choose SMS, or use both. Each
            channel has its own consent and pause controls.
          </p>
          <div className="plan-price">
            <strong>$10 / $25 / $50 CAD</strong>
            <span>One-time credit top-ups, not monthly fees.</span>
          </div>
          <ul className="check-list">
            <li>${smsCreditTerms.launchRateCad} CAD per SMS segment at launch</li>
            <li>Messages can use multiple billable SMS segments</li>
            <li>{smsCreditTerms.noExpiry}</li>
            <li>Credit is reserved for a message before it is sent</li>
            <li>SMS pauses when available credit is insufficient</li>
            <li>Reply STOP to unsubscribe from text lessons</li>
          </ul>
          <a className="button" href={memberUrl(liveMode ? "/wallet" : "/onboarding?plan=both")}>
            {liveMode ? "View SMS credit & availability" : "Explore SMS setup"}{" "}
            <span aria-hidden="true">↗</span>
          </a>
        </section>
      </div>
      <div className="notice">
        {liveMode ? (
          <>
            <strong>Availability is shown in your account.</strong> Payment and delivery remain
            disabled until tax treatment and the remaining service checks are completed. The terms
            below do not enable checkout. A free account does not require an SMS purchase.
          </>
        ) : (
          <>
            <strong>This is the free frontend preview.</strong> No payments, real accounts or
            messages are created here. The credit amounts describe the agreed service model, and
            setup choices are demonstrations rather than recorded consent.
          </>
        )}
      </div>
      <section className="section faq-layout">
        <div>
          <p className="eyebrow">Before you choose</p>
          <h2>Clear costs. Your choice.</h2>
          <Link className="text-link" href="/support">
            More help & answers <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="faq-list">
          <details>
            <summary>What does one text message cost?</summary>
            <p>
              The launch rate is ${smsCreditTerms.launchRateCad} CAD per SMS segment. A five-segment
              lesson uses $0.25 CAD of credit; a ten-segment lesson uses $0.50 CAD. Length and
              encoding determine the segment count, including the reference, meaning, example,
              action and opt-out details. Your account shows the current rate before you opt in. Any
              applicable taxes and the full purchase total must be shown before checkout; tax
              treatment is still being finalised.
            </p>
          </details>
          <details>
            <summary>Does free email mean unlimited email?</summary>
            <p>
              No. Free email is subject to account, scheduling and service limits. Choose the
              available frequency in your account. Email costs do not come out of your SMS credit.
            </p>
          </details>
          <details>
            <summary>Will I be charged again automatically?</summary>
            <p>
              No. Each SMS top-up is a separate one-time purchase. There is no recurring plan or
              automatic recharge. If your available credit cannot cover a message, that SMS is not
              submitted. You can keep using the free account and email options.
            </p>
          </details>
          <details>
            <summary>What about unused credit or a failed delivery?</summary>
            <p>
              {smsCreditTerms.noExpiry} {smsCreditTerms.refund} A confirmed failed delivery releases
              its reserved credit. An uncertain delivery keeps its reservation until it is reviewed;
              a timeout alone does not prove failure. <Link href="/support">Contact support</Link>{" "}
              before closing an account with credit, and read the{" "}
              <Link href="/terms">SMS credit terms</Link>.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
