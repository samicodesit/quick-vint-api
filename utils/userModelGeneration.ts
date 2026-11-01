import { createHash } from "node:crypto";
import {
  compileModelPrompt,
  type ModelPreferences,
  type ModelScene,
} from "./userModelCatalog";
export const IMAGE_MODEL = "gpt-image-2.5-flare-2026-09-08";
export const CHECK_MODEL = "gpt-5.4-mini-2026-03-17";
export const MODEL_BUCKET = "user-models";
export const QUALITY_PROMPT =
  "Check this synthetic mirror selfie for three objective product requirements. phone_obscures_face: true if a phone naturally obscures the central face so this is not a clear visible-face portrait. Forehead, ears, cheeks, jaw, chin, partial eyebrows and small eye-edge fragments are acceptable. Do NOT require 100 percent face coverage. False if the phone is beside or below the face, or substantial central features make a clearly visible face. full_body_and_shoes_visible: true ONLY if top of hair, entire body and BOTH complete shoes are inside the frame. no_major_defects: true if there are no obvious extra or missing limbs, grossly broken hands, duplicate people, text or watermarks. Minor natural imperfections are acceptable. Judge cropping by the image boundary. A normal stance with one foot behind the other is acceptable. Shoe soles do not need to be visible; the shoes must simply remain inside the frame.";
export type Quality = {
  phone_obscures_face: boolean;
  full_body_and_shoes_visible: boolean;
  no_major_defects: boolean;
};
export function parseQuality(text: string): Quality {
  const result = JSON.parse(text);
  const keys = [
    "phone_obscures_face",
    "full_body_and_shoes_visible",
    "no_major_defects",
  ];
  if (
    !result ||
    Object.keys(result).length !== 3 ||
    keys.some((key) => typeof result[key] !== "boolean")
  )
    throw new Error("invalid_quality_response");
  return result;
}
export interface ModelJob {
  id: string;
  user_id: string;
  operation_id: string;
  lease_token: string;
  attempt_count: number;
  preferences: ModelPreferences;
  scene: ModelScene;
  prompt_version: number;
  catalog_version: number;
}
export type Metrics = Record<string, unknown>;
export interface GenerationDependencies {
  mutate(
    user: string,
    action: string,
    input: Record<string, unknown>,
  ): Promise<any>;
  generate(
    job: ModelJob,
  ): Promise<{ bytes: Buffer; usage: any; durationMs: number }>;
  check(
    bytes: Buffer,
  ): Promise<{ quality: Quality; usage: any; durationMs: number }>;
  upload(key: string, bytes: Buffer): Promise<void>;
}
export function estimatedModelCost(imageUsage: any, checkUsage: any) {
  // USD estimate from published token rates. Retain raw usage for future reconciliation.
  return (
    ((imageUsage?.input_tokens || 0) * 5 +
      (imageUsage?.output_tokens || 0) * 30 +
      (checkUsage?.input_tokens || 0) * 0.75 +
      (checkUsage?.output_tokens || 0) * 4.5) /
    1_000_000
  );
}
export async function runModelOperation(
  user: string,
  operationId: string,
  deps: GenerationDependencies,
): Promise<void> {
  for (let n = 0; n < 2; n++) {
    const job: ModelJob | null = await deps.mutate(user, "claim", {
      operationId,
    });
    if (!job) return;
    const started = Date.now();
    const metrics: Metrics = {
      imageModel: IMAGE_MODEL,
      checkModel: CHECK_MODEL,
      quality: "medium",
      size: "1024x1536",
      format: "jpeg",
      compression: 90,
    };
    let code = "provider_failed";
    try {
      if (job.prompt_version !== 1 || job.catalog_version !== 1)
        throw new Error("unsupported_recipe");
      const generated = await deps.generate(job);
      metrics.generationMs = generated.durationMs;
      metrics.imageUsage = generated.usage;
      const key = `${job.id}/${operationId}/${job.attempt_count}.jpg`;
      // Upload stays private. Publication is fenced and only follows successful QA.
      code = "storage_or_check_failed";
      const [check, upload] = await Promise.allSettled([
        deps.check(generated.bytes),
        deps.upload(key, generated.bytes),
      ]);
      if (check.status === "fulfilled") {
        metrics.checkMs = check.value.durationMs;
        metrics.checkUsage = check.value.usage;
        metrics.validation = check.value.quality;
      }
      metrics.usageComplete = Boolean(generated.usage && metrics.checkUsage);
      metrics.estimatedCostUsd = metrics.usageComplete
        ? estimatedModelCost(generated.usage, metrics.checkUsage)
        : null;
      if (upload.status === "rejected") {
        code = "storage_failed";
        throw upload.reason;
      }
      if (check.status === "rejected") {
        code = "check_failed";
        throw check.reason;
      }
      if (!Object.values(check.value.quality).every(Boolean)) {
        code = "quality_failed";
        throw new Error(code);
      }
      metrics.durationMs = Date.now() - started;
      await deps.mutate(user, "finish", {
        operationId,
        lease: job.lease_token,
        metrics,
      });
      return;
    } catch {
      metrics.durationMs = Date.now() - started;
      metrics.usageComplete = Boolean(metrics.imageUsage && metrics.checkUsage);
      metrics.estimatedCostUsd = metrics.usageComplete
        ? estimatedModelCost(metrics.imageUsage, metrics.checkUsage)
        : null;
      const result = await deps.mutate(user, "fail", {
        operationId,
        lease: job.lease_token,
        errorCode: code,
        metrics,
      });
      if (result?.state !== "queued") return;
    }
  }
}
async function openai(path: string, body: object, timeout: number) {
  const key = process.env.VERCEL_APP_OPENAI_API_KEY;
  if (!key) throw new Error("model_provider_not_configured");
  const response = await fetch("https://api.openai.com/v1/" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error("model_provider_" + response.status);
  return response.json();
}
export async function generateModelImage(job: ModelJob) {
  const started = Date.now();
  const response = await openai(
    "images/generations",
    {
      model: IMAGE_MODEL,
      prompt: compileModelPrompt(job.preferences, job.scene),
      n: 1,
      quality: "medium",
      size: "1024x1536",
      output_format: "jpeg",
      output_compression: 90,
      background: "opaque",
      safety_identifier: createHash("sha256").update(job.user_id).digest("hex"),
    },
    50000,
  );
  const image = response.data?.[0]?.b64_json;
  if (typeof image !== "string" || image.length > 14_000_000)
    throw new Error("invalid_model_image");
  const bytes = Buffer.from(image, "base64");
  if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("invalid_model_image");
  return { bytes, usage: response.usage, durationMs: Date.now() - started };
}
export async function checkModelImage(bytes: Buffer) {
  const started = Date.now();
  const response = await openai(
    "responses",
    {
      model: CHECK_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 600,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: QUALITY_PROMPT },
            {
              type: "input_image",
              image_url: "data:image/jpeg;base64," + bytes.toString("base64"),
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "model_quality",
          strict: true,
          schema: {
            type: "object",
            properties: {
              phone_obscures_face: { type: "boolean" },
              full_body_and_shoes_visible: { type: "boolean" },
              no_major_defects: { type: "boolean" },
            },
            required: [
              "phone_obscures_face",
              "full_body_and_shoes_visible",
              "no_major_defects",
            ],
            additionalProperties: false,
          },
        },
      },
    },
    10000,
  );
  if (response.status !== "completed")
    throw new Error("incomplete_model_check");
  const text = response.output
    ?.flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === "output_text")
    .map((item: any) => item.text)
    .join("");
  return {
    quality: parseQuality(text),
    usage: response.usage,
    durationMs: Date.now() - started,
  };
}
export async function uploadModelImage(key: string, bytes: Buffer) {
  const response = await fetch(
    process.env.VERCEL_APP_SUPABASE_URL +
      "/storage/v1/object/" +
      MODEL_BUCKET +
      "/" +
      key,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        "Content-Type": "image/jpeg",
        "x-upsert": "false",
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("model_storage_" + response.status);
}
