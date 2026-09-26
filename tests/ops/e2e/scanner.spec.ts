import { expect, test } from "@playwright/test";

test("fixture scanner stays read only globally and moves only in put-away station", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const itemId = "c0000000-0000-4000-8000-000000000002";
  const locationId = "c0000000-0000-4000-8000-000000000003";
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
  await page.addInitScript((fixtureUser) => {
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
    );
  }, user);
  await page.route("**/auth/v1/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(user),
    });
  });
  let moves = 0;
  await page.route("**/api/ops", async (route) => {
    const request = route.request().postDataJSON() as {
      name: string;
      payload: Record<string, unknown>;
    };
    let data: unknown;
    switch (request.name) {
      case "workspace.list":
        data = [{ workspaceId, role: "warehouse", name: "Fixture workspace" }];
        break;
      case "inventory.list":
        data = { items: [], nextCursor: null };
        break;
      case "location.list":
        data = [
          {
            id: locationId,
            code: "B12",
            name: "Box 12",
            parentId: null,
            version: 1,
          },
        ];
        break;
      case "scan.resolve":
        data =
          request.payload.code === "B12"
            ? {
                kind: "location",
                items: [],
                locations: [{ locationId, code: "B12" }],
              }
            : {
                kind: "item",
                items: [{ itemId, displaySku: "SCAN-ONE" }],
                locations: [],
              };
        break;
      case "item.detail":
        data = {
          id: itemId,
          display_sku: "SCAN-ONE",
          custody: "on_hand",
          preparation: "draft",
          location_id: null,
          version: 1,
          ops_item_identifiers: [],
        };
        break;
      case "item.move":
        moves += 1;
        data = { itemId, locationId, version: 2 };
        break;
      default:
        throw new Error(`Unexpected fixture operation: ${request.name}`);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data, requestId: "fixture" }),
    });
  });

  await page.goto("/app/inventory");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await page.getByLabel("Item or location code").fill("B12");
  await page.getByLabel("Item or location code").press("Enter");
  await expect(page.getByText(/Location B12 found/)).toBeVisible();
  expect(moves).toBe(0);
  await page.getByLabel("Filter name").fill("All stock");
  await page.getByRole("button", { name: "Save current filter" }).click();
  await page.reload();
  await expect(page.getByRole("link", { name: "All stock" })).toBeVisible();
  await page.goto("/app/inventory/put-away?locationId=" + locationId);
  await expect(
    page.getByRole("heading", { name: "Put away: B12" }),
  ).toBeVisible();
  await page.getByLabel("Item or location code").fill("SCAN-ONE");
  await page.getByRole("button", { name: "Look up code" }).click();
  await expect(page.getByText(/SCAN-ONE is in B12/)).toBeVisible();
  expect(moves).toBe(1);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Put away: B12" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
