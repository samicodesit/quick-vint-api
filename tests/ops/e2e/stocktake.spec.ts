import { expect, test } from "@playwright/test";

test("fixture count station records scans and requires manager review", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const locationId = "b0000000-0000-4000-8000-000000001501";
  const takeId = "b0000000-0000-4000-8000-000000001502";
  const itemId = "b0000000-0000-4000-8000-000000001503";
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
  let started = false,
    scanned = false,
    resolved = false;
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
    const body = route.request().postDataJSON() as {
      name: string;
      payload: Record<string, unknown>;
    };
    let data: unknown;
    switch (body.name) {
      case "workspace.list":
        data = [{ workspaceId, role: "manager", name: "Fixture" }];
        break;
      case "location.list":
        data = [{ id: locationId, code: "A-1" }];
        break;
      case "stocktake.list":
        data = started
          ? [
              {
                id: takeId,
                location_id: locationId,
                status: "open",
                ops_locations: { code: "A-1" },
              },
            ]
          : [];
        break;
      case "stocktake.start":
        started = true;
        data = { stocktakeId: takeId, expectedCount: 1 };
        break;
      case "stocktake.compare":
        data = {
          stocktakeId: takeId,
          rows: [
            {
              itemId,
              code: "COUNT-1",
              classification: resolved
                ? "resolved"
                : scanned
                  ? "matched"
                  : "missing",
              currentVersion: 2,
            },
          ],
        };
        break;
      case "stocktake.observe":
        expect(body.payload.itemCode).toBe("COUNT-1");
        scanned = true;
        data = { stocktakeId: takeId, itemId };
        break;
      case "stocktake.resolve":
        resolved = true;
        data = { stocktakeId: takeId, itemId };
        break;
      default:
        throw new Error(`Unexpected fixture operation ${body.name}`);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data, requestId: "fixture" }),
    });
  });
  await page.goto("/app/stocktake");
  await page.getByLabel("Location").selectOption(locationId);
  await page.getByRole("button", { name: "Start count" }).click();
  await expect(page.getByText("COUNT-1: missing")).toBeVisible();
  await page.getByLabel("Scan item code").fill("COUNT-1");
  await page.getByRole("button", { name: "Record scan" }).click();
  await expect(page.getByText("COUNT-1: matched")).toBeVisible();
  expect(resolved).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
