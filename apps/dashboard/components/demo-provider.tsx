"use client";

import { categories, practices } from "@jesus-in-practice/content";
import { useContext, useSyncExternalStore } from "react";

import MemberProvider from "@/components/member-provider";
import { PracticeContext, type SaveOutcome } from "@/components/practice-context";
import { defaultState, type DemoState, parseStoredState, STORAGE_KEY } from "@/lib/demo-model";
import { liveMode } from "@/lib/member-api";

type Snapshot = { state: DemoState; hydrated: boolean; issue: "storage" | "recovered" | null };
export type { SaveOutcome } from "@/components/practice-context";
const serverSnapshot: Snapshot = { state: defaultState, hydrated: false, issue: null };
let snapshot = serverSnapshot;
let lastRaw: string | null | undefined;
let memoryOnly = false;
let recoveryPending = false;
const listeners = new Set<() => void>();
const practiceIds = practices.map((practice) => practice.id);
function emit() {
  listeners.forEach((listener) => listener());
}
function readSnapshot(): Snapshot {
  if (memoryOnly) return snapshot;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!snapshot.hydrated || raw !== lastRaw) {
      const result = parseStoredState(raw, practiceIds, categories);
      lastRaw = raw;
      recoveryPending = result.recovered;
      snapshot = {
        state: result.state,
        hydrated: true,
        issue: result.recovered ? "recovered" : null,
      };
    }
  } catch {
    memoryOnly = true;
    snapshot = { ...snapshot, hydrated: true, issue: recoveryPending ? "recovered" : "storage" };
  }
  return snapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
function persist(state: DemoState): SaveOutcome {
  snapshot = { state, hydrated: true, issue: null };
  try {
    const raw = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, raw);
    lastRaw = raw;
    memoryOnly = false;
    snapshot = { ...snapshot, issue: null };
    emit();
    return "saved";
  } catch {
    memoryOnly = true;
    snapshot = { ...snapshot, issue: "storage" };
    emit();
    return "memory";
  }
}
async function update(updater: (state: DemoState) => DemoState): Promise<SaveOutcome> {
  const state = updater(readSnapshot().state);
  if (!recoveryPending) return persist(state);
  // Keep the original unreadable data until the user explicitly replaces it.
  snapshot = { state, hydrated: true, issue: "recovered" };
  emit();
  return "recovery-pending";
}
function savePreview(): SaveOutcome {
  const { state } = readSnapshot();
  recoveryPending = false;
  return persist(state);
}
function reset(): boolean {
  const current = readSnapshot();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    lastRaw = null;
    memoryOnly = false;
    recoveryPending = false;
    snapshot = { state: defaultState, hydrated: true, issue: null };
    emit();
    return true;
  } catch {
    memoryOnly = true;
    snapshot = { ...current, issue: recoveryPending ? "recovered" : "storage" };
    emit();
    return false;
  }
}

export function persistenceMessage(outcome: SaveOutcome, success: string): string {
  if (outcome === "account")
    return success
      .replaceAll("in this browser", "to your account")
      .replaceAll("from this browser", "from your account");
  if (outcome === "saved") return success;
  if (outcome === "recovery-pending")
    return "Kept in this tab only. Use Save fresh preview above to replace the unreadable browser data.";
  return "Kept in this tab only. Browser storage is unavailable; retry saving before leaving.";
}

function PreviewProvider({ children }: { children: React.ReactNode }) {
  const current = useSyncExternalStore(subscribe, readSnapshot, () => serverSnapshot);
  return (
    <PracticeContext.Provider
      value={{
        ...current,
        update,
        savePreview,
        reset,
        mode: "preview",
        member: null,
        pending: false,
        loadStatus: current.hydrated ? "ready" : "loading",
        loadError: "",
        loadCode: "",
        refresh: async () => {},
      }}
    >
      {children}
    </PracticeContext.Provider>
  );
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  return liveMode ? (
    <MemberProvider>{children}</MemberProvider>
  ) : (
    <PreviewProvider>{children}</PreviewProvider>
  );
}

export function useDemo() {
  const context = useContext(PracticeContext);
  if (!context) throw new Error("Practice state must be used inside DemoProvider");
  return context;
}

function subscribeClock(listener: () => void) {
  const timer = window.setInterval(listener, 60_000);
  return () => window.clearInterval(timer);
}
export function useCurrentDate() {
  const minute = useSyncExternalStore(
    subscribeClock,
    () => Math.floor(Date.now() / 60_000),
    () => 0,
  );
  return new Date(minute * 60_000);
}
