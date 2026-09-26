import { expect, test } from "@playwright/test";

test("app deep links reload without taking public routes", async ({ page }) => {
  await page.goto("/app/inventory");
  await expect(
    page.getByText("Sign-in is not configured for this environment."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Sign-in is not configured for this environment."),
  ).toBeVisible();

  await page.goto("/fr/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByText("Sign-in is not configured for this environment."),
  ).toHaveCount(0);

  const api = await page.request.get("/api/no-such-ops-route");
  expect(api.status()).toBe(404);
  const unknown = await page.request.get("/no-such-page");
  expect(unknown.status()).toBe(404);
});

test("inventory intake and detail routes survive refresh", async ({ page }) => {
  for (const route of [
    "/app/inventory/new",
    "/app/inventory/item?itemId=c0000000-0000-4000-8000-000000000001",
    "/app/inventory/lot?lotId=c0000000-0000-4000-8000-000000000002",
  ]) {
    await page.goto(route);
    await expect(
      page.getByText("Sign-in is not configured for this environment."),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Sign-in is not configured for this environment."),
    ).toBeVisible();
  }
});
