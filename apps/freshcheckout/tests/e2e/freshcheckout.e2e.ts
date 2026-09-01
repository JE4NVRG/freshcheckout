import { expect, test, type Page } from "@playwright/test";

import { receiptSchema } from "../../src/core/model.js";

function expectNoPageErrors(page: Page): () => void {
  const errors: string[] = [];
  const handler = (error: Error): void => {
    errors.push(error.message);
  };
  page.on("pageerror", handler);
  return () => {
    page.off("pageerror", handler);
    expect(errors).toEqual([]);
  };
}

test("creates an honest passing demo receipt", async ({ page }) => {
  const assertNoErrors = expectNoPageErrors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("FreshCheckout tests the first run");
  await expect(page.getByRole("link", { name: "View verified repository-backed run ↗" })).toBeVisible();
  await expect(page.getByText("Uses a bundled fixture. No repository, Sandbox, Browser session, or verification evidence is created.")).toBeVisible();
  await expect(page.getByText("No run yet")).toBeVisible();
  await expect(page.getByText("No repository, commit, Browser result, or evidence exists yet.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /Repository/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run built-in fixture" })).toBeVisible();
  await page.getByRole("button", { name: "Run built-in fixture" }).click();

  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo fixture passed", { timeout: 15_000 });
  await expect(page.getByText("Built-in fixture · no repository fetched")).toBeVisible();
  await expect(page.getByText("Not resolved")).toBeVisible();
  await expect(page.getByText("No Solari cloud execution occurred. This output is not valid verification evidence.")).toBeVisible();
  await expect(page.locator(".stage-item-passed")).toHaveCount(11);
  const badgeFontSize = await page.locator(".mode-badge").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(badgeFontSize).toBeGreaterThanOrEqual(12);
  await expect(page.getByRole("link", { name: /View demo receipt\.json/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Run another checkout" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Compare with real Solari proof/ })).toBeVisible();
  assertNoErrors();
});

test("surfaces the deterministic failure without claiming live evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Simulate failure" }).click();
  await page.getByRole("button", { name: "Run built-in fixture" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Built-in failing fixture failed", { timeout: 15_000 });
  await expect(page.locator(".run-state-failed")).toHaveText("failed");
  await expect(page.getByText("1 failed · 2 skipped")).toBeVisible();
  await expect(page.locator(".stage-item-failed")).toHaveCount(1);
  await expect(page.locator(".stage-item-skipped")).toHaveCount(2);
  await expect(page.getByText("Built-in failing fixture: the declared build step returned exit code 1.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Not valid verification evidence/).first()).toBeVisible();

  const json = await page.getByRole("link", { name: /View demo receipt\.json/ }).getAttribute("href");
  const body = receiptSchema.parse(await page.request.get(json ?? "").then((response) => response.json()));
  expect(body.status).toBe("failed");
  expect(body.verdict).toBe("failed");
  expect(body.source.kind).toBe("fixture");
  expect(body.source.commitSha).toBeUndefined();
});

test("exposes social metadata and keyboard-first navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://freshcheckout.je4ndev.com/og-freshcheckout.png",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("keeps operator-only live execution out of the browser UI", async ({ page }) => {
  let healthRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/health") healthRequests += 1;
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("button", { name: "Run built-in fixture" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Live repository run" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /Repository/ })).toHaveCount(0);
  expect(healthRequests).toBe(0);
});

test("keeps the mobile entry flow inside the viewport with usable targets", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only layout assertion");
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);

  const heights = await page.locator(".execution-mode button, .scenario-picker button, .url-control button").evaluateAll(
    (elements) => elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(heights.every((height) => height >= 44)).toBe(true);
  await expect(page.getByRole("button", { name: "Run built-in fixture" })).toBeInViewport();
});
