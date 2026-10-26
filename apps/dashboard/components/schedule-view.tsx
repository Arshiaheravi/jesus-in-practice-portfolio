"use client";

import { practices, sourceLabels } from "@jesus-in-practice/content";
import {
  EnvelopeClosedIcon,
  MobileIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { useState } from "react";

import DeliveryAvailability from "@/components/delivery-availability";
import { persistenceMessage, useDemo } from "@/components/demo-provider";
import { CatalogStatus, usePracticeCatalog } from "@/components/practice-catalog";
import { PageHeading, Status } from "@/components/ui";
import { type Channel, dayLabels, formatTime, timezones, validateSchedule } from "@/lib/demo-model";
import { memberError } from "@/lib/member-api";
import { eligiblePractices } from "@/lib/practice-selection";

export default function ScheduleView() {
  const { state, update, pending, mode, member } = useDemo();
  const catalog = usePracticeCatalog(
    { source: state.source, topics: state.topics, limit: 1 },
    mode === "live",
  );
  const [schedule, setSchedule] = useState(state.schedule);
  const [channel, setChannel] = useState<Channel>(state.channel);
  const [timezone, setTimezone] = useState(state.timezone);
  const [baseline, setBaseline] = useState({
    schedule: state.schedule,
    channel: state.channel,
    timezone: state.timezone,
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<"email" | "sms">(
    state.channel === "sms" ? "sms" : "email",
  );
  const dirty =
    JSON.stringify(schedule) !== JSON.stringify(state.schedule) ||
    channel !== state.channel ||
    timezone !== state.timezone;
  const sample = eligiblePractices(
    mode === "live" ? (catalog.page?.items ?? []) : practices,
    state.source,
    state.topics,
  )[0];
  function cancel() {
    setSchedule(state.schedule);
    setChannel(state.channel);
    setTimezone(state.timezone);
    setBaseline({ schedule: state.schedule, channel: state.channel, timezone: state.timezone });
    setStatus("");
    setError("");
  }
  return (
    <>
      <PageHeading
        eyebrow="LEARNING, ON YOUR SCHEDULE"
        title="Make space for a daily practice."
        description="Choose your channel, days, and times. Preview exactly how a scripture teaching becomes an everyday action."
      />
      <div className="settings-layout">
        <form
          className="settings-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const validation = validateSchedule(schedule);
            if (validation) {
              setError(validation);
              setStatus("");
              document.getElementById("schedule-error")?.focus();
              return;
            }
            try {
              const outcome = await update(
                (current) => ({ ...current, channel, timezone, schedule }),
                baseline,
              );
              setBaseline({ schedule, channel, timezone });
              setError("");
              setStatus(
                persistenceMessage(
                  outcome,
                  mode === "live"
                    ? "Your reminder preferences are saved. Delivery depends on consent, verified contact details, and available SMS credit."
                    : "Your rhythm is saved in this browser. No messages have been scheduled or sent.",
                ),
              );
            } catch (error) {
              setStatus("");
              setError(memberError(error));
            }
          }}
        >
          <section className="panel form-section">
            <div className="section-heading">
              <div>
                <h2>How would you like a reminder?</h2>
                <p>Email, a short text, or a little of both.</p>
              </div>
              <span className="step-number">01</span>
            </div>
            <div className="channel-options">
              {[
                {
                  value: "email" as const,
                  title: "Email",
                  detail: "A little more room to reflect",
                  Icon: EnvelopeClosedIcon,
                },
                {
                  value: "sms" as const,
                  title: "SMS",
                  detail: "A short nudge in your day",
                  Icon: MobileIcon,
                },
                {
                  value: "both" as const,
                  title: "Email + SMS",
                  detail: "Both, on your terms",
                  Icon: EnvelopeClosedIcon,
                },
              ].map(({ value, title, detail, Icon }) => (
                <label
                  key={value}
                  className={`channel-choice ${channel === value ? "selected" : ""}`}
                >
                  <input
                    name="channel"
                    type="radio"
                    checked={channel === value}
                    onChange={() => {
                      setChannel(value);
                      setPreview(value === "sms" ? "sms" : "email");
                      setStatus("");
                    }}
                  />
                  <Icon aria-hidden="true" />
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </label>
              ))}
            </div>
            <p className="field-hint">
              {mode === "live"
                ? "Email is free. SMS requires a verified phone, separate consent, and prepaid credit. Selecting a channel does not give consent."
                : "Contact details and separate delivery consent will be requested when messaging is available. This preview does not collect either."}
            </p>
            {mode === "live" && (
              <div className="info-box">
                <DeliveryAvailability channel={channel} />
                <p>
                  Email consent: {member?.account.emailConsent ? "enabled" : "not given"}. SMS
                  consent: {member?.account.smsConsent ? "enabled" : "not given"}.
                </p>
                <Link className="text-link" href="/settings/account">
                  Manage contacts and consent
                </Link>
                <Link className="text-link" href="/wallet">
                  View SMS credit
                </Link>
              </div>
            )}
          </section>
          <section className="panel form-section">
            <div className="section-heading">
              <div>
                <h2>When is a good moment?</h2>
                <p>All times follow your selected time zone.</p>
              </div>
              <span className="step-number">02</span>
            </div>
            <div className="field">
              <label htmlFor="timezone">Your time zone</label>
              <select
                id="timezone"
                value={timezone}
                onChange={(event) => {
                  setTimezone(event.target.value);
                  setStatus("");
                }}
              >
                {timezones.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("America/", "").replaceAll("_", " ")} ({value})
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend>Days of the week</legend>
              <div className="day-choices">
                {dayLabels.map((day, index) => (
                  <label key={day} className={schedule.days.includes(index) ? "selected" : ""}>
                    <input
                      type="checkbox"
                      checked={schedule.days.includes(index)}
                      onChange={() => {
                        setSchedule((current) => ({
                          ...current,
                          days: current.days.includes(index)
                            ? current.days.filter((value) => value !== index)
                            : [...current.days, index].sort(),
                        }));
                        setStatus("");
                      }}
                    />
                    <span aria-hidden="true">{day.slice(0, 3)}</span>
                    <span className="sr-only">{day}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Reminder timing</legend>
              <div className="inline-radios">
                <label>
                  <input
                    type="radio"
                    name="timing"
                    checked={schedule.mode === "fixed"}
                    onChange={() => {
                      setSchedule((current) => ({ ...current, mode: "fixed" }));
                      setStatus("");
                    }}
                  />
                  At a chosen time
                </label>
                <label>
                  <input
                    type="radio"
                    name="timing"
                    checked={schedule.mode === "window"}
                    onChange={() => {
                      setSchedule((current) => ({ ...current, mode: "window" }));
                      setStatus("");
                    }}
                  />
                  Surprise me within a window
                </label>
              </div>
            </fieldset>
            {schedule.mode === "fixed" ? (
              <div>
                <div className="time-list">
                  {schedule.times.map((time, index) => (
                    <div className="time-row" key={index}>
                      <div className="field">
                        <label htmlFor={`reminder-time-${index}`}>Reminder time {index + 1}</label>
                        <input
                          id={`reminder-time-${index}`}
                          type="time"
                          value={time}
                          required
                          onChange={(event) => {
                            setSchedule((current) => ({
                              ...current,
                              times: current.times.map((value, item) =>
                                item === index ? event.target.value : value,
                              ),
                            }));
                            setStatus("");
                          }}
                        />
                      </div>
                      {schedule.times.length > 1 && (
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Remove reminder time ${index + 1}`}
                          onClick={() =>
                            setSchedule((current) => ({
                              ...current,
                              times: current.times.filter((_, item) => index !== item),
                            }))
                          }
                        >
                          <TrashIcon aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {schedule.times.length < 3 && (
                  <button
                    className="text-link"
                    type="button"
                    onClick={() =>
                      setSchedule((current) => ({
                        ...current,
                        times: [
                          ...current.times,
                          current.times.includes("12:00") ? "18:00" : "12:00",
                        ],
                      }))
                    }
                  >
                    <PlusIcon aria-hidden="true" />
                    Add another time
                  </button>
                )}
                <p className="field-hint">
                  {mode === "live"
                    ? "Up to three reminder times per selected day. Each SMS message may use multiple paid segments."
                    : "Up to three preview reminders per selected day. Delivery limits will depend on the launch plan."}
                </p>
              </div>
            ) : (
              <div>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="window-start">Not before</label>
                    <input
                      id="window-start"
                      type="time"
                      value={schedule.windowStart}
                      required
                      onChange={(event) =>
                        setSchedule((current) => ({ ...current, windowStart: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="window-end">Not after</label>
                    <input
                      id="window-end"
                      type="time"
                      value={schedule.windowEnd}
                      required
                      onChange={(event) =>
                        setSchedule((current) => ({ ...current, windowEnd: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <p className="field-hint">
                  {mode === "live"
                    ? "One reminder inside this window on each selected day, when the selected channel is ready for delivery."
                    : "One reminder at an unchosen time inside this window on each selected day. The preview saves your window; it does not choose or queue a send time."}
                </p>
              </div>
            )}
          </section>
          <section className="panel pause-panel">
            <div>
              <h2>Take a break when you need one.</h2>
              <p>Pause reminders without losing your choices. Pausing does not withdraw consent.</p>
              {mode === "live" && dirty && (
                <p className="field-hint">
                  Save or cancel your changes before pausing or resuming.
                </p>
              )}
            </div>
            <button
              type="button"
              className="button button-secondary"
              disabled={pending || (mode === "live" && dirty)}
              onClick={async () => {
                const paused = !state.schedule.paused;
                try {
                  const outcome = await update((current) => ({
                    ...current,
                    schedule: { ...current.schedule, paused },
                  }));
                  setSchedule((current) => ({ ...current, paused }));
                  setBaseline({
                    schedule: { ...state.schedule, paused },
                    channel: state.channel,
                    timezone: state.timezone,
                  });
                  setStatus(
                    persistenceMessage(
                      outcome,
                      mode === "live"
                        ? paused
                          ? "Your reminders are paused."
                          : "Your saved schedule is active. Delivery readiness is checked before each message."
                        : paused
                          ? "Your preview rhythm is paused. Your choices are saved in this browser."
                          : "Your preview rhythm preference is saved as active again. No real messages are sent.",
                    ),
                  );
                } catch (error) {
                  setStatus("");
                  setError(memberError(error));
                }
              }}
            >
              {state.schedule.paused ? (
                <PlayIcon aria-hidden="true" />
              ) : (
                <PauseIcon aria-hidden="true" />
              )}
              {mode === "live"
                ? state.schedule.paused
                  ? "Resume reminders"
                  : "Pause reminders"
                : state.schedule.paused
                  ? "Resume preview"
                  : "Pause preview"}
            </button>
          </section>
          {error && (
            <div id="schedule-error" tabIndex={-1}>
              <Status error>{error}</Status>
            </div>
          )}
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={!dirty || pending}>
              {pending ? "Saving…" : "Save rhythm"}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={!dirty}
              onClick={cancel}
            >
              Cancel changes
            </button>
            {dirty && <span className="small muted">Unsaved changes</span>}
          </div>
          <Status>{status}</Status>
        </form>
        <aside className="schedule-preview">
          <div className="panel">
            <p className="eyebrow">A LOOK AT YOUR REMINDER</p>
            {mode === "live" && <CatalogStatus catalog={catalog} />}
            <div className="segmented-control" role="group" aria-label="Reminder preview channel">
              <button aria-pressed={preview === "email"} onClick={() => setPreview("email")}>
                Email
              </button>
              <button aria-pressed={preview === "sms"} onClick={() => setPreview("sms")}>
                SMS
              </button>
            </div>
            {mode === "live" && !catalog.page ? null : sample ? (
              <div className={`message-preview ${preview === "sms" ? "sms-preview" : ""}`}>
                <span className="small muted">
                  {preview === "email"
                    ? `SUBJECT: ${sample.title}`
                    : "Jesus in Practice · sample message"}
                </span>
                {preview === "email" && <h3>{sample.title}</h3>}
                {preview === "sms" ? (
                  <p className="sms-body">{sample.smsText}</p>
                ) : (
                  <>
                    <a
                      className="message-reference"
                      href={sample.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {sample.reference}
                      <span>{sourceLabels[sample.source]}</span>
                      <span className="sr-only"> (opens scripture in a new tab)</span>
                    </a>
                    <div className="email-lesson">
                      <strong>In plain language</strong>
                      <p>{sample.plainMeaning}</p>
                      <strong>In real life</strong>
                      <p>{sample.everydayExample}</p>
                      <strong>Try this today</strong>
                      <p>{sample.action}</p>
                    </div>
                    <p className="message-attribution">
                      Original explanation and example, not a scripture quotation.
                    </p>
                  </>
                )}
                <p className="message-footer">
                  {mode === "live"
                    ? preview === "sms"
                      ? "Reply STOP to unsubscribe from SMS reminders."
                      : "Practice emails include an unsubscribe link."
                    : preview === "sms"
                      ? "Future SMS will include an unsubscribe option."
                      : "Future emails will include delivery preferences and an unsubscribe link."}
                </p>
              </div>
            ) : (
              <div className="message-preview">
                <h3>No matching reminder example</h3>
                <p>
                  The current collection has no practice for your selected sources and topics.
                  Adjust Preferences to preview a matching example.
                </p>
              </div>
            )}
            <p className="quiet-disclaimer">
              Illustrative content only. Actual SMS formatting and message length will be finalized
              with the delivery provider.
            </p>
          </div>
          <div className="panel schedule-summary">
            <h2>Your current choices</h2>
            <dl>
              <div>
                <dt>Channel</dt>
                <dd>
                  {channel === "both" ? "Email + SMS" : channel === "email" ? "Email" : "SMS"}
                </dd>
              </div>
              <div>
                <dt>Days</dt>
                <dd>
                  {schedule.days.length === 7
                    ? "Every day"
                    : schedule.days.length
                      ? schedule.days.map((day) => dayLabels[day].slice(0, 3)).join(", ")
                      : "No days selected"}
                </dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>
                  {schedule.mode === "fixed"
                    ? schedule.times
                        .map((time) => (time ? formatTime(time) : "Choose a time"))
                        .join(", ")
                    : `${schedule.windowStart ? formatTime(schedule.windowStart) : "—"} – ${schedule.windowEnd ? formatTime(schedule.windowEnd) : "—"}`}
                </dd>
              </div>
            </dl>
            <p className="quiet-disclaimer">
              Daylight saving follows the selected time zone. Quiet time is everything outside your
              chosen times or window.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
