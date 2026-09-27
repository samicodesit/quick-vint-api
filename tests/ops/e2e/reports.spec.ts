import { expect, test } from "@playwright/test";

test("fixture report displays exact contribution and matching export", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const orderId = "b0000000-0000-4000-8000-000000001601";
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
    const body = route.request().postDataJSON() as { name: string };
    let data: unknown;
    switch (body.name) {
      case "workspace.list":
        data = [{ workspaceId, role: "manager", name: "Fixture" }];
        break;
      case "report.build":
        data = {
          from: "2026-09-01",
          to: "2026-09-30",
          allocationRule: "Equal allocation when line revenue is unknown.",
          currencies: {
            EUR: {
              revenueMinor: 6000,
              contributionMinor: 4400,
              completeOrders: 1,
              incompleteOrders: 0,
              distinctItems: 1,
            },
          },
          rows: [
            {
              orderId,
              createdAt: "2026-09-26T00:00:00Z",
              orderStatus: "dispatched",
              status: "complete",
              reason: null,
              currency: "EUR",
              revenueMinor: 6000,
              acquisitionMinor: 1200,
              costsMinor: 400,
              contributionMinor: 4400,
              allocation: [{ basis: "equal_allocation" }],
            },
          ],
        };
        break;
      case "report.export":
        data = {
          csv: `order_id,created_at,status,currency,seller_revenue_minor,acquisition_minor,costs_and_refunds_minor,contribution_minor,coverage,revenue_basis\n"${orderId}","2026-09-26T00:00:00Z","dispatched","EUR","6000","1200","400","4400","complete","equal_allocation"\n`,
        };
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
  await page.goto("/app/reports");
  await page.getByLabel("From").fill("2026-09-01");
  await page.getByLabel("To").fill("2026-09-30");
  await page.getByRole("button", { name: "Build report" }).click();
  await expect(page.getByText("Known contribution: 44.00.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download matching CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "autolister-contribution-2026-09-01-2026-09-30.csv",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
