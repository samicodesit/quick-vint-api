import { supabase } from "./supabaseClient";
import {
  compareSemver,
  getEffectiveTier,
  type PricingLimitsMode,
} from "./tierConfig";
import type { UserProfile } from "./rateLimiter";

export type GenerationMode = "manual" | "phone_upload" | "batch";

export type GenerationOfferDefinition = {
  campaignKey: string;
  offerCode: string;
  creditAmount: number;
  triggerName: string;
  enabled: boolean;
  title: string;
  body: string;
  cta: string;
};

export type GenerationOfferPayload = {
  id: string;
  campaignKey: string;
  offerCode: string;
  creditAmount: number;
  title: string;
  body: string;
  cta: string;
};

export const GENERATION_OFFER_DEFINITIONS = {
  labelPhotoBonus: {
    campaignKey: "label_photo_bonus_2026_06",
    offerCode: "free_label_photo_generation",
    creditAmount: 1,
    triggerName: "first_free_clothing_generation",
    enabled: true,
    title: "Forgot the label photo?",
    body: "Labels help with size and material.",
    cta: "🎁 Claim 1 free generation",
  },
} satisfies Record<string, GenerationOfferDefinition>;

export const MIN_EXTENSION_VERSION_FOR_GENERATION_OFFERS = "1.3.24";

function serializeOffer(
  row: { id: string; campaign_key: string; offer_code: string; credit_amount: number },
  definition: GenerationOfferDefinition,
): GenerationOfferPayload {
  return {
    id: row.id,
    campaignKey: row.campaign_key,
    offerCode: row.offer_code,
    creditAmount: row.credit_amount,
    title: definition.title,
    body: definition.body,
    cta: definition.cta,
  };
}

export function normalizeGenerationMode(value: unknown): GenerationMode {
  if (value === "phone_upload" || value === "batch") return value;
  return "manual";
}

export async function maybeCreateGenerationOffer({
  userId,
  profile,
  pricingLimitsMode,
  generationMode,
  isClothing,
  reservationId,
  extensionVersion,
}: {
  userId: string;
  profile: UserProfile;
  pricingLimitsMode: PricingLimitsMode;
  generationMode: GenerationMode;
  isClothing: boolean;
  reservationId?: string | null;
  extensionVersion?: string | null;
}): Promise<GenerationOfferPayload[]> {
  const definition = GENERATION_OFFER_DEFINITIONS.labelPhotoBonus;
  const tierKey = getEffectiveTier(profile);

  if (
    !extensionVersion ||
    compareSemver(extensionVersion, MIN_EXTENSION_VERSION_FOR_GENERATION_OFFERS) < 0 ||
    !definition.enabled ||
    pricingLimitsMode !== "current" ||
    tierKey !== "free" ||
    !isClothing ||
    Math.max(0, profile.free_lifetime_generations_used || 0) !== 0
  ) {
    return [];
  }

  const triggerContext = {
    generationMode,
    reservationId: reservationId || null,
  };

  const { data, error } = await supabase
    .from("generation_offers")
    .upsert(
      {
        user_id: userId,
        campaign_key: definition.campaignKey,
        offer_code: definition.offerCode,
        status: "offered",
        credit_amount: definition.creditAmount,
        trigger_name: definition.triggerName,
        trigger_context: triggerContext,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,campaign_key", ignoreDuplicates: true },
    )
    .select("id, campaign_key, offer_code, credit_amount, status")
    .single();

  if (error) {
    if (error.code !== "23505") {
      console.error("Generation offer creation failed:", error);
    }
    return [];
  }

  if (!data || data.status !== "offered") return [];

  return [serializeOffer(data, definition)];
}

export async function claimGenerationOffer(userId: string, offerId: string) {
  const { data, error } = await supabase.rpc("claim_generation_offer", {
    p_user_id: userId,
    p_offer_id: offerId,
  });
  const result = data as any;

  if (error) {
    console.error("Generation offer claim failed:", error);
    return {
      ok: false,
      status: 500,
      body: { error: "Could not claim this offer. Please try again." },
    };
  }

  if (!result?.ok) {
    return {
      ok: false,
      status: result?.code === "offer_not_found" ? 404 : 409,
      body: {
        code: result?.code || "offer_claim_failed",
        error: result?.error || "Could not claim this offer.",
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      offerId: result.offerId,
      campaignKey: result.campaignKey,
      offerCode: result.offerCode,
      creditAmount: result.creditAmount,
      packCredits: result.packCredits,
    },
  };
}

export async function dismissGenerationOffer(userId: string, offerId: string) {
  const { data, error } = await supabase.rpc("dismiss_generation_offer", {
    p_user_id: userId,
    p_offer_id: offerId,
  });
  const result = data as any;

  if (error) {
    console.error("Generation offer dismiss failed:", error);
    return {
      ok: false,
      status: 500,
      body: { error: "Could not dismiss this offer." },
    };
  }

  if (!result?.ok) {
    return {
      ok: false,
      status: result?.code === "offer_not_found" ? 404 : 409,
      body: {
        code: result?.code || "offer_dismiss_failed",
        error: result?.error || "Could not dismiss this offer.",
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      offerId: result.offerId,
      status: result.status,
    },
  };
}
