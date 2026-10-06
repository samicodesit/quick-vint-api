import { createHash } from "node:crypto";

export const LIMITS = Object.freeze({
  batchEvents: 25,
  batchBytes: 48 * 1024,
  traceBytes: 8192,
  breadcrumbs: 30,
  queueAgeMs: 86400000,
});

type Definition = {
  kind: "business" | "checkpoint" | "expected" | "incident" | "report";
  stage?: string;
  severity?: "blocking" | "transient" | "warning";
  running?: boolean;
};

// Classification is explicit. Unknown legacy product events remain business events.
import definitions from "./registry.json";
const registry = definitions as Record<string, Definition>;

export function classifyEvent(name: string): Definition {
  return registry[name] || { kind: "business" };
}

export function isRegisteredBusiness(name: string): boolean {
  return registry[name]?.kind === "business";
}

export function redact(value: unknown, max = 500): string {
  return (
    String(value ?? "")
      .replace(/\b(?:data|blob):[^\s<>"']+/gi, "[url]")
      .replace(/https?:\/\/[^\s<>"']+/gi, "[url]")
      .replace(/\bBearer\s+\S+/gi, "[credential]")
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        "[credential]",
      )
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
      .replace(
        /\b(access[_-]?token|refresh[_-]?token|token|secret|password|session[_-]?id|session|authorization|api[_-]?key)["']?\s*[=:]\s*["']?[^\s,;"'}]+/gi,
        "$1=[redacted]",
      )
      // Remove non-printing control bytes from diagnostic text.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .slice(0, max)
  );
}

import policy from "./context-policy.json";
const stringKeys = new Set(policy.strings);
const numberKeys = new Set(policy.numbers);
function imageContext(value: any) {
  const result: Record<string, any> = { sourceUrl: null };
  for (const key of policy.imageStrings)
    if (typeof value?.[key] === "string") result[key] = redact(value[key], 80);
  for (const key of policy.imageNumbers)
    if (Number.isFinite(value?.[key]))
      result[key] = Math.max(0, Math.min(value[key], 1e9));
  for (const key of policy.imageBooleans)
    if (typeof value?.[key] === "boolean") result[key] = value[key];
  return result;
}

export function sanitizeContext(
  input: unknown,
  trace: boolean,
): Record<string, any> {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const output: Record<string, any> = {};
  // Normalize legacy callers without broadening the persisted allowlist.
  const canonical = {
    ...source,
    errorCode: source.errorCode || source.code,
    statusCode:
      source.statusCode ??
      (typeof source.status === "number" ? source.status : undefined),
  };
  for (const [key, value] of Object.entries(canonical)) {
    if (stringKeys.has(key) && typeof value === "string")
      output[key] = redact(
        value,
        key === "message" || key === "error" ? 500 : 120,
      );
    if (
      numberKeys.has(key) &&
      typeof value === "number" &&
      Number.isFinite(value)
    )
      output[key] = Math.max(-1e12, Math.min(value, 1e12));
    if (policy.booleans.includes(key) && typeof value === "boolean")
      output[key] = value;
  }
  if (Array.isArray(source.imageSources))
    output.imageSources = source.imageSources.slice(0, 3).map(imageContext);
  if (trace && typeof source.stack === "string")
    output.stack = redact(source.stack, 2000);
  if (trace && Array.isArray(source.breadcrumbs)) {
    output.breadcrumbs = source.breadcrumbs
      .slice(-LIMITS.breadcrumbs)
      .map((crumb) => sanitizeContext(crumb, false));
    while (
      Buffer.byteLength(JSON.stringify(output)) > LIMITS.traceBytes &&
      output.breadcrumbs.length
    )
      output.breadcrumbs.shift();
  }
  // Context itself has a fixed allowlist and per-field bounds; shed optional fields
  // even when a caller fills every allowed key with multi-byte characters.
  while (Buffer.byteLength(JSON.stringify(output)) > LIMITS.traceBytes) {
    const key = Object.keys(output)
      .reverse()
      .find(
        (name) => !["errorCode", "stage", "generationAttemptId"].includes(name),
      );
    if (!key) break;
    delete output[key];
  }
  return output;
}

export type IncidentEvent = {
  phoneKey?: string;
  id: string;
  event: string;
  occurredAt: string;
  source: string;
  release: string;
  market: string;
  definition: Definition;
  context: Record<string, any>;
  operationId: string | null;
  fingerprint: string;
};

export function normalizeIncidentEvent(
  input: any,
  now = Date.now(),
): { value?: IncidentEvent; error?: string } {
  if (
    !input ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      input.id || "",
    )
  )
    return { error: "invalid_id" };
  const time = Date.parse(input.occurredAt);
  if (!Number.isFinite(time) || time > now + 300000)
    return { error: "invalid_time" };
  if (time < now - LIMITS.queueAgeMs) return { error: "expired" };
  if (
    typeof input.event !== "string" ||
    !/^[a-z0-9_:-]{1,80}$/.test(input.event)
  )
    return { error: "invalid_event" };
  let definition = classifyEvent(input.event);
  if (
    (input.event === "generate_error" &&
      [401, 402].includes(
        Number(input.context?.statusCode ?? input.context?.status),
      )) ||
    (["phone_upload_transfer_error", "phone_upload_file_error"].includes(
      input.event,
    ) &&
      Number(input.context?.statusCode || input.context?.status) === 410)
  ) {
    definition = {
      kind: "expected",
      stage: "authentication_or_session_required",
      running: false,
    };
  }
  if (
    input.event === "batch_paused" &&
    ["service_worker_restarted", "user_cancelled", "cancelled"].includes(
      input.context?.reason,
    )
  ) {
    definition = { kind: "expected", stage: "interrupted", running: false };
  }
  if (
    ["batch_resume_failed", "batch_paused"].includes(input.event) &&
    input.context?.reason === "recovery_files_expired"
  ) {
    definition = { kind: "expected", stage: "expired", running: false };
  }
  const context = sanitizeContext(
    input.context,
    definition.kind === "incident" || definition.kind === "report",
  );
  const release = redact(
    input.extensionVersion || input.release || "unknown",
    80,
  );
  const market = /^[a-z]{2}(?:-[a-z]{2})?$/i.test(
    input.market || context.market || "",
  )
    ? String(input.market || context.market).toLowerCase()
    : "unknown";
  const operationId =
    context.generationAttemptId ||
    context.operationId ||
    context.batchId ||
    null;
  const code = String(context.errorCode || input.event)
    .toLowerCase()
    .replace(/\d+/g, "#")
    .slice(0, 120);
  const stage =
    definition.stage ||
    context.stage ||
    context.lastConfirmedStage ||
    "unknown";
  const fingerprint = createHash("sha256")
    .update(
      [
        code,
        stage,
        release,
        market,
        definition.kind === "report" ? input.id : "",
      ].join("|"),
    )
    .digest("hex");
  return {
    value: {
      id: input.id,
      event: input.event,
      occurredAt: new Date(time).toISOString(),
      source: redact(input.source || "unknown", 80),
      release,
      market,
      definition,
      context,
      operationId,
      fingerprint,
    },
  };
}
