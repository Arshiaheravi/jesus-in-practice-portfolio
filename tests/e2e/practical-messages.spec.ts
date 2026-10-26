import { expect, test } from "@playwright/test";

import { defaultState } from "../../apps/dashboard/lib/demo-model";
import { practices } from "../../packages/content/src/index";

const member = "http://127.0.0.1:3001";
const storageKey = "jesus-in-practice:preview:v1";

test("practice libraries can find an everyday situation, not only a title", async ({ page }) => {
  for (const [url, label] of [
    ["/practices", "Find a practice"],
    [`${member}/library`, "Search practices"],
  ]) {
    await page.goto(url);
    await page.getByLabel(label).fill("groceries");
    await expect(
      page.getByRole("heading", { name: "Notice your neighbour", exact: true }),
    ).toBeVisible();
  }
});

for (const source of ["bible", "book-of-mormon"] as const) {
  const practice = practices.find((item) => item.source === source)!;
  for (const app of ["public", "member"] as const) {
    test(`${app} ${source} lesson connects its reference, meaning, example, and action`, async ({
      page,
    }) => {
      await page.goto(
        app === "public" ? `/practices/${practice.id}` : `${member}/library/${practice.id}`,
      );
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(practice.title);
      await expect(main.getByText(practice.plainMeaning, { exact: true })).toBeVisible();
      await expect(main.getByText(practice.everydayExample, { exact: true })).toBeVisible();
      await expect(main.getByText(practice.action, { exact: true })).toBeVisible();
      const reference = main.locator(`a[href="${practice.sourceUrl}"]`).first();
      await expect(reference).toBeVisible();
      await expect(reference).toContainText(practice.reference);
    });
  }
}

test("random message examples keep their source and attribution across email and SMS", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.locator(".message-preview");
  const source = preview.getByRole("combobox");
  await expect(source).toHaveValue("bible");
  for (const selectedSource of ["bible", "book-of-mormon", "both"] as const) {
    await source.selectOption(selectedSource);
    let previous = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const title = await preview.locator(".message-card h3").innerText();
      const practice = practices.find((item) => item.title === title)!;
      expect(practice).toBeDefined();
      if (selectedSource !== "both") expect(practice.source).toBe(selectedSource);
      expect(practice.id).not.toBe(previous);
      await expect(preview.getByText(practice.plainMeaning, { exact: true })).toBeVisible();
      await expect(preview.getByText(practice.everydayExample, { exact: true })).toBeVisible();
      await expect(preview.getByText(practice.action, { exact: true })).toBeVisible();
      await expect(preview.locator(`a[href="${practice.sourceUrl}"]`)).toContainText(
        practice.reference,
      );
      const channels = preview.getByRole("group", { name: "Message preview channel" });
      await channels.getByRole("button", { name: "Text message" }).click();
      await expect(preview.getByText(practice.smsText, { exact: true })).toBeVisible();
      await expect(preview.locator(`a[href="${practice.sourceUrl}"]`)).toBeVisible();
      await channels.getByRole("button", { name: "Email", exact: true }).click();
      previous = practice.id;
      await preview.getByRole("button", { name: /another example/i }).click();
    }
  }
});

test("today's random practice stays inside source and topic choices", async ({ page }) => {
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
    },
    {
      key: storageKey,
      state: { ...defaultState, onboarded: true, source: "bible", topics: ["Patience", "Honesty"] },
    },
  );
  await page.goto(`${member}/dashboard`);
  const card = page.locator(".today-card");
  let previous = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const title = await card.getByRole("heading", { level: 2 }).first().innerText();
    const practice = practices.find((item) => item.title === title)!;
    expect(practice).toBeDefined();
    expect(practice.source).toBe("bible");
    expect(["Patience", "Honesty"]).toContain(practice.category);
    expect(practice.id).not.toBe(previous);
    await expect(card.getByText(practice.plainMeaning, { exact: true })).toBeVisible();
    await expect(card.getByText(practice.everydayExample, { exact: true })).toBeVisible();
    previous = practice.id;
    await card.getByRole("button", { name: "Try another practice" }).click();
  }
  // Changing preferences must discard a random selection from the old collection.
  await page.goto(`${member}/settings/preferences`);
  await page.getByRole("radio", { name: /Book of Mormon Practical teachings/ }).check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.goto(`${member}/dashboard`);
  const title = await card.getByRole("heading", { level: 2 }).first().innerText();
  expect(practices.find((item) => item.title === title)?.source).toBe("book-of-mormon");
  await expect(card.getByRole("button", { name: "Try another practice" })).toBeDisabled();
  // An unavailable topic combination is an honest empty state, never another source.
  await page.goto(`${member}/settings/preferences`);
  await page.getByRole("checkbox", { name: "Patience", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.goto(`${member}/dashboard`);
  await expect(page.getByRole("heading", { name: "No matching practices yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Adjust your preferences" })).toBeVisible();
  await page.goto(`${member}/schedule`);
  await expect(page.getByRole("heading", { name: "No matching reminder example" })).toBeVisible();
  await expect(page.getByText("Mosiah 2:17", { exact: true })).toHaveCount(0);
});
