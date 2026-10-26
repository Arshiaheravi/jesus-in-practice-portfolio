"use client";

import { type FormEvent, useRef, useState } from "react";

export default function FeedbackForm({ supportEmail }: { supportEmail: string | null }) {
  const [topic, setTopic] = useState("Content or scripture");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const result = useRef<HTMLDivElement>(null);
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim().length < 15) {
      setError("Please write at least 15 characters so the issue is clear.");
      input.current?.focus();
      return;
    }
    setError("");
    setDraft(`Jesus in Practice feedback\nTopic: ${topic}\n\n${message.trim()}`);
    setCopyStatus("");
    requestAnimationFrame(() => result.current?.focus());
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyStatus("Draft copied. Nothing has been sent.");
    } catch {
      setCopyStatus("Copy is unavailable. Select and copy the draft text below.");
    }
  }
  return (
    <form className="feedback-form" onSubmit={prepare} noValidate>
      <div className="field">
        <label htmlFor="feedback-topic">What is this about?</label>
        <select
          id="feedback-topic"
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value);
            setDraft("");
            setCopyStatus("");
          }}
        >
          <option>Content or scripture</option>
          <option>Accessibility</option>
          <option>Something is not working</option>
          <option>An idea or question</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="feedback-message">Your note</label>
        <textarea
          id="feedback-message"
          ref={input}
          value={message}
          maxLength={2000}
          onChange={(event) => {
            setMessage(event.target.value);
            setDraft("");
            setCopyStatus("");
            if (error) setError("");
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "feedback-hint feedback-error" : "feedback-hint"}
          placeholder="Include the page and what you expected to happen."
        />
        <p className="fine-print" id="feedback-hint">
          Keep personal or sensitive information out of your note. Maximum 2,000 characters.
        </p>
        {error && (
          <p className="field-error" id="feedback-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button className="button" type="submit" style={{ justifySelf: "start" }}>
        Prepare local draft
      </button>
      {draft && (
        <div className="feedback-success" ref={result} tabIndex={-1} role="status">
          <h3>Your draft is ready.</h3>
          <p>
            {supportEmail
              ? "This note has not been sent. Open it in your email app, review it, and send it when you are ready."
              : "This note has not been sent. This demo has no support mailbox; you can copy the draft for your own records."}
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontFamily: "inherit",
              fontSize: ".85rem",
              marginBlock: 20,
            }}
          >
            {draft}
          </pre>
          <button className="button button-secondary button-small" type="button" onClick={copy}>
            Copy draft
          </button>
          {supportEmail && (
            <a
              className="button button-small"
              style={{ marginLeft: 12, marginTop: 12 }}
              href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Jesus in Practice: ${topic}`)}&body=${encodeURIComponent(draft)}`}
            >
              Open email draft
            </a>
          )}
          <p className="status-text" role="status" style={{ marginTop: 12 }}>
            {copyStatus}
          </p>
        </div>
      )}
    </form>
  );
}
