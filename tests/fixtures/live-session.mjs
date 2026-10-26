/** Synthetic identity accepted ONLY by scripts/mock-supabase-auth.mjs. Not real credentials. */
export const fixtureUser = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "member@example.test",
  email_confirmed_at: "2026-10-01T00:00:00.000Z",
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
export const fixtureAccessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: fixtureUser.id, aud: "authenticated", role: "authenticated", exp: 4102444800 })}.synthetic-test-signature`;
export const fixtureSession = {
  access_token: fixtureAccessToken,
  refresh_token: "synthetic-refresh-token-never-accepted-by-Supabase",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800,
  user: fixtureUser,
};
// The SDK derives the project key from the first hostname component (127.0.0.1).
export const fixtureCookie = {
  name: "sb-127-auth-token",
  value: `base64-${encode(fixtureSession)}`,
  url: "http://127.0.0.1:3002",
  httpOnly: true,
  secure: false,
  sameSite: "Lax",
};
