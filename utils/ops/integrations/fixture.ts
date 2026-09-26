import type { MarketplaceAdapter } from "../../../src/ops/contracts/integrations";
import { unsupportedCapabilities } from "./capabilities";
import { manualAdapter } from "./manual";

// Internal test adapter only. Receipts never assert a real remote listing.
export const fixtureAdapter: MarketplaceAdapter = {
  ...manualAdapter,
  async capabilities() {
    return {
      ...unsupportedCapabilities("Fixture only"),
      publish: {
        supported: true,
        verifiedAt: null,
        reason: "Fixture only, no marketplace action",
      },
    };
  },
  async publish(_ctx, item) {
    return {
      ok: true,
      value: {
        state: "pending_confirmation",
        externalListingId: null,
        providerRequestId: `fixture:${item.reference}`,
      },
    };
  },
  async reconcilePublication() {
    return {
      ok: true,
      value: {
        state: "pending_confirmation",
        externalListingId: null,
        providerRequestId: null,
      },
    };
  },
};
