"use client";

import { practices, type Source, sourceLabels } from "@jesus-in-practice/content";
import { ShuffleIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useState } from "react";

export default function MessagePreview() {
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [source, setSource] = useState<Source | "both">("bible");
  const [practice, setPractice] = useState(practices[0]);
  function changeSource(value: Source | "both") {
    setSource(value);
    if (value !== "both" && practice.source !== value)
      setPractice(practices.find((item) => item.source === value)!);
  }
  function anotherExample() {
    const eligible = practices.filter(
      (item) => (source === "both" || item.source === source) && item.id !== practice.id,
    );
    if (eligible.length) setPractice(eligible[Math.floor(Math.random() * eligible.length)]);
  }
  return (
    <div className="message-preview" aria-label="Scripture message preview">
      <div className="preview-controls">
        <div className="field">
          <label htmlFor="example-source">Example scripture source</label>
          <select
            id="example-source"
            value={source}
            onChange={(event) => changeSource(event.target.value as Source | "both")}
          >
            <option value="bible">Bible · KJV</option>
            <option value="book-of-mormon">Book of Mormon</option>
            <option value="both">Both collections</option>
          </select>
        </div>
        <div className="segmented" role="group" aria-label="Message preview channel">
          <button
            type="button"
            aria-pressed={channel === "email"}
            onClick={() => setChannel("email")}
          >
            Email
          </button>
          <button type="button" aria-pressed={channel === "sms"} onClick={() => setChannel("sms")}>
            Text message
          </button>
        </div>
      </div>
      <div className="message-card" aria-live="polite">
        <div className="message-heading">
          <div>
            <p className="message-label">
              {sourceLabels[practice.source]} /{" "}
              {channel === "email" ? "Email example" : "SMS example"}
            </p>
            <h3>{practice.title}</h3>
          </div>
          <a className="reference-link" href={practice.sourceUrl} target="_blank" rel="noreferrer">
            {practice.reference} <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        {channel === "email" ? (
          <div className="lesson-grid">
            <div className="lesson-block">
              <h4>In plain language</h4>
              <p>{practice.plainMeaning}</p>
            </div>
            <div className="lesson-block example">
              <h4>In real life</h4>
              <p>{practice.everydayExample}</p>
            </div>
            <div className="lesson-block action">
              <h4>Try this today</h4>
              <p>{practice.action}</p>
            </div>
            <div className="lesson-block reflect">
              <h4>Think about it</h4>
              <p>{practice.reflection}</p>
            </div>
          </div>
        ) : (
          <div className="sms-preview">
            <p>{practice.smsText}</p>
            <p className="fine-print">
              Longer texts can span multiple SMS parts. This is sample content, not a sent message.
            </p>
          </div>
        )}
        <details className="passage-context">
          <summary>About the passage</summary>
          <p>{practice.summary}</p>
        </details>
        <p className="original-label">
          Our explanation and example, inspired by the linked passage. Not a scripture quotation.
        </p>
      </div>
      <div className="preview-bottom">
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={anotherExample}
        >
          <ShuffleIcon aria-hidden="true" width={17} height={17} />
          Try another example
        </button>
        <Link className="text-link" href={`/practices/${practice.id}`}>
          Read this practice <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <p className="fine-print">
        Curated preview: selected from our {practices.length} prepared lessons. Nothing is generated
        or sent live.
      </p>
    </div>
  );
}
