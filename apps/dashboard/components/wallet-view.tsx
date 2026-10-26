"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDemo } from "@/components/demo-provider";
import SettingsNavigation from "@/components/settings-navigation";
import { PageHeading, Status } from "@/components/ui";
import { websiteLink } from "@/lib/links";
import { memberError, memberRequest, postMember, type WalletData } from "@/lib/member-api";

import { smsCreditTerms } from "../../../shared/commerce-copy";

const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
const ledgerLabels: Record<string, string> = {
  fund: "Credit added",
  reserve: "SMS credit reserved",
  settle: "SMS delivery charged",
  release: "SMS reservation released",
  refund_hold: "Credit reserved for refund",
  refund_settle: "Refund confirmed",
  refund_release: "Refund reservation released",
  refund_return: "Failed refund credit restored",
  incident_debit: "Payment adjustment",
  incident_restore: "Payment adjustment restored",
  waiver: "Uncertain SMS charge waived",
};
export default function WalletView() {
  const { mode, refresh } = useDemo();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);
  const request = useRef(0);
  const load = useCallback(async (cursor?: string) => {
    const requestId = ++request.current;
    setLoading(true);
    setError("");
    try {
      const data = await memberRequest<WalletData>(
        `/api/wallet${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (requestId !== request.current) return;
      setWallet((current) => ({
        ...data,
        entries:
          cursor && current
            ? [
                ...current.entries,
                ...data.entries.filter(
                  (entry) => !current.entries.some((existing) => existing.id === entry.id),
                ),
              ]
            : data.entries,
      }));
      setUpdatedAt(new Date().toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }));
    } catch (error) {
      if (requestId === request.current) setError(memberError(error));
    } finally {
      if (requestId === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const lifecycle = { active: true };
    const requests = request;
    void Promise.resolve().then(() => {
      if (lifecycle.active && mode === "live") void load();
    });
    return () => {
      lifecycle.active = false;
      requests.current++;
    };
  }, [load, mode]);
  async function checkout() {
    setPaying(true);
    setError("");
    operationId.current ||= crypto.randomUUID();
    try {
      const result = await postMember<{ url: string }>("/api/wallet/checkout", {
        amountCents: amount,
        operationId: operationId.current,
      });
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "checkout.stripe.com" ||
        url.username ||
        url.password
      )
        throw new Error("The checkout link could not be verified. Please try again.");
      window.location.assign(url.toString());
    } catch (error) {
      setError(memberError(error));
      setPaying(false);
    }
  }
  if (mode !== "live")
    return (
      <>
        <PageHeading
          title="SMS wallet"
          description="Prepaid SMS will be available with a connected account. This preview cannot take payments."
        />
        <Link className="button button-secondary" href="/settings/plans">
          Explore reminder options
        </Link>
        <p className="field-hint">
          {smsCreditTerms.noExpiry} {smsCreditTerms.refund}{" "}
          <a className="text-link" href={websiteLink("/terms")}>
            Read SMS credit terms
          </a>
        </p>
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow="FREE EMAIL. SMS ON YOUR TERMS."
        title="Your SMS wallet"
        description="Add credit when you want text reminders. There is no subscription or automatic top-up."
      />
      <SettingsNavigation />
      <div className="wallet-layout">
        <section className="panel form-section">
          <h2>Available SMS credit</h2>
          {wallet ? (
            <>
              <p className="wallet-balance">
                {money(wallet.availableCents)} <span>CAD</span>
              </p>
              {wallet.rateCents !== null && (
                <p className="small muted">
                  Each practice can use up to 10 SMS segments: at most{" "}
                  {money(wallet.rateCents * 10)} CAD per message at this rate. Your schedule allows
                  up to three messages per day. Credit is reserved before sending, charged on
                  delivery confirmation, and released after a confirmed failure. An uncertain
                  delivery keeps its reservation while it is reviewed.
                </p>
              )}
              <p className="small muted">
                Reserved for messages or refunds in progress: {money(wallet.reservedCents)} CAD
              </p>
              <p>
                {wallet.rateCents === null
                  ? "SMS pricing is not configured yet."
                  : `${money(wallet.rateCents)} CAD per SMS segment. A longer message can use more than one segment.`}
              </p>
              {wallet.availableCents <= 0 && (
                <div className="info-box">
                  <p>
                    No SMS credit is available. Free email reminders can continue when email consent
                    and your schedule are enabled.
                  </p>
                </div>
              )}
              {!wallet.enabled && (
                <div className="info-box">
                  <p>SMS payments are not available right now. Please check again later.</p>
                </div>
              )}
              {wallet.blockedReason && (
                <Status error>
                  Your wallet needs a support review. Payments and SMS spending are unavailable.
                  <a href={websiteLink("/support")}>Contact support</a> before adding more credit.
                  Your free email reminders are separate.
                </Status>
              )}
              <p className="field-hint">
                Last refreshed {updatedAt}. Pending payments are added only after server
                confirmation.
              </p>
              {wallet.supportId && (
                <p className="field-hint">
                  Wallet support ID: <code className="operator-id">{wallet.supportId}</code>
                </p>
              )}
            </>
          ) : (
            <p role="status">{loading ? "Loading your wallet…" : "Your balance is unavailable."}</p>
          )}
          <button
            className="button button-secondary"
            disabled={loading || paying}
            onClick={() => {
              void load();
              void refresh();
            }}
          >
            {loading ? "Refreshing…" : "Refresh balance"}
          </button>
        </section>
        <section className="panel form-section">
          <h2>Add prepaid credit</h2>
          <p>Choose an amount. You will review payment details in secure hosted checkout.</p>
          <fieldset disabled={paying}>
            <legend>Top-up amount in CAD</legend>
            <div className="wallet-amounts">
              {[1000, 2500, 5000].map((value) => (
                <label className={`topic-choice ${amount === value ? "selected" : ""}`} key={value}>
                  <input
                    type="radio"
                    name="top-up"
                    value={value}
                    checked={amount === value}
                    onChange={() => {
                      setAmount(value);
                      operationId.current = null;
                    }}
                  />
                  <span>{money(value)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="button button-primary"
            disabled={
              !wallet?.enabled ||
              Boolean(wallet.blockedReason) ||
              wallet.rateCents === null ||
              paying ||
              loading
            }
            onClick={() => void checkout()}
          >
            {paying ? "Opening checkout…" : `Continue with ${money(amount)} CAD`}
          </button>
          <p className="field-hint">
            Payment details stay with the payment provider. Returning from checkout does not itself
            confirm payment. Refresh your balance to check the result.
          </p>
          <p className="field-hint">
            {smsCreditTerms.noExpiry} {smsCreditTerms.refund}{" "}
            <a className="text-link" href={websiteLink("/support")}>
              Contact support about unused credit
            </a>{" "}
            before closing your account.
          </p>
          <p>
            <a className="text-link" href={websiteLink("/terms")}>
              Read SMS credit terms
            </a>
          </p>
          <Link className="text-link" href="/settings/account">
            Verify your phone and manage SMS consent
          </Link>
        </section>
      </div>
      <Status error>{error}</Status>
      <section className="panel wallet-history">
        <div className="section-heading">
          <h2>Credit activity</h2>
          <span className="small muted">CAD</span>
        </div>
        {!wallet ? (
          <p>Your activity will appear when the wallet loads.</p>
        ) : !wallet.entries.length ? (
          <p>No wallet activity yet. Confirmed top-ups and SMS activity will appear here.</p>
        ) : (
          <div className="wallet-ledger">
            {wallet.entries.map((entry) => (
              <div className="wallet-entry" key={entry.id}>
                <div>
                  <strong>{ledgerLabels[entry.kind] || "Credit adjustment"}</strong>
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString("en-CA")}
                  </time>
                </div>
                <strong>{money(entry.amountCents)}</strong>
              </div>
            ))}
          </div>
        )}
        {wallet?.nextCursor && (
          <button
            className="button button-secondary"
            disabled={loading}
            onClick={() => void load(wallet.nextCursor!)}
          >
            {loading ? "Loading…" : "Load more activity"}
          </button>
        )}
      </section>
    </>
  );
}
