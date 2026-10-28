import { createHash } from "node:crypto";

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

// JSONB does not preserve key order. Hash the same JSON representation on replay.
export function billingEvidenceHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value)))))
    .digest("hex");
}
