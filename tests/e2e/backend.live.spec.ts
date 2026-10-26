import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { practices, type Practice } from "../../packages/content/src/index";

import {
  consentVersion,
  type MemberBootstrap,
  type MemberCommand,
} from "../../packages/backend/src/contracts";
import { fixtureCookie, fixtureUser } from "../fixtures/live-session.mjs";

/** These are live-mode frontend tests with mocked APIs, NOT real provider verification. */
type Reply = { status?: number; body: unknown };
type Handler = (body: Record<string, unknown>, url: URL) => Reply | Promise<Reply>;
type RecordedRequest = { method: string; path: string; body: Record<string, unknown> };
type MockApi = {
  member: MemberBootstrap;
  handlers: Map<string, Handler>;
  requests: RecordedRequest[];
  catalog: Practice[];
  signIn: () => Promise<void>;
};

const firstPractice = "notice-your-neighbour";
function memberFixture(): MemberBootstrap {
  return {
    revision: 1,
    capabilities: { emailDelivery: true, smsDelivery: true, phoneVerification: true },
    state: {
      version: 1,
      onboarded: true,
      source: "bible",
      topics: [],
      channel: "email",
      timezone: "America/Toronto",
      plan: "email",
      schedule: {
        mode: "fixed",
        times: ["08:00"],
        days: [0, 1, 2, 3, 4, 5, 6],
        windowStart: "09:00",
        windowEnd: "17:00",
        paused: false,
      },
      saved: [],
      completed: [],
      notes: {},
    },
    account: { email: fixtureUser.email, phone: null, emailConsent: false, smsConsent: false },
    operator: {
      name: "Test operator",
      mailingAddress: "TEST FIXTURE ADDRESS — NOT FOR SENDING",
      supportEmail: "support@example.test",
    },
    wallet: { availableCents: 1000, reservedCents: 50, rateCents: 5, enabled: true },
    history: { total: 0, hasMore: false, nextCursor: null },
  };
}
const failure = (code: string, message: string, status = 503): Reply => ({
  status,
  body: { error: { code, message, requestId: "mock-request-fixture" } },
});
function catalogReply(api: MockApi, url: URL): Reply {
  const params = url.searchParams;
  const source = params.get("source") ?? "both";
  const topics = params.get("topics")?.split(",") ?? [];
  const q = (params.get("q") ?? "").toLowerCase();
  const ids = params.get("ids")?.split(",");
  const items = api.catalog
    .filter(
      (practice) =>
        (source === "both" || practice.source === source) &&
        (!topics.length || topics.includes(practice.category)) &&
        (!ids || ids.includes(practice.id)) &&
        (params.get("saved") !== "true" || api.member.state.saved.includes(practice.id)) &&
        `${practice.title} ${practice.summary} ${practice.reference} ${practice.category} ${practice.plainMeaning} ${practice.everydayExample} ${practice.action}`
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const offset = Number(params.get("cursor")?.replace("catalog-page:", "") ?? 0);
  const limit = Math.min(100, Number(params.get("limit") ?? 24));
  return {
    body: {
      items: items.slice(offset, offset + limit),
      total: items.length,
      nextCursor: offset + limit < items.length ? `catalog-page:${offset + limit}` : null,
      updatedAt: "2026-10-17T12:00:00.000Z",
    },
  };
}

function applyFixtureCommand(member: MemberBootstrap, command: MemberCommand) {
  if (command.type === "reflection") member.state.notes[command.practiceId] = command.text;
  else if (command.type === "saved")
    member.state.saved = command.saved
      ? [...new Set([...member.state.saved, command.practiceId])]
      : member.state.saved.filter((id) => id !== command.practiceId);
  else if (command.type === "schedule") {
    member.state.schedule = command.schedule;
    member.state.channel = command.channel;
    member.state.timezone = command.timezone;
  } else if (command.type === "preferences") {
    member.state.source = command.source;
    member.state.topics = command.topics;
    member.state.channel = command.channel;
    member.state.timezone = command.timezone;
  } else throw new Error(`The test needs an explicit fixture for ${command.type}`);
  member.revision++;
}

async function mockMemberApi(
  page: Page,
  context: BrowserContext,
): Promise<MockApi & { unexpected: string[] }> {
  const api = {
    member: memberFixture(),
    handlers: new Map<string, Handler>(),
    requests: [] as RecordedRequest[],
    catalog: [...practices],
    unexpected: [] as string[],
    signIn: async () => {
      await context.addCookies([{ ...fixtureCookie, sameSite: "Lax" }]);
    },
  };
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:3002") await route.fallback();
    else {
      api.unexpected.push(`Blocked external request: ${route.request().url()}`);
      await route.abort();
    }
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON() || {};
    const key = `${request.method()} ${url.pathname}`;
    api.requests.push({ method: request.method(), path: url.pathname, body });
    let reply: Reply;
    const handler = api.handlers.get(key);
    if (handler) reply = await handler(body, url);
    else if (key === "GET /api/member") reply = { body: api.member };
    else if (key === "GET /api/practices") reply = catalogReply(api, url);
    else if (request.method() === "GET" && url.pathname.startsWith("/api/practices/")) {
      const practice = api.catalog.find(
        (item) => item.id === decodeURIComponent(url.pathname.split("/").at(-1)!),
      );
      reply = practice
        ? { body: { practice } }
        : failure(
            "NOT_FOUND",
            "This practice is no longer published. Your saved records are retained.",
            404,
          );
    } else if (key === "POST /api/member") {
      expect(body.revision).toBe(api.member.revision);
      applyFixtureCommand(api.member, body.command as MemberCommand);
      reply = { body: api.member };
    } else if (key === "POST /api/consent") {
      expect(typeof body.enabled).toBe("boolean");
      if (body.enabled) {
        expect(body.consentVersion).toBe(
          consentVersion(body.channel as "email" | "sms", api.member.wallet.rateCents),
        );
      } else expect(body).not.toHaveProperty("consentVersion");
      if (body.channel === "email") api.member.account.emailConsent = body.enabled === true;
      else if (body.channel === "sms") api.member.account.smsConsent = body.enabled === true;
      else throw new Error("Unexpected consent channel in test");
      reply = { body: { ok: true } };
    } else if (key === "GET /api/wallet")
      reply = { body: { ...api.member.wallet, entries: [], nextCursor: null } };
    else {
      api.unexpected.push(key);
      reply = failure("UNMOCKED_TEST_REQUEST", "This test did not provide a request fixture.", 501);
    }
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(reply.body),
    });
  });
  return api;
}

const test = base.extend<{ api: MockApi }>({
  api: async ({ page, context }, use) => {
    const api = await mockMemberApi(page, context);
    await use(api);
    expect(api.unexpected, "Every browser API response must be explicitly mocked").toEqual([]);
  },
});

test("real local HTTP proxy redirects an anonymous private page and private API returns 401", async ({
  request,
}) => {
  const pageResponse = await request.get("/dashboard", { maxRedirects: 0 });
  expect(pageResponse.status()).toBe(307);
  expect(new URL(pageResponse.headers().location, "http://127.0.0.1:3002").pathname).toBe(
    "/signin",
  );
  const apiResponse = await request.get("/api/member");
  expect(apiResponse.status()).toBe(401);
  expect((await apiResponse.json()).error.code).toBe("AUTH_REQUIRED");
  expect(apiResponse.headers()["cache-control"]).toContain("no-store");
});

test("real local HTTP rejects an untrusted mutation origin before any provider request", async ({
  request,
}) => {
  const response = await request.post("/api/auth/start", {
    headers: { Origin: "https://untrusted.example.test" },
    data: { email: fixtureUser.email },
  });
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("real local health responds while an unconfigured auth dependency fails closed", async ({
  request,
}) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  const response = await request.post("/api/auth/start", {
    headers: { Origin: "http://127.0.0.1:3002" },
    data: { email: fixtureUser.email },
  });
  expect(response.status()).toBe(503);
  expect((await response.json()).error.code).toBe("UNAVAILABLE");
});

test("real local robots policy is public while private account pages still require sign-in", async ({
  request,
}) => {
  const response = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(await response.text()).toContain("Disallow: /");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  expect((await request.get("/dashboard", { maxRedirects: 0 })).status()).toBe(307);
});

test("mocked unavailable channels preserve preferences and consent withdrawal without offering phone codes", async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const operator = api.member.operator;
  api.member.operator = null;
  api.member.capabilities = {
    emailDelivery: false,
    smsDelivery: false,
    phoneVerification: false,
  };
  api.member.account = {
    ...api.member.account,
    phone: "+14165550100",
    emailConsent: true,
    smsConsent: true,
  };
  await api.signIn();
  await page.goto("/settings/account");
  await expect(
    page.getByText("Email and SMS delivery is currently unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send verification code" })).toBeDisabled();
  await expect(page.getByLabel("Canadian phone number")).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("checkbox", { name: /free scripture practice reminders by email/ }).click();
  await expect(
    page.getByRole("checkbox", { name: /free scripture practice reminders by email/ }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: /scripture practice reminders by SMS/ }).click();
  await expect(
    page.getByRole("checkbox", { name: /scripture practice reminders by SMS/ }),
  ).not.toBeChecked();
  // Provider availability does not change valid consent choices into a delivery promise.
  api.member.operator = operator;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("checkbox", { name: /free scripture practice reminders by email/ }),
  ).toBeEnabled();
  await page.getByRole("checkbox", { name: /free scripture practice reminders by email/ }).click();
  await expect(page.getByText("Email reminder consent recorded.", { exact: true })).toBeVisible();
  expect(api.requests.filter((request) => request.path.startsWith("/api/phone/"))).toEqual([]);
  await page.goto("/schedule");
  await expect(
    page.getByText("Email delivery is currently unavailable.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause reminders", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume reminders", exact: true })).toBeVisible();
  expect(api.member.state.schedule.paused).toBe(true);
  await page.goto("/dashboard");
  await expect(
    page.getByText("Email delivery is currently unavailable.", { exact: false }),
  ).toBeVisible();
});

test("mocked channel availability is independent and refreshes without clearing account choices", async ({
  page,
  api,
}) => {
  api.member.capabilities = {
    emailDelivery: true,
    smsDelivery: false,
    phoneVerification: false,
  };
  await api.signIn();
  await page.goto("/settings/account");
  await expect(
    page.getByText("SMS delivery is currently unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/^Email delivery is currently unavailable/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send verification code" })).toBeDisabled();
  api.member.capabilities.phoneVerification = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Send verification code" })).toBeEnabled();
  await expect(
    page.getByText("Phone verification is currently unavailable.", { exact: false }),
  ).toHaveCount(0);
  expect(api.member.state.schedule.times).toEqual(["08:00"]);
});

async function expectNoPrivateBrowserStorage(page: Page) {
  const storage = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  expect(storage).not.toContain(fixtureUser.email);
  expect(storage).not.toContain("+14165550100");
  expect(storage).not.toContain("synthetic-test-signature");
  expect(storage).not.toContain("Private fixture reflection");
  expect(storage).not.toContain("jesus-in-practice:preview:v1");
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-127-auth-token");
}

test("mocked live auth keeps an email draft through outage and rejects a wrong code before entry", async ({
  page,
  api,
}) => {
  let starts = 0;
  api.handlers.set("POST /api/auth/start", (body) => {
    expect(body).toEqual({ email: fixtureUser.email });
    return ++starts === 1
      ? failure("UNAVAILABLE", "Email sign-in is temporarily unavailable.")
      : { body: { ok: true } };
  });
  api.handlers.set("POST /api/auth/verify", async (body) => {
    if (body.code !== "654321")
      return failure("INVALID_CODE", "The verification code is incorrect or expired.", 400);
    await api.signIn();
    return { body: { ok: true } };
  });
  await page.goto("/signup");
  await page.getByLabel("Email address", { exact: true }).fill(fixtureUser.email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(fixtureUser.email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByLabel("Verification code", { exact: true })).toBeFocused();
  await page.getByLabel("Verification code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("incorrect or expired");
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByLabel("Verification code", { exact: true }).fill("654321");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(".today-card")).toBeVisible();
  await expectNoPrivateBrowserStorage(page);
});

test("mocked account load failure recovers and an expired API session hides private content", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.handlers.set("GET /api/member", () =>
    failure("UNAVAILABLE", "Account storage is temporarily unavailable."),
  );
  await page.goto("/saved");
  await expect(
    page.getByRole("heading", { name: "Your account could not be loaded" }),
  ).toBeVisible();
  api.handlers.delete("GET /api/member");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your saved practices", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No available saved practices match" }),
  ).toBeVisible();
  api.handlers.set("GET /api/member", () =>
    failure("AUTH_REQUIRED", "Sign in again to continue.", 401),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your saved practices", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No available saved practices match" }),
  ).toHaveCount(0);
});

test("mocked server saves survive reload and reflection conflicts preserve an unsaved draft", async ({
  page,
  api,
}) => {
  await api.signIn();
  await page.goto(`/library/${firstPractice}`);
  await page.getByRole("button", { name: "Save practice", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByLabel("Your reflection (optional)")
    .fill("Private fixture reflection, not personal data.");
  api.handlers.set("POST /api/member", () =>
    failure("UNAVAILABLE", "Saving is temporarily unavailable."),
  );
  await page.getByRole("button", { name: "Save reflection", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Saving is temporarily unavailable",
  );
  await expect(page.getByLabel("Your reflection (optional)")).toHaveValue(
    "Private fixture reflection, not personal data.",
  );
  api.handlers.set("POST /api/member", () => {
    api.member.state.notes[firstPractice] = "A newer server fixture reflection.";
    api.member.revision++;
    return failure("CONFLICT", "Account changed elsewhere.", 409);
  });
  await page.getByRole("button", { name: "Save reflection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Load newer reflection" })).toBeVisible();
  await expect(page.getByLabel("Your reflection (optional)")).toHaveValue(
    "Private fixture reflection, not personal data.",
  );
  await page.getByRole("button", { name: "Load newer reflection" }).click();
  await expect(page.getByLabel("Your reflection (optional)")).toHaveValue(
    "A newer server fixture reflection.",
  );
  api.handlers.delete("POST /api/member");
  await page
    .getByLabel("Your reflection (optional)")
    .fill("Private fixture reflection saved deliberately.");
  await page.getByRole("button", { name: "Save reflection", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reflection saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your reflection (optional)")).toHaveValue(
    "Private fixture reflection saved deliberately.",
  );
  expect(api.member.state.saved).toEqual([firstPractice]);
  await expectNoPrivateBrowserStorage(page);
});

test("mocked phone ownership and email/SMS consent remain separate choices", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.handlers.set("POST /api/phone/start", (body) =>
    body.phone === "+14165550100"
      ? { body: { ok: true } }
      : failure("PHONE_NOT_CANADIAN", "Use a Canadian phone number.", 400),
  );
  api.handlers.set("POST /api/phone/verify", (body) => {
    if (body.code !== "654321") return failure("INVALID_CODE", "The phone code is incorrect.", 400);
    api.member.account.phone = "+14165550100";
    return { body: { ok: true } };
  });
  const operator = api.member.operator;
  delete api.member.operator;
  await page.goto("/settings/account");
  const email = page.getByRole("checkbox", {
    name: /I agree to receive free scripture practice reminders by email/,
  });
  const sms = page.getByRole("checkbox", {
    name: /I agree to receive scripture practice reminders by SMS/,
  });
  await expect(email).toBeDisabled();
  api.member.operator = operator;
  await page.reload();
  await expect(email).toBeEnabled();
  await expect(email).not.toBeChecked();
  await expect(sms).toBeDisabled();
  // Consent is server-confirmed; React intentionally restores the old value while saving.
  await email.click();
  await expect(email).toBeChecked();
  await page.getByLabel("Canadian phone number").fill("+12025550100");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Canadian phone");
  await page.getByLabel("Canadian phone number").fill("+14165550100");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await page.getByLabel("Phone verification code").fill("000000");
  await page.getByRole("button", { name: "Verify phone", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("phone code is incorrect");
  await page.getByLabel("Phone verification code").fill("654321");
  await page.getByRole("button", { name: "Verify phone", exact: true }).click();
  await expect(page.getByText("Verified number: +14165550100", { exact: true })).toBeVisible();
  await expect(sms).toBeEnabled();
  await expect(sms).not.toBeChecked();
  api.member.wallet.rateCents = null;
  await page.reload();
  await expect(sms).toBeDisabled();
  api.member.wallet.rateCents = 5;
  await page.reload();
  await expect(sms).toBeEnabled();
  await sms.click();
  await expect(sms).toBeChecked();
  await email.click();
  await expect(email).not.toBeChecked();
  await expect(sms).toBeChecked();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/playwright/live-account-desktop.png", fullPage: true });
  await expectNoPrivateBrowserStorage(page);
});

test("mocked SMS price changes require reviewing the new rate and a fresh consent choice", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.member.account.phone = "+14165550100";
  await page.goto("/settings/account");
  const sms = page.getByRole("checkbox", {
    name: /I agree to receive scripture practice reminders by SMS/,
  });
  await expect(page.getByText("SMS costs 0.05 CAD per segment", { exact: false })).toBeVisible();
  // Change the mock server rate while the browser still displays the earlier quote.
  api.member.wallet.rateCents = 8;
  api.handlers.set("POST /api/consent", (body) => {
    expect(body.channel).toBe("sms");
    if (body.enabled && body.consentVersion !== consentVersion("sms", 8))
      return failure(
        "CONSENT_CHANGED",
        "The SMS price changed. Review the updated rate before choosing again.",
        409,
      );
    api.member.account.smsConsent = body.enabled === true;
    return { body: { ok: true } };
  });
  await sms.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("SMS price changed");
  await expect(sms).not.toBeChecked();
  expect(api.member.account.smsConsent).toBe(false);
  await expect(page.getByText("SMS costs 0.08 CAD per segment", { exact: false })).toBeVisible();
  await sms.click();
  await expect(sms).toBeChecked();
  await sms.click();
  await expect(sms).not.toBeChecked();
  expect(
    api.requests
      .filter((request) => request.path === "/api/consent")
      .map((request) => request.body),
  ).toEqual([
    { channel: "sms", enabled: true, consentVersion: consentVersion("sms", 5) },
    { channel: "sms", enabled: true, consentVersion: consentVersion("sms", 8) },
    { channel: "sms", enabled: false },
  ]);
});

test("mocked wallet preserves activity across pagination and reuses a failed checkout operation", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.member.wallet.enabled = false;
  const first = {
    id: "ledger-fixture-1",
    kind: "fund",
    amountCents: 1000,
    createdAt: "2026-10-01T12:00:00Z",
  };
  const second = {
    id: "ledger-fixture-2",
    kind: "settle",
    amountCents: -25,
    createdAt: "2026-10-02T12:00:00Z",
  };
  api.handlers.set("GET /api/wallet", (_, url) => ({
    body: {
      ...api.member.wallet,
      entries: url.searchParams.has("cursor") ? [first, second] : [first],
      nextCursor: url.searchParams.has("cursor") ? null : "opaque-next-page",
    },
  }));
  let attempts = 0;
  api.handlers.set("POST /api/wallet/checkout", () =>
    ++attempts === 1
      ? failure("UNAVAILABLE", "Checkout is temporarily unavailable.")
      : {
          body: {
            url: "https://checkout.stripe.com/c/pay/cs_test_mocked_browser_only#provider-session-state",
          },
        },
  );
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: "<h1>Mock hosted Checkout — no payment</h1>",
    }),
  );
  await page.goto("/wallet?checkout=complete");
  await expect(page.getByRole("button", { name: "Continue with $10.00 CAD" })).toBeDisabled();
  await expect(page.getByText("$0.05 CAD per SMS segment.", { exact: false })).toBeVisible();
  await expect(page.getByText("SMS credit does not expire.", { exact: false })).toContainText(
    "refund of unused available credit after pending messages and payments are reconciled",
  );
  await expect(
    page.getByRole("link", { name: "Contact support about unused credit", exact: true }),
  ).toHaveAttribute("href", /\/support$/);
  await expect(
    page.getByRole("link", { name: "Read SMS credit terms", exact: true }),
  ).toHaveAttribute("href", /\/terms$/);
  await expect(
    page.getByText("Returning from checkout does not itself confirm payment.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more activity" }).click();
  await expect(page.locator(".wallet-entry")).toHaveCount(2);
  await expect(page.getByText("Credit added", { exact: true })).toBeVisible();
  await expect(page.getByText("SMS delivery charged", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more activity" })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/playwright/live-wallet-desktop.png", fullPage: true });
  api.member.wallet.enabled = true;
  api.member.wallet.rateCents = 8; // Isolated server fixture proves the live rate is not display copy.
  await page.getByRole("button", { name: "Refresh balance" }).click();
  await expect(page.getByText("$0.08 CAD per SMS segment.", { exact: false })).toBeVisible();
  await page.getByRole("radio", { name: "$25.00", exact: true }).check();
  await page.getByRole("button", { name: "Continue with $25.00 CAD" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Checkout is temporarily unavailable",
  );
  await page.getByRole("button", { name: "Continue with $25.00 CAD" }).click();
  await expect(
    page.getByRole("heading", { name: "Mock hosted Checkout — no payment" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    "https://checkout.stripe.com/c/pay/cs_test_mocked_browser_only#provider-session-state",
  );
  const payments = api.requests.filter((request) => request.path === "/api/wallet/checkout");
  expect(payments).toHaveLength(2);
  expect(payments[0].body.amountCents).toBe(2500);
  expect(payments[1].body.operationId).toBe(payments[0].body.operationId);
});

test("mocked paginated history retains earlier rows after a failed next-page request", async ({
  page,
  api,
}) => {
  await api.signIn();
  let nextAttempts = 0;
  const first = { recordId: "completion-fixture-1", id: firstPractice, date: "2026-10-01" };
  const second = {
    recordId: "completion-fixture-2",
    id: "listen-before-answering",
    date: "2026-10-02",
  };
  api.handlers.set("GET /api/history", (_, url) => {
    if (!url.searchParams.has("cursor"))
      return { body: { items: [first], total: 2, nextCursor: "history-next" } };
    if (++nextAttempts === 1)
      return failure("UNAVAILABLE", "The next history page is unavailable.");
    return { body: { items: [first, second], total: 2, nextCursor: null } };
  });
  await page.goto("/progress");
  await expect(page.getByText("Showing 1 of 2 recorded practices.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more practices" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("next history page");
  await expect(page.locator(".journey-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Load more practices" }).click();
  await expect(page.locator(".journey-row")).toHaveCount(2);
  await expect(page.getByText("Showing 2 of 2 recorded practices.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more practices" })).toHaveCount(0);
});

test("mocked live schedule saves to the account, retains a failed draft and never grants consent", async ({
  page,
  api,
}) => {
  await api.signIn();
  await page.goto("/schedule");
  for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])
    await page.getByRole("checkbox", { name: day, exact: true }).uncheck();
  await page.getByRole("button", { name: "Save rhythm" }).click();
  await expect(page.locator("#schedule-error")).toContainText("Choose at least one day");
  expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(0);
  await page.getByRole("checkbox", { name: "Monday", exact: true }).check();
  await page.getByRole("radio", { name: /Email \+ SMS Both, on your terms/ }).check();
  await page.getByRole("radio", { name: "Surprise me within a window" }).check();
  await page.getByLabel("Not before").fill("18:00");
  await page.getByLabel("Not after").fill("20:00");
  await page.getByLabel("Your time zone").selectOption("America/St_Johns");
  api.handlers.set("POST /api/member", () =>
    failure("UNAVAILABLE", "Schedule storage is temporarily unavailable."),
  );
  await page.getByRole("button", { name: "Save rhythm" }).click();
  await expect(page.locator("#schedule-error")).toContainText("temporarily unavailable");
  await expect(page.getByLabel("Not before")).toHaveValue("18:00");
  api.handlers.delete("POST /api/member");
  await page.getByRole("button", { name: "Save rhythm" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your reminder preferences are saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your time zone")).toHaveValue("America/St_Johns");
  await expect(page.getByLabel("Not before")).toHaveValue("18:00");
  expect(api.member.state.schedule).toMatchObject({
    days: [1],
    mode: "window",
    windowStart: "18:00",
    windowEnd: "20:00",
  });
  expect(api.member.account).toMatchObject({ emailConsent: false, smsConsent: false, phone: null });
  expect(api.requests.some((request) => request.path === "/api/consent")).toBe(false);
});

test("mocked blocked wallet shows a support review and cannot start checkout", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.member.wallet.blockedReason = "payment_dispute";
  await page.goto("/wallet");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "wallet needs a support review",
  );
  await expect(page.getByRole("button", { name: "Continue with $10.00 CAD" })).toBeDisabled();
  expect(api.requests.some((request) => request.path === "/api/wallet/checkout")).toBe(false);
});

test("mocked message activity distinguishes acceptance, delivery and an unconfirmed send", async ({
  page,
  api,
}) => {
  await api.signIn();
  const first = {
    id: "delivery-fixture-1",
    practiceId: firstPractice,
    channel: "sms",
    status: "submitted",
    scheduledAt: "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-01T12:01:00Z",
    segments: 5,
    quoteCents: 25,
  };
  const second = { ...first, id: "delivery-fixture-2", status: "unknown" };
  let refreshed = false;
  api.handlers.set("GET /api/deliveries", (_, url) => ({
    body: {
      items: url.searchParams.has("cursor")
        ? [first, second]
        : [{ ...first, status: refreshed ? "delivered" : "submitted" }],
      total: 2,
      nextCursor: url.searchParams.has("cursor") ? null : "delivery-next",
    },
  }));
  await page.goto("/deliveries");
  await expect(page.getByText("Provider accepted", { exact: true })).toBeVisible();
  await expect(page.getByText("Delivery is not yet confirmed.", { exact: false })).toBeVisible();
  await expect(page.getByText("$0.25 CAD · 5 segments", { exact: true })).toBeVisible();
  await expect(page.getByText("A quote is not proof of a debit.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Load more messages" }).click();
  await expect(page.locator(".message-record")).toHaveCount(2);
  await expect(page.getByText("Result unconfirmed", { exact: true })).toBeVisible();
  await expect(
    page.getByText("an unconfirmed result does not prove that nothing was sent", { exact: false }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/playwright/live-deliveries-desktop.png", fullPage: true });
  refreshed = true;
  await page.getByRole("button", { name: "Refresh messages" }).click();
  await expect(page.getByText("Delivery confirmed", { exact: true })).toBeVisible();
  await expect(
    page.getByText("This does not mean the message was read.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Showing 1 of 2 messages.", { exact: true })).toBeVisible();
});

test("mocked deletion requires typed confirmation and a failed request never claims success", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.handlers.set("DELETE /api/account", () =>
    failure("UNAVAILABLE", "Account deletion could not finish. Please retry."),
  );
  await page.goto("/settings/account");
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Permanently delete account" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Keep my account" }).click();
  expect(api.requests.filter((request) => request.method === "DELETE")).toHaveLength(0);
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("could not finish");
  await expect(dialog).toBeVisible();
  expect(api.requests.find((request) => request.method === "DELETE")?.body).toEqual({
    confirmation: "DELETE",
  });
  await expect(page).toHaveURL(/\/settings\/account$/);
});

test("mocked unfinished deletion offers a bounded retry and keeps private account pages unavailable", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.handlers.set("GET /api/member", () =>
    failure("ACCOUNT_DELETING", "Deletion is pending.", 409),
  );
  let retries = 0;
  api.handlers.set("DELETE /api/account", () => {
    if (++retries === 1)
      return failure("UNAVAILABLE", "Deletion provider is temporarily unavailable.");
    api.handlers.set("GET /api/member", () => failure("AUTH_REQUIRED", "Sign in again.", 401));
    return { body: { ok: true } };
  });
  await page.goto("/settings/account");
  await expect(
    page.getByRole("heading", { name: "Your account deletion is unfinished" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Account & consent" })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry account deletion" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("button", { name: "Retry account deletion" })).toBeEnabled();
  await page.getByRole("button", { name: "Retry account deletion" }).click();
  await expect(page).toHaveURL(/\/signin$/);
  expect(retries).toBe(2);
});

test("mocked live account remains readable and accessible on a narrow screen", async ({
  page,
  api,
}) => {
  await api.signIn();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { level: 1, name: "Account & consent" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: "output/playwright/live-account-mobile.png", fullPage: true });
  await expectNoPrivateBrowserStorage(page);
});

test("mocked live catalogue retries an outage, loads further pages and searches lesson examples", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.catalog.push(
    ...Array.from({ length: 30 }, (_, index) => ({
      ...practices[0],
      id: `synthetic-published-${String(index).padStart(2, "0")}`,
      title: `Synthetic published lesson ${index}`,
      everydayExample:
        index === 29
          ? "A unique grocery situation used only by this isolated test."
          : "A synthetic example for browser pagination.",
    })),
  );
  let calls = 0;
  api.handlers.set("GET /api/practices", (_body, url) =>
    ++calls === 1
      ? failure("UNAVAILABLE", "The practice catalogue is temporarily unavailable.")
      : catalogReply(api, url),
  );
  await page.goto("/library");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("heading", { name: "No practices found" })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh practices", exact: true }).click();
  await expect(page.locator(".practice-card")).toHaveCount(24);
  await page.screenshot({ path: "output/playwright/catalogue-live-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Load more practices", exact: true }).click();
  await expect(page.locator(".practice-card")).toHaveCount(42);
  await page.getByLabel("Search practices", { exact: true }).fill("UNIQUE GROCERY SITUATION");
  await expect(page.locator(".practice-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Synthetic published lesson 29", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 of 1 matching practices loaded", { exact: true })).toBeVisible();
  await expect(page.locator(".practice-card-link")).toHaveAttribute(
    "href",
    "/practice/synthetic-published-29",
  );
  const unavailable = await page.evaluate(async () => {
    const response = await fetch("/api/practices/withdrawn-fixture");
    return { status: response.status, body: await response.json() };
  });
  expect(unavailable.status).toBe(404);
  expect(unavailable.body.error.code).toBe("NOT_FOUND");
});

test("mocked live Today keeps source and topic choices through random selection", async ({
  page,
  api,
}) => {
  await api.signIn();
  api.member.state.source = "book-of-mormon";
  api.member.state.topics = ["Service"];
  const source = practices.find(
    (item) => item.source === "book-of-mormon" && item.category === "Service",
  )!;
  api.catalog.push(
    { ...source, id: "synthetic-service-one", title: "Synthetic service lesson one" },
    { ...source, id: "synthetic-service-two", title: "Synthetic service lesson two" },
  );
  api.handlers.set("GET /api/practices", (_body, url) => {
    expect(url.searchParams.get("source")).toBe("book-of-mormon");
    expect(url.searchParams.get("topics")).toBe("Service");
    return catalogReply(api, url);
  });
  await page.goto("/dashboard");
  const card = page.locator(".today-card");
  await expect(card).toBeVisible();
  for (let index = 0; index < 3; index++) {
    await expect(card.locator(".lesson-source")).toHaveText("Book of Mormon");
    await expect(card.locator(".tag")).toHaveText("Service");
    const title = await card.getByRole("heading", { level: 2 }).textContent();
    await card.getByRole("button", { name: "Try another practice" }).click();
    await expect(card.getByRole("heading", { level: 2 })).not.toHaveText(title!);
  }
});

test("mocked saved catalogue refreshes after an imported practice is removed", async ({
  page,
  api,
}) => {
  await api.signIn();
  const imported = {
    ...practices[0],
    id: "synthetic-saved-practice",
    title: "Synthetic saved practice",
  };
  api.catalog.push(imported);
  api.member.state.saved = [firstPractice, imported.id];
  await page.goto("/saved");
  await expect(page.locator(".practice-card")).toHaveCount(2);
  const card = page
    .locator(".practice-card")
    .filter({ has: page.getByRole("heading", { name: imported.title, exact: true }) });
  await card.getByRole("button", { name: "Remove saved practice", exact: true }).click();
  await expect(page.getByRole("heading", { name: imported.title, exact: true })).toHaveCount(0);
  await expect(page.locator(".practice-card")).toHaveCount(1);
  expect(api.member.state.saved).toEqual([firstPractice]);
  await expectNoPrivateBrowserStorage(page);
});
