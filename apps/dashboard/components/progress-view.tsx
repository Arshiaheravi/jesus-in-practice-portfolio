"use client";

import { getPractice } from "@jesus-in-practice/content";
import { ArrowRightIcon, CheckIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useState } from "react";

import { useDemo } from "@/components/demo-provider";
import ProgressLiveView from "@/components/progress-live-view";
import { EmptyState, PageHeading } from "@/components/ui";

function readableDate(date: string) {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
export default function ProgressView() {
  const { state, mode } = useDemo();
  const [tab, setTab] = useState<"practices" | "reflections">("practices");
  const [limit, setLimit] = useState(12);
  const complete = [...state.completed].sort((a, b) => b.date.localeCompare(a.date));
  const notes = Object.entries(state.notes).filter(([, text]) => text.trim());
  if (mode === "live") return <ProgressLiveView />;
  return (
    <>
      <PageHeading
        eyebrow="WHAT YOU’VE PUT INTO PRACTICE"
        title="From a teaching to a habit."
        description="Review the actions you’ve tried and the reflections you’ve kept. Your history starts with what you actually do."
      />
      <div className="progress-stats">
        <div className="panel">
          <strong>{state.completed.length}</strong>
          <span>practices completed</span>
        </div>
        <div className="panel">
          <strong>{new Set(state.completed.map((item) => item.date)).size}</strong>
          <span>days with a practice</span>
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
      {tab === "practices" ? (
        !complete.length ? (
          <EmptyState
            title="Your first step belongs here"
            action="Find today’s practice"
            href="/dashboard"
          >
            When you put a practice into action, tap “I practiced this.” Your own history will grow
            here.
          </EmptyState>
        ) : (
          <>
            <div className="journey-list">
              {complete.slice(0, limit).map((item) => {
                const practice = getPractice(item.id);
                return practice ? (
                  <Link
                    className="journey-row"
                    href={`/library/${practice.id}`}
                    key={`${item.date}-${item.id}`}
                  >
                    <span className="journey-check">
                      <CheckIcon aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{practice.title}</strong>
                      <small>
                        {practice.reference} · {readableDate(item.date)}
                      </small>
                    </span>
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                ) : null;
              })}
            </div>
            {complete.length > limit && (
              <button
                className="button button-secondary load-more"
                onClick={() => setLimit((value) => value + 12)}
              >
                Show more practices ({complete.length - limit} remaining)
              </button>
            )}
          </>
        )
      ) : !notes.length ? (
        <EmptyState
          title="Leave a little space for reflection"
          action="Explore the practice library"
          href="/library"
        >
          Open any practice to add a thought about what you noticed. Reflections are optional and
          stay in this browser.
        </EmptyState>
      ) : (
        <div className="reflections-list">
          {notes.map(([id, note]) => {
            const practice = getPractice(id);
            return practice ? (
              <article className="panel" key={id}>
                <p className="eyebrow">{practice.category}</p>
                <h2>{practice.title}</h2>
                <p className="reflection-text">{note}</p>
                <Link className="text-link" href={`/library/${id}`}>
                  Continue reflecting
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </article>
            ) : null;
          })}
        </div>
      )}
      <p className="library-footnote">
        This is your browser’s preview history, not a synced account. Up to 2,000 completion records
        are retained. Changing browser or clearing its storage starts a new history.
      </p>
    </>
  );
}
