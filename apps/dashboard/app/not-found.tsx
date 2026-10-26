import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone-page">
      <p className="eyebrow">Page not found</p>
      <h1>A small detour.</h1>
      <p>This page may have moved, or the address may be incomplete.</p>
      <Link className="button button-primary" href="/dashboard">
        Return to your practice
      </Link>
    </main>
  );
}
