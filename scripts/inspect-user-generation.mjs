import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://autolister.app";
const DEFAULT_OUTPUT_DIR = "/tmp/autolister-admin-log-inspection";

function usage() {
  console.error(
    [
      "Usage:",
      "  ADMIN_SECRET=... pnpm run ops:inspect-generation -- user@example.com",
      "  ADMIN_SECRET=... pnpm run ops:inspect-generation -- user@example.com --index 0",
      "",
      "Options:",
      "  --base-url <url>      Admin API base URL. Default: https://autolister.app",
      "  --output-dir <path>   Directory for saved logs/images. Default: /tmp/autolister-admin-log-inspection",
      "  --index <n>           Which successful generation to inspect, newest first. Default: 0",
      "  --limit <n>           Number of recent logs to search. Default: 100",
      "",
      "Notes:",
      "  The script never prints ADMIN_SECRET.",
      "  Prompt images are saved exactly from api_logs.image_urls when present.",
    ].join("\n"),
  );
}

function getArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function getPositionalEmail() {
  return process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(arg));
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
}

function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function fetchJson(url, adminSecret, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${adminSecret}` },
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(json)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function getImageUrls(log) {
  const imageUrls = parseJsonMaybe(log?.image_urls);
  if (Array.isArray(imageUrls)) return imageUrls;

  const body = parseJsonMaybe(log?.full_request_body);
  if (Array.isArray(body?.imageUrls)) return body.imageUrls;

  return [];
}

function extensionForMime(mime) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

async function savePromptImages(imageUrls, outputDir) {
  const imageDir = path.join(outputDir, "images");
  fs.mkdirSync(imageDir, { recursive: true });

  const saved = [];
  for (const [index, imageUrl] of imageUrls.entries()) {
    const number = String(index + 1).padStart(2, "0");
    if (typeof imageUrl !== "string") continue;

    if (imageUrl.startsWith("data:")) {
      const match = imageUrl.match(/^data:([^;,]+);base64,(.*)$/s);
      if (!match) continue;
      const [, mime, base64] = match;
      const filePath = path.join(imageDir, `image-${number}.${extensionForMime(mime)}`);
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
      saved.push({ index: index + 1, source: "data-url", filePath });
      continue;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      saved.push({
        index: index + 1,
        source: "remote-url",
        url: imageUrl,
        error: `${response.status} ${response.statusText}`,
      });
      continue;
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const filePath = path.join(imageDir, `image-${number}.${extensionForMime(contentType)}`);
    fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
    saved.push({ index: index + 1, source: "remote-url", filePath, url: imageUrl });
  }

  return saved;
}

function summarizeLog(log) {
  return {
    id: log.id,
    created_at: log.created_at,
    endpoint: log.endpoint,
    origin: log.origin,
    ip_address: log.ip_address || null,
    user_id: log.user_id || null,
    user_email: log.user_email || null,
    response_status: log.response_status,
    subscription_tier: log.subscription_tier || null,
    subscription_status: log.subscription_status || null,
    api_calls_count: log.api_calls_count ?? null,
    generated_title: log.generated_title || null,
    generated_description: log.generated_description || null,
    openai_model: log.openai_model || null,
    openai_prompt_tokens: log.openai_prompt_tokens ?? null,
    openai_completion_tokens: log.openai_completion_tokens ?? null,
    openai_tokens_used: log.openai_tokens_used ?? null,
    processing_duration_ms: log.processing_duration_ms ?? null,
    image_count: getImageUrls(log).length,
  };
}

const email = getPositionalEmail();
const adminSecret = process.env.ADMIN_SECRET;
const baseUrl = (getArg("--base-url", DEFAULT_BASE_URL) || DEFAULT_BASE_URL).replace(/\/$/, "");
const outputRoot = getArg("--output-dir", DEFAULT_OUTPUT_DIR);
const index = Number.parseInt(getArg("--index", "0"), 10);
const limit = Number.parseInt(getArg("--limit", "100"), 10);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

if (!email || !adminSecret || Number.isNaN(index) || Number.isNaN(limit)) {
  usage();
  process.exit(1);
}

const outputDir = path.resolve(process.cwd(), outputRoot, safeName(email));
fs.mkdirSync(outputDir, { recursive: true });

const logsUrl = new URL(`${baseUrl}/api/admin`);
logsUrl.searchParams.set("action", "view-logs");
logsUrl.searchParams.set("log_type", "all");
logsUrl.searchParams.set("search", email);
logsUrl.searchParams.set("page", "1");
logsUrl.searchParams.set("limit", String(limit));

const listResponse = await fetchJson(logsUrl, adminSecret);
const logs = listResponse.logs || [];
fs.writeFileSync(path.join(outputDir, "logs-list.json"), JSON.stringify(listResponse, null, 2));

const generations = logs.filter(
  (log) => log.endpoint === "/api/generate" && Number(log.response_status) === 200,
);
const generation = generations[index];
if (!generation) {
  console.error(`No successful generation found for ${email} at index ${index}.`);
  process.exit(1);
}

let detailLog = generation;
try {
  const detailUrl = new URL(`${baseUrl}/api/admin`);
  detailUrl.searchParams.set("action", "log-detail");
  detailUrl.searchParams.set("id", generation.id);
  const detailResponse = await fetchJson(detailUrl, adminSecret, 20000);
  if (detailResponse.log) detailLog = detailResponse.log;
} catch (error) {
  console.warn(`Detail fetch failed, using list row: ${error.message}`);
}

fs.writeFileSync(path.join(outputDir, "generation-log.json"), JSON.stringify(detailLog, null, 2));

const imageUrls = getImageUrls(detailLog);
const savedImages = await savePromptImages(imageUrls, outputDir);

const generationTime = new Date(generation.created_at).getTime();
const nearbyEdits = logs
  .filter((log) => log.endpoint === "/event/generation_output_edited")
  .filter((log) => {
    const logTime = new Date(log.created_at).getTime();
    return logTime >= generationTime && logTime - generationTime <= 5 * 60 * 1000;
  })
  .sort((a, b) => a.created_at.localeCompare(b.created_at));

const summary = {
  email,
  outputDir,
  selected_generation_index: index,
  generation: summarizeLog(detailLog),
  nearby_edit_events: nearbyEdits.map(summarizeLog),
  saved_images: savedImages,
};

fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
