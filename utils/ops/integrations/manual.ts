import type {
  AdapterResult,
  MarketplaceAdapter,
} from "../../../src/ops/contracts/integrations";
import { unsupportedCapabilities } from "./capabilities";

const unsupported = <T>(): AdapterResult<T> => ({
  ok: false,
  code: "UNSUPPORTED",
  message:
    "This action requires a verified marketplace connection or manual seller action",
});

export const manualAdapter: MarketplaceAdapter = {
  async capabilities() {
    return unsupportedCapabilities("Manual seller action required");
  },
  async publish() {
    return unsupported();
  },
  async listOrders() {
    return unsupported();
  },
  async getOrder() {
    return unsupported();
  },
  async getLabel() {
    return unsupported();
  },
  async reconcilePublication() {
    return unsupported();
  },
};
