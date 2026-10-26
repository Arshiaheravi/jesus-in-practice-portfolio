import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

import type { ContentVersion } from "../../packages/backend/src/content-contracts";
import { defaultState } from "../../apps/dashboard/lib/demo-model";
import { fixtureCookie, fixtureUser } from "../fixtures/live-session.mjs";

/** Operator UI only: synthetic local identity, mocked API/MFA/payment/editorial responses.
 * These tests do not establish real operator authorization, TOTP, refunds or publication.
 */
type Reply = { status?: number; body: unknown };
type Handler = (body: Record<string, unknown>, url: URL) => Reply | Promise<Reply>;
type Access = {
  role: "admin" | "support" | "editor";
  verified: boolean;
  recentMfa: boolean;
  factors: { id: string; name: string }[];
};
type OperatorFixture = {
  access: Access;
  handlers: Map<string, Handler>;
  requests: { method: string; path: string; query: string; body: Record<string, unknown> }[];
};
const denied = (message: string, status = 403): Reply => ({
  status,
  body: {
    error: {
      code: status === 403 ? "OPERATOR_REQUIRED" : "UNAVAILABLE",
      message,
      requestId: "synthetic-operator-request",
    },
  },
});
const stamp = "2026-10-17T12:00:00Z";
const walletId = "00000000-0000-4000-8000-000000000020";
const checkoutId = "00000000-0000-4000-8000-000000000030";
const factorId = "00000000-0000-4000-8000-000000000040";
const emptyCases = { events: [], nextCursor: null, deliveries: [], deliveryLimit: 50 };
const readiness = {
  ready: true,
  checkedAt: stamp,
  scope: "database-and-configuration",
  externalServicesVerified: false,
  checks: [
    { code: "database", status: "pass" },
    { code: "migrations", status: "pass" },
    { code: "config:phoneVerificationConfiguration", status: "pass" },
    { code: "config:paymentConfiguration", status: "pass" },
    { code: "old_unknown_deliveries", status: "warn", count: 1 },
  ],
};
function walletFixture() {
  return {
    wallet: { id: walletId, availableCents: 1000, reservedCents: 0, blockedReason: null },
    checkouts: [{ id: checkoutId, amountCents: 1000, status: "paid", createdAt: stamp }],
    refunds: [],
    limit: 50,
  };
}
function draftFixture(): ContentVersion {
  return {
    id: "00000000-0000-4000-8000-000000000050",
    practiceId: "synthetic-love-in-action",
    revision: 1,
    editionId: "synthetic-test-kjv",
    passage: {
      editionId: "synthetic-test-kjv",
      editionTitle: "KJV · synthetic test inventory",
      manifestSha256: "a".repeat(64),
      corpusSha256: "b".repeat(64),
      source: "bible",
      book: "1-john",
      chapter: 3,
      fromVerse: 18,
      toVerse: 18,
      reference: "1 John 3:18",
      sourceUrl:
        "https://www.churchofjesuschrist.org/study/scriptures/nt/1-jn/3?lang=eng&id=p18#p18",
      passageKey: "synthetic-test-kjv:1-john:3:18-18",
      verses: [
        {
          book: "1-john",
          chapter: 3,
          verse: 18,
          text: "My little children, let us not love in word, neither in tongue; but in deed and in truth.",
        },
      ],
      context: [
        {
          book: "1-john",
          chapter: 3,
          verse: 17,
          text: "Synthetic nearby context fixture for browser layout; not a scripture quotation.",
        },
      ],
    },
    draft: {
      title: "Put care into action",
      summary: "Original explanation for this synthetic review fixture.",
      plainMeaning: "Care is expressed through actions as well as words.",
      everydayExample:
        "A neighbour needs help carrying groceries. Ask whether a hand would be useful.",
      action: "Offer one practical form of help today, and respect the answer.",
      reflection: "What help would be welcome?",
      smsText: "1 John 3:18 — care through action. Ask before helping a neighbour with groceries.",
      category: "Compassion",
      minutes: 5,
    },
    provenance: {
      kind: "manual",
      notes: "Synthetic browser fixture, not approved production content.",
    },
    createdBy: fixtureUser.id,
    createdAt: stamp,
    review: null,
    published: false,
    withdrawn: false,
  };
}
const test = base.extend<{ operator: OperatorFixture }>({
  operator: async ({ page, context }, use) => {
    const unexpected: string[] = [];
    const fixture: OperatorFixture = {
      access: {
        role: "admin",
        verified: true,
        recentMfa: true,
        factors: [{ id: factorId, name: "Synthetic authenticator" }],
      },
      handlers: new Map(),
      requests: [],
    };
    await context.addCookies([{ ...fixtureCookie, sameSite: "Lax" }]);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:3002") await route.fallback();
      else {
        unexpected.push(`Unexpected external request ${url.origin}`);
        await route.abort();
      }
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const body = request.postDataJSON() || {},
        key = `${request.method()} ${url.pathname}`;
      fixture.requests.push({
        method: request.method(),
        path: url.pathname,
        query: url.search,
        body,
      });
      let reply: Reply;
      const handler = fixture.handlers.get(key);
      if (handler) reply = await handler(body, url);
      else if (key === "GET /api/member")
        reply = {
          body: {
            revision: 1,
            state: { ...defaultState, onboarded: true },
            account: {
              email: fixtureUser.email,
              phone: null,
              emailConsent: false,
              smsConsent: false,
            },
            wallet: { availableCents: 1000, reservedCents: 0, rateCents: 5, enabled: false },
            history: { total: 0, hasMore: false, nextCursor: null },
          },
        };
      else if (key === "GET /api/operator/access") reply = { body: fixture.access };
      else if (key === "GET /api/operator/overview") reply = { body: readiness };
      else if (key === "GET /api/operator/cases")
        reply = { body: url.searchParams.has("wallet") ? walletFixture() : emptyCases };
      else {
        unexpected.push(key);
        reply = denied("No explicit fixture for this operator request.", 501);
      }
      await route.fulfill({
        status: reply.status ?? 200,
        contentType: "application/json",
        body: JSON.stringify(reply.body),
      });
    });
    await use(fixture);
    expect(unexpected, "All operator requests must use explicit isolated fixtures").toEqual([]);
  },
});

async function chooseRefund(page: Page) {
  await page.goto("/operator/finance");
  await expect(page.getByRole("heading", { level: 1, name: "Financial support" })).toBeVisible();
  await page.getByLabel("Wallet support ID").fill(walletId);
  await page.getByRole("button", { name: "Inspect wallet", exact: true }).click();
  await page.getByRole("button", { name: /Select \$10\.00 top-up/ }).click();
  await page.getByLabel("Refund amount (CAD)").fill("3.25");
  await page
    .getByLabel("Reason for the action")
    .fill("Synthetic support case 123: unused credit requested back.");
}
async function noPrivateStorage(page: Page) {
  const value = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  expect(value).not.toContain(fixtureUser.email);
  expect(value).not.toContain("SYNTHETICSETUPKEY");
  expect(value).not.toContain("Synthetic support case");
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-127-auth-token");
}

test("mocked operator access has a loading state, fails closed and retries without exposing finance", async ({
  page,
  operator,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let allow = false;
  operator.handlers.set("GET /api/operator/access", async () => {
    await pending;
    return allow ? { body: operator.access } : denied("This account has no operator role.");
  });
  await page.goto("/operator");
  await expect(page.getByRole("status")).toContainText("Checking operator access");
  release();
  await expect(page.getByRole("heading", { name: "Operator access unavailable" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("no operator role");
  await expect(page.getByRole("navigation", { name: "Operator navigation" })).toHaveCount(0);
  expect(operator.requests.some((request) => request.path === "/api/operator/overview")).toBe(
    false,
  );
  allow = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Configured checks passed" })).toBeVisible();
  await expect(page.getByText(/do not prove that a real email, SMS, payment/)).toBeVisible();
});

test("mocked authenticator setup validates a six-digit code, handles failure and clears transient setup data", async ({
  page,
  operator,
}) => {
  operator.access = { role: "admin", verified: false, recentMfa: false, factors: [] };
  operator.handlers.set("POST /api/operator/access", (body) => {
    if (body.action === "enroll")
      return {
        body: {
          factorId,
          secret: "SYNTHETICSETUPKEY_NOT_REAL",
          qrCode:
            '<svg xmlns="http://www.w3.org/2000/svg" width="224" height="224"><rect width="224" height="224" fill="white"/><text x="20" y="100">TEST FIXTURE ONLY</text></svg>',
        },
      };
    expect(body.action).toBe("verify");
    expect(body.factorId).toBe(factorId);
    if (body.code !== "123456") return denied("Synthetic code was not accepted.", 400);
    operator.access = {
      role: "admin",
      verified: true,
      recentMfa: true,
      factors: [{ id: factorId, name: "Synthetic authenticator" }],
    };
    return { body: { ok: true } };
  });
  await page.goto("/operator");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const code = page.getByLabel("Six-digit authenticator code");
  await expect(code).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify and continue" })).toBeDisabled();
  await code.fill("000000");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Synthetic code was not accepted",
  );
  await expect(code).toHaveValue("");
  await code.fill("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("heading", { name: "Service overview", level: 1 })).toBeVisible();
  await expect(page.getByText("SYNTHETICSETUPKEY_NOT_REAL")).toHaveCount(0);
  await noPrivateStorage(page);
});

test("mocked editor cannot open financial controls and support cannot open editorial controls", async ({
  page,
  operator,
}) => {
  operator.access.role = "editor";
  await page.goto("/operator/finance");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Financial support requires",
  );
  await expect(page.getByRole("link", { name: "Financial support", exact: true })).toHaveCount(0);
  expect(operator.requests.some((request) => request.path === "/api/operator/cases")).toBe(false);
  operator.access.role = "support";
  await page.goto("/operator/content");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Content editing requires");
  await expect(page.getByRole("link", { name: "Content review", exact: true })).toHaveCount(0);
  expect(operator.requests.some((request) => request.path === "/api/operator/content")).toBe(false);
});

test("mocked overview keeps failed checks visible and refreshes current aggregate status", async ({
  page,
  operator,
}) => {
  let available = false;
  operator.handlers.set("GET /api/operator/overview", () =>
    available
      ? {
          body: {
            ...readiness,
            ready: false,
            checks: [
              { code: "queue_lag", status: "fail", count: 2 },
              { code: "config:phoneVerificationConfiguration", status: "fail" },
              { code: "config:paymentConfiguration", status: "fail" },
            ],
          },
        }
      : denied("Synthetic database check unavailable.", 503),
  );
  await page.goto("/operator");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Synthetic database check unavailable",
  );
  available = true;
  await page.getByRole("button", { name: "Refresh checks" }).click();
  await expect(page.getByRole("heading", { name: "Some checks need attention" })).toBeVisible();
  await expect(page.getByText("queue lag", { exact: true })).toBeVisible();
  await expect(page.getByText("Phone verification settings", { exact: true })).toBeVisible();
  await expect(page.getByText("Payment settings", { exact: true })).toBeVisible();
  await expect(page.getByText(/Needs action.*2/)).toBeVisible();
});

test("mocked refund requires explicit confirmation and retries an uncertain submission with the same immutable request", async ({
  page,
  operator,
}) => {
  const submitted: Record<string, unknown>[] = [];
  let refund: { id: string; status: string; holdState: string; amountCents: number } | null = null;
  operator.handlers.set("POST /api/operator/finance", (body) => {
    submitted.push(body);
    if (submitted.length === 1)
      return denied(
        "Synthetic provider outcome is uncertain. Check this request before retrying.",
        503,
      );
    refund = {
      id: body.operationId as string,
      status: "pending",
      holdState: "held",
      amountCents: 325,
    };
    return { body: { refund } };
  });
  operator.handlers.set("GET /api/operator/finance", (_body, url) => {
    expect(url.searchParams.get("id")).toBe(submitted[0].operationId);
    return {
      body: { refund: refund ? { ...refund, status: "succeeded", holdState: "settled" } : null },
    };
  });
  operator.handlers.set("GET /api/operator/cases", (_body, url) => ({
    body: url.searchParams.has("wallet")
      ? {
          ...walletFixture(),
          wallet: {
            ...walletFixture().wallet,
            availableCents: refund ? 675 : 1000,
            reservedCents: refund ? 325 : 0,
          },
        }
      : emptyCases,
  }));
  await chooseRefund(page);
  const confirm = page.getByRole("checkbox", { name: /I have checked the selected top-up/ });
  await expect(page.getByRole("button", { name: "Request refund", exact: true })).toBeDisabled();
  await confirm.check();
  await page.getByRole("button", { name: "Request refund", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Synthetic provider outcome is uncertain",
  );
  await expect(page.getByLabel("Refund amount (CAD)")).toBeDisabled();
  await expect(page.getByLabel("Reason for the action")).toBeDisabled();
  await page.getByRole("button", { name: "Check refund status", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No request was recorded");
  await page.getByRole("button", { name: "Retry the same request" }).click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1]).toEqual(submitted[0]);
  expect(submitted[0]).toMatchObject({
    action: "refund",
    checkoutId,
    amountCents: 325,
    confirmed: true,
  });
  expect(submitted[0].operationId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole("status")).toContainText(
    "A recorded request is not a completed refund",
  );
  await expect(page.getByText(/\$6\.75 available/)).toBeVisible();
  await page.getByRole("button", { name: "Check refund status", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Refund status: succeeded");
  await page.getByRole("button", { name: "Start another review" }).click();
  await expect(page.getByLabel("Reason for the action")).toHaveValue("");
  await noPrivateStorage(page);
});

test("mocked financial records paginate and refresh without implying uncertain delivery was sent", async ({
  page,
  operator,
}) => {
  operator.access.role = "support";
  operator.handlers.set("GET /api/operator/cases", (_body, url) => ({
    body: {
      ...emptyCases,
      events: [
        {
          id: url.searchParams.has("cursor") ? "event-older" : "event-new",
          walletId: null,
          kind: "dispute",
          amountCents: 500,
          createdAt: stamp,
          paymentIntentId: url.searchParams.has("cursor") ? "pi_fixtureolder" : "pi_fixturenew",
        },
      ],
      nextCursor: url.searchParams.has("cursor") ? null : "cursor_fixture_older",
      deliveries: [
        {
          id: "delivery-fixture-unknown",
          channel: "sms",
          status: "unknown",
          failureCode: "PROVIDER_TIMEOUT",
          providerId: null,
          updatedAt: stamp,
        },
      ],
    },
  }));
  await page.goto("/operator/finance");
  await expect(page.getByText("pi_fixturenew", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load older events" }).click();
  await expect(page.getByText("pi_fixtureolder", { exact: true })).toBeVisible();
  await expect(page.getByText("pi_fixturenew", { exact: true })).toBeVisible();
  await expect(page.getByText("No provider identifier received", { exact: false })).toBeVisible();
  await expect(page.getByText(/do not resend it blindly/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Request refund", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh records" }).click();
  await expect(page.getByText("pi_fixtureolder", { exact: true })).toHaveCount(0);
});

test("mocked editorial review displays the exact passage and requires separate explicit publication", async ({
  page,
  operator,
}) => {
  operator.access.role = "editor";
  let version = draftFixture();
  operator.handlers.set("GET /api/operator/content", (_body, url) => ({
    body: url.searchParams.has("version")
      ? { version }
      : {
          drafts: { items: [version], nextCursor: null, total: 1 },
          editions: { items: [], nextCursor: null, total: 0 },
          aiEnabled: false,
          rightsEnabled: false,
        },
  }));
  operator.handlers.set("POST /api/operator/content", (body) => {
    expect(body.versionId).toBe(version.id);
    if (body.action === "review") {
      expect(body.review).toMatchObject({
        decision: "approve",
        checks: {
          reference: true,
          context: true,
          meaning: true,
          safety: true,
          rights: true,
          originalExplanation: true,
        },
      });
      version = { ...version, review: "approve" };
    } else {
      expect(body.action).toBe("publish");
      expect(body.confirmed).toBe(true);
      expect(version.review).toBe("approve");
      version = { ...version, published: true };
    }
    return { body: { version } };
  });
  await page.goto("/operator/content");
  await page.getByRole("button", { name: "Read and review" }).click();
  await expect(page.getByRole("heading", { name: "Source passage", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the source passage" })).toHaveAttribute(
    "href",
    version.passage.sourceUrl,
  );
  await expect(page.getByText(/My little children, let us not love in word/)).toBeVisible();
  await page.getByText("Nearby passage context", { exact: true }).click();
  await expect(page.getByText(/Synthetic nearby context fixture/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Record approval" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish approved version" })).toBeDisabled();
  await page.screenshot({ path: "output/playwright/operator-content-desktop.png", fullPage: true });
  for (const checkbox of await page
    .getByRole("group", { name: "Human review" })
    .getByRole("checkbox")
    .all())
    await checkbox.check();
  await page
    .getByLabel("Review notes or withdrawal reason")
    .fill(
      "Synthetic review of exact reference, context, practical wording and source permissions.",
    );
  await page.getByRole("button", { name: "Record approval" }).click();
  await expect(page.getByRole("status")).toContainText("Publication is a separate action");
  await expect(page.getByRole("button", { name: "Publish approved version" })).toBeDisabled();
  expect(
    operator.requests.filter(
      (request) => request.method === "POST" && request.body.action === "publish",
    ),
  ).toHaveLength(0);
  await page.getByRole("checkbox", { name: /I have reviewed this exact version/ }).check();
  await page.getByRole("button", { name: "Publish approved version" }).click();
  await expect(page.getByRole("status")).toContainText("now published");
  await expect(page.getByRole("button", { name: "Publish approved version" })).toBeDisabled();
});

test("mocked operator finance remains accessible on mobile without horizontal overflow", async ({
  page,
  operator,
}) => {
  operator.access.role = "support";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/operator/finance");
  await expect(page.getByRole("heading", { level: 1, name: "Financial support" })).toBeVisible();
  await expect(page.getByText("No payment incidents have been recorded.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: "output/playwright/operator-finance-mobile.png", fullPage: true });
  await noPrivateStorage(page);
});

test("mocked charge waiver requires explicit merchant-cost approval and retries the same reservation operation", async ({
  page,
  operator,
}) => {
  const deliveryId = "00000000-0000-4000-8000-000000000060";
  const attempts: Record<string, unknown>[] = [];
  let waived = false;
  operator.handlers.set("GET /api/operator/cases", () => ({
    body: {
      ...emptyCases,
      deliveries: [
        {
          id: deliveryId,
          channel: "sms",
          status: "unknown",
          failureCode: "PROVIDER_TIMEOUT",
          providerId: null,
          updatedAt: stamp,
          creditState: waived ? "waived" : "held",
          amountCents: 35,
        },
      ],
    },
  }));
  operator.handlers.set("POST /api/operator/deliveries", (body) => {
    attempts.push(body);
    if (attempts.length === 1)
      return denied("Synthetic waiver response unavailable. Retry the same operation.", 503);
    expect(body).toMatchObject({ deliveryId, confirmed: true });
    expect(body).not.toHaveProperty("amountCents");
    expect(body).not.toHaveProperty("amount");
    waived = true;
    return { body: { waiver: { operationId: body.operationId, deliveryId, amountCents: 35 } } };
  });
  await page.goto("/operator/finance");
  await page.getByRole("button", { name: "Review a charge waiver" }).click();
  await expect(page.getByRole("heading", { name: "Waive an uncertain SMS charge" })).toBeVisible();
  await expect(page.getByText(/This restores exactly 0\.35 CAD/)).toBeVisible();
  await expect(
    page.getByText(/The message stays marked as unknown and will not be resent/),
  ).toBeVisible();
  await page
    .getByLabel("Support review reason")
    .fill("Synthetic case 456: the merchant accepts any provider cost.");
  await expect(page.getByRole("button", { name: "Waive this SMS charge" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /I approve restoring this reserved credit/ }).check();
  await page.getByRole("button", { name: "Waive this SMS charge" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Synthetic waiver response unavailable",
  );
  await expect(page.getByLabel("Support review reason")).toBeDisabled();
  await page.getByRole("button", { name: "Retry the same waiver" }).click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[0].operationId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole("status")).toContainText(
    "The reserved credit was returned. The delivery outcome remains unknown.",
  );
  await expect(page.getByText("Credit reservation: waived.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review a charge waiver" })).toHaveCount(0);
  await noPrivateStorage(page);
});
