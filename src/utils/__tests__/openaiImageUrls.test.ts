import { describe, expect, it } from "vitest";
import {
  ImagePreparationError,
  prepareOpenAIImageUrls,
  summarizePhotoSourcesForLog,
} from "../../../utils/openaiImageUrls";

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

  it("names the failing photo and its host when a download is rejected", async () => {
    const fetchImpl = async (url: string) =>
      url.includes("second")
        ? new Response("{}", { status: 404 })
        : new Response(Buffer.from("image-bytes"), {
            headers: { "content-type": "image/webp" },
          });

    const result = prepareOpenAIImageUrls(
      [
        "https://images1.vinted.net/t/first/f800/1.webp?s=sig",
        "https://images1.vinted.net/t/second/f800/2.webp",
      ],
      fetchImpl as typeof fetch,
    );
    await expect(result).rejects.toBeInstanceOf(ImagePreparationError);
    await expect(result).rejects.toThrow(
      "Invalid image URL: photo 2 of 2 (Vinted photo) fetch failed (404).",
    );
  });

  it("keeps network failures out of the invalid-input class", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed: connect timeout");
    };

    const result = prepareOpenAIImageUrls(
      ["https://project.supabase.co/storage/v1/object/sign/temp-uploads/a.jpg"],
      fetchImpl as typeof fetch,
    );
    await expect(result).rejects.toBeInstanceOf(ImagePreparationError);
    await expect(result).rejects.toThrow(
      "Photo download failed: photo 1 of 1 (uploaded photo): fetch failed: connect timeout",
    );
  });
});

describe("summarizePhotoSourcesForLog", () => {
  it("groups photos by transport and the reason Vinted page photos were used", () => {
    expect(
      summarizePhotoSourcesForLog([
        { generationPayloadSource: "manual_upload_storage_url" },
        {
          promptSource: "vinted_dom_image",
          capturedUploadMatchStatus: "no_capture_expired",
        },
        {
          promptSource: "vinted_dom_image",
          capturedUploadMatchStatus: "no_capture_expired",
        },
      ]),
    ).toBe(
      "1x manual_upload_storage_url, 2x vinted_page_photo (no_capture_expired)",
    );
  });

  it("keeps the page-photo reason when those photos travelled through storage", () => {
    expect(
      summarizePhotoSourcesForLog([
        {
          promptSource: "vinted_dom_image",
          capturedUploadMatchStatus: "no_capture_existing_listing",
          generationPayloadSource: "prepared_photo_storage_url",
        },
      ]),
    ).toBe(
      "1x vinted_page_photo (no_capture_existing_listing) via prepared_photo_storage_url",
    );
  });

  it("returns null without image metadata", () => {
    expect(summarizePhotoSourcesForLog(undefined)).toBeNull();
    expect(summarizePhotoSourcesForLog([])).toBeNull();
  });
});
