import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { supabase } from '@/utils/supabaseClient';
import { RateLimiter } from '@/utils/rateLimiter';
import { ApiLogger } from '@/utils/apiLogger';
import { languageMap } from '@/utils/languageMap';
import { isDisposableEmail } from '@/utils/disposableDomains';

// Required for static export with API routes
export const dynamic = 'force-static';

const OPEN_AI_MODEL = 'gpt-4o-mini';

// Lazy-initialize OpenAI to avoid build-time errors
function getOpenAI(): OpenAI {
  const apiKey = process.env.VERCEL_APP_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('VERCEL_APP_OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey });
}

// CORS allowed origins
const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || '';
const ALLOWED_ORIGINS = rawOrigins
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/i;

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');

  const response = new NextResponse(null, { status: 200 });

  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin) || vintedOriginPattern.test(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
  }

  return response;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestMetadata = ApiLogger.extractRequestMetadata(request);

  // Initialize log data
  let logData: any = {
    ...requestMetadata,
    endpoint: '/api/generate',
  };

  const origin = request.headers.get('origin');

  try {
    // CORS check
    if (origin && !ALLOWED_ORIGINS.includes(origin) && !vintedOriginPattern.test(origin)) {
      logData.responseStatus = 403;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = `CORS error: Origin ${origin} not allowed`;
      await ApiLogger.logRequest(logData);
      return NextResponse.json({ error: 'CORS origin denied' }, { status: 403 });
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
      logData.fullRequestBody = body;
    } catch (e) {
      logData.responseStatus = 400;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = 'Invalid JSON body';
      await ApiLogger.logRequest(logData);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Extract imageUrls early for logging purposes
    if (body && Array.isArray(body.imageUrls)) {
      logData.imageUrls = body.imageUrls;
    }

    // --- AUTH ---
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logData.responseStatus = 401;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = 'Auth header missing or malformed';
      await ApiLogger.logRequest(logData);
      return NextResponse.json({ error: 'Missing or invalid Authorization' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      logData.responseStatus = 401;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = 'Auth token missing from header';
      await ApiLogger.logRequest(logData);
      return NextResponse.json({ error: 'Missing or invalid Authorization' }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      logData.responseStatus = 401;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = `Token validation failed: ${userError?.message || 'No user found for token'}`;
      await ApiLogger.logRequest(logData);
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Add user info to log data
    logData.userId = user.id;
    logData.userEmail = user.email;

    if (isDisposableEmail(user.email || '')) {
      logData.responseStatus = 403;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = 'Disposable email blocked';
      await ApiLogger.logRequest(logData);
      return NextResponse.json(
        {
          error:
            'Disposable emails are not allowed. If you have previously used or attempt to use one, you risk legal action. Contact us for appeal, or if you believe this is a mistake.',
        },
        { status: 403 }
      );
    }

    // --- PROFILE & LIMITS ---
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        'api_calls_this_month, subscription_status, subscription_tier, last_api_call_reset'
      )
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Error fetching profile:', profileError);
      logData.responseStatus = 500;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = 'Profile fetch error';
      await ApiLogger.logRequest(logData);
      return NextResponse.json({ error: 'Could not retrieve profile.' }, { status: 500 });
    }

    // Initialize profile for new users
    if (!profile || !profile.last_api_call_reset) {
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: user.id,
        api_calls_this_month: 0,
        last_api_call_reset: new Date().toISOString(),
        subscription_status: profile?.subscription_status || 'free',
        subscription_tier: profile?.subscription_tier || 'free',
      });

      if (upsertError) {
        console.error('Error initializing user profile:', upsertError);
        logData.responseStatus = 500;
        logData.processingDurationMs = Date.now() - startTime;
        logData.flaggedReason = 'Profile initialization error';
        await ApiLogger.logRequest(logData);
        return NextResponse.json({ error: 'Failed to initialize user profile.' }, { status: 500 });
      }
    }

    // Use the existing profile or the default values for new users
    const userProfile = profile || {
      api_calls_this_month: 0,
      subscription_status: 'free',
      subscription_tier: 'free',
      last_api_call_reset: new Date().toISOString(),
    };

    // Add user profile info to log data
    logData.subscriptionTier = userProfile.subscription_tier;
    logData.subscriptionStatus = userProfile.subscription_status;
    logData.apiCallsCount = userProfile.api_calls_this_month;

    // --- RATE LIMITING ---
    const rateLimitResult = await RateLimiter.checkRateLimit(user.id, userProfile);

    if (!rateLimitResult.allowed) {
      logData.responseStatus = 429;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = 'Rate limit exceeded';
      await ApiLogger.logRequest(logData);
      return NextResponse.json(
        {
          error: rateLimitResult.error || 'Too many requests. Please try again later.',
        },
        { status: 429 }
      );
    }

    // --- VALIDATE BODY ---
    const { imageUrls, languageCode, tone, useEmojis } = body;
    const languageCodeStr = String(languageCode || 'en').toLowerCase();
    const language = languageMap[languageCodeStr] || 'English';

    // --- CONSTRUCT PROMPT INSTRUCTIONS ---
    let toneInstruction = 'neutral and balanced';
    if (tone === 'friendly') toneInstruction = 'friendly, casual, and warm';
    else if (tone === 'professional') toneInstruction = 'professional, clean, and concise';
    else if (tone === 'enthusiastic') toneInstruction = 'enthusiastic, sales-oriented, and exciting';

    const emojiInstruction =
      useEmojis === true || useEmojis === 'true'
        ? 'Use relevant emojis in the description.'
        : 'Do NOT use any emojis in the description.';

    if (
      !Array.isArray(imageUrls) ||
      imageUrls.length === 0 ||
      !imageUrls.every((u: string) => typeof u === 'string' && u.trim())
    ) {
      logData.responseStatus = 400;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = 'Invalid imageUrls format';
      await ApiLogger.logRequest(logData);
      return NextResponse.json(
        { error: 'imageUrls must be a non-empty array of strings.' },
        { status: 400 }
      );
    }

    // Create the prompt for OpenAI
    const systemPrompt =
      'You are a savvy Vinted seller. Your goal is to create listings that are appealing, trustworthy, and get items sold.';
    const userPrompt = `
Analyze the image(s) and generate a title and description in ${language}.
- Title format: [BRAND - Omit if not known] [Color] [Item] - [Size].
- Description: Note a positive condition (e.g., excellent condition, Like new). No negative remarks related to wrinkles or creasing. Highlight a key feature, the feel of the fabric, or a good way to style it. End with 4-5 relevant SEO hashtags. If brand is not visible at all, just skip it, do NOT say "Unknown Brand". Your tone should be ${toneInstruction}. ${emojiInstruction} Apply minimal formatting like line breaks for readability or other necessary formatting only if needed.
Reply only in JSON: {"title":"...","description":"..."}
        `.trim();

    // Log the full prompt being sent to OpenAI
    logData.rawPrompt = `System: ${systemPrompt}\n\nUser: ${userPrompt}\n\nImages: ${imageUrls.length} image(s)`;
    logData.openaiModel = OPEN_AI_MODEL;

    // Check for suspicious activity
    const suspiciousCheck = ApiLogger.detectSuspiciousActivity({
      imageUrls,
      rawPrompt: logData.rawPrompt,
      userAgent: logData.userAgent,
    });

    if (suspiciousCheck.suspicious) {
      logData.suspiciousActivity = true;
      logData.flaggedReason = suspiciousCheck.reasons.join('; ');
      console.warn(`Suspicious activity detected for user ${user.id}:`, suspiciousCheck.reasons);
    }

    // --- GENERATE VIA OPENAI ---
    try {
      const parts: ChatCompletionContentPart[] = imageUrls.map((url: string) => ({
        type: 'image_url',
        image_url: { url, detail: 'auto' },
      }));
      const chat = await getOpenAI().chat.completions.create({
        model: OPEN_AI_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              ...parts,
              {
                type: 'text',
                text: userPrompt,
              },
            ],
          },
        ],
        max_tokens: 150,
      });

      // Log token usage
      logData.openaiTokensUsed = chat.usage?.total_tokens;

      let content = chat.choices?.[0]?.message?.content?.trim() || '{}';
      const md = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(content);
      if (md && md[1]) content = md[1].trim();

      let parsed: { title?: string; description?: string } = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        console.warn('GPT output not valid JSON:', content);
      }

      const title = parsed.title?.trim() || 'Untitled';
      const description = parsed.description?.trim() || 'No description available.';

      // Add generated content to log
      logData.generatedTitle = title;
      logData.generatedDescription = description;
      logData.responseStatus = 200;
      logData.processingDurationMs = Date.now() - startTime;

      // Log the successful request
      await ApiLogger.logRequest(logData);

      // Record successful request for rate limiting
      await RateLimiter.recordSuccessfulRequest(user.id);

      // Increment monthly API call count after successful generation
      const { error: incrementError } = await supabase
        .from('profiles')
        .update({
          api_calls_this_month: userProfile.api_calls_this_month + 1,
        })
        .eq('id', user.id);

      if (incrementError) {
        console.error('Failed to increment monthly API count:', incrementError);
      }

      const response = NextResponse.json({ title, description });

      // Add CORS headers
      if (origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }

      return response;
    } catch (err: any) {
      console.error('Generation error:', err);

      // Determine user-friendly error message
      let userMessage =
        "We're experiencing technical difficulties. Please try again in a moment.";
      let statusCode = 500;

      if (err.message?.includes('Rate limit')) {
        userMessage = 'Our AI service is currently busy. Please try again in a few seconds.';
        statusCode = 429;
      } else if (err.message?.includes('timeout') || err.message?.includes('timed out')) {
        userMessage = 'The request took too long. Please try again.';
        statusCode = 504;
      } else if (err.message?.includes('Invalid') || err.message?.includes('invalid')) {
        userMessage = 'There was an issue processing your images. Please try different images.';
        statusCode = 400;
      }

      // Log the detailed error
      logData.responseStatus = statusCode;
      logData.processingDurationMs = Date.now() - startTime;
      logData.flaggedReason = `OpenAI generation error: ${err.message}`;
      await ApiLogger.logRequest(logData);

      const response = NextResponse.json({ error: userMessage }, { status: statusCode });

      if (origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
      }

      return response;
    }
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
