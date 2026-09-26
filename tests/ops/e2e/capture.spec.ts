import { expect, test } from "@playwright/test";

test("fixture capture visibly keeps offline photos local to their item", async ({
  page,
  context,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const itemId = "c0000000-0000-4000-8000-000000000002";
  const sessionId = "c0000000-0000-4000-8000-000000000003";
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
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(user),
    }),
  );
  await page.route("**/api/ops", async (route) => {
    const { name } = route.request().postDataJSON() as { name: string };
    const data =
      name === "workspace.list"
        ? [{ workspaceId, role: "owner", name: "Fixture" }]
        : name === "capture.create"
          ? { sessionId, itemId }
          : name === "media.list"
            ? []
            : null;
    if (data === null) throw new Error(`Unexpected fixture operation ${name}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data, requestId: "fixture" }),
    });
  });
  await page.goto(`/app/capture?itemId=${itemId}`);
  await page
    .getByRole("button", { name: "Start capture for this item" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Photos for this item" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page
    .getByLabel("Add photos")
    .setInputFiles({
      name: "jacket.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
  await expect(
    page.getByRole("heading", { name: "On this device, not yet server-saved" }),
  ).toBeVisible();
  await expect(
    page.getByText(/jacket.jpg: Waiting for connection/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish capture" }).click();
  await expect(
    page.getByText("Queue offline photos before finishing this session."),
  ).toBeVisible();
  await context.setOffline(false);
});
