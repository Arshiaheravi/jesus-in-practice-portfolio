"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { categories } from "@jesus-in-practice/content";
import { CheckIcon, DownloadIcon, ResetIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";

import AccountLiveView from "@/components/account-live-view";
import { persistenceMessage, useDemo } from "@/components/demo-provider";
import SettingsNavigation from "@/components/settings-navigation";
import { PageHeading, SourceOptions, Status } from "@/components/ui";
import WalletView from "@/components/wallet-view";
import { type PreviewPlan } from "@/lib/demo-model";
import { websiteLink } from "@/lib/links";
import { memberError } from "@/lib/member-api";

import { smsCreditTerms } from "../../../shared/commerce-copy";

export function PreferencesView() {
  const { state, update, pending } = useDemo();
  const [source, setSource] = useState(state.source);
  const [topics, setTopics] = useState(state.topics);
  const [baseline, setBaseline] = useState({ source: state.source, topics: state.topics });
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const dirty = source !== state.source || JSON.stringify(topics) !== JSON.stringify(state.topics);
  return (
    <>
      <PageHeading
        eyebrow="MAKE IT MEANINGFUL"
        title="Your preferences"
        description="Choose what you’d like to learn from and what matters to you right now."
      />
      <SettingsNavigation />
      <form
        className="narrow-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setFailed(false);
          try {
            const outcome = await update((current) => ({ ...current, source, topics }), baseline);
            setBaseline({ source, topics });
            setStatus(
              persistenceMessage(
                outcome,
                "Preferences saved in this browser. Today’s practice and your library source now follow your choices.",
              ),
            );
          } catch (error) {
            setFailed(true);
            setStatus(memberError(error));
          }
        }}
      >
        <section className="panel form-section">
          <h2>Where would you like to learn from?</h2>
          <p className="section-description">
            These are distinct scripture collections. Your choice is always yours to change.
          </p>
          <fieldset>
            <legend className="sr-only">Scripture sources</legend>
            <SourceOptions
              value={source}
              onChange={(value) => {
                setSource(value);
                setStatus("");
              }}
            />
          </fieldset>
        </section>
        <section className="panel form-section">
          <h2>What would you like to practice?</h2>
          <p className="section-description">
            Pick any topics that speak to you. Choose none to explore them all.
          </p>
          <fieldset>
            <legend className="sr-only">Topics</legend>
            <div className="topic-grid">
              {categories.map((category) => (
                <label
                  className={`topic-choice ${topics.includes(category) ? "selected" : ""}`}
                  key={category}
                >
                  <input
                    type="checkbox"
                    checked={topics.includes(category)}
                    onChange={() => {
                      setTopics((current) =>
                        current.includes(category)
                          ? current.filter((value) => value !== category)
                          : [...current, category],
                      );
                      setStatus("");
                    }}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <div className="form-actions">
          <button className="button button-primary" type="submit" disabled={!dirty || pending}>
            {pending ? "Saving…" : "Save preferences"}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={!dirty}
            onClick={() => {
              setSource(state.source);
              setTopics(state.topics);
              setBaseline({ source: state.source, topics: state.topics });
              setStatus("");
            }}
          >
            Cancel changes
          </button>
          {dirty && <span className="small muted">Unsaved changes</span>}
        </div>
        <Status error={failed}>{status}</Status>
      </form>
    </>
  );
}
export function AccountView() {
  const { state, reset, issue, mode } = useDemo();
  const { theme, setTheme } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const [resetError, setResetError] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function exportData() {
    try {
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                notice: "Local Jesus in Practice preview data. May contain personal reflections.",
                ...state,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "jesus-in-practice-preview.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Your browser was asked to download your preview data.");
      setError("");
    } catch {
      setError("The export could not be created. Try again in a browser that allows downloads.");
    }
  }
  if (mode === "live") return <AccountLiveView />;
  return (
    <>
      <PageHeading
        eyebrow="YOUR SPACE, YOUR CHOICES"
        title="Your preview & data"
        description="A few simple controls for a comfortable, considered experience."
      />
      <SettingsNavigation />
      <div className="narrow-form">
        <section className="panel form-section">
          <h2>A preview, without an account</h2>
          <p>
            No account has been created. This dashboard does not store your contact details,
            password, or payment details. The website’s sign-in preview uses only transient example
            contact details.
          </p>
          <div className="info-box">
            <strong>{issue ? "Working in this tab only" : "Stored in this browser"}</strong>
            <p>
              Sources, topics, rhythm, saved practices, completion history, and optional reflections
              stay on this device. They are not encrypted account storage or synced between devices.
            </p>
          </div>
          <Link className="text-link" href="/help#preview">
            Understand this preview
          </Link>
        </section>
        <section className="panel form-section">
          <h2>Appearance</h2>
          <label htmlFor="appearance">Choose a comfortable view</label>
          <select
            id="appearance"
            value={theme || "system"}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="system">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <p className="field-hint">Motion follows your device’s reduced-motion setting.</p>
        </section>
        <section className="panel form-section">
          <h2>Keep a copy of your journey</h2>
          <p>
            Download your preview preferences, saved practices, completions, and reflections as a
            JSON file.
          </p>
          <p className="small muted">
            The file can contain your reflections. Store it somewhere appropriate. Import and
            account syncing are not available in this preview.
          </p>
          <button className="button button-secondary" onClick={exportData}>
            <DownloadIcon aria-hidden="true" />
            Export preview data
          </button>
        </section>
        <section className="panel form-section danger-zone">
          <h2>A fresh beginning</h2>
          <p>
            Clear this preview’s preferences, saved practices, completion history, and reflections
            from this browser. This cannot be undone.
          </p>
          <button
            className="button button-danger"
            onClick={() => {
              setResetError("");
              setStatus("");
              setConfirm(true);
            }}
          >
            <ResetIcon aria-hidden="true" />
            Reset preview
          </button>
        </section>
        <Status>{status}</Status>
        <Status error>{error}</Status>
      </div>
      <Dialog open={confirm} onClose={setConfirm} className="confirmation-dialog">
        <DialogBackdrop className="dialog-backdrop" />
        <div className="dialog-position">
          <DialogPanel className="dialog-panel">
            <DialogTitle as="h2">Reset your preview?</DialogTitle>
            <p>
              Your saved practices, preferences, history, and reflections in this browser will be
              removed. Export a copy first if you want to keep them.
            </p>
            <div className="button-row">
              <button
                className="button button-secondary"
                data-autofocus
                onClick={() => setConfirm(false)}
              >
                Keep my preview
              </button>
              <button
                className="button button-danger"
                onClick={() => {
                  if (!reset()) {
                    setResetError(
                      "Browser data could not be removed. Your preview has not been reset. Allow storage access and try again, or clear this site’s data in your browser settings.",
                    );
                    return;
                  }
                  setResetError("");
                  setConfirm(false);
                  setStatus(
                    "Your preview data has been removed from this browser. You can begin again whenever you’re ready.",
                  );
                }}
              >
                Yes, reset my preview
              </button>
            </div>
            <Status error>{resetError}</Status>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}

const plans: { id: PreviewPlan; name: string; description: string; features: string[] }[] = [
  {
    id: "explore",
    name: "Explore",
    description: "Begin with a small daily practice.",
    features: [
      "Browse the starter practice library",
      "Save practices in this browser",
      "Reflect at your own pace",
    ],
  },
  {
    id: "email",
    name: "A daily email",
    description: "A little room for scripture and reflection.",
    features: [
      "Planned email reminders",
      "Your source and topic choices",
      "A rhythm you can adjust or pause",
    ],
  },
  {
    id: "both",
    name: "Email + SMS",
    description: "A gentle nudge, wherever the day takes you.",
    features: [
      "Planned email and SMS reminders",
      "Separate channel preferences",
      "Clear consent and unsubscribe controls",
    ],
  },
];
export function PlansView() {
  const { state, update, mode } = useDemo();
  const [status, setStatus] = useState("");
  if (mode === "live") return <WalletView />;
  return (
    <>
      <PageHeading
        eyebrow="ROOM FOR YOUR ROUTINE"
        title="Choose your kind of reminder."
        description="Accounts and practice emails are free. SMS uses prepaid credit. Preview choices never charge you."
      />
      <SettingsNavigation />
      <div className="info-box plans-notice">
        <strong>Plan preview only</strong>
        <p>
          Selecting a plan saves a preference in this browser. It does not start a subscription,
          send a message, or charge you.
        </p>
      </div>
      <div className="plan-grid">
        {plans.map((plan) => (
          <article
            className={`panel plan-card ${state.plan === plan.id ? "chosen-plan" : ""}`}
            key={plan.id}
          >
            <p className="eyebrow">
              {plan.id === "explore" ? "AVAILABLE TO PREVIEW" : "PLANNED FOR LAUNCH"}
            </p>
            <h2>{plan.name}</h2>
            <p>{plan.description}</p>
            <strong className="plan-price">
              {plan.id === "both"
                ? "Prepaid SMS"
                : plan.id === "email"
                  ? "Free email"
                  : "Free preview"}
            </strong>
            {plan.id !== "explore" && (
              <span className="small muted">
                {plan.id === "both"
                  ? "Top-ups: $10, $25 or $50 CAD · no billing in this preview"
                  : "No payment required"}
              </span>
            )}
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <CheckIcon aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              className={`button ${state.plan === plan.id ? "button-completed" : "button-primary"}`}
              aria-pressed={state.plan === plan.id}
              onClick={async () => {
                const outcome = await update((current) => ({
                  ...current,
                  plan: plan.id,
                  channel: plan.id === "explore" ? current.channel : plan.id,
                }));
                setStatus(
                  persistenceMessage(
                    outcome,
                    `${plan.name} preference saved in this browser. No subscription or payment was created.`,
                  ),
                );
              }}
            >
              {state.plan === plan.id ? "Selected for preview" : "Choose for preview"}
            </button>
          </article>
        ))}
      </div>
      <Status>{status}</Status>
      <section className="panel billing-note">
        <h2>No billing surprises</h2>
        <p>
          This preview does not accept payments. In the connected service, accounts and email are
          free, while optional SMS uses prepaid credit with no subscription or automatic top-up. The
          wallet shows the configured rate per SMS segment before checkout.{" "}
          {smsCreditTerms.noExpiry} {smsCreditTerms.refund} Read the{" "}
          <a href={websiteLink("/terms")}>SMS credit terms</a>.
        </p>
        <Link className="text-link" href="/schedule">
          Try the reminder settings
        </Link>
      </section>
    </>
  );
}
