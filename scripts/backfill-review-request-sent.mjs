import fs from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const REVIEW_REQUEST_SUBJECT = "Did AutoLister help with your Vinted listings?";
const SENT_EVENTS = new Set(["sent", "delivered", "opened", "clicked"]);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function getArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function normalizeEmail(email) {
  return typeof email === "string" && email.includes("@")
    ? email.trim().toLowerCase()
    : "";
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const apply = process.argv.includes("--apply");
const maxEmails = parsePositiveInt(getArg("--max", "1000"), 1000, 10000);
const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseUrl = process.env.VERCEL_APP_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.RESEND_API_KEY || !supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    "Missing RESEND_API_KEY, VERCEL_APP_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const matched = new Map();
let scanned = 0;
let after = undefined;

while (scanned < maxEmails) {
  const response = await resend.emails.list({
    limit: Math.min(100, maxEmails - scanned),
    ...(after ? { after } : {}),
  });

  if (response.error) {
    throw new Error(response.error.message || "Failed to list Resend emails.");
  }

  const emails = response.data?.data || [];
  if (!emails.length) break;

  for (const email of emails) {
    scanned += 1;
    if (email.subject !== REVIEW_REQUEST_SUBJECT) continue;
    if (!SENT_EVENTS.has(email.last_event)) continue;

    for (const recipient of email.to || []) {
      const normalized = normalizeEmail(recipient);
      if (!normalized) continue;
      const previous = matched.get(normalized);
      if (!previous || email.created_at > previous.sentAt) {
        matched.set(normalized, {
          email: normalized,
          sentAt: email.created_at,
          resendId: email.id,
          lastEvent: email.last_event,
        });
      }
    }
  }

  if (!response.data?.has_more || scanned >= maxEmails) break;
  after = emails[emails.length - 1]?.id;
  if (!after) break;
}

const rows = Array.from(matched.values()).sort((a, b) =>
  a.email.localeCompare(b.email),
);

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      scanned,
      matched: rows.length,
      rows,
    },
    null,
    2,
  ),
);

if (!apply || rows.length === 0) {
  process.exit(0);
}

for (const row of rows) {
  const { error } = await supabase
    .from("profiles")
    .update({ review_request_sent_at: row.sentAt })
    .eq("email", row.email)
    .is("review_request_sent_at", null);

  if (error) {
    console.error(`Failed to mark ${row.email}: ${error.message}`);
    process.exitCode = 1;
  }
}
