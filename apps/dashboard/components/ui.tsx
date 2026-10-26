"use client";

import { type Practice, sourceLabels } from "@jesus-in-practice/content";
import {
  ArrowRightIcon,
  ArrowTopRightIcon,
  BookmarkFilledIcon,
  BookmarkIcon,
  CheckIcon,
  ReaderIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useState } from "react";

import { useDemo } from "@/components/demo-provider";
import { practiceHref } from "@/components/practice-catalog";
import { memberError } from "@/lib/member-api";

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Status({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  if (!children) return null;
  return (
    <p className={`status ${error ? "status-error" : ""}`} role={error ? "alert" : "status"}>
      {!error && <CheckIcon aria-hidden="true" />}
      {children}
    </p>
  );
}
export function EmptyState({
  title,
  children,
  action,
  href,
}: {
  title: string;
  children: React.ReactNode;
  action?: string;
  href?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <ReaderIcon aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action && href && (
        <Link className="button button-primary" href={href}>
          {action}
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
export function SaveButton({ id, compact = false }: { id: string; compact?: boolean }) {
  const { state, update, pending } = useDemo();
  const [error, setError] = useState("");
  const saved = state.saved.includes(id);
  return (
    <span className="save-control">
      <button
        type="button"
        className={compact ? "icon-button save-button" : "button button-secondary"}
        aria-label={compact ? (saved ? "Remove saved practice" : "Save practice") : undefined}
        aria-pressed={saved}
        disabled={pending}
        onClick={async () => {
          setError("");
          try {
            await update((current) => ({
              ...current,
              saved: saved ? current.saved.filter((item) => item !== id) : [...current.saved, id],
            }));
          } catch (error) {
            setError(memberError(error));
          }
        }}
      >
        {saved ? <BookmarkFilledIcon aria-hidden="true" /> : <BookmarkIcon aria-hidden="true" />}
        {!compact && (saved ? "Saved" : "Save practice")}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
export function PracticeCard({ practice }: { practice: Practice }) {
  return (
    <article className="practice-card">
      <div className="card-topline">
        <span className="tag">{practice.category}</span>
        <SaveButton id={practice.id} compact />
      </div>
      <Link href={practiceHref(practice.id)} className="practice-card-link">
        <h2>{practice.title}</h2>
        <span className="card-kicker">In plain language</span>
        <p>{practice.plainMeaning}</p>
        <span className="card-example">
          <strong>In real life</strong>
          {practice.everydayExample}
        </span>
        <span className="practice-meta">
          {sourceLabels[practice.source]} <span aria-hidden="true">·</span> {practice.minutes} min
          practice
        </span>
        <span className="card-footer">
          <span>Explore this practice</span>
          <ArrowRightIcon aria-hidden="true" />
        </span>
      </Link>
      <a
        className="card-source-link"
        href={practice.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {practice.reference}
        <ArrowTopRightIcon aria-hidden="true" />
        <span className="sr-only"> (read scripture in a new tab)</span>
      </a>
    </article>
  );
}
export function LoadingContent() {
  return (
    <div className="loading-content" role="status">
      <span className="loading-dot" />
      <p>Opening your practice space…</p>
    </div>
  );
}
export function SourceOptions({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: "bible" | "book-of-mormon" | "both") => void;
}) {
  const choices = [
    {
      value: "bible" as const,
      title: "Bible · King James Version",
      text: "Practical teachings from the Old and New Testaments.",
    },
    {
      value: "book-of-mormon" as const,
      title: "Book of Mormon",
      text: "Practical teachings from the Book of Mormon, clearly identified.",
    },
    {
      value: "both" as const,
      title: "Explore both",
      text: "A mix of both sources. Every practice names its source.",
    },
  ];
  return (
    <div className="choice-stack">
      {choices.map((choice) => (
        <label className={`choice ${value === choice.value ? "selected" : ""}`} key={choice.value}>
          <input
            type="radio"
            name="source"
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
          />
          <span>
            <strong>{choice.title}</strong>
            <span>{choice.text}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
