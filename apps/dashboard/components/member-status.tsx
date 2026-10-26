"use client";

import Link from "next/link";
import { useState } from "react";

import { useDemo } from "@/components/demo-provider";
import { LoadingContent, Status } from "@/components/ui";
import { memberError, memberRequest, postMember } from "@/lib/member-api";

function DeletionRecovery() {
  const [pending, setPending] = useState<"delete" | "logout" | null>(null);
  const [error, setError] = useState("");
  async function finish(action: "delete" | "logout") {
    setPending(action);
    setError("");
    try {
      if (action === "delete")
        await memberRequest("/api/account", {
          method: "DELETE",
          body: JSON.stringify({ confirmation: "DELETE" }),
        });
      else await postMember("/api/auth/logout", {});
      window.location.replace("/signin");
    } catch (error) {
      setError(memberError(error));
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="panel form-section">
      <h1>Your account deletion is unfinished</h1>
      <p>
        Your account is marked for deletion and its private pages are unavailable. You can retry
        your existing deletion request, or sign out and return later. Signing out does not cancel
        deletion.
      </p>
      <p>Retrying continues the permanent deletion you already requested.</p>
      <Status error>{error}</Status>
      <div className="form-actions">
        <button
          className="button button-danger"
          disabled={pending !== null}
          onClick={() => void finish("delete")}
        >
          {pending === "delete" ? "Retrying deletion…" : "Retry account deletion"}
        </button>
        <button
          className="button button-secondary"
          disabled={pending !== null}
          onClick={() => void finish("logout")}
        >
          {pending === "logout" ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </section>
  );
}

export function MemberContent({ children }: { children: React.ReactNode }) {
  const { hydrated, loadStatus, loadError, loadCode, refresh } = useDemo();
  if (loadCode === "ACCOUNT_DELETING") return <DeletionRecovery />;
  if (hydrated) return <>{children}</>;
  if (loadStatus === "unauthenticated")
    return (
      <section className="panel">
        <h1>Sign in to continue</h1>
        <p>Your session is no longer available. Sign in to access your account.</p>
        <Link className="button button-primary" href="/signin">
          Sign in
        </Link>
      </section>
    );
  if (loadStatus === "error")
    return (
      <section className="panel">
        <h1>Your account could not be loaded</h1>
        <Status error>{loadError}</Status>
        <button className="button button-secondary" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );
  return <LoadingContent />;
}
