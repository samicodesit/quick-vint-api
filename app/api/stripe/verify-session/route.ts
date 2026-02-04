import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Required for static export with API routes
export const dynamic = 'force-static';

// Lazy-initialize Stripe to avoid build-time errors
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key, {});
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get('session_id');

    if (!session_id) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Missing session_id parameter',
        },
        { status: 400 }
      );
    }

    // Retrieve the session from Stripe
    const session = await getStripe().checkout.sessions.retrieve(session_id);

    // Check if session is valid and payment was successful
    const isValid =
      session && session.payment_status === 'paid' && session.status === 'complete';

    if (isValid) {
      return NextResponse.json({
        valid: true,
        session: {
          id: session.id,
          customer_email: session.customer_details?.email,
          amount_total: session.amount_total,
          currency: session.currency,
          payment_status: session.payment_status,
          subscription_id: session.subscription,
          created: session.created,
        },
      });
    } else {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid or incomplete session',
          session_status: session?.status,
          payment_status: session?.payment_status,
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Stripe session verification error:', error);

    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid session ID',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        valid: false,
        error: 'Failed to verify session',
      },
      { status: 500 }
    );
  }
}
