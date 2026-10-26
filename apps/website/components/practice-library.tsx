"use client";

import { categories, practices, type Source, sourceLabels } from "@jesus-in-practice/content";
import { useState } from "react";

import PracticeCard from "@/components/practice-card";

export default function PracticeLibrary() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<Source | "both">("bible");
  const [category, setCategory] = useState("all");
  const filtered = practices.filter(
    (practice) =>
      (source === "both" || practice.source === source) &&
      (category === "all" || practice.category === category) &&
      `${practice.title} ${practice.plainMeaning} ${practice.everydayExample} ${practice.action} ${practice.summary} ${practice.reference} ${practice.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  function clear() {
    setQuery("");
    setSource("bible");
    setCategory("all");
  }
  return (
    <div className="library-bottom">
      <div className="filter-panel">
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="practice-search">Find a practice</label>
            <input
              id="practice-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try compassion, rest, or a passage…"
            />
          </div>
          <div className="field">
            <label htmlFor="source-filter">Scripture collection</label>
            <select
              id="source-filter"
              value={source}
              onChange={(event) => setSource(event.target.value as Source | "both")}
            >
              <option value="bible">Bible · KJV</option>
              <option value="book-of-mormon">Book of Mormon</option>
              <option value="both">Both collections</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="topic-filter">Area of life</label>
            <select
              id="topic-filter"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">All topics</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="filter-info">
        <p role="status">
          {filtered.length} {filtered.length === 1 ? "practice" : "practices"}{" "}
          {source !== "both" ? `from ${sourceLabels[source]}` : "across both collections"}
        </p>
        <button type="button" className="link-button" onClick={clear}>
          Reset filters
        </button>
      </div>
      <div className="practices-grid">
        {filtered.length ? (
          filtered.map((practice) => <PracticeCard key={practice.id} practice={practice} />)
        ) : (
          <div className="empty-state">
            <h2>No practices found.</h2>
            <p>
              Try another word or choose a different topic. There is room to begin somewhere else.
            </p>
            <button className="button button-secondary" type="button" onClick={clear}>
              Reset filters
            </button>
          </div>
        )}
      </div>
      <p className="fine-print" style={{ marginTop: 25 }}>
        The full preview library contains {practices.length} original reflections. It is a starting
        collection, not a complete guide to either scripture.
      </p>
    </div>
  );
}
