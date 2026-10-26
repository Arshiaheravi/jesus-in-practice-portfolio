"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDemo } from "@/components/demo-provider";
import { practiceHref, usePracticeLabels } from "@/components/practice-catalog";
import { EmptyState, PageHeading, Status } from "@/components/ui";
import { type HistoryPage, memberError, memberRequest } from "@/lib/member-api";

export default function ProgressLiveView() {
  const { state, member } = useDemo();
  const [tab, setTab] = useState<"practices" | "reflections">("practices");
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);
  const labels = usePracticeLabels([
    ...(page?.items.map((item) => item.id) ?? []),
    ...Object.keys(state.notes),
  ]);
  const load = useCallback(async (cursor?: string) => {
    const requestId = ++request.current;
    setLoading(true);
    setError("");
    try {
      const data = await memberRequest<HistoryPage>(
        `/api/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (requestId !== request.current) return;
      setPage((current) => ({
        ...data,
        items:
          cursor && current
            ? [
                ...current.items,
                ...data.items.filter(
                  (item) => !current.items.some((existing) => existing.recordId === item.recordId),
                ),
              ]
            : data.items,
      }));
    } catch (error) {
      if (requestId === request.current) setError(memberError(error));
    } finally {
      if (requestId === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const lifecycle = { active: true };
    const requests = request;
    void Promise.resolve().then(() => {
      if (lifecycle.active) void load();
    });
    return () => {
      lifecycle.active = false;
      requests.current++;
    };
  }, [load, member?.revision]);
  const notes = Object.entries(state.notes).filter(([, note]) => note.trim());
  return (
    <>
      <PageHeading
        eyebrow="WHAT YOU HAVE PUT INTO PRACTICE"
        title="Your journey"
        description="Your recorded practices and optional reflections, saved to your account."
      />
      <div className="progress-stats">
        <div className="panel">
          <strong>{page?.total ?? member?.history.total ?? "—"}</strong>
          <span>recorded practices</span>
        </div>
        <div className="panel">
          <strong>{page ? new Set(page.items.map((item) => item.date)).size : "—"}</strong>
          <span>days in loaded history</span>
        </div>
        <div className="panel">
          <strong>{notes.length}</strong>
          <span>reflections saved</span>
        </div>
      </div>
      <div className="segmented-control" role="group" aria-label="Journey view">
        <button aria-pressed={tab === "practices"} onClick={() => setTab("practices")}>
          Practiced
        </button>
        <button aria-pressed={tab === "reflections"} onClick={() => setTab("reflections")}>
          Reflections
        </button>
      </div>
      {labels.error && (
        <div>
          <Status error>{labels.error}</Status>
          <button className="text-link" onClick={labels.refresh}>
            Retry practice titles
          </button>
        </div>
      )}
      {labels.limited && (
        <p className="field-hint">
          Current titles are loaded for up to 1,000 records. All loaded history remains below; open
          an older practice to check its current version.
        </p>
      )}
      {tab === "practices" ? (
        <>
          {error && (
            <>
              <Status error>{error}</Status>
              <button
                className="button button-secondary"
                disabled={loading}
                onClick={() => void load()}
              >
                Refresh history
              </button>
            </>
          )}
          {!page ? (
            <p role="status">
              {loading ? "Loading your history…" : "History is unavailable. Refresh to try again."}
            </p>
          ) : page.items.length === 0 ? (
            <EmptyState
              title="Your first step belongs here"
              action="Find today’s practice"
              href="/dashboard"
            >
              Record a practice after you have tried it. Your history will grow here.
            </EmptyState>
          ) : (
            <>
              <div className="journey-list">
                {page.items.map((item) => {
                  const practice = labels.get(item.id);
                  return (
                    <article className="journey-row" key={item.recordId}>
                      <div>
                        {practice ? (
                          <Link className="text-link" href={practiceHref(practice.id)}>
                            {practice.title}
                          </Link>
                        ) : (
                          <Link className="text-link" href={practiceHref(item.id)}>
                            Previously recorded practice · view current version
                          </Link>
                        )}
                        <p className="small muted">
                          {practice?.reference ||
                            "Your completion is retained; the current version may have changed or been withdrawn."}{" "}
                          ·{" "}
                          <time dateTime={item.date}>
                            {new Intl.DateTimeFormat("en-CA", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                              timeZone: "UTC",
                            }).format(new Date(`${item.date}T12:00:00Z`))}
                          </time>
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="field-hint">
                Showing {page.items.length} of {page.total} recorded practices.
              </p>
              {page.nextCursor && (
                <button
                  className="button button-secondary load-more"
                  disabled={loading}
                  onClick={() => void load(page.nextCursor!)}
                >
                  {loading ? "Loading…" : "Load more practices"}
                </button>
              )}
            </>
          )}
        </>
      ) : notes.length === 0 ? (
        <EmptyState
          title="A space for reflection"
          action="Explore the practice library"
          href="/library"
        >
          You can save an optional reflection from any practice.
        </EmptyState>
      ) : (
        <div className="reflections-list">
          {notes.map(([id, note]) => {
            const practice = labels.get(id);
            return (
              <article className="panel" key={id}>
                <h2>{practice?.title || "Saved reflection"}</h2>
                <p className="reflection-text">{note}</p>
                {
                  <Link className="text-link" href={practiceHref(id)}>
                    {practice ? "Continue reflecting" : "Open current practice, if available"}
                  </Link>
                }
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
