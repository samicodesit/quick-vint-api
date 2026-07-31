import fs from "node:fs";
import path from "node:path";

const ENV_FILES = [".env.local", ".env"];
const DEFAULT_FROM = "AutoLister AI <support@autolister.app>";

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

function loadEnv() {
  for (const file of ENV_FILES) {
    loadEnvFile(path.resolve(process.cwd(), file));
  }
}

function getArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function requireArg(flag) {
  const value = getArg(flag);
  if (!value) {
    console.error(`${flag} is required.`);
    usage();
    process.exit(1);
  }

  return value;
}

function usage() {
  console.error(
    [
      "Usage:",
      "  npm run ops:support-reply -- --to user@example.com --subject \"Re: ...\" --text \"Hi...\"",
      "",
      "Options:",
      "  --to <recipient>       Required. Email address or Name <email>.",
      "  --subject <subject>    Required. Subject line.",
      "  --text <body>          Required. Plain-text body.",
      "  --message-id <id>      Optional thread Message-ID for In-Reply-To.",
      "  --references <ids>     Optional References header. Defaults to --message-id.",
      "  --from <sender>        Defaults to support@autolister.app.",
      "  --reply-to <email>     Defaults to the email address in --from.",
      "  --bcc <recipient>      Optional BCC recipient.",
      "  --dry-run              Print the payload without sending.",
    ].join("\n"),
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlineText(lines) {
  return escapeHtml(lines.join("\n"))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

function renderSupportBlock(content) {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.slice(0, 120))}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:26px 30px 20px;border-bottom:1px solid #eef0f3;">
            <div style="font-size:20px;font-weight:700;color:#6d42c7;">AutoLister AI</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 30px 30px;font-size:15px;line-height:1.65;color:#374151;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 30px 28px;border-top:1px solid #eef0f3;text-align:center;font-size:12px;line-height:1.6;color:#8a93a3;">
            <strong style="color:#6d42c7;">AutoLister AI</strong><br />
            <a href="https://autolister.app" style="color:#8a93a3;text-decoration:underline;">autolister.app</a>
            &nbsp;·&nbsp; Reply to this email if you need a hand
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function textToSupportHtml(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let bullets = [];
  let quote = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(
      `<p style="margin: 0 0 16px 0;">${renderInlineText(paragraph)}</p>`,
    );
    paragraph = [];
  }

  function flushBullets() {
    if (bullets.length === 0) return;
    blocks.push(
      `<ul style="margin: -4px 0 18px 0; padding-left: 22px;">${bullets
        .map((line) => `<li style="margin: 0 0 6px 0;">${escapeHtml(line)}</li>`)
        .join("")}</ul>`,
    );
    bullets = [];
  }

  function flushQuote() {
    if (quote.length === 0) return;
    blocks.push(
      `<div style="margin:0 0 18px 0;padding:14px 16px;background:#faf9fd;border:1px dashed #c9c2dc;border-radius:8px;color:#4b4658;">${renderInlineText(quote)}</div>`,
    );
    quote = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);

    if (!line.trim()) {
      flushParagraph();
      flushBullets();
      flushQuote();
      continue;
    }

    if (quoteMatch) {
      flushParagraph();
      flushBullets();
      quote.push(quoteMatch[1]);
      continue;
    }

    if (bulletMatch) {
      flushParagraph();
      flushQuote();
      bullets.push(bulletMatch[1]);
      continue;
    }

    flushBullets();
    flushQuote();
    paragraph.push(line);
  }

  flushParagraph();
  flushBullets();
  flushQuote();

  return `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  ${renderSupportBlock(blocks.join("\n"))}
</body>
</html>`;
}

function extractEmailAddress(sender) {
  const angleMatch = String(sender).match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (angleMatch) return angleMatch[1];

  const bareMatch = String(sender).match(/[^<>\s]+@[^<>\s]+/);
  return bareMatch?.[0] || "support@autolister.app";
}

loadEnv();

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  console.error("Missing RESEND_API_KEY in environment.");
  process.exit(1);
}

const recipient = requireArg("--to");
const subject = requireArg("--subject");
const text = requireArg("--text");
const messageId = getArg("--message-id");
const references = getArg("--references") || messageId;
const bcc = getArg("--bcc");
const dryRun = process.argv.includes("--dry-run");
const from = getArg("--from", DEFAULT_FROM);
const replyTo = getArg("--reply-to", extractEmailAddress(from));

const payload = {
  from,
  to: [recipient],
  subject,
  text,
  html: textToSupportHtml(text),
  reply_to: [replyTo],
};

if (bcc) {
  payload.bcc = [bcc];
}

if (messageId || references) {
  payload.headers = {};
  if (messageId) payload.headers["In-Reply-To"] = messageId;
  if (references) payload.headers.References = references;
}

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, payload }, null, 2));
  process.exit(0);
}

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${resendApiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "quick-vint-api/send-support-reply-script",
  },
  body: JSON.stringify(payload),
});

const bodyText = await response.text();
let parsedBody = bodyText;

try {
  parsedBody = JSON.parse(bodyText);
} catch {
  // Keep the raw text if the response is not JSON.
}

console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      body: parsedBody,
      bcc: bcc || null,
    },
    null,
    2,
  ),
);

if (!response.ok) {
  process.exit(1);
}
