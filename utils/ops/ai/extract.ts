import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Actor, CommandMeta } from "../../../src/ops/contracts/core";
import {
  requestAnalysisSchema,
  validateProposals,
  type Proposal,
} from "../../../src/ops/contracts/extraction";
import { userClient, check } from "../inventory/intake";
import {
  ONTOLOGY_VERSION,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  extractionPrompt,
} from "./prompt";
import { responseFormat } from "./schema";
import {
  estimateCostMinor,
  maxReservationMinor,
  type ProviderUsage,
} from "./usage";

const runtimeSchema = z.object({
  model: z.string().trim().min(1),
  maxInputTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive().max(4096),
  inputPerMillionMinor: z.number().int().nonnegative(),
  outputPerMillionMinor: z.number().int().nonnegative(),
  rateEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function runtimeConfig(env = process.env) {
  if (env.OPS_AI_ENABLED !== "true") return null;
  return runtimeSchema.parse({
    model: env.OPS_AI_MODEL,
    maxInputTokens: Number(env.OPS_AI_MAX_INPUT_TOKENS),
    maxOutputTokens: Number(env.OPS_AI_MAX_OUTPUT_TOKENS),
    inputPerMillionMinor: Number(env.OPS_AI_INPUT_RATE_MINOR_PER_MILLION),
    outputPerMillionMinor: Number(env.OPS_AI_OUTPUT_RATE_MINOR_PER_MILLION),
    rateEffectiveDate: env.OPS_AI_RATE_EFFECTIVE_DATE,
  });
}

function serviceClient() {
  const url = process.env.VERCEL_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("OS database is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function requestAnalysis(
  actor: Actor,
  input: z.infer<typeof requestAnalysisSchema>,
  meta: CommandMeta,
  token: string,
) {
  const validated = requestAnalysisSchema.parse(input);
  const config = runtimeConfig();
  if (
    !config &&
    process.env.OPS_ENV !== "local" &&
    process.env.OPS_ENV !== "test"
  )
    return {
      status: "manual",
      reason: "AI is not configured. Enter facts manually.",
    };
  const { data, error } = await userClient(token).rpc("ops_request_analysis", {
    p_workspace_id: actor.workspaceId,
    p_item_id: validated.itemId,
    p_capture_revision: validated.captureRevision,
    p_mode: validated.mode,
    p_model: config?.model ?? "fixture-only",
    p_prompt_version: PROMPT_VERSION,
    p_schema_version: SCHEMA_VERSION,
    p_ontology_version: ONTOLOGY_VERSION,
    p_key: meta.idempotencyKey,
  });
  check(error);
  return data;
}

export async function analysisDetail(actor: Actor, itemId: string) {
  const client = serviceClient();
  const { data: runs, error } = await client
    .from("ops_analysis_runs")
    .select(
      "id,item_id,capture_revision,mode,status,selected_count,omitted_count,error_code,created_at,completed_at",
    )
    .eq("workspace_id", actor.workspaceId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(10);
  check(error);
  const ids = (runs ?? []).map((run) => run.id);
  if (ids.length === 0) return { runs: [], proposals: [] };
  const { data: proposals, error: proposalError } = await client
    .from("ops_analysis_proposals")
    .select(
      "id,run_id,field_name,value_text,value_number,value_unit,reason,label_text,crop,ops_analysis_evidence(asset_id)",
    )
    .eq("workspace_id", actor.workspaceId)
    .in("run_id", ids);
  check(proposalError);
  return { runs, proposals };
}

type AnalysisRun = {
  id: string;
  workspace_id: string;
  item_id: string;
  model: string;
  status: string;
  requested_by: string;
};
type AnalysisAsset = {
  asset_id: string;
  position: number;
  ops_media_assets: { derivative_path: string | null; state: string } | null;
};
type ProviderResult = { proposals: Proposal[]; usage: ProviderUsage };
type AnalyzeDeps = {
  client?: SupabaseClient;
  provider?: (input: {
    model: string;
    prompt: string;
    images: { assetId: string; base64: string }[];
    maxOutputTokens: number;
  }) => Promise<{ raw: unknown; usage: ProviderUsage }>;
  environment?: string;
};

async function openaiProvider(input: {
  model: string;
  prompt: string;
  images: { assetId: string; base64: string }[];
  maxOutputTokens: number;
}) {
  if (!process.env.OPENAI_API_KEY)
    throw new Error("AI provider key is not configured");
  const started = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: globalThis.AbortSignal.timeout(12_000),
    body: JSON.stringify({
      model: input.model,
      store: false,
      truncation: "disabled",
      max_output_tokens: input.maxOutputTokens,
      text: { format: responseFormat },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: input.prompt },
            ...input.images.map((image) => ({
              type: "input_image",
              image_url: `data:image/webp;base64,${image.base64}`,
              detail: "high",
            })),
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const body = (await response.json()) as {
    id?: string;
    status?: string;
    output?: { content?: { type: string; text?: string }[] }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
  if (body.status !== "completed")
    throw new Error("AI provider did not complete");
  const text = body.output
    ?.flatMap((entry) => entry.content ?? [])
    .find((part) => part.type === "output_text")?.text;
  if (!text) throw new Error("AI provider returned no structured output");
  return {
    raw: JSON.parse(text) as unknown,
    usage: {
      responseId: body.id,
      inputTokens: body.usage?.input_tokens,
      outputTokens: body.usage?.output_tokens,
      cachedTokens: body.usage?.input_tokens_details?.cached_tokens,
      latencyMs: Date.now() - started,
    },
  };
}

async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  check(error);
  return data as T;
}

export async function analyseItem(
  job: { workspaceId: string; payload: unknown },
  deps: AnalyzeDeps = {},
) {
  const payload = z
    .object({ runId: z.string().uuid() })
    .strict()
    .parse(job.payload);
  const client = deps.client ?? serviceClient();
  const environment = deps.environment ?? process.env.OPS_ENV ?? "production";
  const { data: run, error } = await client
    .from("ops_analysis_runs")
    .select("id,workspace_id,item_id,model,status,requested_by")
    .eq("workspace_id", job.workspaceId)
    .eq("id", payload.runId)
    .single();
  check(error);
  const analysis = run as AnalysisRun;
  const { data: membership, error: membershipError } = await client
    .from("ops_memberships")
    .select("role")
    .eq("workspace_id", job.workspaceId)
    .eq("user_id", analysis.requested_by)
    .eq("active", true)
    .maybeSingle();
  check(membershipError);
  if (!membership || !["owner", "manager", "lister"].includes(membership.role))
    throw new Error("Requester no longer has analysis access");
  if (analysis.status === "completed")
    return { runId: payload.runId, status: "completed" };
  const { data: entitlement, error: entitlementError } = await client
    .from("ops_ai_entitlements")
    .select("mode,enabled")
    .eq("workspace_id", job.workspaceId)
    .single();
  check(entitlementError);
  if (!entitlement?.enabled) throw new Error("Analysis entitlement revoked");
  if (
    entitlement.mode === "fixture" &&
    environment !== "local" &&
    environment !== "test"
  )
    throw new Error("Fixture analysis disabled");
  const config = runtimeConfig();
  if (entitlement.mode === "openai" && !config)
    throw new Error("AI is disabled; manual review remains available");
  if (entitlement.mode === "openai") {
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("account_status")
      .eq("id", analysis.requested_by)
      .maybeSingle();
    check(profileError);
    if (
      !profile ||
      profile.account_status === "paused" ||
      profile.account_status === "suspended"
    )
      throw new Error("Account is not eligible for AI analysis");
  }
  const { data: rows, error: assetError } = await client
    .from("ops_analysis_run_assets")
    .select("asset_id,position,ops_media_assets(derivative_path,state)")
    .eq("workspace_id", job.workspaceId)
    .eq("run_id", payload.runId)
    .order("position");
  check(assetError);
  const assets = rows as unknown as AnalysisAsset[];
  if (
    assets.length < 1 ||
    assets.length > 8 ||
    assets.some(
      (row) =>
        !row.ops_media_assets?.derivative_path ||
        row.ops_media_assets.state !== "available",
    )
  )
    throw new Error("Selected evidence is unavailable");
  const images: { assetId: string; base64: string }[] = [];
  if (entitlement.mode === "openai")
    for (const row of assets) {
      const { data, error: downloadError } = await client.storage
        .from("ops-derivatives")
        .download(row.ops_media_assets!.derivative_path!);
      check(downloadError);
      const buffer = Buffer.from(await data!.arrayBuffer());
      if (buffer.length > 4_000_000)
        throw new Error("Derivative exceeds AI input bound");
      images.push({ assetId: row.asset_id, base64: buffer.toString("base64") });
    }
  const reserve =
    entitlement.mode === "fixture"
      ? 0
      : maxReservationMinor({
          maxInputTokens: config!.maxInputTokens,
          maxOutputTokens: config!.maxOutputTokens,
          rates: {
            inputPerMillionMinor: config!.inputPerMillionMinor,
            outputPerMillionMinor: config!.outputPerMillionMinor,
          },
        });
  const dispatch = await rpc<{ dispatchId: string; attempt: number }>(
    client,
    "ops_begin_analysis_dispatch",
    { p_run_id: payload.runId, p_reserve_minor: reserve },
  );
  let outcome: ProviderResult;
  try {
    const response =
      entitlement.mode === "fixture"
        ? { raw: { proposals: [] }, usage: { latencyMs: 0 } }
        : await (deps.provider ?? openaiProvider)({
            model: analysis.model,
            prompt: extractionPrompt(assets.map((row) => row.asset_id)),
            images,
            maxOutputTokens: config!.maxOutputTokens,
          });
    outcome = {
      proposals: validateProposals(response.raw, {
        selectedAssetIds: assets.map((row) => row.asset_id),
      }),
      usage: response.usage,
    };
  } catch (cause) {
    await rpc(client, "ops_finish_analysis_dispatch", {
      p_dispatch_id: dispatch.dispatchId,
      p_status: "uncertain",
      p_usage: {},
      p_cost_minor: null,
      p_error_code:
        cause instanceof Error ? cause.name.slice(0, 80) : "PROVIDER_ERROR",
    });
    throw cause;
  }
  const cost =
    entitlement.mode === "fixture"
      ? 0
      : estimateCostMinor(outcome.usage, {
          inputPerMillionMinor: config!.inputPerMillionMinor,
          outputPerMillionMinor: config!.outputPerMillionMinor,
        });
  try {
    return await rpc(client, "ops_record_analysis_result", {
      p_run_id: payload.runId,
      p_dispatch_id: dispatch.dispatchId,
      p_proposals: outcome.proposals,
      p_usage: outcome.usage,
      p_cost_minor: cost,
      p_rate_effective_date:
        entitlement.mode === "fixture" ? null : config!.rateEffectiveDate,
    });
  } catch (cause) {
    // The provider may have billed even if the result write failed or its reply was lost.
    try {
      await rpc(client, "ops_finish_analysis_dispatch", {
        p_dispatch_id: dispatch.dispatchId,
        p_status: "uncertain",
        p_usage: outcome.usage,
        p_cost_minor: cost,
        p_error_code: "RESULT_UNCONFIRMED",
      });
    } catch {
      /* A committed result already settled the dispatch. */
    }
    throw cause;
  }
}
