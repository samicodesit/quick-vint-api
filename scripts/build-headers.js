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
  const repoRoot = path.join(__dirname, "..");
  const publicDir = path.join(repoRoot, "public");
  const partialPath = path.join(publicDir, "partials", "header.html");

  try {
    const partial = await fs.readFile(partialPath, "utf8");
    const htmlFiles = await findHtmlFiles(publicDir);
    let replaced = 0;
    for (const file of htmlFiles) {
      let content = await fs.readFile(file, "utf8");
      const placeholder = '<div id="shared-header-placeholder"></div>';
      if (content.includes(placeholder)) {
        content = content.replace(placeholder, partial);
        await fs.writeFile(file, content, "utf8");
        replaced++;
        console.log("Inlined header into", path.relative(repoRoot, file));
      }
    }
    console.log(`Done. Inlined header into ${replaced} files.`);
  } catch (err) {
    console.error("Error during build-headers:", err);
    process.exitCode = 1;
  }
}

main();
