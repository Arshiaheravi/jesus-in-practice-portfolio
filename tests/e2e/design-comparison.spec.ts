import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { practices } from "../../packages/content/src/index";

const member = "http://127.0.0.1:3001";
const choices = [
  ["heritage", "Heritage"],
  ["vespers", "Vespers"],
  ["olive", "Olive & Stone"],
  ["light", "Clear Light"],
  ["living", "Living Faith"],
] as const;

async function expectResponsive(page: Page) {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true);
  }
}

async function expectPhotos(page: Page) {
  for (const photo of await page.locator('main img:not([aria-hidden="true"])').all()) {
    if (!(await photo.isVisible())) continue;
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        photo.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
      )
      .toBe(true);
  }
}

async function expectAccessible(page: Page) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
}

test("gallery offers five working website and dashboard choices with actual previews", async ({
  page,
}) => {
  await page.goto("/designs");
  for (const [id, name] of choices) {
    const card = page.getByRole("article", { name });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: `View website : ${name}` })).toHaveAttribute(
      "href",
      `/designs/${id}`,
    );
    await expect(card.getByRole("link", { name: `View dashboard : ${name}` })).toHaveAttribute(
      "href",
      `${member}/designs/${id}`,
    );
  }
  await expectPhotos(page);
  await expectResponsive(page);
  await expectAccessible(page);
  await page.getByRole("link", { name: "View website : Olive & Stone" }).click();
  await expect(page).toHaveURL("/designs/olive");
  await expect(page.locator('[data-design="olive"]')).toBeVisible();
  await page.getByRole("link", { name: "View dashboard", exact: true }).click();
  await expect(page).toHaveURL(`${member}/designs/olive`);
  await page.getByRole("link", { name: "All designs", exact: true }).click();
  await expect(page).toHaveURL("/designs");
});

for (const [id, name] of choices) {
  test(`${name} website keeps attributed lessons and usable responsive controls`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/designs/${id}`);
    await expect(page.locator(`[data-design="${id}"]`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page).toHaveTitle(new RegExp(name));
    const preview = page.locator(".message-preview");
    await preview.getByLabel("Example scripture source").selectOption("book-of-mormon");
    const title = await preview.locator(".message-card h3").innerText();
    const practice = practices.find((entry) => entry.title === title)!;
    expect(practice.source).toBe("book-of-mormon");
    await expect(preview.getByText(practice.plainMeaning, { exact: true })).toBeVisible();
    await expect(preview.getByText(practice.everydayExample, { exact: true })).toBeVisible();
    await expect(preview.getByText(practice.action, { exact: true })).toBeVisible();
    await expect(preview.locator(`a[href="${practice.sourceUrl}"]`)).toContainText(
      practice.reference,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await preview.getByRole("button", { name: "Text message", exact: true }).click();
    await expect(preview.getByText(practice.smsText, { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "Email", exact: true }).click();
    await preview.getByRole("button", { name: "Try another example" }).click();
    await expect(preview.locator(".message-card h3")).not.toHaveText(title);
    await expectPhotos(page);
    await expectResponsive(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  test(`${name} dashboard retains practice actions and a usable responsive reading space`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${member}/designs/${id}`);
    await expect(page.locator(`[data-design="${id}"]`)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("link", { name: /Website design/ })).toHaveAttribute(
      "href",
      `http://127.0.0.1:3000/designs/${id}`,
    );
    const card = page.locator(".today-card");
    await expect(card).toBeVisible();
    const title = await card.getByRole("heading", { level: 2 }).first().innerText();
    const practice = practices.find((entry) => entry.title === title)!;
    await expect(card.getByText(practice.plainMeaning, { exact: true })).toBeVisible();
    await expect(card.getByText(practice.everydayExample, { exact: true })).toBeVisible();
    await expect(card.getByText(practice.action, { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Save practice", exact: true }).click();
    await card.getByRole("button", { name: "I practiced this", exact: true }).click();
    await page.reload();
    await expect(
      card.getByRole("button", { name: "Practiced today", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await card.getByRole("button", { name: "Try another practice" }).click();
    await expect(card.getByRole("heading", { level: 2 }).first()).not.toHaveText(title);
    await expectPhotos(page);
    await expectResponsive(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });
}

test("comparison routes reject unknown designs and leave normal pages on the current design", async ({
  page,
}) => {
  for (const origin of ["http://127.0.0.1:3000", member]) {
    const response = await page.goto(`${origin}/designs/not-a-design`);
    expect(response?.status()).toBe(404);
  }
  for (const route of ["/", `${member}/dashboard`]) {
    await page.goto(route);
    await expect(page.locator("[data-design]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
