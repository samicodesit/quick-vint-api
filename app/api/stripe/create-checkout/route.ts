import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/utils/supabaseClient';
import { TIER_CONFIGS } from '@/utils/tierConfig';

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

function getSuccessUrl(): string {
  const url = process.env.STRIPE_SUCCESS_URL;
  if (!url) {
    throw new Error('STRIPE_SUCCESS_URL is not configured');
  }
  return url;
}

function getCancelUrl(): string {
  const url = process.env.STRIPE_CANCEL_URL;
  if (!url) {
    throw new Error('STRIPE_CANCEL_URL is not configured');
  }
  return url;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, tier } = body as {
      email: string;
      tier: 'starter' | 'pro' | 'business';
    };

    // 1) Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    // 2) Validate tier and get price ID
    if (!tier || !TIER_CONFIGS[tier]) {
      return NextResponse.json({ error: 'Invalid tier specified.' }, { status: 400 });
    }

    const tierConfig = TIER_CONFIGS[tier];
    const priceId = tierConfig.stripe.priceId;

    // 3) Look up existing stripe_customer_id in Supabase
    let customerId: string | null = null;
    {
      const { data: profileRow, error: fetchErr } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .ilike('email', email)
        .single();

      if (fetchErr) {
        console.error('Error fetching profile for checkout:', fetchErr);
        // continue - we can create a new customer
      } else if (profileRow?.stripe_customer_id) {
        customerId = profileRow.stripe_customer_id;
      }
    }

    const stripe = getStripe();

    // 4) If we have a customerId, verify it still exists in Stripe
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
        // If no error, customer still exists, keep using it.
      } catch (stripeErr: any) {
        console.warn('Stored customer not found, will create new:', stripeErr.message);
        customerId = null;
      }
    }

    // 5) If no valid customerId, create a new Stripe Customer
    if (!customerId) {
      const newCustomer = await stripe.customers.create({
        email,
        metadata: { source: 'auto_lister_extension' },
      });
      customerId = newCustomer.id;

      // Persist stripe_customer_id back to Supabase
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .ilike('email', email);

      if (updateErr) {
        console.error('Error saving new stripe_customer_id:', updateErr);
        // But we can proceed with the new customerId anyway.
      }
    }

    // 6) Create Stripe Checkout Session using priceId and the validated customerId
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer: customerId,
      success_url: `${getSuccessUrl()}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getCancelUrl()}?session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('create-checkout error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
