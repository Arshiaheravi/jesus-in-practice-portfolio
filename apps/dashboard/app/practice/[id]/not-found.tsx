import Link from "next/link";
export default function UnavailablePractice() {
  return (
    <main className="auth-layout">
      <section className="panel">
        <h1>This practice is unavailable</h1>
        <p>
          It may have been withdrawn or its source permission may have changed. Your saved records,
          completion history and reflections are retained in your account.
        </p>
        <Link className="button button-primary" href="/library">
          Return to the practice library
        </Link>
      </section>
    </main>
  );
}
