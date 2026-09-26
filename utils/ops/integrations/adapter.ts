import type {
  MarketplaceAdapter,
  ProviderMode,
} from "../../../src/ops/contracts/integrations";
import { fixtureAdapter } from "./fixture";
import { manualAdapter } from "./manual";

export function createAdapter(
  mode: ProviderMode,
  environment: string,
): MarketplaceAdapter {
  if (mode === "fixture") {
    if (environment !== "local" && environment !== "test")
      throw new Error(
        "Fixture adapter is disabled outside local/test environments",
      );
    return fixtureAdapter;
  }
  // Account-scoped official credentials and capability proof are not configured.
  // The official client is only constructed by createVintedOfficialAdapter with
  // explicit server-side dependencies after those gates are met.
  return manualAdapter;
}
