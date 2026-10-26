"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="section centered-state container" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>Let’s take a moment.</h1>
      <p>We could not load this page. Try again, or return to the practice library.</p>
      <div className="button-row">
        <button className="button" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="button button-secondary" href="/practices">
          Explore practices
        </Link>
      </div>
    </section>
  );
}
