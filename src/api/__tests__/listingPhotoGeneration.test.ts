import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parsePhotoPlan,
  photoPrompt,
  rearPosePrompt,
  photoCost,
  editListingPhoto,
  checkListingPhoto,
  sourceFingerprint,
  classifyListingPhotos,
} from "../../../utils/listingPhotoGeneration";
afterEach(() => vi.unstubAllGlobals());
const plan = {
  eligible: true,
  category: "top",
  frontIndex: 0,
  backIndex: -1,
  detailIndex: 1,
};
describe("listing photo recipes", () => {
  it("rejects a visible product mismatch even when anatomy passes", async () => {
    process.env.VERCEL_APP_OPENAI_API_KEY = "test";
    const verdict = {
      defects: [
        {
          code: "invented_decoration",
          evidence: "Added rear logo absent from the product reference.",
        },
      ],
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            content: [{ type: "output_text", text: JSON.stringify(verdict) }],
          },
        ],
        usage: {},
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await checkListingPhoto(
      "pose",
      Buffer.from("output"),
      plan,
      "secondary",
      false,
      ["original-back", "front-detail"],
    );
    expect(result.accepted).toBe(false);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      model: "gpt-5.4-2026-03-05",
      reasoning: { effort: "low" },
    });
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).input[0].content.at(-1),
    ).toMatchObject({ type: "input_image", image_url: "original-back" });
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).input[0].content.filter(
        (part: any) => part.type === "input_image",
      ),
    ).toHaveLength(3);
  });
  it("bounds classifier indices to input files even when a source contains collage panels", async () => {
    process.env.VERCEL_APP_OPENAI_API_KEY = "test";
    const result = {
      eligible: true,
      category: "backpack",
      frontIndex: 0,
      backIndex: 0,
      detailIndex: 0,
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            content: [{ type: "output_text", text: JSON.stringify(result) }],
          },
        ],
        usage: {},
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await classifyListingPhotos(["data:image/jpeg;base64,collage"])).plan,
    ).toEqual(result);
    const schema = JSON.parse(fetcher.mock.calls[0][1].body).text.format.schema;
    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe(
      "gpt-5.4-mini-2026-03-17",
    );
    for (const key of ["frontIndex", "backIndex", "detailIndex"])
      expect(schema.properties[key].enum).toEqual([-1, 0]);
    expect(() =>
      parsePhotoPlan(JSON.stringify({ ...result, backIndex: 2 }), 1),
    ).toThrow("invalid_photo_plan");
  });
  it("rejects invalid indices and unsafe categories before generation", () => {
    expect(parsePhotoPlan(JSON.stringify(plan), 2)).toEqual(plan);
    expect(() =>
      parsePhotoPlan(JSON.stringify({ ...plan, frontIndex: 3 }), 2),
    ).toThrow();
    expect(() =>
      parsePhotoPlan(JSON.stringify({ ...plan, category: "lingerie" }), 2),
    ).toThrow();
  });
  it("uses a single rear pose and category-specific crop without forcing phone into shoe crops", () => {
    expect(rearPosePrompt).toContain("SCREEN");
    expect(photoPrompt(plan, "secondary")).toContain("undecorated");
    expect(photoPrompt({ ...plan, category: "shoes" }, "primary")).toContain(
      "outside the crop",
    );
    expect(
      photoPrompt({ ...plan, category: "backpack" }, "primary").toLowerCase(),
    ).toContain("rear");
  });
  it("fingerprints image identities independently of expiring signatures", () => {
    expect(sourceFingerprint(["https://x.supabase.co/a.jpg?token=one"])).toBe(
      sourceFingerprint(["https://x.supabase.co/a.jpg?token=two"]),
    );
    expect(sourceFingerprint(["data:image/jpeg;base64,one"])).not.toBe(
      sourceFingerprint(["data:image/jpeg;base64,two"]),
    );
  });
  it("accounts for separate image/text tokens and cached checker input", () => {
    expect(
      photoCost("image", {
        input_tokens_details: { image_tokens: 1000, text_tokens: 100 },
        output_tokens: 200,
      }),
    ).toBeCloseTo(0.0145);
    expect(
      photoCost("check", {
        input_tokens: 1000,
        input_tokens_details: { cached_tokens: 100 },
        output_tokens: 100,
      }),
    ).toBeCloseTo(0.0011325);
    expect(
      photoCost(
        "check",
        {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 100 },
          output_tokens: 100,
        },
        "gpt-5.4-2026-03-05",
      ),
    ).toBeCloseTo(0.003775);
  });
  it("uses parallel-safe single-view edits and treats malformed checker output as failure", async () => {
    process.env.VERCEL_APP_OPENAI_API_KEY = "test";
    const bytes = Buffer.alloc(1100);
    bytes[0] = 255;
    bytes[1] = 216;
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: bytes.toString("base64") }],
        usage: {},
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    await editListingPhoto(
      "owner",
      ["data:image/jpeg;base64,reference"],
      photoPrompt(plan, "primary"),
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({
      quality: "medium",
      size: "768x1152",
      n: 1,
      output_format: "jpeg",
    });
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: '{"valid":true}' }] },
        ],
      }),
    });
    await expect(
      checkListingPhoto("pose", bytes, plan, "secondary"),
    ).rejects.toThrow();
  });
});
