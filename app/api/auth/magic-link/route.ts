import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { isDisposableEmail } from '@/utils/disposableDomains';
import { handleCorsPreflight, addCorsHeaders, getAllowedOrigin } from '@/lib/cors';

// Required for static export with API routes
export const dynamic = 'force-static';

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  const origin = getAllowedOrigin(request);

  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      const response = NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
      return origin ? addCorsHeaders(response, origin) : response;
    }

    if (isDisposableEmail(email)) {
      const response = NextResponse.json(
        {
          error:
            'Disposable emails are not allowed. If you have previously used or attempt to use one, you risk legal action. Contact us for appeal, or if you believe this is a mistake.',
        },
        { status: 400 }
      );
      return origin ? addCorsHeaders(response, origin) : response;
    }

    const appSiteUrl = process.env.VERCEL_APP_SITE_URL;
    if (!appSiteUrl) {
      console.error('VERCEL_APP_SITE_URL is not set in environment variables.');
      const response = NextResponse.json(
        { error: 'Server configuration error related to redirect URL.' },
        { status: 500 }
      );
      return origin ? addCorsHeaders(response, origin) : response;
    }

    // Support both Chrome extension URLs and web URLs
    const emailRedirectTo = appSiteUrl.startsWith('chrome-extension://')
      ? `${appSiteUrl}/callback.html`
      : `${appSiteUrl}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: emailRedirectTo,
      },
    });

    if (error) {
      console.error('Supabase signInWithOtp error:', error.message);
      const response = NextResponse.json(
        { error: error.message || 'Failed to send magic link.' },
        { status: 500 }
      );
      return origin ? addCorsHeaders(response, origin) : response;
    }

    const response = NextResponse.json({
      message: 'Magic link sent successfully! Please check your email.',
    });

    return origin ? addCorsHeaders(response, origin) : response;
  } catch (error: any) {
    console.error('Magic link error:', error);
    const response = NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
    return origin ? addCorsHeaders(response, origin) : response;
  }
}
