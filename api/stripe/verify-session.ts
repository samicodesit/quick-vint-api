import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id } = req.query;

    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({ 
        valid: false, 
        error: 'Missing session_id parameter' 
      });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Check if session is valid and payment was successful
    const isValid = session && 
                   session.payment_status === 'paid' && 
                   session.status === 'complete';

    if (isValid) {
      return res.status(200).json({
        valid: true,
        session: {
          id: session.id,
          customer_email: session.customer_details?.email,
          amount_total: session.amount_total,
          currency: session.currency,
          payment_status: session.payment_status,
          subscription_id: session.subscription,
          created: session.created
        }
      });
    } else {
      return res.status(400).json({
        valid: false,
        error: 'Invalid or incomplete session',
        session_status: session?.status,
        payment_status: session?.payment_status
      });
    }

  } catch (error: any) {
    console.error('Stripe session verification error:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        valid: false,
        error: 'Invalid session ID'
      });
    }

    return res.status(500).json({
      valid: false,
      error: 'Failed to verify session'
    });
  }
}