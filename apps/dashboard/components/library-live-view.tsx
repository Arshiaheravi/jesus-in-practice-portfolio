"use client";
import { categories } from "@jesus-in-practice/content";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";

import { useDemo } from "@/components/demo-provider";
import { CatalogStatus, usePracticeCatalog } from "@/components/practice-catalog";
import { EmptyState, PageHeading, PracticeCard } from "@/components/ui";
export default function LibraryLiveView({ savedOnly = false }: { savedOnly?: boolean }) {
  const { state, member } = useDemo();
  const [source, setSource] = useState<string>(savedOnly ? "both" : state.source);
  const [topic, setTopic] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const catalog = usePracticeCatalog(
    { source, topics: topic === "all" ? [] : [topic], q: query, saved: savedOnly },
    true,
    savedOnly ? member?.revision : undefined,
  );
  const { refresh } = catalog;
  function clear() {
    setSource(savedOnly ? "both" : state.source);
    setTopic("all");
    setSearch("");
    setQuery("");
  }
  return (
    <>
      <PageHeading
        eyebrow={savedOnly ? "YOUR PERSONAL COLLECTION" : "SCRIPTURE, MADE PRACTICAL"}
        title={savedOnly ? "Your saved practices" : "The practice library"}
        description="Practical lessons with a scripture reference, an original explanation, and something you can try."
      />
      <div className="library-toolbar">
        <div className="search-field">
          <MagnifyingGlassIcon aria-hidden="true" />
          <label className="sr-only" htmlFor="practice-search">
            Search practices
          </label>
          <input
            id="practice-search"
            type="search"
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a topic, practice, or verse"
          />
        </div>
        <div className="filter-field">
          <label htmlFor="source-filter">Scripture source</label>
          <select id="source-filter" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="both">Both sources</option>
            <option value="bible">Bible · KJV</option>
            <option value="book-of-mormon">Book of Mormon</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="category-filter">Topic</label>
          <select id="category-filter" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="all">All topics</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="results-summary">
        <p role="status">
          {catalog.page
            ? `${catalog.page.items.length} of ${catalog.page.total} matching practices loaded`
            : "Checking current practices"}
        </p>
        <div className="button-row">
          <button className="text-link" onClick={clear}>
            Clear filters
          </button>
          <button className="text-link" disabled={catalog.loading} onClick={() => void refresh()}>
            Refresh catalogue
          </button>
        </div>
      </div>
      <CatalogStatus catalog={catalog} />
      {catalog.page &&
        (!catalog.page.items.length ? (
          <EmptyState
            title={savedOnly ? "No available saved practices match" : "No practices found"}
          >
            Try another word, topic or source.{" "}
            {savedOnly
              ? "Withdrawn practices are excluded; existing records and reflections are retained."
              : "Only currently available practices appear here."}
          </EmptyState>
        ) : (
          <div className="practice-grid">
            {catalog.page.items.map((practice) => (
              <PracticeCard key={practice.id} practice={practice} />
            ))}
          </div>
        ))}
      {catalog.page?.nextCursor && (
        <button
          className="button button-secondary load-more"
          disabled={catalog.loading}
          onClick={() => void catalog.loadMore()}
        >
          {catalog.loading ? "Loading…" : "Load more practices"}
        </button>
      )}
      <p className="library-footnote">
        The catalogue combines our 24 starter practices with eligible editor-published lessons.
        Search covers the current catalogue; loading a page does not load every lesson. Results
        refresh when this window regains focus or you choose Refresh catalogue. AI-assisted drafts
        require human review before publication.
      </p>
    </>
  );
}
