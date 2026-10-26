import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { origin, required, requireLive, ServiceError } from "./config";

export async function authClient() {
  requireLive();
  const jar = await cookies();
  return createServerClient(required("SUPABASE_URL"), required("SUPABASE_PUBLISHABLE_KEY"), {
    cookieOptions: {
      httpOnly: true,
      secure: origin().startsWith("https:"),
      sameSite: "lax",
      path: "/",
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" }),
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values)
          jar.set(name, value, {
            ...options,
            httpOnly: true,
            secure: origin().startsWith("https:"),
            sameSite: "lax",
            path: "/",
          });
      },
    },
  });
}
export async function requireUser() {
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || !data.user.email || !data.user.email_confirmed_at)
    throw new ServiceError("AUTH_REQUIRED", "Sign in again to continue.", 401);
  return data.user;
}
export function adminAuth() {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" }),
    },
  }).auth.admin;
}
