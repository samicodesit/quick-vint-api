import { describe, expect, it } from "vitest";
import { validateProposals } from "../../../src/ops/contracts/extraction";
import { analysisFingerprint, selectAssets } from "../../../utils/ops/ai/cache";
import { extractionPrompt } from "../../../utils/ops/ai/prompt";
import {
  estimateCostMinor,
  maxReservationMinor,
} from "../../../utils/ops/ai/usage";
import { runtimeConfig } from "../../../utils/ops/ai/extract";

const assetId = "11111111-1111-4111-8111-111111111111";
const base = {
  field: "size",
  valueText: null,
  valueNumber: null,
  valueUnit: null,
  reason: "unreadable",
  evidenceAssetIds: [assetId],
  labelText: null,
  crop: null,
};

describe("bounded garment extraction", () => {
  it("keeps unreadable size null and rejects invented or foreign claims", () => {
    expect(
      validateProposals(
        { proposals: [base] },
        { selectedAssetIds: [assetId] },
      )[0].valueText,
    ).toBeNull();
    expect(() =>
      validateProposals(
        { proposals: [{ ...base, valueText: "M" }] },
        { selectedAssetIds: [assetId] },
      ),
    ).toThrow();
    expect(() =>
      validateProposals({ proposals: [base] }, { selectedAssetIds: [] }),
    ).toThrow("Foreign evidence");
    expect(() =>
      validateProposals(
        { proposals: [{ ...base, field: "authenticity" }] },
        { selectedAssetIds: [assetId] },
      ),
    ).toThrow();
    expect(() =>
      validateProposals(
        {
          proposals: [
            {
              ...base,
              field: "category",
              reason: "visible",
              valueText: "hoodie-ish",
            },
          ],
        },
        { selectedAssetIds: [assetId] },
      ),
    ).toThrow("Invalid category");
    expect(() =>
      validateProposals(
        {
          proposals: [
            { ...base, crop: { x: 0.9, y: 0, width: 0.2, height: 0.5 } },
          ],
        },
        { selectedAssetIds: [assetId] },
      ),
    ).toThrow();
    expect(() =>
      validateProposals(
        { proposals: [{ ...base, publishNow: true }] },
        { selectedAssetIds: [assetId] },
      ),
    ).toThrow();
  });

  it("keeps image instructions as untrusted data and never exposes mutation tools", () => {
    const prompt = extractionPrompt([assetId]);
    expect(prompt).toContain("untrusted evidence");
    expect(prompt).toContain(assetId);
    expect(prompt).not.toContain("buyer address");
  });

  it("selects at most eight ordered derivatives and fingerprints physical identity", () => {
    const { selected, omittedCount } = selectAssets(
      Array.from({ length: 10 }, (_, position) => ({
        id: `asset-${position}`,
        position: 10 - position,
      })),
    );
    expect(selected).toHaveLength(8);
    expect(omittedCount).toBe(2);
    const input = {
      workspaceId: "w",
      itemId: "i",
      orderedAssetHashes: ["a", "b"],
      captureRevision: 2,
      factRevision: 0,
      model: "configured",
      promptVersion: "1",
      schemaVersion: "1",
      ontologyVersion: "1",
    };
    expect(analysisFingerprint(input)).toBe(analysisFingerprint({ ...input }));
    expect(analysisFingerprint(input)).not.toBe(
      analysisFingerprint({ ...input, itemId: "other" }),
    );
    expect(analysisFingerprint(input)).not.toBe(
      analysisFingerprint({ ...input, orderedAssetHashes: ["b", "a"] }),
    );
  });

  it("requires explicit runtime rates and a nonzero reservation", () => {
    expect(runtimeConfig({})).toBeNull();
    expect(() => runtimeConfig({ OPS_AI_ENABLED: "true" })).toThrow();
    expect(
      estimateCostMinor(
        { latencyMs: 1 },
        { inputPerMillionMinor: 100, outputPerMillionMinor: 100 },
      ),
    ).toBeNull();
    expect(
      maxReservationMinor({
        maxInputTokens: 1000,
        maxOutputTokens: 1000,
        rates: { inputPerMillionMinor: 100, outputPerMillionMinor: 100 },
      }),
    ).toBe(1);
    expect(() =>
      maxReservationMinor({
        maxInputTokens: 1,
        maxOutputTokens: 1,
        rates: { inputPerMillionMinor: 0, outputPerMillionMinor: 0 },
      }),
    ).toThrow();
  });
});
