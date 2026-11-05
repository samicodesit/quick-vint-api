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
  it("avoids cache writes for unique Sol checks while retaining the fidelity inputs", async () => {
    process.env.VERCEL_APP_OPENAI_API_KEY = "test";
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: '{"defects":[]}' }] },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    await checkListingPhoto(
      "pose",
      Buffer.from("candidate"),
      plan,
      "primary",
      false,
      ["front", "back"],
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.prompt_cache_options).toEqual({ mode: "explicit" });
    expect(body.model).toBe("gpt-6.1-sol");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(
      body.input[0].content
        .filter((part: any) => part.type === "input_image")
        .map((part: any) => part.image_url),
    ).toEqual([
      "pose",
      expect.stringContaining("data:image/jpeg;base64,"),
      "front",
      "back",
    ]);
    expect(JSON.stringify(body)).not.toContain("prompt_cache_breakpoint");
    await checkListingPhoto(
      "pose",
      Buffer.from("candidate"),
      plan,
      "secondary",
      true,
    );
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty(
      "prompt_cache_options",
    );
  });

  it.each([
    ["default", 1],
    ["fast", 2],
    ["priority", 2],
  ] as const)(
    "prices retained Sol cache writes separately from ordinary input at %s tier",
    (tier, multiplier) => {
      // 1,000 ordinary + 2,000 read + 3,000 written, then 100 output tokens.
      expect(
        photoCost(
          "check",
          {
            input_tokens: 6000,
            input_tokens_details: {
              cached_tokens: 2000,
              cache_write_tokens: 3000,
            },
            output_tokens: 100,
          },
          "gpt-6.1-sol",
          tier,
        ),
      ).toBeCloseTo(0.0107 * multiplier, 9);
    },
  );

  it("gives the fidelity check enough time without extending classification or image calls", async () => {
    process.env.VERCEL_APP_OPENAI_API_KEY = "test";
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "completed",
          service_tier: "priority",
          output: [
            { content: [{ type: "output_text", text: '{"defects":[]}' }] },
          ],
        }),
      }),
    );
    const result = await checkListingPhoto(
      "pose",
      Buffer.from("image"),
      plan,
      "primary",
    );
    expect(timeout).toHaveBeenCalledWith(20000);
    expect(result.serviceTier).toBe("priority");
    timeout.mockRestore();
  });
  it.each(["headwear", "neckwear", "other"])(
    "skips an unsupported %s instead of forcing it into a supported framing",
    (itemType) => {
      expect(
        parsePhotoPlan(JSON.stringify({ ...plan, itemType }), 2),
      ).toMatchObject({ eligible: false, category: "skip" });
    },
  );
  it("rejects a contradictory item type before creating a different garment", () => {
    expect(() =>
      parsePhotoPlan(JSON.stringify({ ...plan, itemType: "trousers" }), 2),
    ).toThrow("invalid_photo_plan");
  });
  it("requires visible rear evidence when a classifier labels the front as the back", async () => {
    const recordedPlan = {
      eligible: true,
      category: "top",
      frontIndex: 1,
      backIndex: 1,
      detailIndex: 3,
    };
    process.env.VERCEL_APP_OPENAI_API_KEY = "test";
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: '{"defects":[]}' }] },
        ],
        usage: {},
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    await checkListingPhoto(
      "pose",
      Buffer.from("candidate"),
      recordedPlan,
      "secondary",
      false,
      ["original-front", "label"],
    );
    const input = JSON.parse(fetcher.mock.calls[0][1].body).input[0].content;
    const instructions = input
      .filter((part: any) => part.type === "input_text")
      .map((part: any) => part.text)
      .join("\n");
    expect(instructions).toContain(
      "A front view is not evidence of rear decoration",
    );
    expect(instructions).not.toContain(
      "PRODUCT: actual sale item, target surface.",
    );
    expect(
      input
        .filter((part: any) => part.type === "input_image")
        .map((part: any) => part.image_url),
    ).toEqual([
      "pose",
      expect.stringContaining("data:image/jpeg;base64,"),
      "original-front",
      "label",
    ]);
    // Shared indices remain legal for a genuine front/back collage.
    expect(parsePhotoPlan(JSON.stringify(recordedPlan), 4)).toEqual(
      recordedPlan,
    );
  });

  it.each([
    ["top", "primary", false],
    ["shoes", "secondary", false],
    ["bag", "secondary", false],
    ["backpack", "secondary", false],
    ["top", "secondary", true],
  ] as const)(
    "keeps unrelated %s %s pose=%s checks unchanged",
    async (category, slot, rear) => {
      process.env.VERCEL_APP_OPENAI_API_KEY = "test";
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            { content: [{ type: "output_text", text: '{"defects":[]}' }] },
          ],
          usage: {},
        }),
      });
      vi.stubGlobal("fetch", fetcher);
      await checkListingPhoto(
        "pose",
        Buffer.from("candidate"),
        { ...plan, category },
        slot,
        rear,
        ["original"],
      );
      const request = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(JSON.stringify(request)).not.toContain(
        "A front view is not evidence of rear decoration",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
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
      model: "gpt-6.1-sol",
      reasoning: { effort: "low" },
    });
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).input[0].content.at(-1),
    ).toMatchObject({ type: "input_image", image_url: "front-detail" });
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).input[0].content.filter(
        (part: any) => part.type === "input_image",
      ),
    ).toHaveLength(4);
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
      photoCost(
        "image",
        {
          input_tokens_details: { image_tokens: 1000, text_tokens: 100 },
          output_tokens: 200,
        },
        "gpt-image-2.5-flare-2026-09-08",
      ),
    ).toBeCloseTo(0.0145, 9);
    expect(
      photoCost("check", {
        input_tokens: 1000,
        input_tokens_details: { cached_tokens: 100 },
        output_tokens: 100,
      }),
    ).toBeCloseTo(0.0011325, 9);
    expect(
      photoCost(
        "check",
        {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 100 },
          output_tokens: 100,
        },
        "gpt-6.1-sol",
        "default",
      ),
    ).toBeCloseTo(0.00281, 9);
    expect(
      photoCost(
        "check",
        {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 100 },
          output_tokens: 100,
        },
        "gpt-6.1-sol",
        "priority",
      ),
    ).toBeCloseTo(0.00562, 9);
    expect(
      photoCost(
        "check",
        { input_tokens: 1000, output_tokens: 100 },
        "gpt-6.1-sol",
      ),
    ).toBeNull();
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
    ).toBeCloseTo(0.003775, 9);
    expect(
      photoCost("image", { input_tokens: 1000 }, "unknown-image-model"),
    ).toBeNull();
    expect(
      photoCost("check", { input_tokens: 1000 }, "unknown-check-model"),
    ).toBeNull();
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
      model: "gpt-image-2.5-flare-2026-09-08",
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
