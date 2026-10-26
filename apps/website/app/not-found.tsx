import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section centered-state container">
      <p className="eyebrow">Page not found</p>
      <h1>A different path from here.</h1>
      <p>
        This page may have moved, or the link may be incomplete. Your next practice is still here.
      </p>
      <div className="button-row">
        <Link className="button" href="/practices">
          Explore practices
        </Link>
        <Link className="button button-secondary" href="/">
          Back to home
        </Link>
      </div>
    </section>
  );
}
