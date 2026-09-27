import { expect, test } from "@playwright/test";

test("fixture return stays quarantined until inspection and restock approval", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const orderId = "b0000000-0000-4000-8000-000000001401";
  const returnId = "b0000000-0000-4000-8000-000000001402";
  const lineId = "b0000000-0000-4000-8000-000000001403";
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
  let receipt = false,
    inspected = false,
    restocked = false;
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
      case "order.list":
        data = [{ id: orderId, status: "dispatched" }];
        break;
      case "location.list":
        data = [];
        break;
      case "return.list":
        data = receipt
          ? [
              {
                id: returnId,
                order_id: orderId,
                status: restocked
                  ? "closed"
                  : inspected
                    ? "inspected"
                    : "received",
                ops_return_lines: [
                  {
                    id: lineId,
                    status: restocked
                      ? "restocked"
                      : inspected
                        ? "resellable"
                        : "received",
                  },
                ],
              },
            ]
          : [];
        break;
      case "return.detail":
        data = {
          return: {
            id: returnId,
            order_id: orderId,
            status: restocked ? "closed" : inspected ? "inspected" : "received",
          },
          lines: [
            {
              id: lineId,
              item_id: "item-1",
              status: restocked
                ? "restocked"
                : inspected
                  ? "resellable"
                  : "received",
              inspection_note: null,
              ops_items: {
                display_sku: "RETURN-1",
                version: 4,
                custody: restocked ? "on_hand" : "return_quarantine",
              },
            },
          ],
        };
        break;
      case "return.receipt":
        expect(body.payload).toEqual({ orderId, itemCodes: ["RETURN-1"] });
        receipt = true;
        data = { returnId, receivedLines: 1 };
        break;
      case "return.inspect":
        expect(receipt).toBe(true);
        inspected = true;
        data = { returnLineId: lineId, status: "resellable" };
        break;
      case "return.restock":
        expect(inspected).toBe(true);
        restocked = true;
        data = { returnLineId: lineId, status: "restocked" };
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
  await page.goto("/app/returns");
  await page.getByLabel("Dispatched order").selectOption(orderId);
  await page.getByLabel("Exact item code").fill("RETURN-1");
  await page.getByRole("button", { name: "Record receipt" }).click();
  await expect(
    page.getByText("Garment received into quarantine."),
  ).toBeVisible();
  await expect(page.getByText(/Custody: return_quarantine/)).toBeVisible();
  await page.getByLabel("Inspection decision").selectOption("resellable");
  await page.getByRole("button", { name: "Save inspection" }).click();
  await expect(
    page.getByRole("button", { name: "Approve restock" }),
  ).toBeVisible();
  expect(restocked).toBe(false);
  await page.getByRole("button", { name: "Approve restock" }).click();
  await expect(
    page.getByText("Item restocked. Listing needs a fresh review."),
  ).toBeVisible();
  expect(restocked).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
