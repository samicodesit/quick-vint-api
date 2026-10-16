import assert from "node:assert/strict";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Busboy = require("busboy");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const mode = process.env.PHONE_TRANSPORT_CASE || "disconnect";
const productPath = process.env.PHONE_PRODUCT_PATH || "batch";
const output = process.env.PHONE_TRANSPORT_OUTPUT || "/tmp/autolister-phone-transport";
await mkdir(output, { recursive: true });
const html = await readFile(new URL("../src/pages/phone-upload.html", import.meta.url));
const publicRoot = resolve("public");
const uploads = new Map();
const events = [];
let attempts = 0;
let dropped = 0;
let cleanup = 0;
let connected = !["disconnect", "cancel", "prepare"].includes(mode);
let stalled = mode === "idle";
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/api/phone-upload") {
    const action = url.searchParams.get("action");
    if (action === "cleanup") { cleanup++; return json({ success: true }); }
    if (action === "status") return json({ status: "open" });
    if (action === "prepare" && mode === "prepare" && !connected) { dropped++; req.socket.destroy(); return; }
    if (action === "prepare" || action === "complete") return json({ success: true, complete: true });
    if (req.method === "POST") {
      attempts++;
      if (mode === "expired") return json({ error: "Local expired fixture" }, 410);
      if (!connected) { dropped++; req.socket.destroy(); return; }
      const parser = Busboy({ headers: req.headers });
      let order;
      let bytes;
      parser.on("field", (name, value) => { if (name === "uploadOrder") order = Number(value); });
      parser.on("file", (_name, stream) => {
        const chunks = [];
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("end", () => { bytes = Buffer.concat(chunks); });
      });
      parser.on("close", () => {
        if (stalled) { stalled = false; return; }
        assert.ok(Number.isInteger(order) && bytes?.length > 0);
        uploads.set(order, { bytes: bytes.length, hash: createHash("sha256").update(bytes).digest("hex") });
        json({ success: true, files: [{ size: bytes.length }] });
      });
      req.pipe(parser);
      return;
    }
    return json({ files: [], complete: false });
  }
  if (url.pathname === "/api/events/track") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    events.push(...(body.events || []));
    return json({ acknowledgedIds: (body.events || []).map(event => event.id) });
  }
  if (url.pathname === "/phone-upload") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(html); }
  const path = resolve(publicRoot, `.${url.pathname}`);
  if (!path.startsWith(publicRoot + sep)) { res.writeHead(404); return res.end(); }
  try { const body = await readFile(path); res.writeHead(200, { "Content-Type": path.endsWith(".js") ? "application/javascript" : "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const page = await context.newPage();
page.on("dialog", dialog => dialog.accept());
const errors = [];
page.on("pageerror", error => errors.push(error.message));
async function until(predicate, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!(await predicate())) { assert.ok(Date.now() < end, `transition timed out in ${mode}`); await new Promise(resolve => setTimeout(resolve, 100)); }
}
try {
  await page.goto(`${base}/phone-upload?v=2${productPath === "batch" ? "&mode=batch" : ""}&s=550e8400-e29b-41d4-a716-446655440099`);
  let files = await Promise.all(["sample-front.png", "sample-detail.png"].map(async name => ({ name, mimeType: "image/png", buffer: await readFile(new URL(`../docs/qa/browser-drafts/${name}`, import.meta.url)) })));
  if (["idle", "expired", "slow"].includes(mode)) files = files.slice(0, 1);
  if (mode === "slow") {
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1280;
      const drawing = canvas.getContext('2d'); const image = drawing.createImageData(1280, 1280);
      let seed = 1701;
      for (let index = 0; index < image.data.length; index += 4) {
        for (let color = 0; color < 3; color++) { seed = (1664525 * seed + 1013904223) >>> 0; image.data[index + color] = seed >>> 24; }
        image.data[index + 3] = 255;
      }
      drawing.putImageData(image, 0, 0); return canvas.toDataURL('image/jpeg', 0.97);
    });
    files = [{ name: "slow-phone.jpg", mimeType: "image/jpeg", buffer: Buffer.from(dataUrl.split(',')[1], 'base64') }];
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 16000 });
  }
  const started = Date.now();
  await page.locator("#fileInput").setInputFiles(files);
  if (["disconnect", "cancel", "prepare"].includes(mode)) {
    await until(() => dropped >= (mode === "prepare" ? 2 : 4));
    await new Promise(resolve => setTimeout(resolve, 3000));
    assert.equal(await page.locator("#mainBtn").isDisabled(), true, "brief connection loss remains active without a retry click");
    assert.match(await page.locator("#pageCopy").innerText(), /connection|reconnect/i);
    await page.screenshot({ path: `${output}/${productPath}-${mode}-waiting.png`, fullPage: true });
    if (mode === "cancel") {
      await page.locator("#cancelBtn").click();
      const count = attempts;
      connected = true;
      await new Promise(resolve => setTimeout(resolve, 5500));
      assert.equal(attempts, count, "cancelled uploads do not restart");
      assert.equal(uploads.size, 0);
      assert.equal(cleanup, 1);
    } else connected = true;
  }
  if (!["cancel", "expired"].includes(mode)) {
    await until(() => uploads.size === files.length, mode === "slow" ? 180000 : mode === "idle" ? 65000 : 20000);
    await until(() => page.locator("#pageCopy").textContent().then(text => text.includes(`${files.length} photos ready`)));
    assert.equal(cleanup, 0);
    assert.deepEqual([...uploads.keys()].sort(), files.map((_, index) => index));
    assert.equal(new Set([...uploads.values()].map(value => value.hash)).size, files.length);
  } else if (mode === "expired") {
    await until(() => page.locator("#pageTitle").textContent().then(text => text.includes("Expired")));
    await new Promise(resolve => setTimeout(resolve, 2000));
    assert.equal(attempts, 1, "expired sessions are terminal, not network retries");
    assert.match(await page.locator('#pageCopy').innerText(), /expired|no longer available/i);
    assert.equal(await page.locator('#mainBtn').isVisible(), false, "expired uploads must not offer another retry of the same dead link");
    assert.equal(await page.locator('#cancelBtn').isVisible(), false, "expired uploads must not revive a cancellation action");
    assert.doesNotMatch(await page.locator('#toast').innerText(), /retry when ready/i);
  }
  assert.deepEqual(errors, []);
  if (mode === "slow") assert.ok(Date.now() - started > 45000, "real progressing transfer must survive longer than the idle deadline");
  await page.evaluate(() => globalThis.AutoListerWebsiteTelemetry?.flush());
  if (["disconnect", "idle"].includes(mode)) {
    assert.equal(events.some(event => event.event === 'phone_upload_file_error'), false, "recovered transport must not produce terminal file failure");
    assert.ok(events.filter(event => event.event === 'phone_upload_transfer_error').length <= files.length, "network retries must not flood critical evidence");
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: `${output}/${mode}.png`, fullPage: true });
  const result = { productPath, mode, passed: true, elapsedMs: Date.now() - started, attempts, dropped, uploadedOrders: [...uploads.keys()], cleanup,
    scope: "Actual Chromium file selection, compression, multipart XHR and loopback HTTP. Real socket termination or held response; local API metadata and storage. No paid/live services." };
  await writeFile(`${output}/${mode}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: `${output}/${mode}-failure.png`, fullPage: true });
  console.error(JSON.stringify({ mode, attempts, dropped, uploaded: uploads.size, copy: await page.locator("#pageCopy").textContent() }));
  throw error;
} finally {
  await context.close();
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
