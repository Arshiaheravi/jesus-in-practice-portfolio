"use client";

import type { ReadinessResult } from "@jesus-in-practice/backend/maintenance";
import { useEffect, useState } from "react";

import { PageHeading, Status } from "@/components/ui";
import { memberError, memberRequest } from "@/lib/member-api";

const labels: Record<string, string> = {
  "config:operatorIdentity": "Public operator identity",
  "config:monitoringSecret": "Monitoring access",
  "config:retentionPolicy": "Approved retention policy",
  "config:emailConfiguration": "Email settings",
  "config:smsConfiguration": "SMS settings",
  "config:phoneVerificationConfiguration": "Phone verification settings",
  "config:paymentConfiguration": "Payment settings",
  database: "Database connection",
  migrations: "Database migrations",
  rls: "Row access controls",
  planner: "Delivery planner",
  retention: "Data maintenance",
};
export default function OperatorOverview() {
  const [data, setData] = useState<ReadinessResult | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void memberRequest<ReadinessResult>("/api/operator/overview", { signal: controller.signal })
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) setError(memberError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <>
      <PageHeading
        eyebrow="OPERATOR WORKSPACE"
        title="Service overview"
        description="Configuration and database signals to help you spot work that needs attention."
      />
      <div className="operator-stack">
        <section className="panel">
          <div className="button-row">
            <h2>
              {data
                ? data.ready
                  ? "Configured checks passed"
                  : "Some checks need attention"
                : "Service checks"}
            </h2>
            <button
              className="button button-secondary"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                setError("");
                setAttempt((n) => n + 1);
              }}
            >
              {loading ? "Checking…" : "Refresh checks"}
            </button>
          </div>
          <Status error>{error}</Status>
          {data && (
            <>
              <p className="field-hint">
                Checked {new Date(data.checkedAt).toLocaleString("en-CA")}. Refresh to get current
                results.
              </p>
              <ul className="operator-list">
                {data.checks.map((check) => (
                  <li key={check.code}>
                    <span>
                      {labels[check.code] ?? check.code.replaceAll("_", " ").replaceAll(":", " · ")}
                    </span>
                    <strong>
                      {check.status === "pass"
                        ? "Passed"
                        : check.status === "warn"
                          ? "Review"
                          : "Needs action"}
                      {check.count !== undefined ? ` · ${check.count}` : ""}
                    </strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <aside className="panel">
          <h2>What these checks establish</h2>
          <p>
            These checks inspect this app’s configuration and database. They do not prove that a
            real email, SMS, payment, backup restore, or provider webhook has succeeded.
          </p>
          <p>
            Keep provider delivery and payment switches off until the release checklist has been
            verified against the intended domain and accounts.
          </p>
        </aside>
      </div>
    </>
  );
}
