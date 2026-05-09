import { supabase } from "./supabaseClient";

export interface CreditBalance {
  subscription_credits: number;
  /** How many of subscription_credits rolled over from previous cycles (display only) */
  rollover_credits: number;
  pack_credits: number;
  /** Total immediately spendable (subscription + pack) */
  total: number;
}

type CreditTransactionType =
  | "signup_bonus"
  | "weekly_drip"
  | "subscription_renewal"
  | "pack_purchase"
  | "generation"
  | "rollover_trim"
  | "expiry"
  | "admin_adjustment"
  | "subscription_cancel"
  | "upgrade_proration"
  | "rollover_freeze"
  | "rollover_expiry";

async function logTransaction(
  userId: string,
  amount: number,
  type: CreditTransactionType,
  balanceAfter: number,
  subAfter: number,
  packAfter: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    balance_after: balanceAfter,
    subscription_credits_after: subAfter,
    pack_credits_after: packAfter,
    type,
    metadata: metadata ?? {},
  });
  if (error) {
    console.error("Failed to log credit transaction:", error);
  }
}

export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const { data } = await supabase
    .from("profiles")
    .select("subscription_credits, rollover_credits, pack_credits")
    .eq("id", userId)
    .single();

  const sub = data?.subscription_credits ?? 0;
  const rollover = data?.rollover_credits ?? 0;
  const pack = data?.pack_credits ?? 0;
  return {
    subscription_credits: sub,
    rollover_credits: rollover,
    pack_credits: pack,
    total: sub + pack,
  };
}

/**
 * Deducts one credit after a successful generation.
 * Subscription credits burn first; pack credits last.
 *
 * Uses an atomic Postgres function to prevent the read-then-write race that
 * would otherwise let concurrent generations either lose a deduction or
 * underflow into negative balances. The function returns NULL on insufficient
 * credits.
 */
export async function consumeCredit(
  userId: string,
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; balance: CreditBalance; error?: string }> {
  const { data, error } = await supabase.rpc("consume_credit_atomic", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Failed to consume credit:", error);
    return {
      success: false,
      balance: {
        subscription_credits: 0,
        rollover_credits: 0,
        pack_credits: 0,
        total: 0,
      },
      error: "Credit update failed",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    // RPC returned no row — user had no credits left.
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("subscription_credits, rollover_credits, pack_credits")
      .eq("id", userId)
      .single();
    const sub = profileRow?.subscription_credits ?? 0;
    const rollover = profileRow?.rollover_credits ?? 0;
    const pack = profileRow?.pack_credits ?? 0;
    return {
      success: false,
      balance: {
        subscription_credits: sub,
        rollover_credits: rollover,
        pack_credits: pack,
        total: sub + pack,
      },
      error: "Insufficient credits",
    };
  }

  const newSub = row.subscription_credits ?? 0;
  const newRollover = row.rollover_credits ?? 0;
  const newPack = row.pack_credits ?? 0;
  const newTotal = newSub + newPack;

  await logTransaction(
    userId,
    -1,
    "generation",
    newTotal,
    newSub,
    newPack,
    metadata,
  );

  return {
    success: true,
    balance: {
      subscription_credits: newSub,
      rollover_credits: newRollover,
      pack_credits: newPack,
      total: newTotal,
    },
  };
}

/**
 * Given at new account creation. Sets drip_started_at so the weekly cron knows when to fire.
 */
export async function giveSignupBonus(userId: string): Promise<void> {
  const SIGNUP_BONUS = 5;
  const now = new Date().toISOString();

  await supabase
    .from("profiles")
    .update({
      subscription_credits: SIGNUP_BONUS,
      free_drip_started_at: now,
      free_drip_weeks_delivered: 0,
      is_legacy_plan: false,
    })
    .eq("id", userId);

  await logTransaction(
    userId,
    SIGNUP_BONUS,
    "signup_bonus",
    SIGNUP_BONUS,
    SIGNUP_BONUS,
    0,
  );
}

/**
 * Delivers 2 drip credits to a free-tier user. Called by the weekly-drip cron.
 */
export async function deliverWeeklyDrip(userId: string): Promise<void> {
  const DRIP_AMOUNT = 2;

  const { data } = await supabase
    .from("profiles")
    .select("subscription_credits, pack_credits, free_drip_weeks_delivered")
    .eq("id", userId)
    .single();

  const currentSub = data?.subscription_credits ?? 0;
  const pack = data?.pack_credits ?? 0;
  const weeksDelivered = (data?.free_drip_weeks_delivered ?? 0) + 1;
  const newSub = currentSub + DRIP_AMOUNT;

  await supabase
    .from("profiles")
    .update({
      subscription_credits: newSub,
      free_drip_weeks_delivered: weeksDelivered,
    })
    .eq("id", userId);

  await logTransaction(
    userId,
    DRIP_AMOUNT,
    "weekly_drip",
    newSub + pack,
    newSub,
    pack,
    { weeks_delivered: weeksDelivered },
  );
}

/**
 * Called at subscription renewal or on first subscribe.
 *
 * Banks unused subscription_credits as rollover (capped at rolloverCap),
 * then adds new monthly allocation. Handles renewals, upgrades, and downgrades —
 * the caller passes the new tier's rolloverCap so trimming is automatic.
 *
 * Also handles frozen rollover recovery: if a user resubscribes within the
 * 14-day window after a failed-payment downgrade, their frozen rollover_credits
 * are restored before banking, so they don't lose credits they earned.
 */
export async function grantSubscriptionCredits(
  userId: string,
  monthlyAmount: number,
  rolloverCap: number,
  cycleEnd: string,
): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select(
      "subscription_credits, pack_credits, rollover_credits, rollover_frozen_until",
    )
    .eq("id", userId)
    .single();

  const rawUnusedSub = data?.subscription_credits ?? 0;
  const pack = data?.pack_credits ?? 0;
  const frozenRollover = data?.rollover_credits ?? 0;
  const frozenUntil = data?.rollover_frozen_until as string | null;
  const hasFrozenRollover = !!frozenUntil && new Date(frozenUntil) > new Date();

  // On resubscription after payment failure, use the frozen rollover as the starting balance.
  const unusedSub = hasFrozenRollover
    ? Math.max(rawUnusedSub, frozenRollover)
    : rawUnusedSub;

  const bankedRollover = Math.min(unusedSub, rolloverCap);
  const newSub = bankedRollover + monthlyAmount;

  const updatePayload: Record<string, unknown> = {
    subscription_credits: newSub,
    rollover_credits: bankedRollover,
    credits_cycle_end: cycleEnd,
    is_legacy_plan: false,
  };

  if (hasFrozenRollover) {
    updatePayload.rollover_frozen_until = null;
    updatePayload.payment_grace_started_at = null;
    updatePayload.payment_day5_email_sent = false;
  }

  await supabase.from("profiles").update(updatePayload).eq("id", userId);

  await logTransaction(
    userId,
    monthlyAmount,
    "subscription_renewal",
    newSub + pack,
    newSub,
    pack,
    {
      monthly_granted: monthlyAmount,
      rollover_banked: bankedRollover,
      rollover_cap: rolloverCap,
      cycle_end: cycleEnd,
      frozen_rollover_restored: hasFrozenRollover ? frozenRollover : undefined,
    },
  );
}

/**
 * Called on mid-cycle upgrade (e.g. Starter → Pro).
 *
 * Preserves all existing credits, applies new higher rollover cap going forward,
 * and adds prorated credits for the remaining days in the current billing cycle.
 * Does NOT bank existing credits as rollover — the cycle hasn't ended.
 */
export async function upgradeSubscriptionCredits(
  userId: string,
  proratedCredits: number,
  cycleEnd: string,
): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("subscription_credits, pack_credits")
    .eq("id", userId)
    .single();

  const sub = data?.subscription_credits ?? 0;
  const pack = data?.pack_credits ?? 0;
  const newSub = sub + proratedCredits;

  await supabase
    .from("profiles")
    .update({
      subscription_credits: newSub,
      credits_cycle_end: cycleEnd,
      is_legacy_plan: false,
    })
    .eq("id", userId);

  await logTransaction(
    userId,
    proratedCredits,
    "upgrade_proration",
    newSub + pack,
    newSub,
    pack,
    { prorated_credits: proratedCredits, cycle_end: cycleEnd },
  );
}

/**
 * Adds permanent pack credits to the user's balance. Uses an atomic Postgres
 * function so concurrent pack purchases (or webhook retries) cannot lose
 * credits via read-modify-write races. Webhook-level idempotency further
 * protects against double-credit from Stripe retries.
 */
export async function addPackCredits(
  userId: string,
  amount: number,
): Promise<void> {
  const { data, error } = await supabase.rpc("add_pack_credits_atomic", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error("Failed to add pack credits:", error);
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const sub = row?.subscription_credits ?? 0;
  const newPack = row?.pack_credits ?? 0;

  await logTransaction(
    userId,
    amount,
    "pack_purchase",
    sub + newPack,
    sub,
    newPack,
    { pack_credits_added: amount },
  );
}

/**
 * Zeroes out subscription credits when a subscription is voluntarily cancelled.
 * Pack credits are never touched.
 */
export async function cancelSubscriptionCredits(userId: string): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("pack_credits")
    .eq("id", userId)
    .single();

  const pack = data?.pack_credits ?? 0;

  await supabase
    .from("profiles")
    .update({
      subscription_credits: 0,
      rollover_credits: 0,
      credits_cycle_end: null,
    })
    .eq("id", userId);

  await logTransaction(userId, 0, "subscription_cancel", pack, 0, pack);
}

/**
 * Called when a subscription is cancelled due to failed payment (after 7-day grace).
 *
 * Stores the current subscription_credits as frozen rollover so they can be
 * recovered if the user resubscribes within 14 days. Pack credits are untouched.
 */
export async function freezeSubscriptionCreditsOnFailure(
  userId: string,
  frozenUntil: string,
): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("subscription_credits, pack_credits")
    .eq("id", userId)
    .single();

  const sub = data?.subscription_credits ?? 0;
  const pack = data?.pack_credits ?? 0;

  await supabase
    .from("profiles")
    .update({
      subscription_credits: 0,
      rollover_credits: sub,
      rollover_frozen_until: frozenUntil,
      credits_cycle_end: null,
      payment_grace_started_at: null,
      payment_day5_email_sent: false,
    })
    .eq("id", userId);

  await logTransaction(userId, -sub, "rollover_freeze", pack, 0, pack, {
    frozen_credits: sub,
    frozen_until: frozenUntil,
  });
}

/**
 * Called by the payment-recovery cron after the 14-day rollover freeze expires.
 * Permanently zeros out the frozen rollover credits.
 */
export async function expireFrozenRollover(userId: string): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("rollover_credits, pack_credits")
    .eq("id", userId)
    .single();

  const frozen = data?.rollover_credits ?? 0;
  const pack = data?.pack_credits ?? 0;

  await supabase
    .from("profiles")
    .update({
      rollover_credits: 0,
      rollover_frozen_until: null,
    })
    .eq("id", userId);

  if (frozen > 0) {
    await logTransaction(userId, -frozen, "rollover_expiry", pack, 0, pack, {
      expired_credits: frozen,
    });
  }
}
