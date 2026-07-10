import type { VercelRequest } from "@vercel/node";
import { supabase } from "./supabaseClient";

const INTERNAL_LOG_EXCLUDED_EMAILS = new Set([
  "samicodesit@gmail.com",
]);

export interface ApiLogData {
  userId?: string;
  endpoint?: string;
  requestMethod: string;
  userAgent?: string;
  origin?: string;
  ipAddress?: string;

  // Request data
  imageUrls?: string[];
  rawPrompt?: string;
  fullRequestBody?: any;

  // Response data
  generatedTitle?: string;
  generatedDescription?: string;
  responseStatus?: number;
  openaiModel?: string;
  openaiTokensUsed?: number;
  openaiPromptTokens?: number;
  openaiCompletionTokens?: number;
  openaiCachedTokens?: number;

  // User context
  userEmail?: string;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  apiCallsCount?: number;

  // Performance
  processingDurationMs?: number;

  // Security flags
  suspiciousActivity?: boolean;
  flaggedReason?: string;
}

export interface ApiLogCompactionResult {
  cutoffHours: number;
  cutoffIso: string;
  batchSize: number;
  compacted: number;
}

export class ApiLogger {
  private static getApproxDataUrlBytes(dataUrl: string) {
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex === -1) return null;
    return Math.floor(((dataUrl.length - commaIndex - 1) * 3) / 4);
  }

  private static sanitizeImageUrlForLog(rawUrl: string) {
    const value = String(rawUrl || "");
    if (/^data:/i.test(value)) {
      const mimeEnd = value.indexOf(";");
      const mime =
        value.slice(5, mimeEnd > 5 ? mimeEnd : undefined).slice(0, 80) ||
        "unknown";
      const approxBytes = this.getApproxDataUrlBytes(value);
      return {
        kind: "data_url",
        mime,
        approxBytes,
      };
    }

    if (/^blob:/i.test(value)) {
      return { kind: "blob_url" };
    }

    if (/^https?:\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        return {
          kind: "remote_url",
          url: `${parsed.origin}${parsed.pathname}`.slice(0, 1000),
        };
      } catch {
        return { kind: "remote_url", url: value.slice(0, 1000) };
      }
    }

    return { kind: "unknown", length: value.length };
  }

  private static sanitizeImageUrlsForLog(imageUrls?: string[]) {
    if (!Array.isArray(imageUrls)) return null;
    return imageUrls.map((url) => this.sanitizeImageUrlForLog(url));
  }

  private static isInternalLogExcludedEmail(email?: string) {
    return INTERNAL_LOG_EXCLUDED_EMAILS.has(
      String(email || "").trim().toLowerCase(),
    );
  }

  private static isSuspiciousExternalImageUrl(rawUrl: string) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return false;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) return false;

    const hostname = parsedUrl.hostname.toLowerCase();
    const trustedImageHost =
      hostname.includes("vinted") ||
      hostname.includes("imgur") ||
      hostname.includes("cloudinary");
    if (trustedImageHost) return false;

    const inspectedUrl = `${hostname}${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();
    return ["adult", "porn", "xxx"].some((keyword) =>
      inspectedUrl.includes(keyword),
    );
  }

  private static buildInsertRow(data: ApiLogData) {
    return {
      user_id: data.userId,
      endpoint: data.endpoint || "/api/generate",
      request_method: data.requestMethod,
      user_agent: data.userAgent,
      origin: data.origin,
      ip_address: data.ipAddress,

      image_urls: data.imageUrls
        ? JSON.stringify(this.sanitizeImageUrlsForLog(data.imageUrls))
        : null,
      raw_prompt: data.rawPrompt,
      full_request_body: data.fullRequestBody,

      generated_title: data.generatedTitle,
      generated_description: data.generatedDescription,
      response_status: data.responseStatus,
      openai_model: data.openaiModel,
      openai_tokens_used: data.openaiTokensUsed,
      openai_prompt_tokens: data.openaiPromptTokens,
      openai_completion_tokens: data.openaiCompletionTokens,
      openai_cached_tokens: data.openaiCachedTokens,

      user_email: data.userEmail,
      subscription_tier: data.subscriptionTier,
      subscription_status: data.subscriptionStatus,
      api_calls_count: data.apiCallsCount,

      processing_duration_ms: data.processingDurationMs,

      suspicious_activity: data.suspiciousActivity || false,
      flagged_reason: data.flaggedReason,
    };
  }

  /**
   * Log an API request with comprehensive data for monitoring and security
   */
  static async logRequest(data: ApiLogData): Promise<void> {
    await this.logRequests([data]);
  }

  static async logRequests(items: ApiLogData[]): Promise<void> {
    const loggableItems = items.filter(
      (item) => !this.isInternalLogExcludedEmail(item.userEmail),
    );
    if (!loggableItems.length) return;

    try {
      const { error } = await supabase
        .from("api_logs")
        .insert(loggableItems.map((item) => this.buildInsertRow(item)));

      if (error) {
        console.error("Failed to log API request(s):", error);
        // Don't throw error to avoid disrupting the main API flow
      }
    } catch (err) {
      console.error("Error in ApiLogger.logRequests:", err);
      // Don't throw error to avoid disrupting the main API flow
    }
  }

  static async compactOldLogs({
    cutoffHours,
    cutoffDays = 90,
    batchSize = 1000,
  }: {
    cutoffHours?: number;
    cutoffDays?: number;
    batchSize?: number;
  } = {}): Promise<ApiLogCompactionResult> {
    const rawCutoffHours =
      typeof cutoffHours === "number" ? cutoffHours : cutoffDays * 24;
    const safeCutoffHours = Math.max(1, Math.floor(rawCutoffHours));
    const safeBatchSize = Math.max(1, Math.min(Math.floor(batchSize), 5000));
    const cutoffIso = new Date(
      Date.now() - safeCutoffHours * 60 * 60 * 1000,
    ).toISOString();

    const heavyFieldFilter = [
      "image_urls.not.is.null",
      "raw_prompt.not.is.null",
      "full_request_body.not.is.null",
      "generated_title.not.is.null",
      "generated_description.not.is.null",
      "user_agent.not.is.null",
      "origin.not.is.null",
      "ip_address.not.is.null",
      "user_email.not.is.null",
    ].join(",");

    const { data: rows, error: selectError } = await supabase
      .from("api_logs")
      .select("id")
      .lt("created_at", cutoffIso)
      .or(heavyFieldFilter)
      .order("created_at", { ascending: true })
      .limit(safeBatchSize);

    if (selectError) {
      throw selectError;
    }

    const ids = (rows || [])
      .map((row: { id: string }) => row.id)
      .filter(Boolean);
    if (!ids.length) {
      return {
        cutoffHours: safeCutoffHours,
        cutoffIso,
        batchSize: safeBatchSize,
        compacted: 0,
      };
    }

    const { error: updateError } = await supabase
      .from("api_logs")
      .update({
        image_urls: null,
        raw_prompt: null,
        full_request_body: null,
        generated_title: null,
        generated_description: null,
        user_agent: null,
        origin: null,
        ip_address: null,
        user_email: null,
      })
      .in("id", ids);

    if (updateError) {
      throw updateError;
    }

    return {
      cutoffHours: safeCutoffHours,
      cutoffIso,
      batchSize: safeBatchSize,
      compacted: ids.length,
    };
  }

  /**
   * Flag a request as suspicious for review
   */
  static async flagSuspiciousActivity(
    logId: string,
    reason: string,
    reviewedBy?: string,
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from("api_logs")
        .update({
          suspicious_activity: true,
          flagged_reason: reason,
          reviewed_by: reviewedBy,
          reviewed_at: reviewedBy ? new Date().toISOString() : null,
        })
        .eq("id", logId);

      if (error) {
        console.error("Failed to flag suspicious activity:", error);
      }
    } catch (err) {
      console.error("Error in ApiLogger.flagSuspiciousActivity:", err);
    }
  }

  /**
   * Extract request metadata from Vercel request
   */
  static extractRequestMetadata(req: VercelRequest) {
    return {
      userAgent: req.headers["user-agent"],
      origin: req.headers.origin,
      ipAddress: this.getClientIpAddress(req),
      requestMethod: req.method || "UNKNOWN",
    };
  }

  /**
   * Get the real client IP address from various headers
   */
  private static getClientIpAddress(req: VercelRequest): string | undefined {
    return (
      req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      req.headers["x-real-ip"]?.toString() ||
      req.headers["x-client-ip"]?.toString() ||
      req.headers["x-forwarded"]?.toString() ||
      req.headers["forwarded-for"]?.toString() ||
      req.headers["forwarded"]?.toString() ||
      undefined
    );
  }

  /**
   * Detect potentially suspicious patterns in requests
   */
  static detectSuspiciousActivity(data: {
    imageUrls?: string[];
    userProvidedText?: string;
    userAgent?: string;
    requestFrequency?: number;
  }): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check for non-Vinted related content in URLs
    if (
      data.imageUrls?.some((url) => this.isSuspiciousExternalImageUrl(url))
    ) {
      reasons.push("Potentially inappropriate image URLs detected");
    }

    // Check only user-controlled text. Generated system prompts contain words
    // like "spammy" as safety instructions and must not self-trigger flags.
    if (data.userProvidedText) {
      const suspiciousKeywords = [
        "hack",
        "exploit",
        "malware",
        "virus",
        "attack",
        "adult",
        "porn",
        "xxx",
        "sexual",
        "explicit",
        "drug",
        "illegal",
        "weapon",
        "violence",
        "spam",
        "scam",
        "fraud",
        "phishing",
      ];

      const lowerPrompt = data.userProvidedText.toLowerCase();
      const foundSuspiciousKeywords = suspiciousKeywords.filter((keyword) =>
        lowerPrompt.includes(keyword),
      );

      if (foundSuspiciousKeywords.length > 0) {
        reasons.push(
          `Suspicious keywords detected: ${foundSuspiciousKeywords.join(", ")}`,
        );
      }
    }

    // Check for automated/bot behavior
    if (
      data.userAgent &&
      (data.userAgent.includes("bot") ||
        data.userAgent.includes("crawler") ||
        data.userAgent.includes("spider") ||
        !data.userAgent.includes("Mozilla")) // Very basic check
    ) {
      reasons.push("Potential bot/automated traffic detected");
    }

    return {
      suspicious: reasons.length > 0,
      reasons,
    };
  }
}

export default ApiLogger;
