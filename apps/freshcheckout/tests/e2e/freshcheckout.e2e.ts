import { expect, test, type Page } from "@playwright/test";

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
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run checkout demo" })).toBeVisible();
  await page.getByRole("button", { name: "Run checkout demo" }).click();

  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo flow complete", { timeout: 15_000 });
  await expect(page.getByText("No Solari cloud execution occurred. This output is not valid verification evidence.")).toBeVisible();
  await expect(page.locator(".stage-item-passed")).toHaveCount(11);
  await expect(page.getByRole("link", { name: /View demo receipt\.json/ })).toBeVisible();
  assertNoErrors();
});

test("surfaces the deterministic failure without claiming live evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await page.getByRole("button", { name: "Failing fixture" }).click();
  await page.getByRole("button", { name: "Run checkout demo" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo found a build failure", { timeout: 15_000 });
  await expect(page.locator(".stage-item-failed")).toHaveCount(1);
  await expect(page.locator(".stage-item-skipped")).toHaveCount(2);
  await expect(page.getByText(/Not valid verification evidence/).first()).toBeVisible();
});

test("keeps the mobile entry flow inside the viewport with usable targets", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-only layout assertion");
  await page.goto("/");
  await page.getByRole("button", { name: "Demo", exact: true }).click();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);

  const heights = await page.locator(".execution-mode button, .scenario-picker button, .url-control button").evaluateAll(
    (elements) => elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(heights.every((height) => height >= 44)).toBe(true);
  await expect(page.getByRole("button", { name: "Run checkout demo" })).toBeInViewport();
});
