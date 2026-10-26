"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { Brand } from "@/components/app-shell";
import { PageHeading, Status } from "@/components/ui";
import { liveMode, memberError, memberRequest, postMember } from "@/lib/member-api";

type Access = {
  role: "admin" | "support" | "editor";
  verified: boolean;
  recentMfa: boolean;
  factors: { id: string; name: string }[];
};
const AccessContext = createContext<Access | null>(null);
export function useOperator() {
  return useContext(AccessContext);
}

export default function OperatorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!liveMode) return;
    const controller = new AbortController();
    void memberRequest<Access>("/api/operator/access", { signal: controller.signal })
      .then(setAccess)
      .catch((error) => {
        if (!controller.signal.aborted) setError(memberError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  const isAccess = pathname === "/operator/access";
  return (
    <div className="operator-shell">
      <a className="skip-link" href="#operator-main">
        Skip to operator workspace
      </a>
      <header className="operator-header">
        <Brand small />
        <Link href="/dashboard" className="text-link">
          Member home
        </Link>
      </header>
      <main id="operator-main" className="operator-main">
        {!liveMode ? (
          <section className="panel">
            <PageHeading
              title="Operator workspace"
              description="Operator access is available when the app is configured in live mode."
            />
            <p>The local member preview does not create operator accounts or change payments.</p>
            <Link href="/dashboard" className="button button-secondary">
              Back to preview
            </Link>
          </section>
        ) : loading ? (
          <p role="status">Checking operator access…</p>
        ) : error ? (
          <section className="panel">
            <PageHeading title="Operator access unavailable" />
            <Status error>{error}</Status>
            <div className="button-row">
              <button
                className="button button-secondary"
                onClick={() => {
                  setError("");
                  setLoading(true);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
              <Link className="button button-secondary" href="/signin">
                Sign in
              </Link>
            </div>
          </section>
        ) : access ? (
          <AccessContext.Provider value={access}>
            <nav className="settings-tabs operator-nav" aria-label="Operator navigation">
              <Link href="/operator" aria-current={pathname === "/operator" ? "page" : undefined}>
                Service overview
              </Link>
              {access.role !== "editor" && (
                <Link
                  href="/operator/finance"
                  aria-current={pathname === "/operator/finance" ? "page" : undefined}
                >
                  Financial support
                </Link>
              )}
              {access.role !== "support" && (
                <Link
                  href="/operator/content"
                  aria-current={pathname === "/operator/content" ? "page" : undefined}
                >
                  Content review
                </Link>
              )}
              <Link href="/operator/access" aria-current={isAccess ? "page" : undefined}>
                Authenticator
              </Link>
            </nav>
            {!access.verified || isAccess ? <OperatorAuthenticator access={access} /> : children}
          </AccessContext.Provider>
        ) : null}
      </main>
    </div>
  );
}

function OperatorAuthenticator({ access }: { access: Access }) {
  const [enrollment, setEnrollment] = useState<{
    factorId: string;
    secret: string;
    qrCode: string;
  } | null>(null);
  const [factorId, setFactorId] = useState(access.factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      const result = await postMember<NonNullable<typeof enrollment>>("/api/operator/access", {
        action: "enroll",
      });
      setEnrollment(result);
      setFactorId(result.factorId);
    } catch (error) {
      setError(memberError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="operator-access panel">
      <PageHeading
        eyebrow="OPERATOR SECURITY"
        title={access.verified ? "Verify your authenticator" : "A second step for operator access"}
        description="Use an authenticator app to protect financial and editorial actions."
      />
      {access.factors.length === 0 && !enrollment ? (
        <>
          <p>
            Add Jesus in Practice to your authenticator, then enter its six-digit code. Keep your
            authenticator backup in a secure place. Device recovery is handled by the Supabase
            account owner.
          </p>
          <button className="button button-primary" disabled={busy} onClick={() => void enroll()}>
            {busy ? "Starting setup…" : "Set up authenticator"}
          </button>
        </>
      ) : null}
      {enrollment && (
        <div className="operator-enrollment">
          {/* Provider SVG is displayed as an image, never injected as document markup. */}
          {}
          <img
            width="224"
            height="224"
            src={
              enrollment.qrCode.startsWith("data:image/svg+xml")
                ? enrollment.qrCode
                : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qrCode)}`
            }
            alt="Scan with your authenticator app. The setup key is also available below."
          />
          <details>
            <summary>Enter the setup key manually</summary>
            <code className="operator-id">{enrollment.secret}</code>
          </details>
          <p className="field-hint">
            This key gives access to your verification codes. Do not send or screenshot it.
          </p>
        </div>
      )}
      {factorId && (
        <form
          className="member-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await postMember("/api/operator/access", { action: "verify", factorId, code });
              setCode("");
              setEnrollment(null);
              window.location.replace("/operator");
            } catch (error) {
              setCode("");
              setError(memberError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {access.factors.length > 1 && (
            <div className="field">
              <label htmlFor="operator-factor">Authenticator</label>
              <select
                id="operator-factor"
                value={factorId}
                onChange={(e) => setFactorId(e.target.value)}
              >
                {access.factors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="operator-code">Six-digit authenticator code</label>
            <input
              id="operator-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              aria-describedby={error ? "operator-mfa-error" : undefined}
            />
          </div>
          <button className="button button-primary" disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
      )}
      <div id="operator-mfa-error">
        <Status error>{error}</Status>
      </div>
    </div>
  );
}
