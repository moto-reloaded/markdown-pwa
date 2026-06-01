import { expect, test } from "@playwright/test";

test("loads README and compact two-row toolbar", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#documentTitle")).toHaveValue("README.md");
  await expect(page.locator("#editor")).toHaveValue(/## 入手先/);
  await expect(page.locator("#helpButton")).toHaveAttribute("aria-label", "README を開く");
  await expect(page.locator("#versionLabel")).toHaveText("v1.0.5");
  await expect(page.locator(".brand")).toContainText("Version v1.0.5");
  await expect(page.locator("#speechPanel")).toBeHidden();

  const toolbarBox = await page.locator(".format-toolbar").boundingBox();
  const firstButtonBox = await page.locator(".format-button").first().boundingBox();

  expect(toolbarBox.height).toBeLessThanOrEqual(88);
  expect(firstButtonBox.height).toBeLessThanOrEqual(34);
  await expect(page.locator(".copyright")).toHaveText("(C) VISIONAX LLC");
});

test("format buttons switch output by profile and note math preview renders", async ({ page }) => {
  await page.goto("/");
  await page.locator("#editor").fill("本文");
  await page.locator("#editor").selectText();
  await page.locator('[data-command="bold"]').click();
  await expect(page.locator("#editor")).toHaveValue("**本文**");

  await page.locator("#editor").fill("本文");
  await page.locator("#editor").selectText();
  await page.locator("#markdownProfile").selectOption("note");
  await page.locator('[data-command="bold"]').click();
  await expect(page.locator("#editor")).toHaveValue("__本文__");

  await page.locator('[data-command="math-inline"]').click();
  await expect(page.locator("#preview .math-inline")).toHaveCount(1);
});

test("mobile layout starts in edit mode with fixed view switch", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator("#workspace")).toHaveClass(/edit-mode/);
  await expect(page.locator(".preview-pane")).toBeHidden();

  const switchBox = await page.locator(".view-switch").boundingBox();
  expect(switchBox.y).toBeGreaterThan(760);

  const toolbarBox = await page.locator(".format-toolbar").boundingBox();
  const toolbarOverflow = await page.locator(".format-toolbar").evaluate((node) => node.scrollWidth > node.clientWidth);
  expect(toolbarBox.height).toBeLessThanOrEqual(52);
  expect(toolbarOverflow).toBe(true);
});

test("speech button focuses editor and explains OS dictation", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#speechToggleButton")).toBeVisible();

  await page.locator("#editor").fill("# Voice\n\n");
  await page.locator("#editor").focus();
  await page.locator("#editor").evaluate((node) => {
    node.selectionStart = node.value.length;
    node.selectionEnd = node.value.length;
  });

  await page.locator("#speechToggleButton").click();
  await expect(page.locator("#speechPanel")).toBeVisible();
  await expect(page.locator("#editor")).toBeFocused();
  await expect(page.locator("#editor")).toHaveValue("# Voice\n\n");
  await expect(page.locator("#speechStatus")).toHaveText("編集欄にフォーカスしました");
  await expect(page.locator("#speechHint")).toContainText("Win + H");
});
