import { readFile } from "node:fs/promises";
import path from "node:path";

function extensionPath(file: string) {
  return path.resolve(process.cwd(), "../quick-vint", file);
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not available outside local dev.", { status: 404 });
  }

  const source = await readFile(
    extensionPath("design-system/content-runtime-review.js"),
    "utf8",
  );
  const body = source
    .replace(
      "`../content.js?v=${Date.now()}`",
      "`/ui-components/content.js?v=${Date.now()}`",
    )
    .replace(
      "`../language-defaults.js?v=${Date.now()}`",
      "`/ui-components/language-defaults.js?v=${Date.now()}`",
    );

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}
