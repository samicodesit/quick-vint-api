import { supabase } from "../supabaseClient";

export type AuthNotificationEvidence = {
  status: "silent_renewed" | "signed_in" | "not_recorded" | "unavailable";
  checkedAt: string;
  renewedAt?: string;
  signInRequired?: boolean;
  blockedGenerateAt?: string;
};

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export function isBackgroundAuthFailure(payload: any): boolean {
  const context = payload?.example?.context;
  return (
    ["token_refresh_failed", "token_refresh_expired"].includes(
      payload?.event,
    ) &&
    payload?.source === "extension_background" &&
    ["startup_restore", "scheduled_refresh", "sdk_refresh"].includes(
      context?.entryPoint,
    ) &&
    !context?.parentOperationId
  );
}

function compatibleVersion(value: unknown, patch: number): boolean {
  const match =
    typeof value === "string" && /^(\d+)\.(\d+)\.(\d+)(?:\.\d+)?$/.exec(value);
  return Boolean(
    match &&
    (+match[1] > 1 ||
      (+match[1] === 1 &&
        (+match[2] > 4 || (+match[2] === 4 && +match[3] >= patch)))),
  );
}

/** Read-only enrichment of the sampled failure, never an issue-state decision. */
export async function loadAuthNotificationEvidence(
  payload: any,
): Promise<AuthNotificationEvidence | undefined> {
  if (!isBackgroundAuthFailure(payload)) return undefined;
  const checkedAt = new Date().toISOString();
  const unavailable: AuthNotificationEvidence = {
    status: "unavailable",
    checkedAt,
  };
  const example = payload.example;
  const context = example.context;
  const owner = example.userId;
  const operation = example.operationId || context.operationId;
  const client = context.analyticsClientId;
  const failedAt = Date.parse(example.occurredAt);
  if (
    example.identityVerified !== true ||
    !uuid.test(owner || "") ||
    !uuid.test(operation || "") ||
    (context.operationId && context.operationId !== operation) ||
    typeof client !== "string" ||
    !/^[\w.:-]{1,120}$/.test(client) ||
    !Number.isFinite(failedAt) ||
    failedAt > Date.parse(checkedAt)
  )
    return unavailable;

  try {
    const query = (endpoint: string, reference: string) =>
      supabase
        .from("api_logs")
        .select("id,user_id,endpoint,created_at,full_request_body")
        .eq("user_id", owner)
        .eq("endpoint", endpoint)
        .eq("full_request_body->context->>analyticsClientId", client)
        .eq(`full_request_body->context->>${reference}`, operation)
        .gte("created_at", new Date(failedAt - 300000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5)
        .abortSignal(AbortSignal.timeout(1500));
    const [sessions, actions] = await Promise.all([
      query("/event/auth_session_result", "operationId"),
      query("/event/auth_action_result", "authRefreshOperationId"),
    ]);
    if (sessions.error || actions.error) return unavailable;
    const valid = (
      row: any,
      endpoint: string,
      reference: string,
      patch: number,
    ) => {
      const body = row.full_request_body || {};
      const data = body.context || {};
      const at = Date.parse(body.occurredAt);
      const received = Date.parse(row.created_at);
      return (
        row.user_id === owner &&
        row.endpoint === endpoint &&
        data.analyticsClientId === client &&
        data[reference] === operation &&
        compatibleVersion(body.extensionVersion, patch) &&
        Number.isFinite(at) &&
        at >= failedAt &&
        at <= Date.parse(checkedAt) &&
        Number.isFinite(received) &&
        received >= failedAt - 300000 &&
        received <= Date.parse(checkedAt)
      );
    };
    const renewal = (sessions.data || [])
      .filter((row) => {
        const body = row.full_request_body || {};
        const data = body.context || {};
        return (
          valid(row, "/event/auth_session_result", "operationId", 21) &&
          body.source === "extension_background" &&
          typeof data.signInRequired === "boolean" &&
          ((data.resultStatus === "silent_renewed" &&
            data.reason === "token_refresh_success" &&
            uuid.test(data.authRefreshOperationId || "")) ||
            (data.resultStatus === "signed_in" &&
              data.reason === "auth_success"))
        );
      })
      .sort(
        (a, b) =>
          Date.parse(b.full_request_body.occurredAt) -
          Date.parse(a.full_request_body.occurredAt),
      )[0];
    const blocked = (actions.data || []).find((row) => {
      const body = row.full_request_body || {};
      const data = body.context || {};
      return (
        valid(row, "/event/auth_action_result", "authRefreshOperationId", 19) &&
        body.source === "extension_content" &&
        data.entryPoint === "generate" &&
        data.resultStatus === "blocked" &&
        (data.statusCode === 401 || data.reason === "session_missing") &&
        uuid.test(data.operationId || "") &&
        typeof data.generationAttemptId === "string" &&
        Boolean(data.generationAttemptId)
      );
    });
    return {
      status: renewal?.full_request_body.context.resultStatus || "not_recorded",
      checkedAt,
      ...(renewal
        ? {
            renewedAt: renewal.full_request_body.occurredAt,
            signInRequired: renewal.full_request_body.context.signInRequired,
          }
        : {}),
      ...(blocked
        ? { blockedGenerateAt: blocked.full_request_body.occurredAt }
        : {}),
    };
  } catch {
    // Recovery lookup must neither silence the original failure nor retry auth.
    return unavailable;
  }
}
