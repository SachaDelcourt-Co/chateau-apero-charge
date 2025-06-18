import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Stripe from 'https://esm.sh/stripe@14.21.0';

// =====================================================
// ENVIRONMENT CONFIGURATION
// =====================================================

// Support both test and live modes
const isTestMode = Deno.env.get('STRIPE_TEST_MODE') === 'true';
const stripeSecretKey = isTestMode 
  ? Deno.env.get('STRIPE_SECRET_KEY_TEST') 
  : Deno.env.get('STRIPE_SECRET_KEY_FINAL');

const stripe = new Stripe(stripeSecretKey || '', {
  apiVersion: '2023-10-16',
});

console.log(`[stripe-webhook] Initialized in ${isTestMode ? 'TEST' : 'LIVE'} mode`);

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

// Create Supabase client with service role key for database operations
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false } }
);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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
 * Validates Stripe webhook signature (ASYNC VERSION for Deno)
 */
async function verifyWebhookSignature(body: string, signature: string): Promise<Stripe.Event> {
  try {
    // Use the async version for Deno edge runtime
    return await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
  } catch (error) {
    throw new Error(`Webhook signature verification failed: ${error.message}`);
  }
}

/**
 * Calls the simplified stored procedure for Stripe recharge processing
 */
async function processStripeRecharge(
  requestId: string,
  cardId: string,
  amount: number,
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
    amount_in: amount,
    stripe_session_id_in: stripeSessionId,
    stripe_metadata_in: stripeMetadata || {}
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
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200, 
      headers: corsHeaders 
    });
  }
  
  // Log basic request info
  logInfo(requestId, 'Stripe webhook request received', {
    method: req.method,
    userAgent: req.headers.get('user-agent'),
    hasStripeSignature: !!req.headers.get('stripe-signature')
  });

  // Validate HTTP method
  if (req.method !== 'POST') {
    logError(requestId, 'Invalid HTTP method', { method: req.method });
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }), 
      { 
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  // Validate Stripe signature header
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    logError(requestId, 'Missing Stripe signature header');
    return new Response(
      JSON.stringify({ 
        error: 'Missing stripe-signature header',
        message: 'This endpoint should only be called by Stripe webhooks'
      }), 
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    // Read request body
    const body = await req.text();
    
    if (!body) {
      logError(requestId, 'Empty request body');
      return new Response(
        JSON.stringify({ error: 'Empty request body' }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    logInfo(requestId, 'Request body received', { 
      bodyLength: body.length
    });

    // Verify webhook signature (ASYNC)
    let event: Stripe.Event;
    try {
      event = await verifyWebhookSignature(body, signature);
      logInfo(requestId, 'Webhook signature verified successfully', {
        eventType: event.type,
        eventId: event.id
      });
    } catch (error) {
      logError(requestId, 'Webhook signature verification failed', error);
      return new Response(
        JSON.stringify({ 
          error: `Webhook signature verification failed: ${error.message}`
        }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Only process checkout.session.completed events
    if (event.type !== 'checkout.session.completed') {
      logInfo(requestId, 'Ignoring non-checkout event', { eventType: event.type });
      return new Response(JSON.stringify({ 
        received: true, 
        message: 'Event type not processed',
        eventType: event.type 
      }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract session data
    const session = event.data.object as Stripe.Checkout.Session;
    logInfo(requestId, 'Processing checkout.session.completed event', {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      metadata: session.metadata,
      clientReferenceId: session.client_reference_id,
      amountTotal: session.amount_total
    });

    // Validate payment is completed
    if (session.payment_status !== 'paid') {
      logError(requestId, 'Payment not completed', {
        sessionId: session.id,
        paymentStatus: session.payment_status
      });
      return new Response(
        JSON.stringify({ error: 'Payment not completed' }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Extract metadata
    const metadata = session.metadata || {};
    const cardId = metadata.card_id || metadata.cardId;
    // Support both 'amount' and 'original_amount' field names
    const amount = metadata.amount || metadata.original_amount;
    
    logInfo(requestId, 'Extracted metadata fields', {
      cardId,
      amount,
      hasAmount: !!metadata.amount,
      hasOriginalAmount: !!metadata.original_amount,
      allMetadataKeys: Object.keys(metadata)
    });

    // Enhanced validation with better error details
    const missingFields: string[] = [];
    if (!cardId) missingFields.push('card_id');
    if (!amount) missingFields.push('amount');

    if (missingFields.length > 0) {
      logError(requestId, 'Missing required metadata', {
        missingFields,
        cardId,
        amount,
        allMetadata: metadata,
        sessionId: session.id
      });
      return new Response(
        JSON.stringify({ 
          error: `Missing required metadata fields: ${missingFields.join(', ')}`,
          details: {
            received_metadata: metadata,
            missing_fields: missingFields
          }
        }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      logError(requestId, 'Invalid amount', { amount });
      return new Response(
        JSON.stringify({ error: 'Invalid amount in metadata' }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Process the recharge
    try {
      const result = await processStripeRecharge(
        requestId,
        cardId,
        numericAmount,
        session.id,
        metadata
      );

      // Check if it was a duplicate (expected behavior)
      if (result && result.success === false && result.error === 'Duplicate Stripe session') {
        logInfo(requestId, 'Duplicate session handled gracefully', {
          sessionId: session.id
        });
        return new Response(JSON.stringify({
          received: true,
          message: 'Duplicate session - already processed',
          sessionId: session.id
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Success case
      logInfo(requestId, 'Webhook processed successfully', {
        cardId,
        amount: numericAmount,
        sessionId: session.id,
        result
      });

      return new Response(JSON.stringify({
        received: true,
        message: 'Webhook processed successfully',
        data: {
          cardId,
          amount: numericAmount,
          sessionId: session.id,
          result
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      logError(requestId, 'Failed to process recharge', error);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to process recharge',
          details: error.message 
        }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    logError(requestId, 'Unexpected error in webhook processing', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
