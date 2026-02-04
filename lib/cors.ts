import { NextRequest, NextResponse } from 'next/server';

// CORS allowed origins from environment
const rawOrigins = process.env.VERCEL_APP_ALLOWED_ORIGINS || '';
const ALLOWED_ORIGINS = rawOrigins
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Vinted domain pattern (case-insensitive)
export const vintedOriginPattern =
  /^https:\/\/(?:[\w-]+\.)?vinted\.(?:[a-z]{2,}|co\.[a-z]{2})$/i;

// Chrome extension pattern
export const chromeExtensionPattern = /^chrome-extension:\/\/[a-z]{32}$/i;

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string): boolean {
  // Check explicit allowed origins
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  // Check Vinted domains
  if (vintedOriginPattern.test(origin)) {
    return true;
  }

  // Check Chrome extension origins
  if (chromeExtensionPattern.test(origin)) {
    return true;
  }

  return false;
}

/**
 * Create CORS headers for a response
 */
export function createCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflight(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  const response = new NextResponse(null, { status: 200 });

  const headers = createCorsHeaders(origin);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

/**
 * Add CORS headers to an existing response
 */
export function addCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  if (origin && isOriginAllowed(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  return response;
}

/**
 * Get allowed origin for CORS (for use in API routes)
 * Returns the origin if allowed, null otherwise
 */
export function getAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  return isOriginAllowed(origin) ? origin : null;
}
