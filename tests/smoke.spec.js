import { expect, test } from "@playwright/test";

test("loads README and compact two-row toolbar", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#documentTitle")).toHaveValue("README.md");
  await expect(page.locator("#editor")).toHaveValue(/## 入手先/);
  await expect(page.locator("#helpButton")).toHaveAttribute("aria-label", "README を開く");

  const toolbarBox = await page.locator(".format-toolbar").boundingBox();
  const firstButtonBox = await page.locator(".format-button").first().boundingBox();

  expect(toolbarBox.height).toBeLessThanOrEqual(78);
  expect(firstButtonBox.height).toBeLessThanOrEqual(32);
  await expect(page.locator(".copyright")).toHaveText("(C) VISIONAX LLC");
});

test("format buttons insert markdown and note math preview renders", async ({ page }) => {
  await page.goto("/");
  await page.locator("#editor").fill("本文");
  await page.locator("#editor").selectText();
  await page.locator('[data-command="bold"]').click();
  await expect(page.locator("#editor")).toHaveValue("**本文**");

  await page.locator('[data-note-command="note-math-inline"]').click();
  await expect(page.locator("#preview .math-inline")).toHaveCount(1);
});
