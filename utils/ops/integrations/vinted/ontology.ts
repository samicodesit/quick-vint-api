import { createHash } from "node:crypto";
import type { VintedClient } from "./client";

export type OntologySnapshot = {
  version: string;
  hash: string;
  payload: Record<string, unknown>;
};

export async function fetchOntology(
  client: VintedClient,
): Promise<OntologySnapshot> {
  const response = await client.request("GET", "/api/v1/ontologies");
  if (
    response.status !== 200 ||
    !response.data ||
    typeof response.data !== "object"
  )
    throw new Error(`Vinted ontology unavailable (${response.status})`);
  const payload = response.data as Record<string, unknown>;
  if (typeof payload.version !== "string" || !payload.enumerations)
    throw new Error("Vinted ontology response is incomplete");
  return {
    version: payload.version,
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    payload,
  };
}

export function assertOntologyVersion(
  approvedVersion: string,
  current: OntologySnapshot,
): void {
  if (approvedVersion !== current.version)
    throw new Error("Vinted ontology changed since listing approval");
}
