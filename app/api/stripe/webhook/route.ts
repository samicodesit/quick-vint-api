import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/utils/supabaseClient';
import { getTierByStripePriceId } from '@/utils/tierConfig';

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

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

export async function POST(request: NextRequest) {
  try {
    // 1) Retrieve raw body + signature header
    const body = await request.text();
    const sigHeader = request.headers.get('stripe-signature');

    if (!sigHeader) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const stripe = getStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sigHeader, getWebhookSecret());
      console.log(`Stripe webhook signature OK. Event: ${event.type}`);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    // 2) Handle event types
    switch (event.type) {
      case 'checkout.session.completed': {
        console.log('Handling checkout.session.completed');
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const email = session.customer_details?.email!;

        if (session.mode === 'subscription' && session.subscription) {
          // Fetch the full Subscription
          const subscription = (await getStripe().subscriptions.retrieve(
            session.subscription as string
          )) as any;

          // Pull interval from the first item's plan
          const priceId = subscription.items.data[0]?.price.id;
          const tierConfig = getTierByStripePriceId(priceId);
          const tier = tierConfig?.name || 'free';
          const status = subscription.status as string;

          // Pull current_period_end from items.data[0]
          const rawEnd = subscription.items.data[0]?.current_period_end;
          let currentPeriodEnd: string | null = null;
          if (typeof rawEnd === 'number') {
            currentPeriodEnd = new Date(rawEnd * 1000).toISOString();
          }

          // 2a) Upsert stripe_customer_id
          await supabase.from('profiles').update({ stripe_customer_id: customerId }).ilike('email', email);

          // 2b) Find the user's profile row by email
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', email)
            .single();

          if (profileRow) {
            await supabase
              .from('profiles')
              .update({
                stripe_subscription_id: subscription.id,
                stripe_customer_id: customerId,
                subscription_tier: tier,
                subscription_status: status,
                current_period_end: currentPeriodEnd,
              })
              .eq('id', profileRow.id);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        console.log(`Handling ${event.type}`);
        const subscription = event.data.object as Stripe.Subscription;
        const subAny = subscription as any;

        const customerId = subAny.customer as string;
        // Same logic: price ID from items.data[0].price.id
        const priceId = subscription.items.data[0]?.price.id;
        const tierConfig = getTierByStripePriceId(priceId);
        const tier = tierConfig?.name || 'free';
        const status = subscription.status as string;

        // Pull current_period_end from items.data[0]
        const rawEnd = subAny.items.data[0]?.current_period_end as number | undefined;
        let currentPeriodEnd: string | null = null;
        if (typeof rawEnd === 'number') {
          currentPeriodEnd = new Date(rawEnd * 1000).toISOString();
        }

        // 1) Try find profile by stripe_customer_id
        let { data: profileRow } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        // 2) Fallback: match by email if no customer_id found
        if (!profileRow) {
          const customer = await getStripe().customers.retrieve(customerId);
          const custAny = customer as any;
          const email = custAny.email as string | undefined;
          if (email) {
            const { data } = await supabase
              .from('profiles')
              .select('id')
              .ilike('email', email)
              .single();
            profileRow = data as any;
          }
        }

        if (profileRow) {
          await supabase
            .from('profiles')
            .update({
              stripe_subscription_id: subAny.id,
              subscription_tier: tier,
              subscription_status: status,
              current_period_end: currentPeriodEnd,
            })
            .eq('id', profileRow.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        console.log('Handling customer.subscription.deleted');
        const subscription = event.data.object as Stripe.Subscription;
        const subAny = subscription as any;
        const customerId = subAny.customer as string;

        const { data: profileRow } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profileRow) {
          await supabase
            .from('profiles')
            .update({
              subscription_status: 'canceled',
              subscription_tier: 'free',
              current_period_end: null,
            })
            .eq('id', profileRow.id);
        }
        break;
      }

      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Error handling Stripe webhook:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

// Configure route to parse raw body
export const runtime = 'nodejs';
