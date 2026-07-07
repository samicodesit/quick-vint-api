import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCustomerUsageToken,
  createCustomerUsageUrl,
  verifyCustomerUsageToken,
} from "../../../utils/customerUsageToken";

describe("customer usage tokens", () => {
  beforeEach(() => {
    process.env.CUSTOMER_USAGE_TOKEN_SECRET = "usage-secret";
  });

  afterEach(() => {
    delete process.env.CUSTOMER_USAGE_TOKEN_SECRET;
  });

  it("creates and verifies a normalized email usage token", () => {
    const token = createCustomerUsageToken({
      email: " Seller@Example.com ",
      expiresAt: "2099-01-01T00:00:00.000Z",
      issuedAt: "2026-07-07T12:00:00.000Z",
    });

    expect(verifyCustomerUsageToken(token)).toMatchObject({
      email: "seller@example.com",
      expiresAt: "2099-01-01T00:00:00.000Z",
      source: "customer_usage_link",
    });
  });

  it("rejects tampered usage tokens", () => {
    const token = createCustomerUsageToken({
      email: "seller@example.com",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    expect(() => verifyCustomerUsageToken(`${token}x`)).toThrow(
      "Invalid usage token signature",
    );
  });

  it("creates a customer usage URL", () => {
    const url = createCustomerUsageUrl(
      {
        email: "seller@example.com",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      "https://autolister.test",
    );

    expect(url).toMatch(/^https:\/\/autolister\.test\/customer-usage\?token=/);
  });
});
