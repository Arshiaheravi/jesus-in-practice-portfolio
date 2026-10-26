"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <h1>Let’s try that again.</h1>
      <p>This page could not open. Your saved browser preferences have not been removed.</p>
      <div className="button-row">
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
        <Link className="button button-secondary" href="/dashboard">
          Back to today
        </Link>
      </div>
    </div>
  );
}
