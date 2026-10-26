"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PracticeContext } from "@/components/practice-context";
import { defaultState, type DemoState } from "@/lib/demo-model";
import {
  commandForChange,
  MemberApiError,
  type MemberBootstrap,
  memberError,
  memberRequest,
  postMember,
} from "@/lib/member-api";

export default function MemberProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [member, setMember] = useState<MemberBootstrap | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error" | "unauthenticated">(
    "loading",
  );
  const [loadError, setLoadError] = useState("");
  const [loadCode, setLoadCode] = useState("");
  const [pending, setPending] = useState(false);
  const current = useRef<MemberBootstrap | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const accept = useCallback((value: MemberBootstrap) => {
    if (
      !value?.state ||
      !Number.isInteger(value.revision) ||
      !value.account ||
      !value.wallet ||
      !value.history
    )
      throw new MemberApiError(
        "Your account response could not be read. Please refresh.",
        "INVALID_RESPONSE",
        502,
      );
    current.current = value;
    setMember(value);
    setLoadStatus("ready");
    setLoadError("");
    setLoadCode("");
  }, []);
  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    try {
      const value = await memberRequest<MemberBootstrap>("/api/member");
      if (requestGeneration === generation.current) accept(value);
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      if (error instanceof MemberApiError && error.status === 401) {
        current.current = null;
        setMember(null);
        setLoadStatus("unauthenticated");
      } else if (error instanceof MemberApiError && error.code === "ACCOUNT_DELETING") {
        current.current = null;
        setMember(null);
        setLoadStatus("error");
      } else setLoadStatus(current.current ? "ready" : "error");
      setLoadError(memberError(error));
      setLoadCode(error instanceof MemberApiError ? error.code : "UNAVAILABLE");
    }
  }, [accept]);
  useEffect(() => {
    if (["/signin", "/signup", "/reset-password"].includes(pathname)) return;
    const lifecycle = { active: true };
    const requests = generation;
    void Promise.resolve().then(() => {
      if (lifecycle.active) void refresh();
    });
    const onFocus = () => {
      if (!inFlight.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      lifecycle.active = false;
      requests.current++;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, pathname]);
  async function update(
    updater: (state: DemoState) => DemoState,
    expected?: Partial<DemoState>,
  ): Promise<"account"> {
    const baseline = current.current;
    if (!baseline) throw new MemberApiError("Sign in to save this change.", "AUTH_REQUIRED", 401);
    if (inFlight.current)
      throw new MemberApiError(
        "Another change is being saved. Please wait, then try again.",
        "BUSY",
        409,
      );
    if (
      expected &&
      Object.entries(expected).some(
        ([key, value]) =>
          JSON.stringify(baseline.state[key as keyof DemoState]) !== JSON.stringify(value),
      )
    )
      throw new MemberApiError(
        "These settings changed elsewhere. Cancel changes to load the latest values before editing again.",
        "CONFLICT",
        409,
      );
    const next = updater(baseline.state);
    if (JSON.stringify(next) === JSON.stringify(baseline.state)) return "account";
    const command = commandForChange(baseline.state, next);
    inFlight.current = true;
    setPending(true);
    generation.current++;
    try {
      accept(
        await postMember<MemberBootstrap>("/api/member", { revision: baseline.revision, command }),
      );
      return "account";
    } catch (error) {
      if (error instanceof MemberApiError && [401, 409].includes(error.status)) await refresh();
      throw error;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <PracticeContext.Provider
      key={member?.account.email || "signed-out"}
      value={{
        state: member?.state || defaultState,
        hydrated: loadStatus === "ready",
        issue: null,
        update,
        savePreview: () => "account",
        reset: () => false,
        mode: "live",
        member,
        pending,
        loadStatus,
        loadError,
        loadCode,
        refresh,
      }}
    >
      {children}
    </PracticeContext.Provider>
  );
}
