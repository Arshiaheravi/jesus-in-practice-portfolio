"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDemo } from "@/components/demo-provider";
import { practiceHref, usePracticeLabels } from "@/components/practice-catalog";
import { EmptyState, PageHeading, Status } from "@/components/ui";
import { type DeliveryItem, type DeliveryPage, memberError, memberRequest } from "@/lib/member-api";

const deliveryStatus: Record<DeliveryItem["status"], { title: string; description: string }> = {
  queued: { title: "Scheduled", description: "Waiting for its scheduled sending time." },
  claimed: { title: "Preparing", description: "The service is preparing this message." },
  sending: {
    title: "Sending",
    description: "A send attempt is in progress. Delivery is not yet confirmed.",
  },
  submitted: {
    title: "Provider accepted",
    description: "The messaging provider accepted this message. Delivery is not yet confirmed.",
  },
  delivered: {
    title: "Delivery confirmed",
    description: "The provider reported delivery. This does not mean the message was read.",
  },
  failed: {
    title: "Not delivered",
    description:
      "This message could not be delivered. Check your consent, phone verification, schedule, and SMS wallet as applicable.",
  },
  unknown: {
    title: "Result unconfirmed",
    description:
      "The send result could not be confirmed. Check again later; an unconfirmed result does not prove that nothing was sent.",
  },
  cancelled: {
    title: "Cancelled",
    description: "This scheduled message was cancelled before it was sent.",
  },
};

export default function DeliveriesView() {
  const { mode, state } = useDemo();
  const [page, setPage] = useState<DeliveryPage | null>(null);
  const labels = usePracticeLabels(page?.items.map((item) => item.practiceId) ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(async (cursor?: string) => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const data = await memberRequest<DeliveryPage>(
        `/api/deliveries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (request !== generation.current) return;
      setPage((current) => ({
        ...data,
        items:
          cursor && current
            ? Array.from(
                new Map([...current.items, ...data.items].map((item) => [item.id, item])).values(),
              )
            : data.items,
      }));
      setRefreshedAt(new Date().toISOString());
    } catch (error) {
      if (request === generation.current) setError(memberError(error));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const lifecycle = { active: true };
    const requests = generation;
    void Promise.resolve().then(() => {
      if (lifecycle.active && mode === "live") void load();
    });
    return () => {
      lifecycle.active = false;
      requests.current++;
    };
  }, [load, mode]);
  const timestamp = (value: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: state.timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));

  return (
    <>
      <PageHeading
        eyebrow="EMAIL & SMS ACTIVITY"
        title="Messages"
        description={
          mode === "live"
            ? "See scheduled messages and the latest delivery results reported to the service."
            : "This interactive preview does not schedule or send real messages."
        }
      />
      {mode === "preview" ? (
        <EmptyState
          title="No messages in this preview"
          action="Explore your rhythm"
          href="/schedule"
        >
          You can try reminder settings and read a sample. There is no message queue, delivery
          history, or SMS charge in preview mode.
        </EmptyState>
      ) : (
        <>
          <div className="messages-toolbar">
            <div>
              <p className="small muted">
                Times shown in {state.timezone}. Delivery does not mean a message was read.
              </p>
              {refreshedAt && (
                <p className="field-hint">
                  Last refreshed <time dateTime={refreshedAt}>{timestamp(refreshedAt)}</time>.
                  Refresh to check for changes.
                </p>
              )}
            </div>
            <button
              className="button button-secondary"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? "Refreshing messages…" : "Refresh messages"}
            </button>
          </div>
          <Status error>{error}</Status>
          {labels.error && (
            <div>
              <Status error>{labels.error}</Status>
              <button className="text-link" onClick={labels.refresh}>
                Retry practice titles
              </button>
            </div>
          )}
          {!page ? (
            <p role="status">
              {loading ? "Loading messages…" : "Messages are unavailable. Refresh to try again."}
            </p>
          ) : page.items.length === 0 ? (
            <EmptyState title="No messages yet" action="Review your rhythm" href="/schedule">
              Messages will appear after your schedule and channel consent are enabled and the
              service schedules a reminder. SMS also needs a verified phone and sufficient credit.
            </EmptyState>
          ) : (
            <div className="message-list">
              {page.items.map((item) => {
                const practice = labels.get(item.practiceId);
                const status = deliveryStatus[item.status] || {
                  title: "Status unavailable",
                  description: "Refresh to check the latest result.",
                };
                return (
                  <article className="panel message-record" key={item.id}>
                    <div className="section-heading">
                      <span className="eyebrow">{item.channel === "sms" ? "SMS" : "Email"}</span>
                      <span className="tag">{status.title}</span>
                    </div>
                    <h2>
                      {practice ? (
                        <Link href={practiceHref(practice.id)}>{practice.title}</Link>
                      ) : (
                        <Link href={practiceHref(item.practiceId)}>
                          Scripture practice · view current version
                        </Link>
                      )}
                    </h2>
                    {practice && <p className="small muted">{practice.reference}</p>}
                    <p>{status.description}</p>
                    <dl className="message-details">
                      <div>
                        <dt>Scheduled for</dt>
                        <dd>
                          <time dateTime={item.scheduledAt}>{timestamp(item.scheduledAt)}</time>
                        </dd>
                      </div>
                      <div>
                        <dt>Status updated</dt>
                        <dd>
                          <time dateTime={item.updatedAt}>{timestamp(item.updatedAt)}</time>
                        </dd>
                      </div>
                      {item.channel === "sms" && (
                        <div>
                          <dt>SMS quote</dt>
                          <dd>
                            {item.quoteCents === null
                              ? "Not quoted yet"
                              : `${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(item.quoteCents / 100)} CAD`}
                            {item.segments !== null
                              ? ` · ${item.segments} ${item.segments === 1 ? "segment" : "segments"}`
                              : ""}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {item.channel === "sms" && (
                      <p className="field-hint">
                        A quote is not proof of a debit. View reserved credit and transactions in
                        your <Link href="/wallet">SMS wallet</Link>.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {page && page.items.length > 0 && (
            <p className="field-hint">
              Showing {page.items.length} of {page.total} messages.
            </p>
          )}
          {page?.nextCursor && (
            <button
              className="button button-secondary load-more"
              disabled={loading}
              onClick={() => void load(page.nextCursor!)}
            >
              {loading ? "Loading…" : "Load more messages"}
            </button>
          )}
        </>
      )}
    </>
  );
}
