import type {
  Capability,
  CapabilityName,
} from "../../../src/ops/contracts/integrations";

export function unsupportedCapabilities(
  reason = "No verified provider access",
): Record<CapabilityName, Capability> {
  const unavailable: Capability = {
    supported: false,
    verifiedAt: null,
    reason,
  };
  return {
    prepareListing: unavailable,
    publish: unavailable,
    readItems: unavailable,
    readOrders: unavailable,
    labels: unavailable,
    withdraw: unavailable,
  };
}
