import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("billing migration safety", () => {
  it("restricts custom reservation limits and RPC access to paid server flows", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "migrations/2026-08-23_paid_entitlement_reservation.sql",
      ),
      "utf8",
    );

    expect(sql).toContain(
      "profile_row.subscription_status IN ('active', 'trialing', 'past_due', 'canceling')",
    );
    expect(sql).toContain("END;\n$$;\n\nREVOKE ALL");
    expect(sql).toContain("REVOKE ALL ON FUNCTION reserve_generation_request");
    expect(sql).toContain("TO service_role");
  });
});
