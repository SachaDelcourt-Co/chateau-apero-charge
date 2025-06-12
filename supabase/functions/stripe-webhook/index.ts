import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// =====================================================
// ENVIRONMENT CONFIGURATION
// =====================================================

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY_FINAL') || '', {
  apiVersion: '2022-11-15',
});

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

// Create Supabase client with service role key for database operations
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false } }
);

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Generates a unique request ID for tracing and logging
 */
function generateRequestId(): string {
  return `stripe-webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Logs structured information with request tracing
 */
function logInfo(requestId: string, message: string, data?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    level: 'INFO',
    message,
    ...(data && { data })
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Logs structured errors with request tracing
 */
function logError(requestId: string, message: string, error?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    level: 'ERROR',
    message,
    ...(error && { error: error.message || error })
  };
  console.error(JSON.stringify(logEntry));
}

/**
 * Validates Stripe webhook signature
 */
function verifyWebhookSignature(body: string, signature: string): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(body, signature, endpointSecret);
  } catch (error) {
    throw new Error(`Webhook signature verification failed: ${error.message}`);
  }
}

/**
 * Validates checkout session metadata
 */
function validateSessionMetadata(session: Stripe.Checkout.Session): { cardId: string; amount: string } {
  const cardId = session.metadata?.cardId;
  const amount = session.metadata?.amount;
  
  if (!cardId || !amount) {
    throw new Error(`Missing required metadata - cardId: ${cardId}, amount: ${amount}`);
  }
  
  // Validate amount is a valid number
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error(`Invalid amount in metadata: ${amount}`);
  }
  
  return { cardId, amount };
}

/**
 * Calls the atomic stored procedure for Stripe recharge processing
 */
async function processStripeRecharge(
  requestId: string,
  cardId: string,
  amount: string,
  stripeSessionId: string,
  stripeMetadata: any
): Promise<any> {
  logInfo(requestId, 'Calling sp_process_stripe_recharge', {
    cardId,
    amount,
    stripeSessionId
  });

  const { data, error } = await supabaseClient.rpc('sp_process_stripe_recharge', {
    card_id_in: cardId,
    amount_in: parseFloat(amount),
    stripe_session_id_in: stripeSessionId,
    stripe_metadata_in: stripeMetadata
  });

  if (error) {
    logError(requestId, 'Stored procedure call failed', error);
    throw error;
  }

  logInfo(requestId, 'Stored procedure completed successfully', data);
  return data;
}

// =====================================================
// MAIN WEBHOOK HANDLER
// =====================================================

serve(async (req) => {
  const requestId = generateRequestId();
  
  logInfo(requestId, 'Stripe webhook request received', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });

  // Validate HTTP method
  if (req.method !== 'POST') {
    logError(requestId, 'Invalid HTTP method', { method: req.method });
    return new Response('Method not allowed', { status: 405 });
  }

  // Validate Stripe signature header
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    logError(requestId, 'Missing Stripe signature header');
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  try {
    // Read request body
    const body = await req.text();
    logInfo(requestId, 'Request body received', { bodyLength: body.length });

    // Verify webhook signature and construct event
    let event: Stripe.Event;
    try {
      event = verifyWebhookSignature(body, signature);
      logInfo(requestId, 'Webhook signature verified successfully', {
        eventType: event.type,
        eventId: event.id
      });
    } catch (error) {
      logError(requestId, 'Webhook signature verification failed', error);
      return new Response(`Webhook signature verification failed: ${error.message}`, { 
        status: 400 
      });
    }

    // Filter for checkout.session.completed events only
    if (event.type !== 'checkout.session.completed') {
      logInfo(requestId, 'Ignoring non-checkout event', { eventType: event.type });
      return new Response(JSON.stringify({ 
        received: true, 
        message: 'Event type not processed',
        eventType: event.type 
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract session data
    const session = event.data.object as Stripe.Checkout.Session;
    logInfo(requestId, 'Processing checkout.session.completed event', {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      metadata: session.metadata
    });

    // Validate session payment status
    if (session.payment_status !== 'paid') {
      logError(requestId, 'Session payment not completed', {
        sessionId: session.id,
        paymentStatus: session.payment_status
      });
      return new Response('Payment not completed', { status: 400 });
    }

    // Validate and extract metadata
    let cardId: string;
    let amount: string;
    try {
      const metadata = validateSessionMetadata(session);
      cardId = metadata.cardId;
      amount = metadata.amount;
    } catch (error) {
      logError(requestId, 'Metadata validation failed', error);
      return new Response(`Invalid session metadata: ${error.message}`, { status: 400 });
    }

    // Process recharge using atomic stored procedure
    let result: any;
    try {
      result = await processStripeRecharge(
        requestId,
        cardId,
        amount,
        session.id,
        session.metadata || {}
      );
    } catch (error) {
      logError(requestId, 'Recharge processing failed', error);
      
      // Check if it's a duplicate session error (expected behavior)
      if (error.message?.includes('Duplicate Stripe session') || 
          result?.error === 'Duplicate Stripe session') {
        logInfo(requestId, 'Duplicate session detected - returning success', {
          sessionId: session.id
        });
        return new Response(JSON.stringify({
          received: true,
          message: 'Duplicate session - already processed',
          sessionId: session.id
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Check if it's a card not found error
      if (error.message?.includes('Card not found')) {
        logError(requestId, 'Card not found', { cardId });
        return new Response(`Card not found: ${cardId}`, { status: 404 });
      }
      
      // Generic database error
      return new Response(`Database error: ${error.message}`, { status: 500 });
    }

    // Handle stored procedure response
    if (!result.success) {
      if (result.error === 'Duplicate Stripe session') {
        logInfo(requestId, 'Duplicate session handled by stored procedure', {
          sessionId: session.id
        });
        return new Response(JSON.stringify({
          received: true,
          message: 'Duplicate session - already processed',
          sessionId: session.id
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      logError(requestId, 'Stored procedure returned error', result);
      return new Response(`Processing error: ${result.error}`, { status: 500 });
    }

    // Success response
    const successResponse = {
      received: true,
      cardId: cardId,
      rechargeAmount: parseFloat(amount),
      previousBalance: result.previous_balance,
      newBalance: result.new_balance,
      transactionId: result.transaction_id,
      sessionId: session.id
    };

    logInfo(requestId, 'Recharge processed successfully', successResponse);

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logError(requestId, 'Unexpected error in webhook handler', error);
    return new Response(`Webhook error: ${error.message}`, { status: 500 });
  }
});
