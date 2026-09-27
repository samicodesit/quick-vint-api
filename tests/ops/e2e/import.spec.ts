import { expect, test } from "@playwright/test";

test("fixture CSV onboarding previews rows and reports a persisted apply result", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const fileId = "c0000000-0000-4000-8000-000000000501";
  const importId = "c0000000-0000-4000-8000-000000000502";
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
  await page.route("**/api/ops-import", async (route) => {
    const body = route.request().postDataJSON() as { csv: string };
    expect(body.csv).toContain("Jacket");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { fileId, rowCount: 2, headers: ["SKU", "Title"] },
      }),
    });
  });
  await page.route("**/api/ops", async (route) => {
    const { name } = route.request().postDataJSON() as { name: string };
    const preview = {
      importId,
      status: "review",
      rowCount: 2,
      counts: { pending: 2 },
      sample: [
        {
          row_number: 1,
          status: "pending",
          reason: null,
          mapped_values: { sku: "A", title: "Jacket" },
        },
        {
          row_number: 2,
          status: "pending",
          reason: null,
          mapped_values: { sku: "B", title: "Coat" },
        },
      ],
    };
    const complete = {
      ...preview,
      status: "complete",
      counts: { imported: 2 },
      sample: preview.sample.map((row) => ({ ...row, status: "imported" })),
    };
    const data =
      name === "workspace.list"
        ? [{ workspaceId, role: "owner", name: "Fixture" }]
        : name === "import.preview"
          ? preview
          : name === "import.apply"
            ? { remaining: 0, processed: 2, status: "complete" }
            : name === "import.detail"
              ? complete
              : name === "import.export"
                ? "row,status\r\n1,imported\r\n"
                : null;
    if (data === null) throw new Error(`Unexpected fixture operation ${name}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data, requestId: "fixture" }),
    });
  });
  await page.goto("/app/import");
  await page.getByLabel("CSV file").setInputFiles({
    name: "stock.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("SKU,Title\nA,Jacket\nB,Coat\n"),
  });
  await page.getByRole("button", { name: "Save CSV" }).click();
  await expect(page.getByText(/2 rows saved/)).toBeVisible();
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText("Jacket")).toBeVisible();
  await page.getByRole("button", { name: "Apply import" }).click();
  await expect(page.getByText(/2 imported/)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("importId")).toBe(importId);
});
