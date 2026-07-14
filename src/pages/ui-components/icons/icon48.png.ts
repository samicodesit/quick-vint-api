import { readExtensionPreviewBinary } from "../../../utils/extensionPreviewSource";

export async function GET() {
  const body = await readExtensionPreviewBinary("icons/icon48.png");

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/png",
    },
  });
}
