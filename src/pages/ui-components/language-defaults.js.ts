import { readFile } from "node:fs/promises";
import path from "node:path";

function extensionPath(file: string) {
  return path.resolve(process.cwd(), "../quick-vint", file);
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not available outside local dev.", { status: 404 });
  }

  const body = await readFile(extensionPath("language-defaults.js"), "utf8");

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}
