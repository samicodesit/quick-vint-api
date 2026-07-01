import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not available outside local dev.", { status: 404 });
  }

  const body = await readFile(
    path.resolve(process.cwd(), "../quick-vint/icons/icon48.png"),
  );

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/png",
    },
  });
}
