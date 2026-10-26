import OperatorDetails from "@/components/operator-details";
import PageHeading from "@/components/page-heading";
import { supportEmail } from "@/lib/operator";
import { liveMode, pageMetadata } from "@/lib/site";

// Operator identity is supplied by the host at runtime, outside the public build settings.
export const dynamic = "force-dynamic";

export const metadata = pageMetadata(
  "Privacy notice",
  "Learn how Jesus in Practice handles account details, practice preferences, optional reflections and delivery choices, and how preview mode differs.",
  "/privacy",
);

export default function Privacy() {
  return (
    <div className="container">
      <PageHeading
        eyebrow={liveMode ? "Account privacy" : "Privacy in this preview"}
        title="Your practice is personal."
      >
        <p>
          {liveMode
            ? "The account experience uses server storage and authentication. This notice explains the intended processing and the launch details that still need to be confirmed."
            : "This preview stores practice data in your browser. It does not create a cloud account or send lessons. The live-account section below explains what changes when the service is enabled."}
        </p>
      </PageHeading>
      <div className="notice">
        <strong>Some launch details remain pending.</strong> The approved cleanup periods are
        described below. Provider and backup retention, processing locations and the deployed
        cleanup schedule still need verification. This notice does not claim that live delivery or
        scheduled cleanup is already running.
      </div>
      <div className="prose">
        <OperatorDetails />
        <h2>{liveMode ? "What the account service stores" : "What stays in your browser"}</h2>
        <p>
          {liveMode
            ? "The service stores account identifiers, verified contact details, source and topic preferences, schedules, channel consent, saved practices, completion activity and any reflections you explicitly save. Delivery and credit records support status updates, opt-outs and payment reconciliation. Authentication uses secure session cookies."
            : "The member demo saves your chosen topics, source collection, schedule, saved practices, completion history and optional reflections in local browser storage. It does not create an account or sync between devices. Anyone with access to this browser profile may be able to read that data."}
        </p>
        <p>
          Religious preferences and reflections can be sensitive. Keep passwords, financial
          information, medical details and private information about other people out of your notes.
          Reflections are optional and are not included in lesson messages or payment details.
        </p>
        <h2>Sign-in and verification</h2>
        <p>
          {liveMode
            ? "Email authentication is handled through Supabase Auth. A Canadian SMS number is checked and verified through Twilio before it can be used for lessons. Verification establishes access to a contact method; it does not grant consent to recurring lessons. Authentication emails and practice-email preferences are separate."
            : "The website sign-in and signup forms simulate a code flow. Entered contact details remain in memory while the form is open; they are not sent, saved in browser storage or included in page URLs. Use example details. Reloading or closing the page clears the form. No identity is verified."}
        </p>
        <h2>Providers when live features are enabled</h2>
        <p>
          Supabase provides authentication and the configured database service. Resend processes
          lesson email addresses and message content. Twilio processes phone verification, SMS
          recipients, message content and delivery/opt-out events. Stripe hosts payment collection
          and processes transaction details; the application does not collect raw card details.
        </p>
        <p>
          Only the relevant data should be sent to each provider. Saved reflections are not sent to
          messaging or payment providers. Provider availability does not mean a delivery is enabled:
          each channel needs its own configuration, verified destination and consent, and SMS also
          requires sufficient credit.
        </p>
        <p>
          Processing may cross national borders. The actual deployment region, provider agreements,
          retention settings and access arrangements must be documented before public launch. No
          Canada-only storage promise is made.
        </p>
        <h2>Consent and control</h2>
        <p>
          Live email and SMS lessons require separate affirmative choices. You can pause a schedule,
          withdraw a channel consent, use an email unsubscribe link or reply STOP to a text. No
          login is required for message opt-out links. Essential sign-in or transaction notices are
          separate from optional lessons.
        </p>
        <h2>Export, deletion and retention</h2>
        <p>
          {liveMode
            ? "Account settings provide data export and an account-deletion request. Deletion must account for any remaining credit and records needed for payment, consent, suppression and security obligations. Those records are not necessarily erased immediately. Contact support before closing an account with unused credit."
            : "The member settings include tools to export or reset locally saved demo data. You can also clear this site's data through your browser. There is no cloud backup or recovery service for preview data. Preview exports are not server-account exports."}
        </p>
        <p>The approved launch cleanup policy makes these live-service records eligible:</p>
        <ul>
          <li>Phone-verification records: 7 days after the verification challenge expires.</li>
          <li>Request-limit counters: 2 days after their counting window starts.</li>
          <li>
            Recipient and message content in delivered, failed or cancelled message records: 30 days
            after the delivery record was last updated, once related financial activity is resolved.
          </li>
        </ul>
        <p>
          Cleanup will process eligible records in batches after deployment; these periods are
          eligibility thresholds, not exact deletion deadlines. It is not yet running on a deployed
          service. Pending or uncertain deliveries and records with unresolved credit holds, refunds
          or payment reviews remain protected from this cleanup.
        </p>
        <p>
          This cleanup does not erase delivery identities, pricing evidence, consent history,
          opt-out protection or financial records. Account data, those retained records, provider
          copies and backups have separate retention requirements; the three periods above are not a
          retention limit for all personal data. The remaining retention and request-handling
          details must be confirmed before public launch.
        </p>
        <h2>Website requests and external links</h2>
        <p>
          The public site has no advertising or analytics integration. Browsing still makes ordinary
          requests to the hosting service, which may keep technical access logs. Images and font
          files are served with the site. External scripture and attribution links take you to sites
          with their own policies.
        </p>
        <h2>Questions or privacy requests</h2>
        <p>
          {supportEmail ? (
            <>
              Contact <a href={"mailto:" + supportEmail}>{supportEmail}</a>. Explain the issue
              without including passwords, sign-in codes, payment-card details or sensitive
              reflections.
            </>
          ) : (
            "This local demonstration has no support mailbox and does not create member accounts. Use the member demo's export and reset controls to manage data stored in your browser."
          )}
        </p>
      </div>
    </div>
  );
}
