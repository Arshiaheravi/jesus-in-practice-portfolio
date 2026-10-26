"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useOperator } from "@/components/operator-shell";
import OperatorWaiver from "@/components/operator-waiver";
import { PageHeading, Status } from "@/components/ui";
import { MemberApiError, memberError, memberRequest } from "@/lib/member-api";

type Cases = {
  events: {
    id: string;
    walletId: string | null;
    kind: string;
    amountCents: number;
    createdAt: string;
    paymentIntentId: string;
  }[];
  nextCursor: string | null;
  deliveries: {
    id: string;
    channel: string;
    status: string;
    failureCode: string | null;
    providerId: string | null;
    updatedAt: string;
    creditState?: string | null;
    amountCents?: number | null;
  }[];
  deliveryLimit: number;
};
type Wallet = {
  wallet: {
    id: string;
    availableCents: number;
    reservedCents: number;
    blockedReason: string | null;
  };
  checkouts: { id: string; amountCents: number; status: string; createdAt: string }[];
  refunds?: (Refund & { checkoutId: string; createdAt: string })[];
  limit: number;
};
type Refund = { id: string; status: string; holdState: string; amountCents: number };
const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);

export default function OperatorFinance() {
  const access = useOperator();
  const [cases, setCases] = useState<Cases | null>(null),
    [wallet, setWallet] = useState<Wallet | null>(null),
    [walletId, setWalletId] = useState(""),
    [checkoutId, setCheckoutId] = useState(""),
    [amount, setAmount] = useState(""),
    [paymentIntentId, setPaymentIntentId] = useState("");
  const [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [refund, setRefund] = useState<Refund | null>(null);
  const operation = useRef<{ id: string; body: Record<string, unknown> } | null>(null);
  const [locked, setLocked] = useState(false);
  const [operationId, setOperationId] = useState("");
  const [revision, setRevision] = useState(0);
  const [lookupId, setLookupId] = useState("");
  const [lookupRefund, setLookupRefund] = useState<Refund | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [waiver, setWaiver] = useState<{ id: string; amountCents: number } | null>(null);
  useEffect(() => {
    if (access?.role === "editor") return;
    const controller = new AbortController();
    void memberRequest<Cases>("/api/operator/cases", { signal: controller.signal })
      .then(setCases)
      .catch((error) => {
        if (!controller.signal.aborted) setError(memberError(error));
      });
    return () => controller.abort();
  }, [access?.role, revision]);
  if (access?.role === "editor")
    return (
      <Status error>
        Your role has access to content review. Financial support requires a support or
        administrator role.
      </Status>
    );
  async function perform(name: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError("");
    setStatus("");
    try {
      await task();
    } catch (error) {
      if (
        name === "submit" &&
        error instanceof MemberApiError &&
        [400, 403, 409].includes(error.status) &&
        error.code !== "OPERATION_CONFLICT"
      ) {
        operation.current = null;
        setLocked(false);
        setConfirmed(false);
      }
      setError(memberError(error));
    } finally {
      setBusy("");
    }
  }
  async function inspect(id: string) {
    const result = await memberRequest<Wallet>(
      `/api/operator/cases?wallet=${encodeURIComponent(id)}`,
    );
    setWallet(result);
    setWalletId(id);
    setCheckoutId("");
  }
  async function submit(action: "refund" | "resolve") {
    if (!operation.current) {
      const id = crypto.randomUUID();
      setOperationId(id);
      operation.current = {
        id,
        body: {
          action,
          operationId: id,
          reason,
          confirmed,
          ...(action === "refund"
            ? { checkoutId, amountCents: Math.round(Number(amount) * 100) }
            : { paymentIntentId }),
        },
      };
      setLocked(true);
    }
    const result = await memberRequest<{
      refund?: Refund;
      resolution?: { result: string; adjustmentCents: number; debtCents: number };
    }>(
      "/api/operator/finance",
      { method: "POST", body: JSON.stringify(operation.current.body) },
      50_000,
    );
    if (result.refund) {
      setRefund(result.refund);
      setStatus(
        `Refund request recorded: ${money(result.refund.amountCents)}. Status: ${result.refund.status}. A recorded request is not a completed refund.`,
      );
    }
    if (result.resolution) {
      setStatus(
        `Review result: ${result.resolution.result}. Adjustment: ${money(result.resolution.adjustmentCents)}. Unrecovered amount: ${money(result.resolution.debtCents)}.`,
      );
      operation.current = null;
      setLocked(false);
      setConfirmed(false);
      setReason("");
    }
    setRevision((n) => n + 1);
    if (wallet) {
      try {
        setWallet(await memberRequest<Wallet>(`/api/operator/cases?wallet=${wallet.wallet.id}`));
      } catch {
        setError(
          "The action was recorded, but the wallet could not be refreshed. Inspect it again before another action.",
        );
      }
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="OPERATOR WORKSPACE"
        title="Financial support"
        description="Review payment exceptions and unused SMS credit with a recorded reason for each action."
      />
      <Status error>{error}</Status>
      <Status>{status}</Status>
      {access?.role === "admin" && !access.recentMfa && (
        <p className="operator-note">
          Financial actions require a recent authenticator code.{" "}
          <Link className="text-link" href="/operator/access">
            Verify your authenticator
          </Link>{" "}
          before submitting.
        </p>
      )}
      <div className="operator-grid">
        <div className="operator-stack">
          <section className="panel">
            <h2>Payment events</h2>
            <p className="field-hint">
              Historical events remain visible after resolution. Inspect the wallet for its current
              restriction.
            </p>
            {!cases ? (
              <p role="status">Loading payment events…</p>
            ) : cases.events.length === 0 ? (
              <p>No payment incidents have been recorded.</p>
            ) : (
              cases.events.map((event) => (
                <article key={event.id} className="operator-record">
                  <h3>
                    {event.kind === "refund" ? "Refund review" : "Dispute review"} ·{" "}
                    {money(event.amountCents)}
                  </h3>
                  <p className="operator-id">{event.paymentIntentId}</p>
                  <p className="field-hint">{new Date(event.createdAt).toLocaleString("en-CA")}</p>
                  <div className="button-row">
                    {event.walletId && (
                      <button
                        className="button button-secondary"
                        disabled={!!busy || locked}
                        onClick={() => void perform("inspect", () => inspect(event.walletId!))}
                      >
                        Inspect wallet
                      </button>
                    )}
                    {access?.role === "admin" && (
                      <button
                        className="button button-secondary"
                        disabled={!!busy || locked}
                        onClick={() => {
                          setPaymentIntentId(event.paymentIntentId);
                          setCheckoutId("");
                        }}
                      >
                        Select for review
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
            {cases?.nextCursor && (
              <button
                className="button button-secondary"
                disabled={!!busy}
                onClick={() =>
                  void perform("more", async () => {
                    const page = await memberRequest<Cases>(
                      `/api/operator/cases?cursor=${encodeURIComponent(cases.nextCursor!)}`,
                    );
                    setCases({ ...page, events: [...cases.events, ...page.events] });
                  })
                }
              >
                Load older events
              </button>
            )}
            <button
              className="button button-secondary"
              disabled={!!busy}
              onClick={() => setRevision((n) => n + 1)}
            >
              Refresh records
            </button>
          </section>
          <section className="panel">
            <h2>Uncertain deliveries needing review</h2>
            <p className="field-hint">
              Up to {cases?.deliveryLimit ?? 50} oldest uncertain records, excluding waived SMS
              charges. A waiver leaves the delivery outcome unknown in its history. Check an unknown
              outcome with the provider; do not resend it blindly.
            </p>
            {cases?.deliveries.length === 0 ? (
              <p>No uncertain deliveries without a charge waiver are currently listed.</p>
            ) : (
              cases?.deliveries.map((delivery) => (
                <article className="operator-record" key={delivery.id}>
                  <strong>
                    {delivery.channel.toUpperCase()} · {delivery.status}
                  </strong>
                  <p className="operator-id">Delivery: {delivery.id}</p>
                  <p className="operator-id">
                    Provider: {delivery.providerId ?? "No provider identifier received"}
                  </p>
                  <p>{delivery.failureCode?.replaceAll("_", " ")}</p>
                  {delivery.creditState && <p>Credit reservation: {delivery.creditState}.</p>}
                  {access?.role === "admin" &&
                    delivery.status === "unknown" &&
                    delivery.channel === "sms" &&
                    delivery.creditState === "held" &&
                    delivery.amountCents && (
                      <button
                        className="button button-secondary"
                        disabled={!!busy || !access.recentMfa}
                        onClick={() =>
                          setWaiver({ id: delivery.id, amountCents: delivery.amountCents! })
                        }
                      >
                        Review a charge waiver
                      </button>
                    )}
                </article>
              ))
            )}
          </section>
        </div>
        <div className="operator-stack">
          {waiver && (
            <OperatorWaiver
              key={waiver.id}
              deliveryId={waiver.id}
              amountCents={waiver.amountCents}
              onSaved={() => setRevision((n) => n + 1)}
            />
          )}
          <section className="panel">
            <h2>Find a wallet</h2>
            <form
              className="operator-form"
              onSubmit={(e) => {
                e.preventDefault();
                void perform("inspect", () => inspect(walletId));
              }}
            >
              <div className="field">
                <label htmlFor="wallet-support-id">Wallet support ID</label>
                <input
                  id="wallet-support-id"
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value.trim())}
                  required
                  disabled={locked}
                />
                <p className="field-hint">The member can find this on their SMS wallet page.</p>
              </div>
              <button className="button button-secondary" disabled={!!busy || locked}>
                {busy === "inspect" ? "Loading…" : "Inspect wallet"}
              </button>
            </form>
            {wallet && (
              <div className="operator-record">
                <strong>
                  {money(wallet.wallet.availableCents)} available ·{" "}
                  {money(wallet.wallet.reservedCents)} reserved
                </strong>
                <p>
                  {wallet.wallet.blockedReason
                    ? `Restriction: ${wallet.wallet.blockedReason.replaceAll("_", " ")}`
                    : "No financial restriction recorded."}
                </p>
                <p className="field-hint">Showing up to {wallet.limit} most recent top-ups.</p>
                {wallet.checkouts
                  .filter((c) => c.status === "paid")
                  .map((checkout) => (
                    <button
                      className="button button-secondary"
                      disabled={locked || access?.role !== "admin"}
                      key={checkout.id}
                      onClick={() => {
                        setCheckoutId(checkout.id);
                        setPaymentIntentId("");
                        setAmount("");
                      }}
                    >
                      Select {money(checkout.amountCents)} top-up ·{" "}
                      {new Date(checkout.createdAt).toLocaleDateString("en-CA")}
                    </button>
                  ))}
                <h3>Recent refund requests</h3>
                <p className="field-hint">
                  Up to {wallet.limit} most recent requests. Check an existing request before
                  creating another.
                </p>
                {!wallet.refunds?.length ? (
                  <p>No refund requests recorded for this wallet.</p>
                ) : (
                  wallet.refunds.map((item) => (
                    <article className="operator-record" key={item.id}>
                      <strong>
                        {money(item.amountCents)} · {item.status}
                      </strong>
                      <p className="operator-id">{item.id}</p>
                      <button
                        className="button button-secondary"
                        disabled={!!busy}
                        onClick={() => {
                          setLookupId(item.id);
                          setLookupRefund(item);
                        }}
                      >
                        Review this refund
                      </button>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Recover a refund request</h2>
            <form
              className="operator-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform("lookup", async () => {
                  const result = await memberRequest<{ refund: Refund | null }>(
                    `/api/operator/finance?id=${encodeURIComponent(lookupId)}`,
                  );
                  setLookupRefund(result.refund);
                  setStatus(
                    result.refund
                      ? "Current refund status loaded."
                      : "No refund request with that ID was recorded.",
                  );
                });
              }}
            >
              <div className="field">
                <label htmlFor="refund-lookup">Refund request ID</label>
                <input
                  id="refund-lookup"
                  required
                  value={lookupId}
                  onChange={(e) => {
                    setLookupId(e.target.value.trim());
                    setLookupRefund(null);
                    setCancelConfirm(false);
                  }}
                />
              </div>
              <button className="button button-secondary" disabled={!!busy}>
                Check saved request
              </button>
            </form>
            {lookupRefund && (
              <div className="operator-record">
                <strong>
                  {money(lookupRefund.amountCents)} · {lookupRefund.status}
                </strong>
                <p>Credit hold: {lookupRefund.holdState}.</p>
                {access?.role === "admin" && lookupRefund.holdState === "held" && (
                  <form
                    className="operator-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void perform("cancel-refund", async () => {
                        const result = await memberRequest<{ refund: Refund }>(
                          "/api/operator/finance",
                          {
                            method: "POST",
                            body: JSON.stringify({
                              action: "cancel-refund",
                              refundId: lookupRefund.id,
                              reason: cancelReason,
                              confirmed: cancelConfirm,
                            }),
                          },
                          50_000,
                        );
                        setLookupRefund(result.refund);
                        setCancelConfirm(false);
                        setStatus(
                          "Refund cancellation recorded from available evidence. Refresh the wallet to review its credit.",
                        );
                        setRevision((n) => n + 1);
                      });
                    }}
                  >
                    <p>
                      Cancellation is allowed only before submission or when complete provider
                      history proves no refund was created after the safety waiting period.
                    </p>
                    <div className="field">
                      <label htmlFor="cancel-refund-reason">Cancellation reason</label>
                      <textarea
                        id="cancel-refund-reason"
                        required
                        minLength={10}
                        maxLength={500}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                    </div>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        required
                        checked={cancelConfirm}
                        onChange={(e) => setCancelConfirm(e.target.checked)}
                      />
                      <span>
                        I have reviewed this request and want to cancel it only if provider evidence
                        allows it.
                      </span>
                    </label>
                    <button
                      className="button button-danger"
                      disabled={!!busy || !cancelConfirm || !access.recentMfa}
                    >
                      Check and cancel request
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>
          {access?.role === "admin" && (
            <section className="panel">
              <h2>{checkoutId ? "Refund unused credit" : "Review a payment incident"}</h2>
              <form
                className="operator-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform("submit", () => submit(checkoutId ? "refund" : "resolve"));
                }}
              >
                {checkoutId ? (
                  <>
                    <p className="operator-id">Top-up: {checkoutId}</p>
                    <div className="field">
                      <label htmlFor="refund-amount">Refund amount (CAD)</label>
                      <input
                        id="refund-amount"
                        type="number"
                        min="0.01"
                        max="50"
                        step="0.01"
                        required
                        value={amount}
                        disabled={locked}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="field">
                    <label htmlFor="payment-intent">Stripe payment ID</label>
                    <input
                      id="payment-intent"
                      required
                      pattern="pi_[A-Za-z0-9]+"
                      value={paymentIntentId}
                      disabled={locked}
                      onChange={(e) => setPaymentIntentId(e.target.value.trim())}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="financial-reason">Reason for the action</label>
                  <textarea
                    id="financial-reason"
                    minLength={10}
                    maxLength={500}
                    required
                    value={reason}
                    disabled={locked}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <p className="field-hint">
                    Use a support case reference. Do not include card details or private
                    reflections.
                  </p>
                </div>
                <label className="check-label">
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    disabled={locked}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    {checkoutId
                      ? "I have checked the selected top-up and refund amount. This can return money to the original payment method."
                      : "I have reviewed this incident. The app will use complete Stripe evidence to determine any adjustment and whether the wallet can be released."}
                  </span>
                </label>
                <button
                  className="button button-primary"
                  disabled={!!busy || !access.recentMfa || !confirmed || !!refund}
                >
                  {busy === "submit"
                    ? "Recording…"
                    : locked
                      ? "Retry the same request"
                      : checkoutId
                        ? "Request refund"
                        : "Reconcile with Stripe"}
                </button>
              </form>
              {locked && (
                <div className="operator-record">
                  <p className="operator-id">Request: {operationId}</p>
                  <p>
                    Keep this request ID. Retrying uses the same operation and does not create a
                    second refund.
                  </p>
                  {checkoutId && (
                    <button
                      className="button button-secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void perform("check", async () => {
                          const result = await memberRequest<{ refund: Refund | null }>(
                            `/api/operator/finance?id=${operation.current!.id}`,
                          );
                          setRefund(result.refund);
                          setStatus(
                            result.refund
                              ? `Refund status: ${result.refund.status}. Credit hold: ${result.refund.holdState}.`
                              : "No request was recorded. You may retry the same request.",
                          );
                        })
                      }
                    >
                      Check refund status
                    </button>
                  )}
                  {refund && ["succeeded", "failed", "canceled"].includes(refund.status) && (
                    <button
                      className="button button-secondary"
                      disabled={!!busy}
                      onClick={() => {
                        operation.current = null;
                        setLocked(false);
                        setRefund(null);
                        setCheckoutId("");
                        setAmount("");
                        setReason("");
                        setConfirmed(false);
                      }}
                    >
                      Start another review
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
