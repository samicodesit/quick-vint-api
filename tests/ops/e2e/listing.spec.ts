import { expect, test } from "@playwright/test";

test("fixture review requires a human fact step before a listing revision is approved", async ({
  page,
}) => {
  const workspaceId = "c0000000-0000-4000-8000-000000000001";
  const itemId = "b0000000-0000-4000-8000-000000000801";
  const listingId = "b0000000-0000-4000-8000-000000000802";
  const revisionId = "b0000000-0000-4000-8000-000000000803";
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
  let facts: Record<string, unknown> | null = null;
  let listing: {
    id: string;
    status: string;
    version: number;
    current_revision_id: string;
    approved_revision_id: string | null;
  } | null = null;
  let revision: Record<string, unknown> | null = null;
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
    const body = route.request().postDataJSON() as {
      name: string;
      payload: Record<string, unknown>;
    };
    let data: unknown;
    switch (body.name) {
      case "workspace.list":
        data = [{ workspaceId, role: "owner", name: "Fixture" }];
        break;
      case "listing.detail":
        data = {
          item: { id: itemId, display_sku: "SKU-1", capture_revision: 2 },
          facts: facts && { revision: 1, values: facts },
          listing,
          revisions: revision ? [revision] : [],
          media: [
            {
              id: "a0000000-0000-4000-8000-000000000801",
              position: 0,
              url: null,
            },
          ],
          analysis: [],
          proposals: [
            {
              id: "a0000000-0000-4000-8000-000000000802",
              field_name: "size",
              value_text: "W30",
              reason: "visible",
              label_text: "W30",
              ops_analysis_evidence: [],
            },
          ],
        };
        break;
      case "facts.confirm":
        facts = body.payload.values as Record<string, unknown>;
        data = { factRevision: 1 };
        break;
      case "listing.save":
        expect(facts).not.toBeNull();
        expect(body.payload).toMatchObject({
          expectedFactRevision: 1,
          priceMinor: 2499,
        });
        listing = {
          id: listingId,
          status: "draft",
          version: 1,
          current_revision_id: revisionId,
          approved_revision_id: null,
        };
        revision = {
          id: revisionId,
          title: "Levi's jeans W30",
          description: "Confirmed details",
          price_minor: 2499,
          currency: "EUR",
          human_description_override: null,
          approved_at: null,
        };
        data = { listingId, revisionId, version: 1 };
        break;
      case "listing.approve":
        expect(body.payload).toMatchObject({
          listingId,
          revisionId,
          expectedListingVersion: 1,
        });
        listing = {
          ...listing!,
          status: "ready",
          version: 2,
          approved_revision_id: revisionId,
        };
        data = { listingId, revisionId, status: "ready", version: 2 };
        break;
      case "handoff.packet":
        expect(body.payload).toEqual({ itemId, listingId, revisionId });
        data = {
          protocolVersion: 1,
          workspaceId,
          itemId,
          listingId,
          revisionId,
          reference: "SKU-1",
          title: "Levi's jeans W30",
          description: "Confirmed details",
          price: { minor: 2499, currency: "EUR" },
          photos: [],
          state: "prepared",
        };
        break;
      case "handoff.ack":
        expect(body.payload).toMatchObject({
          itemId,
          listingId,
          revisionId,
          state: "prepared",
          channel: "manual",
        });
        data = { state: "prepared", marketplaceStatus: "unverified" };
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
  await page.goto(`/app/listings/review?itemId=${itemId}`);
  await expect(page.getByText("Suggestions, unconfirmed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await page.getByRole("button", { name: "Use suggestion in form" }).click();
  await page.getByLabel("brand", { exact: true }).fill("Levi's");
  await page.getByLabel("Category").selectOption("jeans");
  await page.getByLabel("Condition").selectOption("good");
  await page.getByRole("button", { name: "Confirm facts" }).click();
  await expect(page.getByText("Facts confirmed.")).toBeVisible();
  await page.getByLabel("Price").fill("24.99");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Draft saved. Review the exact revision before approval."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve this revision" }).click();
  await expect(page.getByText(/Listing: ready/)).toBeVisible();
  await expect(page.getByText("Listing approved for handoff.")).toBeVisible();
  await page.getByRole("button", { name: "Prepare handoff" }).click();
  await expect(
    page.getByText("Handoff state: prepared. Marketplace status: unverified."),
  ).toBeVisible();
  await expect(page.getByText(/Listing: ready/)).toBeVisible();
  await page.screenshot({
    path: "test-results/ops-listing-review-fixture.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Confirm item facts" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/ops-listing-review-mobile-fixture.png",
    fullPage: true,
  });
});
