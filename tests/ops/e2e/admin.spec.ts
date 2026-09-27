import { expect, test } from "@playwright/test";
const workspaceId = "c0000000-0000-4000-8000-000000000001";
const user = {
  id: "a0000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
};
test("fixture owner creates a short-lived invite and sees operational settings", async ({
  page,
}) => {
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
  let invited = false;
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
      case "admin.overview":
        data = {
          members: [{ user_id: user.id, role: "owner", active: true }],
          invitations: invited
            ? [
                {
                  id: "b0000000-0000-4000-8000-000000001701",
                  email: "new@example.test",
                  role: "warehouse",
                  accepted_at: null,
                  revoked_at: null,
                  expires_at: "2026-09-29T00:00:00Z",
                },
              ]
            : [],
          settings: {
            ai_monthly_budget_minor: 0,
            ai_currency: "EUR",
            media_retention_days: 365,
          },
          credentials: [],
          deletionRequests: [],
        };
        break;
      case "invite.create":
        expect(body.payload).toEqual({
          email: "new@example.test",
          role: "warehouse",
        });
        invited = true;
        data = {
          inviteId: "b0000000-0000-4000-8000-000000001701",
          token: "a".repeat(64),
          expiresInHours: 48,
          emailSent: false,
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
  await page.goto("/app/settings");
  await page.getByLabel("Email").fill("new@example.test");
  await page.getByRole("button", { name: "Create invite link" }).click();
  await expect(
    page.getByText(/Share this link with the named teammate/),
  ).toBeVisible();
  await expect(page.getByText(/No email is sent automatically/)).toBeVisible();
  expect(invited).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
