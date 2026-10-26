"use client";

import { type FormEvent, useRef, useState } from "react";

import { memberUrl } from "@/lib/site";

type Step = "contact" | "code" | "complete";

export default function AuthPreview({ mode }: { mode: "signup" | "signin" }) {
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("contact");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const contactInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLDivElement>(null);
  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = contact.trim();
    const digits = value.replace(/[\s()+.-]/g, "");
    const valid =
      channel === "email"
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
        : /^(?:1)?[2-9]\d{2}[2-9]\d{6}$/.test(digits);
    if (!valid) {
      setError(
        channel === "email"
          ? "Enter an email address, such as alex@example.com."
          : "Enter a valid +1 phone format, such as +1 416 555 0123.",
      );
      contactInput.current?.focus();
      return;
    }
    setError("");
    setNotice("");
    setStep("code");
    requestAnimationFrame(() => codeInput.current?.focus());
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code !== "123456") {
      setError("That is not the demo code. Enter 123456 to continue.");
      codeInput.current?.focus();
      return;
    }
    setError("");
    setNotice("");
    setContact("");
    setCode("");
    setStep("complete");
    requestAnimationFrame(() => result.current?.focus());
  }
  function changeContact() {
    setStep("contact");
    setCode("");
    setError("");
    setNotice("");
    requestAnimationFrame(() => contactInput.current?.focus());
  }
  return (
    <div className="entry-card">
      <p className="eyebrow">Interactive account preview</p>
      {step === "contact" ? (
        <>
          <h2>{mode === "signup" ? "Try your first step." : "Welcome back."}</h2>
          <p>
            Explore a passwordless sign-in flow using example contact details. No account is
            created.
          </p>
          <div className="segmented" role="group" aria-label="Contact method">
            <button
              type="button"
              aria-pressed={channel === "email"}
              onClick={() => {
                setChannel("email");
                setContact("");
                setError("");
              }}
            >
              Email
            </button>
            <button
              type="button"
              aria-pressed={channel === "sms"}
              onClick={() => {
                setChannel("sms");
                setContact("");
                setError("");
              }}
            >
              Phone
            </button>
          </div>
          <form onSubmit={submitContact} noValidate>
            <div className="field">
              <label htmlFor="auth-contact">
                {channel === "email" ? "Email address" : "Canadian phone number"}
              </label>
              <input
                id="auth-contact"
                ref={contactInput}
                type={channel === "email" ? "email" : "tel"}
                inputMode={channel === "email" ? "email" : "tel"}
                autoComplete="off"
                maxLength={channel === "email" ? 254 : 24}
                value={contact}
                onChange={(event) => {
                  setContact(event.target.value);
                  setError("");
                }}
                placeholder={channel === "email" ? "alex@example.com" : "+1 416 555 0123"}
                aria-invalid={!!error}
                aria-describedby={error ? "contact-help auth-error" : "contact-help"}
              />
              <p className="fine-print" id="contact-help">
                {channel === "email"
                  ? "Try alex@example.com. This stays only in the open form."
                  : "Try +1 416 555 0123. Format only; location and ownership are not verified."}
              </p>
              {error && (
                <p className="field-error" id="auth-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button className="button" type="submit" style={{ marginTop: 20 }}>
              Continue to demo code <span aria-hidden="true">↗</span>
            </button>
          </form>
        </>
      ) : step === "code" ? (
        <>
          <h2>Try the verification step.</h2>
          <p>
            No {channel === "email" ? "email" : "text message"} was sent. In a live service, a
            private code would go to your contact. Here, use the test code below.
          </p>
          <div className="demo-code">
            <span>Demo code</span>
            <strong>123456</strong>
          </div>
          <form onSubmit={verify} noValidate>
            <div className="field">
              <label htmlFor="auth-code">Six-digit demo code</label>
              <input
                id="auth-code"
                ref={codeInput}
                value={code}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                pattern="[0-9]{6}"
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "code-help auth-error" : "code-help"}
              />
              <p className="fine-print" id="code-help">
                Preview only. This does not verify your identity.
              </p>
              {error && (
                <p className="field-error" id="auth-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button className="button" type="submit" style={{ marginTop: 20 }}>
              Complete code preview
            </button>
          </form>
          <div className="auth-links">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setNotice("The demo code is still 123456. No message has been sent.");
                setCode("");
                setError("");
                codeInput.current?.focus();
              }}
            >
              Resend preview code
            </button>
            <button type="button" className="link-button" onClick={changeContact}>
              Change contact
            </button>
          </div>
          <p className="status-text" role="status">
            {notice}
          </p>
        </>
      ) : (
        <div ref={result} tabIndex={-1}>
          <h2>You have tried the sign-in flow.</h2>
          <p>
            No identity was verified and no account was created. Contact details have been cleared
            from this form. You can now explore the local demo.
          </p>
          <a className="button" href={memberUrl(mode === "signup" ? "/onboarding" : "/dashboard")}>
            {mode === "signup" ? "Continue to setup" : "Open demo"}{" "}
            <span aria-hidden="true">↗</span>
          </a>
          <button type="button" className="link-button" onClick={changeContact}>
            Try the preview again
          </button>
        </div>
      )}
      <p className="fine-print">
        Preview only: no message sent, no identity verified, and nothing charged. Contact details
        are never saved or submitted.
      </p>
    </div>
  );
}
