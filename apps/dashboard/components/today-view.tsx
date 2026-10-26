"use client";

import { type Practice, practices, sourceLabels } from "@jesus-in-practice/content";
import { ArrowRightIcon, CalendarIcon, CheckIcon, ShuffleIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import DeliveryAvailability from "@/components/delivery-availability";
import { persistenceMessage, useCurrentDate, useDemo } from "@/components/demo-provider";
import { CatalogStatus, practiceHref, usePracticeCatalog } from "@/components/practice-catalog";
import PracticeLesson from "@/components/practice-lesson";
import { EmptyState, PageHeading, SaveButton, Status } from "@/components/ui";
import { dateInTimezone, dayLabels, formatTime, toggleCompletion } from "@/lib/demo-model";
import { memberError } from "@/lib/member-api";
import {
  dailyPractice,
  eligiblePractices,
  practiceSessionKey,
  randomPractice,
} from "@/lib/practice-selection";

import type { DesignId } from "../../../shared/designs";

function TodayPractice({ eligible, date }: { eligible: Practice[]; date: string }) {
  const { state, update, pending, mode } = useDemo();
  const initial = dailyPractice(eligible, date);
  const [selectedId, setSelectedId] = useState<string | null>(() => initial?.id ?? null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const practice = eligible.find((item) => item.id === selectedId) || initial;
  if (!practice)
    return (
      <EmptyState
        title="No matching practices yet"
        action="Adjust your preferences"
        href="/settings/preferences"
      >
        The current collection doesn’t have a practice for this combination of sources and topics.
        Try another topic or choose all topics.
      </EmptyState>
    );
  const completed = state.completed.some(
    (entry) => entry.id === practice.id && entry.date === date,
  );
  const sourceName =
    state.source === "both" ? "Bible · KJV + Book of Mormon" : sourceLabels[state.source];
  return (
    <article className="today-card">
      <div className="today-card-body">
        <div className="card-topline">
          <span className="eyebrow">YOUR PRACTICE FOR TODAY</span>
          <span className="tag">{practice.category}</span>
        </div>
        <h2>{practice.title}</h2>
        <PracticeLesson practice={practice} />
        <div className="practice-actions">
          <div className="button-row">
            <button
              className={`button ${completed ? "button-completed" : "button-primary"}`}
              aria-pressed={completed}
              disabled={pending}
              onClick={async () => {
                setFailed(false);
                try {
                  const outcome = await update((current) =>
                    toggleCompletion(current, practice.id, date),
                  );
                  setStatus(
                    persistenceMessage(
                      outcome,
                      completed
                        ? "Practice removed from today’s completed list."
                        : "Practice added to your journey for today.",
                    ),
                  );
                } catch (error) {
                  setFailed(true);
                  setStatus(memberError(error));
                }
              }}
            >
              <CheckIcon aria-hidden="true" />
              {completed ? "Practiced today" : "I practiced this"}
            </button>
            <SaveButton id={practice.id} />
            <Link className="text-link" href={practiceHref(practice.id)}>
              Reflect on this
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </div>
          <Status error={failed}>{status}</Status>
        </div>
        <div className="today-card-bottom">
          <span>
            <strong>{sourceName}</strong>
            <span>
              {eligible.length} matching {mode === "live" ? "loaded" : "starter"}{" "}
              {eligible.length === 1 ? "practice" : "practices"}
            </span>
          </span>
          <button
            className="button button-secondary"
            disabled={eligible.length < 2}
            onClick={() => {
              const next = randomPractice(eligible, practice.id);
              if (next) {
                setFailed(false);
                setSelectedId(next.id);
                setStatus(`Showing ${next.title}.`);
              }
            }}
          >
            <ShuffleIcon aria-hidden="true" />
            Try another practice
          </button>
        </div>
        {eligible.length < 2 && (
          <p className="field-hint">
            This is the only practice matching your choices. You can add topics in Preferences.
          </p>
        )}
      </div>
    </article>
  );
}

export default function TodayView({ design }: { design?: DesignId } = {}) {
  const { state, mode, member } = useDemo();
  const catalog = usePracticeCatalog(
    { source: state.source, topics: state.topics, limit: 100 },
    mode === "live",
  );
  const now = useCurrentDate();
  const date = dateInTimezone(now, state.timezone);
  const eligible = eligiblePractices(
    mode === "live" ? (catalog.page?.items ?? []) : practices,
    state.source,
    state.topics,
  );
  const completedToday = state.completed.filter((entry) => entry.date === date).length;
  const totalDays = new Set(state.completed.map((entry) => entry.date)).size;
  const photo =
    design === "vespers"
      ? {
          src: "/images/christus.webp",
          width: 1200,
          height: 1800,
          alt: "Bertel Thorvaldsen’s sculpture of Christ with outstretched arms",
          credit: "Thorvaldsens Museum / Wikimedia Commons",
          href: "https://commons.wikimedia.org/wiki/File:Bertel_Thorvaldsen,_Kristus,_1821,_A82,_Thorvaldsensmuseum.png",
        }
      : design === "light"
        ? {
            src: "/images/cross-sunset.webp",
            width: 1600,
            height: 1060,
            alt: "People standing near a hilltop cross at sunset",
            credit: "Luis Georg Müller / Unsplash",
            href: "https://unsplash.com/photos/two-people-standing-in-front-of-a-cross-at-sunset-a2F5f8aXu_w",
          }
        : design === "living"
          ? {
              src: "/images/jesus-garden.webp",
              width: 1200,
              height: 1800,
              alt: "A statue of Jesus with open arms in a leafy garden",
              credit: "Maria Cobuz / Pexels",
              href: "https://www.pexels.com/photo/a-statue-of-jesus-in-a-park-26742263/",
            }
          : {
              src: "/images/prayer.webp",
              width: 1200,
              height: 1800,
              alt: "A man with clasped hands praying beside an open Bible",
              credit: "Tima Miroshnichenko / Pexels",
              href: "https://www.pexels.com/photo/a-bearded-man-praying-5206043/",
            };
  return (
    <>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat("en-CA", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: state.timezone,
        }).format(now)}
        title="Put a teaching into practice."
        description="Understand the scripture. Recognize it in real life. Choose one thing to do."
      />
      {!state.onboarded && (
        <div className="setup-callout">
          <div>
            <strong>Your sources. Your interests. Your routine.</strong>
            <p>Choose what you want to learn and when you’d like a reminder.</p>
          </div>
          <Link className="button button-primary" href="/onboarding">
            Set up my practice
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
      )}
      <div className="today-layout">
        <section aria-label="Today’s scripture practice">
          {mode === "live" && <CatalogStatus catalog={catalog} />}
          {(mode !== "live" || catalog.page) && (
            <TodayPractice
              key={practiceSessionKey(state.source, state.topics, date)}
              eligible={eligible}
              date={date}
            />
          )}
          {mode === "live" && catalog.page?.nextCursor && (
            <div className="panel">
              <p>
                {catalog.page.items.length} of {catalog.page.total} matching practices loaded.
                Today’s selection uses this loaded set.
              </p>
              <button
                className="button button-secondary"
                disabled={catalog.loading}
                onClick={() => void catalog.loadMore()}
              >
                {catalog.loading ? "Loading…" : "Load more matching practices"}
              </button>
            </div>
          )}
          <div className="collection-note">
            <span className="collection-dot" aria-hidden="true" />
            <p>
              {mode === "live"
                ? "Selected from the currently loaded, published catalogue. AI-assisted lessons require editorial review; no unreviewed response is shown here."
                : `Selected from our ${practices.length}-practice starter collection. Every reference leads back to its source.`}
            </p>
            <Link href="/help#sources">How content works</Link>
          </div>
        </section>
        <aside className="today-rail" aria-label="Your practice overview">
          <section className="practice-photo-card">
            <Image
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              sizes="(max-width: 760px) 100vw, 320px"
              priority
            />
            <div>
              <span className="eyebrow">A MOMENT WITH SCRIPTURE</span>
              <h2>
                Pause. Read.
                <br />
                <em>Put it into practice.</em>
              </h2>
              <p>
                Read the passage in context, consider its meaning, and choose a practical response
                for today.
              </p>
              <p className="photo-credit">
                <a href={photo.href} target="_blank" rel="noopener noreferrer">
                  Photo: {photo.credit}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            </div>
          </section>
          <section className="panel rhythm-summary">
            <div className="section-heading">
              <h2>Your reminder plan</h2>
              <CalendarIcon aria-hidden="true" />
            </div>
            <DeliveryAvailability channel={state.channel} />
            <span className={`status-pill ${state.schedule.paused ? "paused" : ""}`}>
              {state.schedule.paused
                ? mode === "live"
                  ? "Reminders paused"
                  : "Preview paused"
                : mode === "live"
                  ? "Saved schedule"
                  : "Schedule preview"}
            </span>
            <strong className="schedule-time">
              {state.schedule.mode === "fixed"
                ? state.schedule.times.map(formatTime).join(" · ")
                : `${formatTime(state.schedule.windowStart)} – ${formatTime(state.schedule.windowEnd)}`}
            </strong>
            <p>
              {state.schedule.days.length === 7
                ? "Every day"
                : state.schedule.days.map((value) => dayLabels[value].slice(0, 3)).join(", ")}
            </p>
            <span className="small muted">
              {state.timezone.replace("America/", "").replaceAll("_", " ")} ·{" "}
              {state.channel === "both" ? "Email + SMS" : state.channel === "sms" ? "SMS" : "Email"}
            </span>
            <p className="quiet-disclaimer">
              {mode === "live"
                ? "Delivery also requires channel consent, a verified destination, and SMS credit when applicable."
                : "A preview of your preferences. No messages are scheduled or sent."}
            </p>
            <Link className="text-link" href="/schedule">
              Adjust your rhythm
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </section>
          <section className="panel">
            <h2>From learning to doing</h2>
            <div className="journey-stats">
              <div>
                <strong>{completedToday}</strong>
                <span>practiced today</span>
              </div>
              <div>
                <strong>{totalDays}</strong>
                <span>
                  {totalDays === 1 ? "day" : "days"}{" "}
                  {mode === "live" && member?.history.hasMore
                    ? "in loaded history"
                    : "with a practice"}
                </span>
              </div>
            </div>
            <p className="small muted">
              Only the actions you record appear here. There’s no score and no streak to keep.
            </p>
            <Link className="text-link" href="/progress">
              See your journey
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
