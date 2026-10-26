"use client";

import { categories, practices } from "@jesus-in-practice/content";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useState } from "react";

import { useDemo } from "@/components/demo-provider";
import LibraryLiveView from "@/components/library-live-view";
import { EmptyState, PageHeading, PracticeCard } from "@/components/ui";

export default function LibraryView({ savedOnly = false }: { savedOnly?: boolean }) {
  const { state, mode } = useDemo();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string>(savedOnly ? "both" : state.source);
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const base = savedOnly
    ? practices.filter((practice) => state.saved.includes(practice.id))
    : practices;
  const filtered = base.filter(
    (practice) =>
      (source === "both" || practice.source === source) &&
      (category === "all" || category === practice.category) &&
      `${practice.title} ${practice.summary} ${practice.reference} ${practice.category} ${practice.plainMeaning} ${practice.everydayExample} ${practice.action}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 9));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 9, currentPage * 9);
  function clear() {
    setSearch("");
    setSource(savedOnly ? "both" : state.source);
    setCategory("all");
    setPage(1);
  }
  if (mode === "live") return <LibraryLiveView savedOnly={savedOnly} />;
  return (
    <>
      <PageHeading
        eyebrow={savedOnly ? "YOUR PERSONAL COLLECTION" : "SCRIPTURE, MADE PRACTICAL"}
        title={savedOnly ? "Your saved practices" : "The practice library"}
        description={
          savedOnly
            ? "Return to the teachings and real-life ideas you want to keep practicing."
            : "A scripture reference. A clear explanation. An everyday example. Something you can actually try."
        }
      />
      {savedOnly && !base.length ? (
        <EmptyState
          title="Build your own practice collection"
          action="Find a practice to save"
          href="/library"
        >
          Tap the bookmark on any practice. It will be here when you want to return to it.
        </EmptyState>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="search-field">
              <MagnifyingGlassIcon aria-hidden="true" />
              <label className="sr-only" htmlFor="practice-search">
                Search practices
              </label>
              <input
                id="practice-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search a topic, practice, or verse"
                type="search"
              />
            </div>
            <div className="filter-field">
              <label htmlFor="source-filter">Scripture source</label>
              <select
                id="source-filter"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setPage(1);
                }}
              >
                <option value="both">Both sources</option>
                <option value="bible">Bible · KJV</option>
                <option value="book-of-mormon">Book of Mormon</option>
              </select>
            </div>
            <div className="filter-field">
              <label htmlFor="category-filter">Topic</label>
              <select
                id="category-filter"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All topics</option>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="results-summary">
            <p role="status">
              {filtered.length} {filtered.length === 1 ? "practice" : "practices"}
              {filtered.length > 0 &&
                ` · showing ${(currentPage - 1) * 9 + 1}–${Math.min(currentPage * 9, filtered.length)}`}
            </p>
            <button className="text-link" onClick={clear}>
              Clear filters
            </button>
          </div>
          {!filtered.length ? (
            <div className="empty-state">
              <h2>No practices found</h2>
              <p>Try another word, topic, or scripture source.</p>
              <button className="button button-secondary" onClick={clear}>
                Show all practices
              </button>
            </div>
          ) : (
            <div className="practice-grid">
              {visible.map((practice) => (
                <PracticeCard key={practice.id} practice={practice} />
              ))}
            </div>
          )}
          {pageCount > 1 && (
            <nav className="pagination" aria-label="Practice pages">
              <button
                className="button button-secondary"
                disabled={currentPage === 1}
                onClick={() => {
                  setPage((value) => value - 1);
                  document.getElementById("main-content")?.scrollIntoView({ behavior: "instant" });
                }}
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {pageCount}
              </span>
              <button
                className="button button-secondary"
                disabled={currentPage === pageCount}
                onClick={() => {
                  setPage((value) => value + 1);
                  document.getElementById("main-content")?.scrollIntoView({ behavior: "instant" });
                }}
              >
                Next
              </button>
            </nav>
          )}
          <p className="library-footnote">
            {practices.length} starter practices, with original summaries and links to their
            scripture sources. This is a curated beginning, not a complete scripture catalogue.
          </p>
        </>
      )}
    </>
  );
}
