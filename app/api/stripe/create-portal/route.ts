import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/utils/supabaseClient';

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

function getReturnUrl(): string {
  const url = process.env.STRIPE_PORTAL_RETURN_URL;
  if (!url) {
    throw new Error('STRIPE_PORTAL_RETURN_URL is not configured');
  }
  return url;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body as { email: string };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    // 1) Look up the user's stripe_customer_id in Supabase (profiles table).
    const { data: profileRow, error: fetchErr } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .ilike('email', email)
      .single();

    if (fetchErr || !profileRow?.stripe_customer_id) {
      console.error('No stripe_customer_id found for:', email, fetchErr);
      return NextResponse.json(
        { error: 'No Stripe customer on file for this user.' },
        { status: 400 }
      );
    }

    const customerId = profileRow.stripe_customer_id;

    // Get the user's subscription ID to direct them to subscription management
    const { data: profileData } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .ilike('email', email)
      .single();

    // 2) Create a Customer Portal session that lands on subscription management
    const portalSessionConfig: any = {
      customer: customerId,
      return_url: getReturnUrl(),
    };

    // If user has an active subscription, direct them to subscription management
    if (profileData?.stripe_subscription_id) {
      portalSessionConfig.flow_data = {
        type: 'subscription_update',
        subscription_update: {
          subscription: profileData.stripe_subscription_id,
        },
      };
    }

    const portalSession = await getStripe().billingPortal.sessions.create(portalSessionConfig);

    // 3) Return the URL to the popup
    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error('create-portal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
