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
  // Official and assisted methods remain unsupported until account-specific verification.
  return manualAdapter;
}
