import { expect, test } from "@playwright/test";

test("fixture phone pick station verifies the exact item without premature mutation", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001",
    orderId = "b0000000-0000-4000-8000-000000001201",
    waveId = "b0000000-0000-4000-8000-000000001202",
    taskId = "b0000000-0000-4000-8000-000000001203",
    claimId = "b0000000-0000-4000-8000-000000001204";
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
  let waveCreated = false,
    claimed = false,
    picked = false;
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
        data = [{ workspaceId, role: "warehouse", name: "Fixture" }];
        break;
      case "order.list":
        data = waveCreated
          ? []
          : [
              {
                id: orderId,
                status: "reserved",
                ops_order_lines: [{ id: "line-1" }],
              },
            ];
        break;
      case "pick.wave.list":
        data = waveCreated
          ? [
              {
                id: waveId,
                mode: "single",
                status: picked ? "completed" : "open",
                created_at: new Date().toISOString(),
              },
            ]
          : [];
        break;
      case "pick.wave.create":
        expect(body.payload).toEqual({ orders: [{ orderId, toteCode: null }] });
        waveCreated = true;
        data = { waveId, mode: "single", taskCount: 1 };
        break;
      case "pick.wave.detail":
        data = {
          wave: {
            id: waveId,
            mode: "single",
            status: picked ? "completed" : "open",
          },
          tasks: [
            {
              id: taskId,
              order_id: orderId,
              tote_code: null,
              status: picked ? "picked" : claimed ? "claimed" : "pending",
              claim_id: claimed && !picked ? claimId : null,
              claim_until: new Date(Date.now() + 300000).toISOString(),
              version: claimed ? 2 : 1,
              ops_items: { display_sku: "SKU-1201" },
              ops_locations: { code: "Rack 2" },
            },
          ],
        };
        break;
      case "pick.task.claim":
        expect(body.payload).toEqual({ taskId });
        claimed = true;
        data = { taskId, claimId, version: 2 };
        break;
      case "pick.task.verify":
        expect(body.payload).toEqual({
          taskId,
          claimId,
          itemCode: "SKU-1201",
          toteCode: null,
        });
        picked = true;
        data = { taskId, status: "picked", orderId };
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
  await page.goto("/app/pick");
  await page.getByLabel(/Order b0000000/).check();
  await page.getByRole("button", { name: "Create wave" }).click();
  await expect(page.getByText("SKU-1201")).toBeVisible();
  expect(claimed).toBe(false);
  await page.getByRole("button", { name: "Claim task" }).click();
  await expect(
    page.getByRole("button", { name: "Continue my claim" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continue my claim" }).click();
  await page.getByLabel("Item code").fill("SKU-1201");
  expect(picked).toBe(false);
  await page.getByRole("button", { name: "Verify pick" }).click();
  await expect(page.getByText("Item verified for this order.")).toBeVisible();
  expect(picked).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
