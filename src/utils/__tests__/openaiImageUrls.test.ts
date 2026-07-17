import { describe, expect, it } from "vitest";
import { prepareOpenAIImageUrls } from "../../../utils/openaiImageUrls";

describe("prepareOpenAIImageUrls", () => {
  it("keeps existing image data URLs unchanged", async () => {
    const dataUrl = "data:image/jpeg;base64,AAAA";

    await expect(prepareOpenAIImageUrls([dataUrl])).resolves.toEqual([dataUrl]);
  });

  it("converts allowed remote image URLs to data URLs", async () => {
    const fetchImpl = async () =>
      new Response(Buffer.from("image-bytes"), {
        headers: { "content-type": "image/jpeg" },
      });

    await expect(
      prepareOpenAIImageUrls(
        ["https://images1.vinted.net/t/example/f800/item.webp"],
        fetchImpl as typeof fetch,
      ),
    ).resolves.toEqual([
      `data:image/jpeg;base64,${Buffer.from("image-bytes").toString("base64")}`,
    ]);
  });

  it("rejects remote URLs from unsupported hosts", async () => {
    await expect(
      prepareOpenAIImageUrls(["https://example.com/item.jpg"]),
    ).rejects.toThrow("Invalid image URL");
  });
});
