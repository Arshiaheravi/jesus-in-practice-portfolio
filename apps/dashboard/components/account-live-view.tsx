"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { consentVersion } from "@jesus-in-practice/backend/contracts";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";

import DeliveryAvailability from "@/components/delivery-availability";
import { useDemo } from "@/components/demo-provider";
import SettingsNavigation from "@/components/settings-navigation";
import { PageHeading, Status } from "@/components/ui";
import { MemberApiError, memberError, memberRequest, postMember } from "@/lib/member-api";

export default function AccountLiveView() {
  const { member, refresh } = useDemo();
  const { theme, setTheme } = useTheme();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneStep, setPhoneStep] = useState<"phone" | "code">("phone");
  const [confirm, setConfirm] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  async function perform(name: string, action: () => Promise<void>, message: string) {
    if (busy) return;
    setBusy(name);
    setError("");
    setStatus("");
    try {
      await action();
      setStatus(message);
    } catch (error) {
      if (error instanceof MemberApiError && error.code === "CONSENT_CHANGED") await refresh();
      setError(memberError(error));
    } finally {
      setBusy("");
    }
  }
  if (!member) return null;
  const phoneUnavailable = !member.capabilities?.phoneVerification && phoneStep === "phone";
  return (
    <>
      <PageHeading
        eyebrow="YOUR ACCOUNT, YOUR CHOICES"
        title="Account & consent"
        description="Manage your contact details, reminders, and account data."
      />
      <SettingsNavigation />
      <div className="narrow-form member-account">
        <section className="panel form-section">
          <h2>Your free account</h2>
          <p className="account-contact">{member.account.email}</p>
          <p>
            Account access and practice emails are free. SMS is optional and uses prepaid credit.
          </p>
          <button
            className="button button-secondary"
            disabled={!!busy}
            onClick={() =>
              void perform(
                "logout",
                async () => {
                  await postMember("/api/auth/logout", {});
                  window.location.replace("/signin");
                },
                "Signing out…",
              )
            }
          >
            Sign out
          </button>
        </section>
        <section className="panel form-section">
          <h2>Your reminder consent</h2>
          <DeliveryAvailability />
          {member.operator ? (
            <p className="small muted">
              Reminders are provided by {member.operator.name}, {member.operator.mailingAddress}.
              Contact{" "}
              <a href={`mailto:${member.operator.supportEmail}`}>{member.operator.supportEmail}</a>.
            </p>
          ) : (
            <p className="field-hint">
              The service operator details are not available yet. New reminder consent is
              unavailable until they are configured.
            </p>
          )}
          <p>
            Choose each channel separately. You can withdraw consent at any time. Signing in or
            adding credit does not enable reminders.
          </p>
          <label className="consent-choice">
            <input
              type="checkbox"
              checked={member.account.emailConsent}
              disabled={!!busy || (!member.operator && !member.account.emailConsent)}
              onChange={(event) => {
                const enabled = event.target.checked;
                void perform(
                  "email-consent",
                  async () => {
                    await postMember("/api/consent", {
                      channel: "email",
                      enabled,
                      ...(enabled ? { consentVersion: consentVersion("email", null) } : {}),
                    });
                    await refresh();
                  },
                  enabled
                    ? "Email reminder consent recorded."
                    : "Email reminder consent withdrawn.",
                );
              }}
            />
            <span>
              I agree to receive free scripture practice reminders by email according to my
              schedule.
            </span>
          </label>
          <label className="consent-choice">
            <input
              type="checkbox"
              checked={member.account.smsConsent}
              disabled={
                !!busy ||
                ((!member.account.phone || !member.operator || member.wallet.rateCents === null) &&
                  !member.account.smsConsent)
              }
              onChange={(event) => {
                const enabled = event.target.checked;
                void perform(
                  "sms-consent",
                  async () => {
                    await postMember("/api/consent", {
                      channel: "sms",
                      enabled,
                      ...(enabled
                        ? { consentVersion: consentVersion("sms", member.wallet.rateCents) }
                        : {}),
                    });
                    await refresh();
                  },
                  enabled ? "SMS reminder consent recorded." : "SMS reminder consent withdrawn.",
                );
              }}
            />
            <span>
              I agree to receive scripture practice reminders by SMS according to my schedule. SMS
              uses prepaid credit; message length can use multiple billable segments. Reply STOP to
              unsubscribe.
            </span>
          </label>
          {!member.account.phone && (
            <p className="field-hint">Verify a phone below before enabling SMS consent.</p>
          )}
          {member.wallet.rateCents !== null && (
            <p className="field-hint">
              SMS costs {(member.wallet.rateCents / 100).toFixed(2)} CAD per segment, up to 10
              segments per practice and three practices per day. Credit is reserved before sending
              and charged on delivery confirmation. See your wallet for the maximum message cost and
              delivery reservations.
            </p>
          )}
          <p className="field-hint">
            Pausing your schedule keeps these choices. Withdrawing consent disables the selected
            channel.
          </p>
          <Link className="text-link" href="/schedule">
            Review your schedule
          </Link>
          <Link className="text-link" href="/wallet">
            View SMS rates and credit
          </Link>
        </section>
        <section className="panel form-section">
          <h2>Your SMS phone</h2>
          <p>
            {member.account.phone
              ? `Verified number: ${member.account.phone}`
              : "No verified phone has been added. You can use email without adding one."}
          </p>
          {phoneUnavailable && (
            <p id="phone-availability" className="field-hint" role="status">
              Phone verification is currently unavailable. Your existing phone and consent choices
              are kept. You can continue using your account without adding a number.
            </p>
          )}
          <form
            className="member-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(
                "phone",
                async () => {
                  if (phoneStep === "phone") {
                    await postMember("/api/phone/start", {
                      phone: phone.replace(/[\s().-]/g, ""),
                    });
                    setPhoneStep("code");
                  } else {
                    await postMember("/api/phone/verify", { code });
                    await refresh();
                    setPhone("");
                    setCode("");
                    setPhoneStep("phone");
                  }
                },
                phoneStep === "phone"
                  ? "Verification code requested. Check your phone."
                  : "Phone ownership verified. SMS consent is a separate choice above.",
              );
            }}
          >
            {phoneStep === "phone" ? (
              <div className="field">
                <label htmlFor="member-phone">Canadian phone number</label>
                <input
                  id="member-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+1 416 555 0123"
                  maxLength={24}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                  disabled={!!busy || phoneUnavailable}
                  aria-describedby={phoneUnavailable ? "phone-availability" : undefined}
                />
                <p className="field-hint">
                  A verification code confirms ownership. This does not subscribe you to reminders.
                </p>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="phone-code">Phone verification code</label>
                <input
                  id="phone-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  disabled={!!busy}
                />
              </div>
            )}
            <button
              className="button button-primary"
              type="submit"
              disabled={!!busy || phoneUnavailable}
              aria-describedby={phoneUnavailable ? "phone-availability" : undefined}
            >
              {busy === "phone"
                ? "Please wait…"
                : phoneStep === "phone"
                  ? "Send verification code"
                  : "Verify phone"}
            </button>
            {phoneStep === "code" && (
              <button
                className="text-link"
                type="button"
                disabled={!!busy}
                onClick={() => {
                  setPhoneStep("phone");
                  setCode("");
                }}
              >
                Change number or request another code
              </button>
            )}
          </form>
        </section>
        <section className="panel form-section">
          <h2>Appearance</h2>
          <label htmlFor="account-appearance">Choose a comfortable view</label>
          <select
            id="account-appearance"
            value={theme || "system"}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="system">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </section>
        <section className="panel form-section">
          <h2>Your account data</h2>
          <p>
            Download your account export. It can include private reflections, so store it carefully.
          </p>
          <button
            className="button button-secondary"
            disabled={!!busy}
            onClick={() =>
              void perform(
                "export",
                async () => {
                  const response = await fetch("/api/account/export", {
                    credentials: "same-origin",
                    cache: "no-store",
                    signal: AbortSignal.timeout(30_000),
                  });
                  if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(
                      body?.error?.message || "Your account export could not be downloaded.",
                    );
                  }
                  const url = URL.createObjectURL(await response.blob());
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = "jesus-in-practice-account.json";
                  anchor.click();
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                },
                "Your browser was asked to download your account export.",
              )
            }
          >
            {busy === "export" ? "Preparing export…" : "Export account data"}
          </button>
        </section>
        <section className="panel form-section danger-zone">
          <h2>Delete your account</h2>
          <p>
            Account deletion stops your reminders. Review your saved reflections and remaining SMS
            credit first.
          </p>
          <button
            className="button button-danger"
            disabled={!!busy}
            onClick={() => {
              setConfirm(true);
              setConfirmation("");
              setError("");
            }}
          >
            Delete account
          </button>
        </section>
        <Status>{status}</Status>
        <Status error>{error}</Status>
      </div>
      <Dialog
        open={confirm}
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
        className="confirmation-dialog"
      >
        <DialogBackdrop className="dialog-backdrop" />
        <div className="dialog-position">
          <DialogPanel className="dialog-panel">
            <DialogTitle as="h2">Delete your account?</DialogTitle>
            <p>
              This action cannot be undone. Download your account data first if you want a copy.
            </p>
            <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
            <input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              disabled={!!busy}
            />
            <div className="button-row">
              <button
                className="button button-secondary"
                data-autofocus
                disabled={!!busy}
                onClick={() => setConfirm(false)}
              >
                Keep my account
              </button>
              <button
                className="button button-danger"
                disabled={confirmation !== "DELETE" || !!busy}
                onClick={() =>
                  void perform(
                    "delete",
                    async () => {
                      await memberRequest("/api/account", {
                        method: "DELETE",
                        body: JSON.stringify({ confirmation: "DELETE" }),
                      });
                      window.location.replace("/signin");
                    },
                    "Account deleted.",
                  )
                }
              >
                {busy === "delete" ? "Deleting…" : "Permanently delete account"}
              </button>
            </div>
            <Status error>{error}</Status>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
