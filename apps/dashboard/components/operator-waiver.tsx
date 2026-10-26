"use client";
import { useRef, useState } from "react";

import { Status } from "@/components/ui";
import { MemberApiError, memberError, postMember } from "@/lib/member-api";
export default function OperatorWaiver({
  deliveryId,
  amountCents,
  onSaved,
}: {
  deliveryId: string;
  amountCents: number;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [locked, setLocked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const operation = useRef<{
    operationId: string;
    deliveryId: string;
    reason: string;
    confirmed: true;
  } | null>(null);
  return (
    <section className="panel">
      <h2>Waive an uncertain SMS charge</h2>
      <p className="operator-id">Delivery: {deliveryId}</p>
      <p>
        This restores exactly {(amountCents / 100).toFixed(2)} CAD from the existing reservation.
        The service absorbs any provider charge. The message stays marked as unknown and will not be
        resent.
      </p>
      <Status error>{error}</Status>
      {saved ? (
        <Status>The reserved credit was returned. The delivery outcome remains unknown.</Status>
      ) : (
        <form
          className="operator-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            if (!operation.current)
              operation.current = {
                operationId: crypto.randomUUID(),
                deliveryId,
                reason,
                confirmed: true,
              };
            setLocked(true);
            try {
              await postMember("/api/operator/deliveries", operation.current);
              setSaved(true);
              onSaved();
            } catch (error) {
              if (
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
              setBusy(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="waiver-reason">Support review reason</label>
            <textarea
              id="waiver-reason"
              required
              minLength={10}
              maxLength={500}
              value={reason}
              disabled={locked}
              onChange={(e) => setReason(e.target.value)}
            />
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
              I approve restoring this reserved credit at the service’s expense. This is not proof
              of a delivery failure.
            </span>
          </label>
          <button className="button button-danger" disabled={busy || !confirmed}>
            {busy
              ? "Recording waiver…"
              : locked
                ? "Retry the same waiver"
                : "Waive this SMS charge"}
          </button>
        </form>
      )}
    </section>
  );
}
