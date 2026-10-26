export default function Loading() {
  return (
    <div className="section container" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Loading your next page…</p>
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-copy" />
      <div className="skeleton skeleton-panel" />
    </div>
  );
}
