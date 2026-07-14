import { readFile } from "node:fs/promises";
import path from "node:path";

const RAW_BASE =
  "https://raw.githubusercontent.com/samicodesit/quick-vint-frontend/main";

function extensionPath(file: string) {
  return path.resolve(process.cwd(), "../quick-vint", file);
}

export async function readExtensionPreviewSource(file: string) {
  if (process.env.NODE_ENV === "development") {
    return readFile(extensionPath(file), "utf8");
  }

  const response = await fetch(`${RAW_BASE}/${file}`);
  if (!response.ok) {
    throw new Error(`GitHub raw ${response.status} for ${file}`);
  }
  return response.text();
}

export async function readExtensionPreviewBinary(file: string) {
  if (process.env.NODE_ENV === "development") {
    return readFile(extensionPath(file));
  }

  const response = await fetch(`${RAW_BASE}/${file}`);
  if (!response.ok) {
    throw new Error(`GitHub raw ${response.status} for ${file}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
