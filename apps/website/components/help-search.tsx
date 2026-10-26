"use client";

import { useState } from "react";

import { helpQuestions } from "@/lib/help";

export default function HelpSearch() {
  const [query, setQuery] = useState("");
  const items = helpQuestions.filter((item) =>
    `${item.question} ${item.answer}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div>
      <div className="field help-search">
        <label htmlFor="help-search">Search help</label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try reminders, privacy, or scripture…"
        />
      </div>
      <p className="fine-print" role="status" style={{ marginBottom: 18 }}>
        {items.length} {items.length === 1 ? "answer" : "answers"}
      </p>
      <div className="faq-list">
        {items.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
      {items.length === 0 && (
        <div className="empty-state">
          <h2>No answers found.</h2>
          <p>Try another search, or prepare a feedback note below.</p>
          <button className="button button-secondary" type="button" onClick={() => setQuery("")}>
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
