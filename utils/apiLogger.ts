import { supabase } from './supabaseClient';
import type { VercelRequest } from '@vercel/node';

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

export class ApiLogger {
  /**
   * Log an API request with comprehensive data for monitoring and security
   */
  static async logRequest(data: ApiLogData): Promise<void> {
    try {
      const { error } = await supabase
        .from('api_logs')
        .insert({
          user_id: data.userId,
          endpoint: data.endpoint || '/api/generate',
          request_method: data.requestMethod,
          user_agent: data.userAgent,
          origin: data.origin,
          ip_address: data.ipAddress,
          
          image_urls: data.imageUrls ? JSON.stringify(data.imageUrls) : null,
          raw_prompt: data.rawPrompt,
          full_request_body: data.fullRequestBody,
          
          generated_title: data.generatedTitle,
          generated_description: data.generatedDescription,
          response_status: data.responseStatus,
          openai_model: data.openaiModel,
          openai_tokens_used: data.openaiTokensUsed,
          
          user_email: data.userEmail,
          subscription_tier: data.subscriptionTier,
          subscription_status: data.subscriptionStatus,
          api_calls_count: data.apiCallsCount,
          
          processing_duration_ms: data.processingDurationMs,
          
          suspicious_activity: data.suspiciousActivity || false,
          flagged_reason: data.flaggedReason,
        });

      if (error) {
        console.error('Failed to log API request:', error);
        // Don't throw error to avoid disrupting the main API flow
      }
    } catch (err) {
      console.error('Error in ApiLogger.logRequest:', err);
      // Don't throw error to avoid disrupting the main API flow
    }
  }

  /**
   * Flag a request as suspicious for review
   */
  static async flagSuspiciousActivity(
    logId: string, 
    reason: string, 
    reviewedBy?: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('api_logs')
        .update({
          suspicious_activity: true,
          flagged_reason: reason,
          reviewed_by: reviewedBy,
          reviewed_at: reviewedBy ? new Date().toISOString() : null,
        })
        .eq('id', logId);

      if (error) {
        console.error('Failed to flag suspicious activity:', error);
      }
    } catch (err) {
      console.error('Error in ApiLogger.flagSuspiciousActivity:', err);
    }
  }

  /**
   * Extract request metadata from Vercel request
   */
  static extractRequestMetadata(req: VercelRequest) {
    return {
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
      ipAddress: this.getClientIpAddress(req),
      requestMethod: req.method || 'UNKNOWN',
    };
  }

  /**
   * Get the real client IP address from various headers
   */
  private static getClientIpAddress(req: VercelRequest): string | undefined {
    return (
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.headers['x-real-ip']?.toString() ||
      req.headers['x-client-ip']?.toString() ||
      req.headers['x-forwarded']?.toString() ||
      req.headers['forwarded-for']?.toString() ||
      req.headers['forwarded']?.toString() ||
      undefined
    );
  }

  /**
   * Detect potentially suspicious patterns in requests
   */
  static detectSuspiciousActivity(data: {
    imageUrls?: string[];
    rawPrompt?: string;
    userAgent?: string;
    requestFrequency?: number;
  }): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check for non-Vinted related content in URLs
    if (data.imageUrls?.some(url => 
      !url.includes('vinted') && 
      !url.includes('imgur') && 
      !url.includes('cloudinary') &&
      (url.includes('adult') || url.includes('porn') || url.includes('xxx'))
    )) {
      reasons.push('Potentially inappropriate image URLs detected');
    }

    // Check for suspicious prompt content
    if (data.rawPrompt) {
      const suspiciousKeywords = [
        'hack', 'exploit', 'malware', 'virus', 'attack',
        'adult', 'porn', 'xxx', 'sexual', 'explicit',
        'drug', 'illegal', 'weapon', 'violence',
        'spam', 'scam', 'fraud', 'phishing'
      ];
      
      const lowerPrompt = data.rawPrompt.toLowerCase();
      const foundSuspiciousKeywords = suspiciousKeywords.filter(keyword => 
        lowerPrompt.includes(keyword)
      );
      
      if (foundSuspiciousKeywords.length > 0) {
        reasons.push(`Suspicious keywords detected: ${foundSuspiciousKeywords.join(', ')}`);
      }
    }

    // Check for automated/bot behavior
    if (data.userAgent && (
      data.userAgent.includes('bot') ||
      data.userAgent.includes('crawler') ||
      data.userAgent.includes('spider') ||
      !data.userAgent.includes('Mozilla') // Very basic check
    )) {
      reasons.push('Potential bot/automated traffic detected');
    }

    // Check for high frequency requests (if provided)
    if (data.requestFrequency && data.requestFrequency > 10) {
      reasons.push(`High request frequency: ${data.requestFrequency} requests`);
    }

    return {
      suspicious: reasons.length > 0,
      reasons
    };
  }
}

export default ApiLogger;