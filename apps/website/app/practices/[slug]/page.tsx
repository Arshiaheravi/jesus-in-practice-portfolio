import { getPractice, practices, sourceLabels } from "@jesus-in-practice/content";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CopyReference from "@/components/copy-reference";
import PracticeCard from "@/components/practice-card";
import { memberUrl, pageMetadata } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return practices.map((practice) => ({ slug: practice.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const practice = getPractice((await params).slug);
  return practice
    ? pageMetadata(practice.title, practice.summary, `/practices/${practice.id}`)
    : { title: "Practice not found", robots: { index: false } };
}

export default async function PracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const practice = getPractice((await params).slug);
  if (!practice) notFound();
  const related = practices
    .filter((item) => item.source === practice.source && item.id !== practice.id)
    .slice(0, 3);
  return (
    <div className="container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/practices">Practices</Link>
        <span aria-hidden="true">/</span>
        <span>{practice.title}</span>
      </nav>
      <article className="practice-detail">
        <div>
          <p className="eyebrow">{practice.category}</p>
          <h1>{practice.title}</h1>
          <div className="practice-ref">
            <span>{sourceLabels[practice.source]}</span>
            <a
              className="reference-link"
              href={practice.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {practice.reference} <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span>About {practice.minutes} minutes to try</span>
          </div>
          <div className="detail-explanation">
            <h2>In plain language</h2>
            <p>{practice.plainMeaning}</p>
          </div>
          <div className="detail-explanation example">
            <h2>In real life</h2>
            <p>{practice.everydayExample}</p>
          </div>
          <details className="passage-context">
            <summary>About the passage</summary>
            <p>{practice.summary}</p>
          </details>
          <a className="text-link" href={practice.sourceUrl} target="_blank" rel="noreferrer">
            Read the passage <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <CopyReference
            reference={`${sourceLabels[practice.source]}: ${practice.reference}`}
            url={practice.sourceUrl}
          />
          <p className="fine-print" style={{ marginTop: 25 }}>
            This is an original reflection inspired by the passage, not a scripture quotation. Read
            the surrounding verses and consider your own circumstances.
          </p>
        </div>
        <aside className="action-panel" aria-label="Practice and reflection">
          <p className="eyebrow">Put it into practice</p>
          <h2>Try this today</h2>
          <p>{practice.action}</p>
          <div className="reflection">
            <p>
              <strong>A moment to reflect</strong>
              {practice.reflection}
            </p>
          </div>
          <a
            className="button"
            style={{ marginTop: 25 }}
            href={memberUrl(`/library/${encodeURIComponent(practice.id)}`)}
          >
            Try in the demo <span aria-hidden="true">↗</span>
          </a>
          <p className="fine-print" style={{ marginTop: 12 }}>
            Save and reflect locally. No account needed.
          </p>
        </aside>
      </article>
      <section className="section" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="section-top">
          <h2>Keep exploring.</h2>
          <Link className="text-link" href="/practices">
            All practices <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="practices-grid">
          {related.map((item) => (
            <PracticeCard key={item.id} practice={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
