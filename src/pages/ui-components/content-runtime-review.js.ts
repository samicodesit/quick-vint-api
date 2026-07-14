import { readExtensionPreviewSource } from "../../utils/extensionPreviewSource";

export async function GET() {
  const source = await readExtensionPreviewSource(
    "design-system/content-runtime-review.js",
  );
  const body = source
    .replace(
      "`../content.js?v=${Date.now()}`",
      "`/ui-components/content.js?v=${Date.now()}`",
    )
    .replace(
      "`../language-defaults.js?v=${Date.now()}`",
      "`/ui-components/language-defaults.js?v=${Date.now()}`",
    )
    .replace(
      'const extensionAssetBaseUrl = new URL("../", window.location.href).href;',
      'const extensionAssetBaseUrl = new URL("/ui-components/", window.location.href).href;',
    );

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}
