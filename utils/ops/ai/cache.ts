import { createHash } from "node:crypto";

export function analysisFingerprint(input: {
  workspaceId: string;
  itemId: string;
  orderedAssetHashes: string[];
  captureRevision: number;
  factRevision: number;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  ontologyVersion: string;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function selectAssets<T extends { id: string; position: number }>(
  assets: T[],
) {
  const sorted = [...assets].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  return {
    selected: sorted.slice(0, 8),
    omittedCount: Math.max(0, sorted.length - 8),
  };
}
