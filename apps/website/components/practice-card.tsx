import { type Practice, sourceLabels } from "@jesus-in-practice/content";
import Link from "next/link";

export default function PracticeCard({ practice }: { practice: Practice }) {
  return (
    <article className="practice-card">
      <p className="category">{practice.category}</p>
      <h3>
        <Link href={`/practices/${practice.id}`}>{practice.title}</Link>
      </h3>
      <a className="card-reference" href={practice.sourceUrl} target="_blank" rel="noreferrer">
        {practice.reference} <span aria-hidden="true">↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <p>
        <span className="card-content-label">In plain language</span>
        {practice.plainMeaning}
      </p>
      <p className="card-example">
        <span className="card-content-label">In real life</span>
        {practice.everydayExample}
      </p>
      <div className="card-footer">
        <div>
          <span className="card-source">{sourceLabels[practice.source]}</span>
          About {practice.minutes} minutes to try
        </div>
        <Link href={`/practices/${practice.id}`} aria-label={`Read ${practice.title}`}>
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  );
}
