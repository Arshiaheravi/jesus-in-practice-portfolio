"use client";

import { categories, sourceLabels } from "@jesus-in-practice/content";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Brand } from "@/components/app-shell";
import { useDemo } from "@/components/demo-provider";
import { MemberContent } from "@/components/member-status";
import { SourceOptions, Status } from "@/components/ui";
import {
  type Channel,
  dayLabels,
  formatTime,
  type PreviewPlan,
  timezones,
  validateSchedule,
} from "@/lib/demo-model";
import { memberError } from "@/lib/member-api";

const steps = ["Your sources", "Your focus", "Your rhythm", "Ready to begin"];
function OnboardingForm({ initialPlan }: { initialPlan?: PreviewPlan }) {
  const { state, update, mode } = useDemo();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [source, setSource] = useState(state.source);
  const [topics, setTopics] = useState(state.topics);
  const [channel, setChannel] = useState<Channel>(
    initialPlan && initialPlan !== "explore" ? initialPlan : state.channel,
  );
  const [time, setTime] = useState(state.schedule.times[0]);
  const [timezone, setTimezone] = useState(state.timezone);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [baseline] = useState({
    source: state.source,
    topics: state.topics,
    channel: state.channel,
    timezone: state.timezone,
    schedule: state.schedule,
  });
  function goToStep(next: number) {
    setStep(next);
    setError("");
    requestAnimationFrame(() => document.getElementById("onboarding-heading")?.focus());
  }
  async function next() {
    if (step === 2) {
      const validation = validateSchedule({ ...state.schedule, mode: "fixed", times: [time] });
      if (validation) {
        setError(validation);
        return;
      }
    }
    if (step < 3) goToStep(step + 1);
    else {
      setSaving(true);
      try {
        await update(
          (current) => ({
            ...current,
            onboarded: true,
            source,
            topics,
            channel,
            timezone,
            plan: mode === "live" ? current.plan : initialPlan || current.plan,
            schedule: { ...current.schedule, mode: "fixed", times: [time] },
          }),
          baseline,
        );
        router.push("/dashboard");
      } catch (error) {
        setError(memberError(error));
        setSaving(false);
      }
    }
  }
  return (
    <>
      <ol className="onboarding-progress" aria-label="Setup progress">
        {steps.map((title, index) => (
          <li
            key={title}
            className={index === step ? "current" : index < step ? "complete" : ""}
            aria-current={index === step ? "step" : undefined}
          >
            <span>{index < step ? <CheckIcon aria-hidden="true" /> : index + 1}</span>
            <strong>{title}</strong>
          </li>
        ))}
      </ol>
      <div className="onboarding-layout">
        <section className="onboarding-copy">
          <p className="eyebrow">BUILD YOUR PERSONAL PRACTICE</p>
          <h1>Scripture that makes sense in your life.</h1>
          <p>
            Choose your sources and interests. We’ll connect each teaching to a familiar situation
            and one action you can try.
          </p>
          <div className="onboarding-promise">
            <CheckIcon aria-hidden="true" />
            <p>
              A passage to understand.
              <br />
              An example you recognize.
              <br />A practical next step.
            </p>
          </div>
          <figure className="onboarding-photo">
            <Image
              src="/images/christus.webp"
              alt="Bertel Thorvaldsen’s sculpture of Christ with outstretched arms"
              width={1200}
              height={1800}
              sizes="(max-width: 760px) 100vw, 500px"
              priority
            />
            <figcaption>
              Photograph of <em>Christ</em> by Bertel Thorvaldsen, Thorvaldsens Museum.
              <a
                href="https://commons.wikimedia.org/wiki/File:Bertel_Thorvaldsen,_Kristus,_1821,_A82,_Thorvaldsensmuseum.png"
                target="_blank"
                rel="noopener noreferrer"
              >
                Image: Thorvaldsens Museum / Wikimedia Commons
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </figcaption>
          </figure>
          <p className="quiet-disclaimer">
            {mode === "live"
              ? "Your choices are saved to your account. Practice emails are free. SMS uses prepaid credit; reminders require separate consent."
              : "This is an interactive preview. Your choices stay in this browser. No account is created and no messages are sent."}
          </p>
        </section>
        <form
          className="panel onboarding-form"
          onSubmit={(event) => {
            event.preventDefault();
            next();
          }}
        >
          <span className="eyebrow">STEP {step + 1} OF 4</span>
          <h2 id="onboarding-heading" tabIndex={-1}>
            {step === 0
              ? "Choose your scripture sources."
              : step === 1
                ? "What would you like to practice?"
                : step === 2
                  ? "Find your everyday moment."
                  : "Your practice is ready to explore."}
          </h2>
          {step === 0 && (
            <>
              <p>
                Choose the scripture collection you want to learn from. Every practice clearly
                identifies its source.
              </p>
              <fieldset>
                <legend className="sr-only">Choose scripture sources</legend>
                <SourceOptions value={source} onChange={setSource} />
              </fieldset>
              <p className="field-hint">
                The Book of Mormon is included only when you choose it or “Explore both.” This is an
                independent learning project.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p>Pick a few topics, or leave them all open to discover something new.</p>
              <fieldset>
                <legend className="sr-only">Choose topics</legend>
                <div className="topic-grid">
                  {categories.map((category) => (
                    <label
                      key={category}
                      className={`topic-choice ${topics.includes(category) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={topics.includes(category)}
                        onChange={() =>
                          setTopics((current) =>
                            current.includes(category)
                              ? current.filter((item) => item !== category)
                              : [...current, category],
                          )
                        }
                      />
                      <span>{category}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="field-hint">
                {topics.length
                  ? `${topics.length} topics chosen. You can adjust these later.`
                  : "No topics selected means all topics are welcome."}
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <p>Preview a gentle reminder. You can add more times or choose certain days later.</p>
              <div className="field">
                <label htmlFor="onboarding-channel">Reminder channel</label>
                <select
                  id="onboarding-channel"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as Channel)}
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="both">Email + SMS</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="onboarding-time">Your reminder time</label>
                <input
                  id="onboarding-time"
                  type="time"
                  value={time}
                  required
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="onboarding-timezone">Your time zone</label>
                <select
                  id="onboarding-timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  {timezones.map((zone) => (
                    <option value={zone} key={zone}>
                      {zone.replace("America/", "").replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <p className="field-hint">
                No email address or phone number is needed. Real messaging will require verified
                contact details and your separate consent.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <p>Review your choices. You can change them at any time.</p>
              <dl className="onboarding-review">
                <div>
                  <dt>Learning from</dt>
                  <dd>
                    {source === "both" ? "Bible · KJV + Book of Mormon" : sourceLabels[source]}
                  </dd>
                  <button type="button" className="text-link" onClick={() => goToStep(0)}>
                    Edit sources
                  </button>
                </div>
                <div>
                  <dt>Making room for</dt>
                  <dd>{topics.length ? topics.join(", ") : "All topics"}</dd>
                  <button type="button" className="text-link" onClick={() => goToStep(1)}>
                    Edit topics
                  </button>
                </div>
                <div>
                  <dt>Your rhythm</dt>
                  <dd>
                    {formatTime(time)} · {timezone.replace("America/", "").replaceAll("_", " ")}
                    <br />
                    {state.schedule.days.length === 7
                      ? "Every day"
                      : state.schedule.days.map((day) => dayLabels[day]).join(", ")}
                    <br />
                    {channel === "both" ? "Email + SMS" : channel === "sms" ? "SMS" : "Email"}{" "}
                    {mode === "live" ? "preference" : "preview"}
                  </dd>
                  <button type="button" className="text-link" onClick={() => goToStep(2)}>
                    Edit rhythm
                  </button>
                </div>
              </dl>
              <p className="field-hint">
                {mode === "live"
                  ? "Your setup will be saved to your account. You can then manage verified contacts and separate reminder consent in Account & consent."
                  : "Your setup will be saved in this browser. You can explore, bookmark, and reflect right away."}
              </p>
            </>
          )}
          <Status error>{error}</Status>
          {error && mode === "live" && (
            <button className="text-link" type="button" onClick={() => window.location.reload()}>
              Reload account values and discard setup changes
            </button>
          )}
          <div className="onboarding-actions">
            {step > 0 ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => goToStep(step - 1)}
              >
                <ArrowLeftIcon aria-hidden="true" />
                Back
              </button>
            ) : (
              <Link className="text-link" href="/dashboard">
                Explore first
              </Link>
            )}
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "Opening your practice…" : step === 3 ? "Start my practice" : "Continue"}
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
export default function OnboardingView({ initialPlan }: { initialPlan?: PreviewPlan }) {
  const { mode } = useDemo();
  return (
    <div className="onboarding-page">
      <a href="#onboarding-main" className="skip-link">
        Skip to setup
      </a>
      <header className="onboarding-header">
        <Brand />
        <Link className="text-link" href="/dashboard">
          {mode === "live" ? "Go to your dashboard" : "Explore the preview"}
          <ArrowRightIcon aria-hidden="true" />
        </Link>
      </header>
      <main id="onboarding-main">
        <MemberContent>
          <OnboardingForm initialPlan={initialPlan} />
        </MemberContent>
      </main>
      <footer className="onboarding-footer">
        Faith in everyday life.{" "}
        <Link href={mode === "live" ? "/settings/account" : "/help#preview"}>
          {mode === "live" ? "Account & consent" : "About this preview"}
        </Link>
      </footer>
    </div>
  );
}
