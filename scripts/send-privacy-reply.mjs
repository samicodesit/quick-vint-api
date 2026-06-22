import fs from "node:fs";
import path from "node:path";

const ENV_FILES = [".env.local", ".env"];

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

function usage() {
  console.error(
    [
      "Usage:",
      "  pnpm run ops:privacy-reply -- --to \"Name <user@example.com>\" --mode pending",
      "",
      "Options:",
      "  --to <recipient>       Required. Email address or Name <email>.",
      "  --mode <mode>          pending or complete. Default: pending.",
      "  --name <name>          Greeting name. Default: there.",
      "  --message-id <id>      Optional email thread Message-ID for reply headers.",
      "  --references <ids>     Optional References header. Defaults to --message-id.",
      "  --from <sender>        Defaults to privacy@autolister.app.",
      "  --subject <subject>    Override subject.",
      "  --text <body>          Override text body.",
    ].join("\n"),
  );
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

function parseRecipientEmail(recipient) {
  const recipientEmailMatch = recipient.match(/<([^>]+)>/);
  return recipientEmailMatch?.[1] || recipient;
}

loadEnv();

const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  console.error("Missing RESEND_API_KEY in environment.");
  process.exit(1);
}

const mode = getArg("--mode", "pending");
const recipient = requireArg("--to");
const recipientEmail = parseRecipientEmail(recipient);
const greetingName = getArg("--name", "there");
const messageId = getArg("--message-id");
const references = getArg("--references") || messageId;

const templates = {
  pending: {
    subject: "Re: Data Deletion Request",
    text: [
      `Hi ${greetingName},`,
      "",
      `Thank you for your email. We have received your request to delete the personal data associated with ${recipientEmail}.`,
      "",
      "We are now processing the deletion request and will remove the associated account records and contact information from our systems. We will send you a confirmation as soon as the process is complete.",
      "",
      "Best regards,",
      "AutoLister AI Privacy Team",
    ].join("\n"),
  },
  complete: {
    subject: "Re: Data Deletion Request",
    text: [
      `Hi ${greetingName},`,
      "",
      `This is to confirm that we have completed the deletion of the account records and contact information associated with ${recipientEmail} from our systems, and any active subscription linked to this email address has been closed where applicable.`,
      "",
      "Your deletion request has now been completed.",
      "",
      "Best regards,",
      "AutoLister AI Privacy Team",
    ].join("\n"),
  },
};

if (!templates[mode]) {
  console.error(`Unsupported mode: ${mode}`);
  process.exit(1);
}

const payload = {
  from:
    getArg("--from") || "AutoLister AI Privacy Team <privacy@autolister.app>",
  to: [recipient],
  subject: getArg("--subject") || templates[mode].subject,
  text: getArg("--text") || templates[mode].text,
};

if (messageId || references) {
  payload.headers = {};
  if (messageId) payload.headers["In-Reply-To"] = messageId;
  if (references) payload.headers.References = references;
}

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${resendApiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "quick-vint-api/send-privacy-reply-script",
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
    },
    null,
    2,
  ),
);

if (!response.ok) {
  process.exit(1);
}
