import { type Practice, sourceLabels } from "@jesus-in-practice/content";
import { ArrowTopRightIcon, ReaderIcon } from "@radix-ui/react-icons";

export default function PracticeLesson({
  practice,
  headingLevel = "h3",
}: {
  practice: Practice;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const editionTitle =
    "editionTitle" in practice && typeof practice.editionTitle === "string"
      ? practice.editionTitle
      : null;
  return (
    <div className="practice-lesson">
      {editionTitle && (
        <p className="small muted">
          Source edition: {editionTitle}. This lesson is an editor-published original explanation.
        </p>
      )}
      <a
        className="lesson-reference"
        href={practice.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="lesson-reference-icon">
          <ReaderIcon aria-hidden="true" />
        </span>
        <span>
          <span className="eyebrow">START WITH THE SCRIPTURE</span>
          <strong>{practice.reference}</strong>
          <span className="lesson-source">{sourceLabels[practice.source]}</span>
        </span>
        <span className="reference-action">
          Read the passage
          <ArrowTopRightIcon aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </span>
      </a>
      <section className="lesson-part lesson-meaning">
        <span className="lesson-number" aria-hidden="true">
          01
        </span>
        <div>
          <Heading>In plain language</Heading>
          <p>{practice.plainMeaning}</p>
        </div>
      </section>
      <section className="lesson-part lesson-example">
        <span className="lesson-number" aria-hidden="true">
          02
        </span>
        <div>
          <Heading>In real life</Heading>
          <p>{practice.everydayExample}</p>
        </div>
      </section>
      <section className="lesson-part lesson-action">
        <span className="lesson-number" aria-hidden="true">
          03
        </span>
        <div>
          <div className="lesson-action-heading">
            <Heading>Try this today</Heading>
            <span>About {practice.minutes} minutes</span>
          </div>
          <p>{practice.action}</p>
        </div>
      </section>
      <details className="passage-context">
        <summary>Read the passage context</summary>
        <p>{practice.summary}</p>
        <p>
          These explanations and examples are original interpretations, not scripture quotations.
          Follow the passage link to read its full context.
        </p>
      </details>
    </div>
  );
}
