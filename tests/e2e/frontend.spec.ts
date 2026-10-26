import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const member = "http://127.0.0.1:3001";
const storageKey = "jesus-in-practice:preview:v1";
const firstPractice = "notice-your-neighbour";

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

test("public library filters sources, handles no results, and opens an attributed practice", async ({
  page,
}) => {
  await page.goto("/practices");
  await expect(page.getByLabel("Scripture collection")).toHaveValue("bible");
  await expect(page.getByRole("status")).toContainText("12 practices");
  await page.getByLabel("Scripture collection").selectOption("book-of-mormon");
  await expect(page.getByRole("status")).toContainText("12 practices from Book of Mormon");
  await page.getByLabel("Find a practice").fill("no-such-practice-987");
  await expect(page.getByRole("heading", { name: "No practices found." })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).first().click();
  await expect(page.getByLabel("Scripture collection")).toHaveValue("bible");
  await page.goto(`/practices/${firstPractice}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notice your neighbour");
  const passage = page.getByRole("link", { name: /Read.*passage/i });
  await expect(passage).toHaveAttribute(
    "href",
    /churchofjesuschrist\.org\/study\/scriptures\/nt\/luke\/10/,
  );
});

test("message examples switch channels without sending a request", async ({ page }) => {
  await page.goto("/");
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  const channels = page.getByRole("group", { name: "Message preview channel" });
  await channels.getByRole("button", { name: "Text message" }).click();
  await expect(page.locator(".message-label")).toContainText("SMS example");
  await expect(channels.getByRole("button", { name: "Text message" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await channels.getByRole("button", { name: "Email", exact: true }).click();
  await expect(page.locator(".message-label")).toContainText("Email example");
  expect(writes).toEqual([]);
});

test("onboarding preserves an explicit source, topic, channel, and Canadian time zone", async ({
  page,
}) => {
  await page.goto(`${member}/onboarding?plan=both`);
  await expect(page.getByRole("radio", { name: /Bible · King James Version/ })).toBeChecked();
  await page.getByRole("radio", { name: /Book of Mormon Practical teachings/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("checkbox", { name: "Compassion", exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Reminder channel").selectOption("both");
  await page.getByLabel("Your reminder time").fill("09:30");
  await page.getByLabel("Your time zone").selectOption("America/St_Johns");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("9:30 a.m.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Start my practice" }).click();
  await expect(page).toHaveURL(`${member}/dashboard`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    storageKey,
  );
  expect(saved).toMatchObject({
    onboarded: true,
    source: "book-of-mormon",
    topics: ["Compassion"],
    channel: "both",
    timezone: "America/St_Johns",
    plan: "both",
    schedule: { times: ["09:30"] },
  });
  await page.reload();
  await expect(page.locator(".today-card")).toContainText("Book of Mormon");
});

test("saved practices, completions, and reflections persist and can be undone", async ({
  page,
}) => {
  await page.goto(`${member}/saved`);
  await expect(
    page.getByRole("heading", { name: "Build your own practice collection" }),
  ).toBeVisible();
  await page.goto(`${member}/library/${firstPractice}`);
  await page.getByRole("button", { name: "Save practice", exact: true }).first().click();
  await page.getByRole("button", { name: "I practiced this", exact: true }).click();
  await page
    .getByLabel("Your reflection (optional)")
    .fill("I listened before offering a suggestion.");
  await page.getByRole("button", { name: "Save reflection", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reflection saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Practiced today", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Your reflection (optional)")).toHaveValue(
    "I listened before offering a suggestion.",
  );
  await page.goto(`${member}/saved`);
  await expect(
    page.getByRole("heading", { name: "Notice your neighbour", exact: true }),
  ).toBeVisible();
  await page.goto(`${member}/progress`);
  await expect(page.locator(".journey-list")).toContainText("Notice your neighbour");
  await page.getByRole("button", { name: "Reflections", exact: true }).click();
  await expect(page.locator(".reflection-text")).toHaveText(
    "I listened before offering a suggestion.",
  );
  await page.goto(`${member}/library/${firstPractice}`);
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await page.getByRole("button", { name: "Practiced today", exact: true }).click();
  await page.getByLabel("Your reflection (optional)").fill("");
  await page.getByRole("button", { name: "Save reflection" }).click();
  await page.goto(`${member}/progress`);
  await expect(page.getByRole("heading", { name: "Your first step belongs here" })).toBeVisible();
  await page.getByRole("button", { name: "Reflections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Leave a little space for reflection" }),
  ).toBeVisible();
});

test("member library pagination covers the collection and filtering resets the page", async ({
  page,
}) => {
  await page.goto(`${member}/library`);
  await page.getByLabel("Scripture source", { exact: true }).selectOption("both");
  await expect(page.locator(".results-summary")).toContainText("24 practices");
  await expect(page.locator(".practice-grid article")).toHaveCount(9);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".practice-grid article")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByLabel("Search practices").fill("Notice your neighbour");
  await expect(page.locator(".practice-grid article")).toHaveCount(1);
  await page.getByLabel("Search practices").fill("no-such-practice-987");
  await expect(page.getByRole("heading", { name: "No practices found" })).toBeVisible();
  await page.getByRole("button", { name: "Show all practices" }).click();
  await expect(page.getByLabel("Search practices")).toHaveValue("");
});

test("reminder form rejects invalid schedules, saves choices, and pauses without sending", async ({
  page,
}) => {
  await page.goto(`${member}/schedule`);
  for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])
    await page.getByRole("checkbox", { name: day, exact: true }).uncheck();
  await page.getByRole("button", { name: "Save rhythm" }).click();
  await expect(page.locator("#schedule-error")).toContainText("Choose at least one day");
  await page.getByRole("checkbox", { name: "Monday", exact: true }).check();
  await page.getByRole("radio", { name: "Surprise me within a window" }).check();
  await page.getByLabel("Not before").fill("18:00");
  await page.getByLabel("Not after").fill("09:00");
  await page.getByRole("button", { name: "Save rhythm" }).click();
  await expect(page.locator("#schedule-error")).toContainText("end time after its start");
  await page.getByLabel("Not after").fill("20:00");
  await page.getByLabel("Your time zone").selectOption("America/Vancouver");
  await page.getByRole("button", { name: "Save rhythm" }).click();
  await expect(page.getByRole("status")).toContainText("No messages have been scheduled or sent");
  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume preview" })).toBeVisible();
  await expect(page.getByLabel("Not before")).toHaveValue("18:00");
  await expect(page.getByLabel("Your time zone")).toHaveValue("America/Vancouver");
  await page.getByRole("button", { name: "Resume preview" }).click();
  await expect(page.getByRole("button", { name: "Pause preview" })).toBeVisible();
});

test("source preferences support cancel/save and plan selection remains a local preference", async ({
  page,
}) => {
  await page.goto(`${member}/settings/preferences`);
  const bible = page.getByRole("radio", { name: /Bible · King James Version/ });
  const book = page.getByRole("radio", { name: /Book of Mormon Practical teachings/ });
  await book.check();
  await page.getByRole("button", { name: "Cancel changes" }).click();
  await expect(bible).toBeChecked();
  await book.check();
  await page.getByRole("checkbox", { name: "Patience", exact: true }).check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Preferences saved");
  await page.goto(`${member}/dashboard`);
  await expect(page.locator(".today-card .lesson-reference")).toContainText("Book of Mormon");
  await expect(page.locator(".today-card .tag")).toHaveText("Patience");
  await page.goto(`${member}/library`);
  await expect(page.getByLabel("Scripture source", { exact: true })).toHaveValue("book-of-mormon");
  await page.getByLabel("Search practices").fill("no-match-987");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByLabel("Scripture source", { exact: true })).toHaveValue("book-of-mormon");
  await page.goto(`${member}/settings/plans`);
  const plan = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Email + SMS", exact: true }) });
  await plan.getByRole("button", { name: "Choose for preview" }).click();
  await expect(page.getByRole("status")).toContainText("No subscription or payment was created");
  await page.reload();
  await expect(plan.getByRole("button", { name: "Selected for preview" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    storageKey,
  );
  expect(saved).toMatchObject({ plan: "both", channel: "both", source: "book-of-mormon" });
});

test("unreadable saved data has a recoverable state", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "{broken json"), storageKey);
  await page.goto(`${member}/dashboard`);
  await expect(
    page.getByText("Saved preview data could not be read.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save fresh preview" }).click();
  await expect(page.getByRole("button", { name: "Save fresh preview" })).toHaveCount(0);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").version, storageKey),
  ).toBe(1);
});

test("denied storage remains usable and explains the persistence limit", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith("jesus-in-practice:"))
        throw new DOMException("Storage disabled", "SecurityError");
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("jesus-in-practice:"))
        throw new DOMException("Storage disabled", "SecurityError");
      return originalSet.call(this, key, value);
    };
  });
  await page.goto(`${member}/library/${firstPractice}`);
  await expect(page.getByText("Browser storage is unavailable.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "I practiced this", exact: true }).click();
  await expect(page.getByRole("button", { name: "Practiced today", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry saving" }).click();
  await expect(page.getByText("Browser storage is unavailable.", { exact: false })).toBeVisible();
});

test("unsupported saved data is preserved until replacement is explicitly chosen", async ({
  page,
}) => {
  const unreadable = JSON.stringify({
    version: 99,
    notes: { important: "Preserve this old data" },
  });
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: storageKey,
    raw: unreadable,
  });
  await page.goto(`${member}/library/${firstPractice}`);
  await page.getByRole("button", { name: "I practiced this", exact: true }).click();
  await expect(page.getByRole("button", { name: "Practiced today", exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(unreadable);
  await page.getByRole("button", { name: "Save fresh preview" }).click();
  const replaced = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}"),
    storageKey,
  );
  expect(replaced.version).toBe(1);
  expect(replaced.completed).toHaveLength(1);
});

test("failed data removal keeps saved data and reports failure instead of claiming a reset", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (key.startsWith("jesus-in-practice:preview"))
        throw new DOMException("Removal disabled", "SecurityError");
      return originalRemove.call(this, key);
    };
  });
  await page.goto(`${member}/library/${firstPractice}`);
  await page.getByRole("button", { name: "Save practice", exact: true }).first().click();
  await page.goto(`${member}/settings/account`);
  await page.getByRole("button", { name: "Reset preview", exact: true }).click();
  await page.getByRole("button", { name: "Yes, reset my preview" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").saved, storageKey),
  ).toContain(firstPractice);
});

test("local preferences synchronize across tabs and reset requires confirmation", async ({
  page,
  context,
}) => {
  await page.goto(`${member}/library/${firstPractice}`);
  const other = await context.newPage();
  await other.goto(`${member}/saved`);
  await expect(
    other.getByRole("heading", { name: "Build your own practice collection" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save practice", exact: true }).first().click();
  await expect(
    other.getByRole("heading", { name: "Notice your neighbour", exact: true }),
  ).toBeVisible();
  await page.goto(`${member}/settings/account`);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export preview data" }).click();
  expect((await downloaded).suggestedFilename()).toBe("jesus-in-practice-preview.json");
  await page.getByRole("button", { name: "Reset preview", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep my preview" }).click();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").saved, storageKey),
  ).toContain(firstPractice);
  await page.getByRole("button", { name: "Reset preview", exact: true }).click();
  await page.getByRole("button", { name: "Yes, reset my preview" }).click();
  await expect(
    other.getByRole("heading", { name: "Build your own practice collection" }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("cross-tab reflection changes preserve an unsaved draft until a version is chosen", async ({
  page,
  context,
}) => {
  await page.goto(`${member}/library/${firstPractice}`);
  const other = await context.newPage();
  await other.goto(`${member}/library/${firstPractice}`);
  await other
    .getByLabel("Your reflection (optional)")
    .fill("A reflection saved in the second tab.");
  await other.getByRole("button", { name: "Save reflection", exact: true }).click();
  await expect(page.getByLabel("Your reflection (optional)")).toHaveValue(
    "A reflection saved in the second tab.",
  );
  await page
    .getByLabel("Your reflection (optional)")
    .fill("An unsaved reflection in the first tab.");
  await other
    .getByLabel("Your reflection (optional)")
    .fill("A newer saved reflection in the second tab.");
  await other.getByRole("button", { name: "Save reflection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Load newer reflection" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save reflection", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Your reflection (optional)")).toHaveValue(
    "An unsaved reflection in the first tab.",
  );
  await page.getByRole("button", { name: "Load newer reflection" }).click();
  await expect(page.getByLabel("Your reflection (optional)")).toHaveValue(
    "A newer saved reflection in the second tab.",
  );
  await page
    .getByLabel("Your reflection (optional)")
    .fill("The version deliberately chosen in the first tab.");
  await other.getByLabel("Your reflection (optional)").fill("Another change in the second tab.");
  await other.getByRole("button", { name: "Save reflection", exact: true }).click();
  await page.getByRole("button", { name: "Replace saved reflection with my draft" }).click();
  await expect(other.getByLabel("Your reflection (optional)")).toHaveValue(
    "The version deliberately chosen in the first tab.",
  );
});

test("mobile navigation, keyboard dismissal, dark appearance, and layout work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${member}/dashboard`);
  const opener = page.getByRole("button", { name: "Open navigation" });
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Practice library", exact: true })
    .click();
  await expect(page).toHaveURL(`${member}/library`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNoOverflow(page);
  await page.goto(`${member}/settings/account`);
  await page.getByLabel("Choose a comfortable view").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoOverflow(page);
  await page.goto("/");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expectNoOverflow(page);
});

test("mobile schedule keyboard focus stays above the fixed navigation", async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${member}/schedule`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const visited = new Set<string>();
    let reachedNavigation = false;
    for (let step = 0; step < 50; step++) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const active = document.activeElement;
        const navigation = document.querySelector(".mobile-bottom-nav");
        if (!active || !navigation) return null;
        if (navigation.contains(active)) return { navigation: true };
        if (!document.querySelector("main")?.contains(active)) return null;
        const bounds = active.getBoundingClientRect();
        if (bounds.width < 2 || bounds.height < 2) return null;
        return {
          navigation: false,
          name: active.id || active.getAttribute("aria-label") || active.textContent?.trim(),
          bottom: bounds.bottom,
          navigationTop: navigation.getBoundingClientRect().top,
        };
      });
      if (focus?.navigation) {
        reachedNavigation = true;
        break;
      }
      if (focus && !focus.navigation) {
        visited.add(focus.name || "");
        expect(
          focus.bottom,
          `${focus.name} and its focus outline should remain above navigation at ${width}px`,
        ).toBeLessThanOrEqual(focus.navigationTop! - 7);
      }
    }
    expect(visited.has("reminder-time-0")).toBe(true);
    expect(visited.has("Add another time")).toBe(true);
    expect(reachedNavigation).toBe(true);
  }
});

for (const scenario of [
  { name: "public home", url: "/", width: 1440, dark: false },
  { name: "public library mobile", url: "/practices", width: 390, dark: false },
  { name: "public home dark", url: "/", width: 390, dark: true },
  { name: "member today", url: `${member}/dashboard`, width: 1440, dark: false },
  { name: "member schedule mobile", url: `${member}/schedule`, width: 390, dark: false },
  {
    name: "member practice dark",
    url: `${member}/library/${firstPractice}`,
    width: 1440,
    dark: true,
  },
  { name: "member onboarding mobile", url: `${member}/onboarding`, width: 390, dark: false },
]) {
  test(`accessibility scan: ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.emulateMedia({ colorScheme: scenario.dark ? "dark" : "light" });
    await page.goto(scenario.url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectNoOverflow(page);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        elements: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
}

test("public metadata, indexing defaults, social image, and defensive headers are valid", async ({
  page,
  request,
}) => {
  const response = await page.goto("/");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["x-powered-by"]).toBeUndefined();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "Jesus in Practice",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^http:\/\/127\.0\.0\.1:3000\/?$/,
  );
  const schema = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(schema || "{}")).toMatchObject({
    "@type": "WebSite",
    name: "Jesus in Practice",
  });
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("<loc>");
  const image = await request.get("/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/png");
  await page.goto(`${member}/dashboard`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(await (await request.get(`${member}/robots.txt`)).text()).toContain("Disallow: /");
});

test("unknown practice and removed template routes return 404 with recovery navigation", async ({
  page,
}) => {
  for (const url of [
    "/practices/not-a-real-practice",
    "/customers",
    `${member}/library/not-a-real-practice`,
    `${member}/finance/cards`,
  ]) {
    const response = await page.goto(url);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.getByRole("link").count()).toBeGreaterThan(0);
  }
});
