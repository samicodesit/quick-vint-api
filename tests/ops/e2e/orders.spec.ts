import { expect, test } from "@playwright/test";

test("fixture manual sale scans a physical item before reservation", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const itemId = "b0000000-0000-4000-8000-000000001101";
  const orderId = "b0000000-0000-4000-8000-000000001102";
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
  const orders: Array<Record<string, unknown>> = [];
  await page.setViewportSize({width:390,height:844});
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
        data = [{ workspaceId, role: "owner", name: "Fixture" }];
        break;
      case "order.list":
        data = orders;
        break;
      case "scan.resolve":
        expect(body.payload.code).toBe("SKU-1101");
        data = {
          kind: "item",
          items: [{ itemId, displaySku: "SKU-1101" }],
          locations: [],
        };
        break;
      case "order.manual.create":
        expect(body.payload).toMatchObject({
          paidConfirmed: true,
          currency: "EUR",
          sellerTotalMinor: 6000,
          lines: [{ itemId, title: "Blue jacket" }],
        });
        orders.push({
          id: orderId,
          source: "manual",
          status: "confirmed",
          version: 1,
          currency: "EUR",
          seller_total_minor: 6000,
          created_at: new Date().toISOString(),
          ops_order_lines: [
            {
              id: "line-1",
              item_id: itemId,
              item_code_snapshot: "SKU-1101",
              title_snapshot: "Blue jacket",
            },
          ],
        });
        data = { orderId, status: "confirmed" };
        break;
      case "order.reserve":
        expect(body.payload).toEqual({ orderId });
        orders[0].status = "reserved";
        orders[0].version = 2;
        data = { orderId, status: "reserved", lineCount: 1, version: 2 };
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
  await page.goto("/app/orders");
  await page.getByLabel("Item SKU or barcode").fill("SKU-1101");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("SKU-1101 title").fill("Blue jacket");
  await page.getByLabel("Seller total, if known").fill("60.00");
  await page.getByLabel("Payment personally confirmed").check();
  await page.getByRole("button", { name: "Save manual order" }).click();
  await expect(page.getByText("confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reserve all items" }).click();
  await expect(page.getByText("reserved", { exact: true })).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
