"use client";

import { createContext } from "react";

import type { DemoState } from "@/lib/demo-model";
import type { MemberBootstrap } from "@/lib/member-api";

export type SaveOutcome = "saved" | "memory" | "recovery-pending" | "account";
export interface PracticeContextValue {
  state: DemoState;
  hydrated: boolean;
  issue: "storage" | "recovered" | null;
  update: (
    updater: (state: DemoState) => DemoState,
    expected?: Partial<DemoState>,
  ) => Promise<SaveOutcome>;
  savePreview: () => SaveOutcome;
  reset: () => boolean;
  mode: "preview" | "live";
  member: MemberBootstrap | null;
  pending: boolean;
  loadStatus: "loading" | "ready" | "error" | "unauthenticated";
  loadError: string;
  loadCode: string;
  refresh: () => Promise<void>;
}
export const PracticeContext = createContext<PracticeContextValue | null>(null);
