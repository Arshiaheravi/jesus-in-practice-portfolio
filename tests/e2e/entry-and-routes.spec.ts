import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { practices } from "../../packages/content/src/index";

const member = "http://127.0.0.1:3001";

test("unconfigured unsubscribe page does not claim a change or invent a support recipient", async ({
  page,
}) => {
  await page.goto(`${member}/unsubscribe`);
  await expect(
    page.getByRole("heading", { name: "Unsubscribe from practice messages" }),
  ).toBeVisible();
  await expect(page.getByText("No preferences were changed.", { exact: false })).toBeVisible();
  await expect(page.locator("a[href^='mailto:']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop these messages" })).toHaveCount(0);
});

test("all 24 practices have both a public and member detail route", async ({ request }) => {
  for (const practice of practices) {
    const responses = await Promise.all([
      request.get(`/practices/${practice.id}`),
      request.get(`${member}/library/${practice.id}`),
    ]);
    for (const response of responses) expect(response.status(), response.url()).toBe(200);
  }
});

test("help search and feedback draft recover from errors without pretending to submit", async ({
  page,
}) => {
  await page.goto("/support");
  await page.getByLabel("Search help").fill("no-such-answer-987");
  await expect(page.getByRole("heading", { name: "No answers found." })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByLabel("Search help")).toHaveValue("");
  await page.getByRole("button", { name: "Prepare local draft" }).click();
  await expect(page.locator("#feedback-error")).toContainText("at least 15 characters");
  await page.getByLabel("What is this about?").selectOption("Accessibility");
  await page.getByLabel("Your note").fill("The preview is ready for a keyboard review.");
  await page.getByRole("button", { name: "Prepare local draft" }).click();
  await expect(page.getByRole("heading", { name: "Your draft is ready." })).toBeVisible();
  await expect(page.getByText("This note has not been sent.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open email draft" })).toHaveCount(0);
  await expect(page.locator("a[href^='mailto:']")).toHaveCount(0);
  await expect(page.locator("pre")).toContainText("Topic: Accessibility");
  await expect(page.locator(".feedback-success")).toContainText("This demo has no support mailbox");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("Clipboard disabled for test")) },
    }),
  );
  await page.getByRole("button", { name: "Copy draft" }).click();
  await expect(
    page.getByText("Copy is unavailable. Select and copy the draft text below."),
  ).toBeVisible();
  await expect(page.locator("pre")).toContainText("The preview is ready for a keyboard review.");
  await page.getByLabel("What is this about?").selectOption("An idea or question");
  await expect(page.getByRole("heading", { name: "Your draft is ready." })).toHaveCount(0);
  await page.getByRole("button", { name: "Prepare local draft" }).click();
  await expect(page.locator("pre")).toContainText("Topic: An idea or question");
  await page.getByLabel("Your note").fill("A revised note for the next review.");
  await expect(page.getByRole("heading", { name: "Your draft is ready." })).toHaveCount(0);
  await page.getByRole("button", { name: "Prepare local draft" }).click();
  await expect(page.locator("pre")).toContainText("A revised note for the next review.");
  await expect(page.locator("pre")).not.toContainText(
    "The preview is ready for a keyboard review.",
  );
});

test("public pricing explains free email and optional one-time CAD SMS credit without checkout", async ({
  page,
}) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Account + email", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Optional SMS", exact: true })).toBeVisible();
  await expect(page.getByText("$10 / $25 / $50 CAD", { exact: true })).toBeVisible();
  await expect(
    page.getByText("$0.05 CAD per SMS segment at launch", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("SMS credit does not expire.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("One-time credit top-ups, not monthly fees.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No payments, real accounts or messages are created here.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore SMS setup/ })).toHaveAttribute(
    "href",
    `${member}/onboarding?plan=both`,
  );
  await page.getByText("Will I be charged again automatically?", { exact: true }).click();
  await expect(
    page.getByText("There is no recurring plan or automatic recharge.", { exact: false }),
  ).toBeVisible();
  await page.getByText("What about unused credit or a failed delivery?", { exact: true }).click();
  await expect(
    page.getByText("You can request a refund of unused available credit", { exact: false }),
  ).toContainText("after pending messages and payments are reconciled");
  await page.getByRole("link", { name: "SMS credit terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByText("Credit is for this service", { exact: false })).toContainText(
    "SMS credit does not expire.",
  );
  await expect(page.getByText("Credit is for this service", { exact: false })).toContainText(
    "Reserved credit remains unavailable for refund",
  );
  await expect(
    page.getByText("The launch rate is $0.05 CAD per SMS segment.", { exact: false }),
  ).toContainText("purchases remain unavailable");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: "output/playwright/sms-terms-mobile.png", fullPage: true });
});

test("public mobile menu supports keyboard dismissal and navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Explore practices" })
    .click();
  await expect(page).toHaveURL(/\/practices$/);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
});

test("passwordless email preview validates input and test code without submitting contact data", async ({
  page,
}) => {
  await page.goto("/signup");
  const requests: string[] = [];
  page.on("request", (request) =>
    requests.push(`${request.method()} ${request.url()} ${request.postData() || ""}`),
  );
  await page.getByLabel("Email address", { exact: true }).fill("not-an-email");
  await page.getByRole("button", { name: "Continue to demo code" }).click();
  await expect(page.locator("#auth-error")).toContainText("Enter an email address");
  await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();
  await page.getByLabel("Email address", { exact: true }).fill("preview-person@example.com");
  await page.getByRole("button", { name: "Continue to demo code" }).click();
  await expect(page.getByLabel("Six-digit demo code")).toBeFocused();
  await page.getByLabel("Six-digit demo code").fill("000000");
  await page.getByRole("button", { name: "Complete code preview" }).click();
  await expect(page.locator("#auth-error")).toContainText("not the demo code");
  await page.getByRole("button", { name: "Resend preview code" }).click();
  await expect(page.getByRole("status")).toContainText("No message has been sent");
  await page.getByLabel("Six-digit demo code").fill("123456");
  await page.getByRole("button", { name: "Complete code preview" }).click();
  await expect(
    page.getByText("No identity was verified and no account was created.", { exact: false }),
  ).toBeVisible();
  expect(
    requests.filter((request) => request.includes("preview-person") || !request.startsWith("GET ")),
  ).toEqual([]);
  const storage = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  expect(storage).not.toContain("preview-person");
  await page.getByRole("link", { name: "Continue to setup" }).click();
  await expect(page).toHaveURL(`${member}/onboarding`);
});

test("phone entry, changing contact, and returning-member entry have complete preview states", async ({
  page,
}) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await page.getByLabel("Canadian phone number").fill("123");
  await page.getByRole("button", { name: "Continue to demo code" }).click();
  await expect(page.locator("#auth-error")).toContainText("valid +1 phone format");
  await page.getByLabel("Canadian phone number").fill("+1 416 555 0123");
  await page.getByRole("button", { name: "Continue to demo code" }).click();
  await page.getByRole("button", { name: "Change contact" }).click();
  await expect(page.getByLabel("Canadian phone number")).toBeFocused();
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("");
  await page.getByLabel("Email address", { exact: true }).fill("alex@example.com");
  await page.getByRole("button", { name: "Continue to demo code" }).click();
  await page.getByLabel("Six-digit demo code").fill("123456");
  await page.getByRole("button", { name: "Complete code preview" }).click();
  await page.getByRole("main").getByRole("link", { name: "Open demo", exact: true }).click();
  await expect(page).toHaveURL(`${member}/dashboard`);
});

test("account-entry error and verification views pass automated accessibility checks", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Continue to demo code" }).click();
  let result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByLabel("Email address", { exact: true }).fill("alex@example.com");
  await page.getByRole("button", { name: "Continue to demo code" }).click();
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

const publicRoutes = [
  "/",
  "/how-it-works",
  "/practices",
  "/practices/notice-your-neighbour",
  "/about",
  "/pricing",
  "/support",
  "/privacy",
  "/terms",
  "/accessibility",
  "/signup",
  "/signin",
  "/reset-password",
];
const memberRoutes = [
  "/dashboard",
  "/library",
  "/library/notice-your-neighbour",
  "/saved",
  "/schedule",
  "/progress",
  "/settings/account",
  "/settings/preferences",
  "/settings/plans",
  "/help",
  "/onboarding",
  "/signin",
  "/reset-password",
];

test("member entry aliases lead to the intended preview", async ({ page }) => {
  await page.goto(`${member}/`);
  await expect(page).toHaveURL(`${member}/dashboard`);
  await page.goto(`${member}/signup`);
  await expect(page).toHaveURL(`${member}/onboarding`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

for (const area of [
  { name: "public", origin: "http://127.0.0.1:3000", routes: publicRoutes },
  { name: "member", origin: member, routes: memberRoutes },
]) {
  test(`${area.name} route inventory loads without runtime errors or broken internal links`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const destinations = new Set<string>();
    const titles = new Set<string>();
    for (const route of area.routes) {
      const response = await page.goto(`${area.origin}${route}`);
      expect(response?.status(), route).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }), route).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 }), route).toBeVisible();
      // Bring lazy images into view before checking decoding, as a person scrolling would.
      // Waiting for off-screen lazy images to decode before scrolling can never complete.
      for (const image of await page.locator("img").all()) {
        if (await image.isVisible()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate((element) => (element as HTMLImageElement).decode());
        }
      }
      const title = await page.title();
      expect(title, route).toContain("Jesus in Practice");
      expect(titles.has(title), `duplicate title for ${route}: ${title}`).toBe(false);
      titles.add(title);
      await expect(page.locator('meta[name="description"]'), route).toHaveAttribute(
        "content",
        /\S.{20}/,
      );
      const anchors = await page
        .locator("a[href]")
        .evaluateAll((elements) => elements.map((element) => (element as HTMLAnchorElement).href));
      for (const href of anchors) {
        const url = new URL(href);
        if (["http://127.0.0.1:3000", member].includes(url.origin))
          destinations.add(`${url.origin}${url.pathname}${url.search}`);
      }
    }
    for (const url of destinations)
      expect((await request.get(url)).ok(), `broken internal link ${url}`).toBe(true);
    expect(errors).toEqual([]);
  });
}
