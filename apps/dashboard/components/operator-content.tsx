"use client";

import type { ContentVersion, PracticeDraft } from "@jesus-in-practice/backend/content-contracts";
import { categories } from "@jesus-in-practice/content";
import { useEffect, useState } from "react";

import { useOperator } from "@/components/operator-shell";
import { PageHeading, Status } from "@/components/ui";
import { memberError, memberRequest } from "@/lib/member-api";

type Page<T> = { items: T[]; nextCursor: string | null; total: number };
type Edition = {
  id: string;
  manifest: { title: string; source: string; books: { id: string; name: string }[] };
  rights: { approved?: boolean };
  importedAt: string | null;
  eligibleForDraft: boolean;
  eligibleForAi: boolean;
};
type Review = {
  sequence: string;
  action: string;
  detail: { reason: string };
  actorId: string;
  createdAt: string;
};
type Data = {
  drafts: Page<ContentVersion>;
  editions: Page<Edition>;
  aiEnabled: boolean;
  rightsEnabled: boolean;
};
const checks = {
  reference: "The exact reference and source text are correct.",
  context: "The passage context supports this interpretation.",
  meaning: "The explanation is clear and faithful to the selected passage.",
  safety: "The example and action respect consent, ability, and safe boundaries.",
  rights: "Source permissions cover the intended use in Canada.",
  originalExplanation:
    "Scripture, original explanation, and illustrative example are clearly distinguished.",
};
const fields: {
  key: keyof Pick<
    PracticeDraft,
    "title" | "summary" | "plainMeaning" | "everydayExample" | "action" | "reflection" | "smsText"
  >;
  label: string;
  max: number;
}[] = [
  { key: "title", label: "Title", max: 100 },
  { key: "summary", label: "Summary", max: 700 },
  { key: "plainMeaning", label: "In plain language", max: 500 },
  { key: "everydayExample", label: "In real life", max: 600 },
  { key: "action", label: "Try this today", max: 500 },
  { key: "reflection", label: "Reflection question", max: 350 },
  { key: "smsText", label: "Short SMS explanation and example", max: 600 },
];
const emptyDraft: PracticeDraft = {
  title: "",
  summary: "",
  plainMeaning: "",
  everydayExample: "",
  action: "",
  reflection: "",
  smsText: "",
  category: categories[0],
  minutes: 5,
};
const emptyChecks = {
  reference: false,
  context: false,
  meaning: false,
  safety: false,
  rights: false,
  originalExplanation: false,
};

export default function OperatorContent() {
  const access = useOperator();
  const [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState<ContentVersion | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(""),
    [revision, setRevision] = useState(0);
  const [practiceId, setPracticeId] = useState(""),
    [editionId, setEditionId] = useState(""),
    [book, setBook] = useState(""),
    [chapter, setChapter] = useState(1),
    [fromVerse, setFromVerse] = useState(1),
    [toVerse, setToVerse] = useState(1),
    [mode, setMode] = useState<"manual" | "generate">("manual"),
    [draft, setDraft] = useState<PracticeDraft>(emptyDraft),
    [notes, setNotes] = useState("");
  const [reviewChecks, setReviewChecks] = useState(emptyChecks),
    [reviewReason, setReviewReason] = useState(""),
    [confirm, setConfirm] = useState(false);
  const [reviews, setReviews] = useState<Page<Review> | null>(null);
  useEffect(() => {
    if (access?.role === "support") return;
    const controller = new AbortController();
    void memberRequest<Data>("/api/operator/content", { signal: controller.signal })
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) setError(memberError(error));
      });
    return () => controller.abort();
  }, [access?.role, revision]);
  if (access?.role === "support")
    return (
      <Status error>
        Your role has access to support records. Content editing requires an editor or administrator
        role.
      </Status>
    );
  async function perform(name: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError("");
    setStatus("");
    try {
      await task();
    } catch (error) {
      setError(memberError(error));
    } finally {
      setBusy("");
    }
  }
  async function command(body: unknown) {
    return memberRequest<{ version?: ContentVersion; outcome?: string; reason?: string }>(
      "/api/operator/content",
      { method: "POST", body: JSON.stringify(body) },
      50_000,
    );
  }
  function select(version: ContentVersion) {
    setSelected(version);
    setReviewChecks(emptyChecks);
    setReviewReason("");
    setConfirm(false);
    setReviews(null);
  }
  async function decision(action: "review" | "publish" | "withdraw", approve = false) {
    const result = await command({
      action,
      versionId: selected!.id,
      ...(action === "review"
        ? {
            review: {
              decision: approve ? "approve" : "reject",
              checks: reviewChecks,
              reason: reviewReason,
            },
          }
        : action === "withdraw"
          ? { reason: reviewReason, confirmed: confirm }
          : { confirmed: confirm }),
    });
    if (result.version) {
      select(result.version);
      try {
        const detail = await memberRequest<{ reviews: Page<Review> }>(
          `/api/operator/content?version=${result.version.id}`,
        );
        setReviews(detail.reviews);
      } catch {
        setError(
          "The action was recorded, but its review history could not be refreshed. Open the version again to check the latest state.",
        );
      }
    }
    setStatus(
      action === "review"
        ? "Review recorded. Publication is a separate action."
        : action === "publish"
          ? "This approved version is now published."
          : "This version has been withdrawn from future selection.",
    );
    setRevision((n) => n + 1);
  }
  return (
    <>
      <PageHeading
        eyebrow="OPERATOR WORKSPACE"
        title="Content review"
        description="Start with a verified passage. Keep the source, explanation, example, and practical action clear."
      />
      <Status error>{error}</Status>
      <Status>{status}</Status>
      {!data ? (
        <p role="status">Loading the editorial workspace…</p>
      ) : (
        <>
          {!data.rightsEnabled && (
            <p className="operator-note">
              Source use is disabled until the edition inventory and permissions are approved. The
              existing 24 bundled practices remain available.
            </p>
          )}
          <div className="operator-grid">
            <div className="operator-stack">
              <section className="panel">
                <div className="button-row">
                  <h2>Drafts and published versions</h2>
                  <button
                    className="button button-secondary"
                    disabled={!!busy}
                    onClick={() => setRevision((n) => n + 1)}
                  >
                    Refresh
                  </button>
                </div>
                <p className="field-hint">
                  Showing {data.drafts.items.length} of {data.drafts.total} versions. Older versions
                  stay in the audit history.
                </p>
                {data.drafts.items.length === 0 ? (
                  <p>
                    No drafts yet. Register and import an approved edition, then create the first
                    practice below.
                  </p>
                ) : (
                  data.drafts.items.map((version) => (
                    <article key={version.id} className="operator-record">
                      <h3>{version.draft.title}</h3>
                      <p>
                        {version.passage.reference} · {version.passage.editionTitle}
                      </p>
                      <p className="operator-meta">
                        Version {version.revision} ·{" "}
                        {version.withdrawn
                          ? "Withdrawn"
                          : version.published
                            ? "Published"
                            : version.review === "approve"
                              ? "Approved"
                              : version.review === "reject"
                                ? "Needs revision"
                                : "Awaiting review"}{" "}
                        ·{" "}
                        {version.provenance.kind === "openai"
                          ? "AI-assisted draft"
                          : "Human-authored draft"}
                      </p>
                      <button
                        className="button button-secondary"
                        disabled={!!busy}
                        onClick={() =>
                          void perform("select", async () => {
                            const result = await memberRequest<{
                              version: ContentVersion;
                              reviews: Page<Review>;
                            }>(`/api/operator/content?version=${version.id}`);
                            select(result.version);
                            setReviews(result.reviews);
                          })
                        }
                      >
                        Read and review
                      </button>
                    </article>
                  ))
                )}
                {data.drafts.nextCursor && (
                  <button
                    className="button button-secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void perform("more", async () => {
                        const next = await memberRequest<Data>(
                          `/api/operator/content?cursor=${encodeURIComponent(data.drafts.nextCursor!)}`,
                        );
                        setData({
                          ...data,
                          drafts: {
                            ...next.drafts,
                            items: [...data.drafts.items, ...next.drafts.items],
                          },
                        });
                      })
                    }
                  >
                    Load more versions
                  </button>
                )}
              </section>
              <section className="panel">
                <h2>Create a draft</h2>
                <p>
                  Drafts are never sent automatically. Each version needs a human review and a
                  separate publication action.
                </p>
                <form
                  className="operator-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void perform("create", async () => {
                      const passage = {
                        editionId,
                        book,
                        chapter,
                        fromVerse,
                        toVerse,
                        contextVerses: 3,
                      };
                      const result = await command({
                        action: mode,
                        practiceId,
                        passage,
                        ...(mode === "manual" ? { draft, notes } : { category: draft.category }),
                      });
                      if (result.outcome === "insufficient_context") {
                        setStatus(
                          "The selected passage did not provide enough context for a reliable draft. Select a different passage or write a draft for review.",
                        );
                        return;
                      }
                      if (result.version) select(result.version);
                      setStatus(
                        "Draft saved. Read the passage and every section before reviewing it.",
                      );
                      setRevision((n) => n + 1);
                    });
                  }}
                >
                  <fieldset disabled={!!busy || !data.rightsEnabled}>
                    <legend>Passage and format</legend>
                    <div className="field">
                      <label htmlFor="draft-id">Practice identifier</label>
                      <input
                        id="draft-id"
                        pattern="[a-z0-9][a-z0-9-]{0,79}"
                        maxLength={80}
                        required
                        value={practiceId}
                        onChange={(e) => setPracticeId(e.target.value)}
                      />
                      <p className="field-hint">
                        Use a stable name such as “a-small-act-of-kindness”. Reusing a custom
                        identifier creates a new version.
                      </p>
                    </div>
                    <div className="field">
                      <label htmlFor="draft-edition">Approved source edition</label>
                      <select
                        id="draft-edition"
                        required
                        value={editionId}
                        onChange={(e) => {
                          setEditionId(e.target.value);
                          setBook("");
                        }}
                      >
                        <option value="">Choose an imported edition</option>
                        {data.editions.items.map((edition) => (
                          <option
                            key={edition.id}
                            value={edition.id}
                            disabled={
                              mode === "generate"
                                ? !edition.eligibleForAi
                                : !edition.eligibleForDraft
                            }
                          >
                            {edition.manifest.title}
                            {!edition.importedAt
                              ? " · import needed"
                              : !edition.rights.approved
                                ? " · permission needed"
                                : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="draft-book">Book</label>
                      <select
                        id="draft-book"
                        required
                        value={book}
                        onChange={(e) => setBook(e.target.value)}
                      >
                        <option value="">Choose a book</option>
                        {data.editions.items
                          .find((e) => e.id === editionId)
                          ?.manifest.books.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="field-grid">
                      {[
                        { id: "chapter", label: "Chapter", value: chapter, set: setChapter },
                        { id: "from", label: "First verse", value: fromVerse, set: setFromVerse },
                        { id: "to", label: "Last verse", value: toVerse, set: setToVerse },
                      ].map((field) => (
                        <div className="field" key={field.id}>
                          <label htmlFor={`draft-${field.id}`}>{field.label}</label>
                          <input
                            id={`draft-${field.id}`}
                            type="number"
                            min={1}
                            max={300}
                            required
                            value={field.value}
                            onChange={(e) => field.set(Number(e.target.value))}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="field">
                      <label htmlFor="draft-category">Topic</label>
                      <select
                        id="draft-category"
                        value={draft.category}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            category: e.target.value as PracticeDraft["category"],
                          })
                        }
                      >
                        {categories.map((c) => (
                          <option value={c} key={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="draft-mode">Drafting method</label>
                      <select
                        id="draft-mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as "manual" | "generate")}
                      >
                        <option value="manual">Write an original explanation</option>
                        <option value="generate" disabled={!data.aiEnabled}>
                          Generate a source-grounded draft
                          {!data.aiEnabled ? " · AI setup needed" : ""}
                        </option>
                      </select>
                    </div>
                    {mode === "manual" ? (
                      <>
                        {fields.map((field) => (
                          <div className="field" key={field.key}>
                            <label htmlFor={`draft-${field.key}`}>{field.label}</label>
                            <textarea
                              id={`draft-${field.key}`}
                              maxLength={field.max}
                              required
                              value={draft[field.key]}
                              onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                            />
                          </div>
                        ))}
                        <div className="field">
                          <label htmlFor="draft-minutes">Suggested minutes</label>
                          <input
                            id="draft-minutes"
                            type="number"
                            min={1}
                            max={60}
                            required
                            value={draft.minutes}
                            onChange={(e) =>
                              setDraft({ ...draft, minutes: Number(e.target.value) })
                            }
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="draft-notes">Author or revision notes</label>
                          <textarea
                            id="draft-notes"
                            required
                            minLength={10}
                            maxLength={1000}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="field-hint">
                        The AI receives only the selected passage, nearby context, and topic.
                        Generating a draft uses the configured AI account; it does not publish or
                        send it.
                      </p>
                    )}
                  </fieldset>
                  <button
                    className="button button-primary"
                    disabled={
                      !!busy ||
                      !data.rightsEnabled ||
                      !data.editions.items.some((e) =>
                        mode === "generate" ? e.eligibleForAi : e.eligibleForDraft,
                      )
                    }
                  >
                    {busy === "create"
                      ? "Preparing draft…"
                      : mode === "manual"
                        ? "Save draft for review"
                        : "Generate draft for review"}
                  </button>
                </form>
                {data.editions.nextCursor && (
                  <button
                    className="button button-secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void perform("editions", async () => {
                        const next = await memberRequest<Data>(
                          `/api/operator/content?editionCursor=${encodeURIComponent(data.editions.nextCursor!)}`,
                        );
                        setData({
                          ...data,
                          editions: {
                            ...next.editions,
                            items: [...data.editions.items, ...next.editions.items],
                          },
                        });
                      })
                    }
                  >
                    Load more source editions
                  </button>
                )}
              </section>
            </div>
            <aside className="operator-stack">
              {!selected ? (
                <section className="panel">
                  <h2>A deliberate review</h2>
                  <p>
                    Select a version to compare its explanation with the source passage and context.
                  </p>
                  <p>
                    Approval means you have performed the checks shown here. Automated checks do not
                    establish theological accuracy or content rights.
                  </p>
                </section>
              ) : (
                <section className="panel">
                  <h2>{selected.draft.title}</h2>
                  <p>
                    {selected.passage.reference} · {selected.passage.editionTitle}
                  </p>
                  <p className="operator-id">
                    Version {selected.revision} · {selected.id}
                  </p>
                  <a
                    className="text-link"
                    href={selected.passage.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open the source passage
                  </a>
                  <article className="operator-record">
                    <h3>Source passage</h3>
                    {selected.passage.verses.map((v) => (
                      <p key={v.verse}>
                        {v.verse}. {v.text}
                      </p>
                    ))}
                    <details>
                      <summary>Nearby passage context</summary>
                      {selected.passage.context.map((v) => (
                        <p key={v.verse}>
                          {v.verse}. {v.text}
                        </p>
                      ))}
                    </details>
                  </article>
                  {fields
                    .filter((f) => f.key !== "title")
                    .map((f) => (
                      <article className="operator-record" key={f.key}>
                        <h3>{f.label}</h3>
                        <p className="operator-review-copy">{selected.draft[f.key]}</p>
                      </article>
                    ))}
                  <p className="field-hint">
                    {selected.provenance.kind === "openai"
                      ? `Generated with ${selected.provenance.model}; prompt ${selected.provenance.promptVersion}.`
                      : "Original manual draft."}{" "}
                    Published: {selected.published ? "yes" : "no"}. Latest review:{" "}
                    {selected.review ?? "none"}.
                  </p>
                  <button
                    className="button button-secondary"
                    disabled={!!busy}
                    onClick={() => {
                      setPracticeId(selected.practiceId);
                      setEditionId(selected.editionId);
                      setBook(selected.passage.book);
                      setChapter(selected.passage.chapter);
                      setFromVerse(selected.passage.fromVerse);
                      setToVerse(selected.passage.toVerse);
                      setDraft(selected.draft);
                      setMode("manual");
                      setNotes("");
                      setStatus(
                        "The draft form contains this version. Save your changes to create a new version; published text is preserved.",
                      );
                    }}
                  >
                    Use as a new revision
                  </button>
                  <section className="operator-record">
                    <h3>Review history</h3>
                    {!reviews ? (
                      <p>Open this version from the list to load its review notes.</p>
                    ) : reviews.items.length === 0 ? (
                      <p>No human review has been recorded.</p>
                    ) : (
                      <>
                        <p className="field-hint">
                          Showing {reviews.items.length} of {reviews.total} reviews.
                        </p>
                        {reviews.items.map((review) => (
                          <article className="operator-record" key={review.sequence}>
                            <strong>
                              {review.action === "review_approve"
                                ? "Approved"
                                : "Revision requested"}
                            </strong>
                            <p>{review.detail.reason}</p>
                            <p className="field-hint">
                              {new Date(review.createdAt).toLocaleString("en-CA")}
                            </p>
                          </article>
                        ))}
                        {reviews.nextCursor && (
                          <button
                            className="button button-secondary"
                            disabled={!!busy}
                            onClick={() =>
                              void perform("reviews", async () => {
                                const result = await memberRequest<{ reviews: Page<Review> }>(
                                  `/api/operator/content?version=${selected.id}&reviewCursor=${encodeURIComponent(reviews.nextCursor!)}`,
                                );
                                setReviews({
                                  ...result.reviews,
                                  items: [...reviews.items, ...result.reviews.items],
                                });
                              })
                            }
                          >
                            Load older reviews
                          </button>
                        )}
                      </>
                    )}
                  </section>
                  {selected.withdrawn ? (
                    <p className="operator-note">
                      This version is withdrawn. Create a new revision to make further changes.
                    </p>
                  ) : (
                    <form
                      className="operator-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void perform("review", () => decision("review", true));
                      }}
                    >
                      <fieldset disabled={!!busy || selected.published}>
                        <legend>Human review</legend>
                        {Object.entries(checks).map(([key, label]) => (
                          <label className="check-label" key={key}>
                            <input
                              type="checkbox"
                              checked={reviewChecks[key as keyof typeof checks]}
                              onChange={(e) =>
                                setReviewChecks({ ...reviewChecks, [key]: e.target.checked })
                              }
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </fieldset>
                      <div className="field">
                        <label htmlFor="review-reason">Review notes or withdrawal reason</label>
                        <textarea
                          id="review-reason"
                          required
                          minLength={10}
                          maxLength={2000}
                          value={reviewReason}
                          onChange={(e) => setReviewReason(e.target.value)}
                          disabled={!!busy}
                        />
                      </div>
                      <div className="button-row">
                        <button
                          className="button button-primary"
                          disabled={
                            !!busy ||
                            selected.published ||
                            !Object.values(reviewChecks).every(Boolean) ||
                            reviewReason.trim().length < 10
                          }
                        >
                          Record approval
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={!!busy || selected.published || reviewReason.trim().length < 10}
                          onClick={() => void perform("reject", () => decision("review"))}
                        >
                          Request revision
                        </button>
                      </div>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={confirm}
                          onChange={(e) => setConfirm(e.target.checked)}
                          disabled={!!busy}
                        />
                        <span>
                          I have reviewed this exact version and understand that publication makes
                          it eligible for member display and permitted reminder channels.
                        </span>
                      </label>
                      <div className="button-row">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={
                            !!busy ||
                            !confirm ||
                            selected.review !== "approve" ||
                            selected.published
                          }
                          onClick={() => void perform("publish", () => decision("publish"))}
                        >
                          Publish approved version
                        </button>
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={!!busy || !confirm || reviewReason.trim().length < 10}
                          onClick={() => void perform("withdraw", () => decision("withdraw"))}
                        >
                          Withdraw this version
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
