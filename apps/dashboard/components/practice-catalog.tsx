"use client";
import { type Practice, practices } from "@jesus-in-practice/content";
import { useCallback, useEffect, useRef, useState } from "react";

import { liveMode, MemberApiError, memberError, memberRequest } from "@/lib/member-api";

interface CatalogPage {
  items: Practice[];
  nextCursor: string | null;
  total: number;
  updatedAt: string;
}
interface CatalogQuery {
  source?: string;
  topics?: readonly string[];
  q?: string;
  saved?: boolean;
  limit?: number;
  ids?: readonly string[];
}
export function practiceHref(id: string) {
  return `${liveMode ? "/practice" : "/library"}/${encodeURIComponent(id)}`;
}
export function usePracticeCatalog(
  query: CatalogQuery = {},
  enabled = liveMode,
  refreshKey?: number,
) {
  const params = new URLSearchParams({
    source: query.source ?? "both",
    limit: String(query.limit ?? 24),
  });
  if (query.topics?.length) params.set("topics", [...query.topics].sort().join(","));
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.saved) params.set("saved", "true");
  if (query.ids?.length) params.set("ids", query.ids.join(","));
  const key = params.toString();
  const [result, setResult] = useState<{ key: string; page: CatalogPage } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(
    async (cursor?: string) => {
      if (!enabled) return;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const stamp = ++generation.current;
      setBusy(true);
      setFailure(null);
      try {
        const data = await memberRequest<CatalogPage>(
          `/api/practices?${key}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          { signal: abort.signal },
        );
        if (
          !Array.isArray(data.items) ||
          !Number.isInteger(data.total) ||
          data.total < 0 ||
          !(data.nextCursor === null || typeof data.nextCursor === "string") ||
          data.items.some((item) => !item.id || !item.title || !item.plainMeaning)
        )
          throw new MemberApiError(
            "The practice catalogue could not be read. Please refresh.",
            "INVALID_RESPONSE",
            502,
          );
        if (stamp !== generation.current) return;
        setResult((current) => ({
          key,
          page: {
            ...data,
            items:
              cursor && current?.key === key
                ? [
                    ...current.page.items,
                    ...data.items.filter(
                      (item) => !current.page.items.some((existing) => existing.id === item.id),
                    ),
                  ]
                : data.items,
          },
        }));
      } catch (error) {
        if (stamp === generation.current && !abort.signal.aborted)
          setFailure({ key, message: memberError(error) });
      } finally {
        if (stamp === generation.current) setBusy(false);
      }
    },
    [enabled, key],
  );
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const ids = generation;
    const requests = controller;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      ids.current++;
      requests.current?.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, load, refreshKey]);
  const page = result?.key === key ? result.page : null;
  const error = failure?.key === key ? failure.message : "";
  return {
    page,
    loading: enabled && (busy || (!page && !error)),
    error,
    refresh: () => load(),
    loadMore: () => (page?.nextCursor ? load(page.nextCursor) : Promise.resolve()),
  };
}
export function CatalogStatus({ catalog }: { catalog: ReturnType<typeof usePracticeCatalog> }) {
  return (
    <>
      {catalog.error && (
        <div className="panel">
          <p role="alert">{catalog.error}</p>
          <button
            className="button button-secondary"
            disabled={catalog.loading}
            onClick={() => void catalog.refresh()}
          >
            Refresh practices
          </button>
        </div>
      )}
      {catalog.loading && !catalog.page && <p role="status">Loading published practices…</p>}
    </>
  );
}
/** Titles are optional current metadata; a missing title must never hide a historical record. */
export function usePracticeLabels(ids: readonly string[]) {
  const importedIds = Array.from(new Set(ids)).filter(
    (id) => !practices.some((practice) => practice.id === id),
  );
  const key = importedIds.sort().slice(0, 1000).join(",");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; items: Practice[]; error: string } | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      const selected = key ? key.split(",") : [];
      const items: Practice[] = [];
      try {
        for (let start = 0; start < selected.length; start += 100) {
          const query = new URLSearchParams({
            source: "both",
            limit: "100",
            ids: selected.slice(start, start + 100).join(","),
          });
          const page = await memberRequest<CatalogPage>(`/api/practices?${query}`, {
            signal: controller.signal,
          });
          if (!Array.isArray(page.items)) throw new Error("Unreadable practice labels");
          items.push(...page.items);
        }
        if (active) setResult({ key, items, error: "" });
      } catch {
        if (active && !controller.signal.aborted)
          setResult({
            key,
            items,
            error: "Some current practice titles could not be loaded. Your records are unchanged.",
          });
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, attempt]);
  const map = new Map(practices.map((practice) => [practice.id, practice]));
  if (result?.key === key) for (const practice of result.items) map.set(practice.id, practice);
  return {
    get: (id: string) => map.get(id),
    error: result?.key === key ? result.error : "",
    refresh: () => setAttempt((value) => value + 1),
    limited: importedIds.length > 1000,
  };
}
