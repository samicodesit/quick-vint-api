import { readExtensionPreviewBinary } from "../../../utils/extensionPreviewSource";

export async function GET() {
  const body = await readExtensionPreviewBinary(
    "images/quickvint-upload-multiple.jpg",
  );

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/jpeg",
    },
  });
}
