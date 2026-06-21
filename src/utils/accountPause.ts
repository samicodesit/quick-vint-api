export const ACCOUNT_PAUSED_CODE = "account_paused";
export const ACCOUNT_PAUSED_MESSAGE =
  "This account is paused because it appears linked to duplicate free-trial usage. To continue, contact support or choose a paid option.";

export type AccountPauseProfile = {
  account_status?: string | null;
  abuse_reason?: string | null;
};

export function isAccountPaused(
  profile: AccountPauseProfile | null | undefined,
) {
  return profile?.account_status === "paused";
}

export function buildAccountPausedResponse(
  profile: AccountPauseProfile | null | undefined,
) {
  return {
    error: ACCOUNT_PAUSED_MESSAGE,
    code: ACCOUNT_PAUSED_CODE,
    reason: ACCOUNT_PAUSED_CODE,
    limitScope: "account" as const,
    currentTier: "free",
    allowed: false,
    available: 0,
    message: ACCOUNT_PAUSED_MESSAGE,
    abuseReason: profile?.abuse_reason || null,
  };
}

export function buildClearAccountPauseUpdate() {
  return {
    account_status: "active",
    abuse_reason: null,
    abuse_notes: null,
    paused_at: null,
    paused_by: null,
  };
}
