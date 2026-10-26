import PageHeading from "@/components/page-heading";
import { supportEmail } from "@/lib/operator";
import { liveMode, pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "Accessibility",
  "Learn about accessibility features in the Jesus in Practice preview, including keyboard navigation, readable text, reduced motion, and source links.",
  "/accessibility",
);

export default function Accessibility() {
  return (
    <div className="container">
      <PageHeading eyebrow="Room for everyone" title="A thoughtful, usable experience.">
        <p>
          Being able to participate matters. Accessibility is part of the design, and an ongoing
          responsibility.
        </p>
      </PageHeading>
      <div className="prose">
        <h2>Using the site</h2>
        <p>
          You can navigate with a keyboard, skip repeated navigation, and use visible focus outlines
          to follow your position. Forms have visible labels and clear feedback. Your browser’s text
          zoom and system colour preference are respected.
        </p>
        <p>
          We keep motion subtle, and reduce it further when your device requests reduced motion.
          Images include descriptions where they add meaning, and scripture links say when they open
          a new tab.
        </p>
        <h2>Reading and reflecting</h2>
        <p>
          Practices use short paragraphs and one concrete action at a time. You can read at your own
          pace. There are no countdowns, forced streaks, or penalties for taking a break.
        </p>
        <h2>Current limits</h2>
        <p>
          This is an English-language {liveMode ? "service" : "frontend preview"}. Automated checks
          and manual browser checks can find some barriers, but they do not establish full
          accessibility conformance. Testing with a wider range of assistive technologies and people
          with disabilities is still needed before a public service launch.
        </p>
        <h2>If something gets in your way</h2>
        <p>
          {supportEmail ? (
            <>
              Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with the page, device or
              assistive technology, and what you were trying to do.{" "}
            </>
          ) : (
            "This demonstration has no support mailbox. "
          )}
          The help page prepares a local draft that you can review and copy; it does not send
          automatically.
        </p>
        <p>
          <a href="/support#feedback">Prepare accessibility feedback</a>
        </p>
      </div>
    </div>
  );
}
