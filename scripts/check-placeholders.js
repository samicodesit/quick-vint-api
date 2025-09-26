#!/usr/bin/env node
const fs = require("fs").promises;
const path = require("path");

async function findHtmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const res = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await findHtmlFiles(res)));
    } else if (e.isFile() && res.endsWith(".html")) {
      files.push(res);
    }
  }
  return files;
}

async function main() {
  const publicDir = path.join(__dirname, "..", "public");
  const files = await findHtmlFiles(publicDir);
  const placeholder = '<div id="shared-header-placeholder"></div>';
  const found = [];
  for (const f of files) {
    const content = await fs.readFile(f, "utf8");
    if (content.includes(placeholder))
      found.push(path.relative(process.cwd(), f));
  }
  if (found.length) {
    console.error("Found placeholder in files (run build-headers to inline):");
    found.forEach((f) => console.error(" -", f));
    process.exitCode = 2;
  } else {
    console.log("No placeholders found. All good.");
  }
}

main();
