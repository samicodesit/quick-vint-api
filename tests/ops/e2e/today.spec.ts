import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("fixture Today orders dated work and shows real queue links on a phone", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const orderId = "b0000000-0000-4000-8000-000000001801";
  const itemId = "b0000000-0000-4000-8000-000000001802";
  const user = {
    id: "a0000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-09-26T00:00:00Z",
    updated_at: "2026-09-26T00:00:00Z",
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(
    (fixtureUser) =>
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: "fixture.token.value",
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: fixtureUser,
        }),
      ),
    user,
  );
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(user),
    }),
  );
  await page.route("**/api/ops", async (route) => {
    const request = route.request().postDataJSON() as { name: string };
    const data =
      request.name === "workspace.list"
        ? [{ workspaceId, role: "manager", name: "Fixture" }]
        : request.name === "today.summary"
          ? {
              orders: [
                {
                  id: orderId,
                  status: "confirmed",
                  created_at: "2026-09-26T00:00:00Z",
                  ship_by_at: "2026-10-01T12:00:00Z",
                },
              ],
              listings: [
                {
                  item_id: itemId,
                  status: "draft",
                  ops_items: {
                    display_sku: "COAT-1",
                    catalog_title: "Blue coat",
                  },
                },
              ],
              captures: [
                {
                  item_id: itemId,
                  ops_items: {
                    display_sku: "COAT-1",
                    catalog_title: "Blue coat",
                  },
                },
              ],
              problems: 2,
              connection: null,
            }
          : request.name === "inventory.list"
            ? {
                items: [
                  {
                    id: itemId,
                    displaySku: "COAT-1",
                    shortTitle: "Blue coat",
                    thumbnailUrl:
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect width='56' height='56' fill='%2317644c'/%3E%3C/svg%3E",
                    custody: "on_hand",
                    preparation: "ready",
                    locationCode: "B12",
                    version: 2,
                  },
                ],
                nextCursor: null,
              }
            : (() => {
                throw new Error(`Unexpected fixture operation ${request.name}`);
              })();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data, requestId: "fixture" }),
    });
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Problems needing attention: 2")).toBeVisible();
  await expect(page.getByText("Ship by")).toBeVisible();
  await expect(
    page.getByText("No official order connection has been verified."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Blue coat", exact: true }),
  ).toHaveAttribute("href", `/app/listings/review?itemId=${itemId}`);
  await expect(
    page.getByRole("link", { name: "Continue Blue coat" }),
  ).toHaveAttribute("href", `/app/capture?itemId=${itemId}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  mkdirSync("docs/ops/screenshots", { recursive: true });
  await page.addStyleTag({
    content: "astro-dev-toolbar { display: none !important; }",
  });
  await page.screenshot({
    path: "docs/ops/screenshots/today-mobile-fixture.png",
    fullPage: true,
  });
  await page.goto("/app/inventory");
  await expect(page.getByRole("link", { name: "Blue coat" })).toBeVisible();
  await expect(page.getByText("COAT-1")).toBeVisible();
  await expect(page.locator(".ops-inventory-identity img")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.addStyleTag({
    content: "astro-dev-toolbar { display: none !important; }",
  });
  await page.screenshot({
    path: "docs/ops/screenshots/inventory-mobile-fixture.png",
    fullPage: true,
  });
});
