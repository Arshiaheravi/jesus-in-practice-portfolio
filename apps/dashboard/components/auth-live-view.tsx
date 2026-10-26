"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Brand } from "@/components/app-shell";
import { Status } from "@/components/ui";
import { websiteLink } from "@/lib/links";
import { memberError, postMember } from "@/lib/member-api";

export default function AuthLiveView({ signup = false }: { signup?: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);
  const focusCodeAfterSend = useRef(false);
  useEffect(() => {
    if (step === "code" && !pending && focusCodeAfterSend.current && codeInput.current) {
      codeInput.current.focus();
      focusCodeAfterSend.current = false;
    }
  }, [step, pending]);
  async function sendCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) {
      setError("Enter a valid email address.");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      await postMember("/api/auth/start", { email: email.trim() });
      focusCodeAfterSend.current = true;
      setStep("code");
      setNotice("If this address can receive a sign-in code, check its inbox and spam folder.");
    } catch (error) {
      setError(memberError(error));
    } finally {
      setPending(false);
    }
  }
  async function verify() {
    if (!/^\d{6,10}$/.test(code)) {
      setError("Enter the numeric verification code from your email.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await postMember("/api/auth/verify", { email: email.trim(), code });
      setCode("");
      setEmail("");
      // Start a new document after changing identity. Anonymous prefetch redirects
      // must not survive a successful cookie-based sign-in.
      window.location.replace("/dashboard");
    } catch (error) {
      setError(memberError(error));
      setPending(false);
    }
  }
  return (
    <main className="access-page">
      <Brand />
      <section className="panel access-panel">
        <p className="eyebrow">A FREE ACCOUNT. A DAILY PRACTICE.</p>
        <h1>
          {step === "code"
            ? "Check your email."
            : signup
              ? "Begin your practice."
              : "Welcome back."}
        </h1>
        <p>
          {step === "code"
            ? `Enter the code for ${email}. Never share this code with someone else.`
            : "Use your email to sign in or create a free account. No password or payment card is needed."}
        </p>
        <form
          className="member-form"
          onSubmit={(event) => {
            event.preventDefault();
            void (step === "email" ? sendCode() : verify());
          }}
        >
          {step === "email" ? (
            <div className="field">
              <label htmlFor="account-email">Email address</label>
              <input
                id="account-email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "auth-live-error" : undefined}
                disabled={pending}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="account-code">Verification code</label>
              <input
                id="account-code"
                ref={codeInput}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                minLength={6}
                maxLength={10}
                required
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "auth-live-error" : undefined}
                disabled={pending}
              />
            </div>
          )}
          {error && (
            <div id="auth-live-error">
              <Status error>{error}</Status>
            </div>
          )}
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending
              ? "Please wait…"
              : step === "email"
                ? "Send sign-in code"
                : "Verify and continue"}
          </button>
        </form>
        {step === "code" && (
          <div className="button-row">
            <button className="text-link" disabled={pending} onClick={() => void sendCode()}>
              Resend code
            </button>
            <button
              className="text-link"
              disabled={pending}
              onClick={() => {
                focusCodeAfterSend.current = false;
                setStep("email");
                setCode("");
                setError("");
                setNotice("");
              }}
            >
              Use another email
            </button>
          </div>
        )}
        <Status>{notice}</Status>
        <p className="field-hint">
          Sign-in emails are for account access. You can separately choose free practice emails
          after signing in. Optional SMS uses prepaid credit; there is no subscription.
        </p>
        <a className="text-link" href={websiteLink("/privacy")}>
          Privacy information
        </a>
        <Link className="text-link" href={signup ? "/signin" : "/signup"}>
          {signup ? "Already have an account? Sign in" : "New here? Create a free account"}
        </Link>
      </section>
      <a className="text-link" href={websiteLink()}>
        Back to the website
      </a>
    </main>
  );
}
