import { readExtensionPreviewSource } from "../../utils/extensionPreviewSource";

export async function GET() {
  const body = await readExtensionPreviewSource("content.js");

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}
