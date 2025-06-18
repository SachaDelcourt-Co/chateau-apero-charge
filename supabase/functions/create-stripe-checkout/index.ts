import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Stripe from 'https://esm.sh/stripe@14.21.0';

interface CreateCheckoutRequest {
  card_id: string;
  amount: number;
  client_request_id: string;
  success_url?: string;
  cancel_url?: string;
}

interface CreateCheckoutResponse {
  success: boolean;
  checkout_url?: string;
  session_id?: string;
  error?: string;
  details?: any;
}

// CORS headers for preflight requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200, 
      headers: corsHeaders 
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Method not allowed' 
      }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    console.log('[create-stripe-checkout] Starting checkout session creation');
    
    // Parse request body
    let requestData: CreateCheckoutRequest;
    try {
      requestData = await req.json();
      console.log('[create-stripe-checkout] Request data:', JSON.stringify(requestData, null, 2));
    } catch (parseError) {
      console.error('[create-stripe-checkout] Failed to parse request JSON:', parseError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON in request body' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate required fields
    const { card_id, amount, client_request_id } = requestData;
    
    if (!card_id || !amount || !client_request_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: card_id, amount, client_request_id' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate amount (must be positive and reasonable)
    if (typeof amount !== 'number' || amount <= 0 || amount > 1000) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Amount must be a positive number between 0.01 and 1000 euros' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if card exists
    const { data: cardData, error: cardError } = await supabase
      .from('table_cards')
      .select('id, amount')
      .eq('id', card_id)
      .maybeSingle();

    if (cardError) {
      console.error('[create-stripe-checkout] Error checking card:', cardError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database error while checking card' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!cardData) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Card not found' 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check for duplicate client_request_id to prevent duplicate checkout sessions
    const { data: existingRequest, error: idempotencyError } = await supabase
      .from('idempotency_keys')
      .select('response_payload, status')
      .eq('request_id', client_request_id)
      .eq('source_function', 'create-stripe-checkout')
      .maybeSingle();

    if (idempotencyError) {
      console.error('[create-stripe-checkout] Error checking idempotency:', idempotencyError);
    } else if (existingRequest) {
      if (existingRequest.status === 'completed') {
        console.log('[create-stripe-checkout] Returning cached response for duplicate request');
        return new Response(
          existingRequest.response_payload,
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      } else if (existingRequest.status === 'processing') {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Request is already being processed' 
          }),
          { 
            status: 409, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // Record idempotency key as processing
    await supabase
      .from('idempotency_keys')
      .upsert({
        request_id: client_request_id,
        source_function: 'create-stripe-checkout',
        status: 'processing',
        created_at: new Date().toISOString()
      });

    // Initialize Stripe (support both test and live modes)
    const isTestMode = Deno.env.get('STRIPE_TEST_MODE') === 'true';
    const stripeSecretKey = isTestMode 
      ? Deno.env.get('STRIPE_SECRET_KEY_TEST') 
      : Deno.env.get('STRIPE_SECRET_KEY_FINAL');
    
    if (!stripeSecretKey) {
      throw new Error(`Missing Stripe secret key for ${isTestMode ? 'test' : 'live'} mode`);
    }
    
    console.log(`[create-stripe-checkout] Using ${isTestMode ? 'TEST' : 'LIVE'} mode`);

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    // Get request origin for URLs
    const referer = req.headers.get('referer');
    const origin = req.headers.get('origin') || (referer ? referer.split('/').slice(0, 3).join('/') : null) || 'https://localhost:3000';
    
    // Use provided URLs or construct default ones
    // IMPORTANT: Stripe will automatically append session_id parameter to success_url
    const successUrl = requestData.success_url || `${origin}/payment-success?card_id=${card_id}&amount=${amount}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = requestData.cancel_url || `${origin}/payment?canceled=true`;

    console.log('[create-stripe-checkout] Creating Stripe session with:', {
      amount,
      card_id,
      successUrl,
      cancelUrl,
      client_request_id,
      mode: isTestMode ? 'TEST' : 'LIVE'
    });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'bancontact'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Recharge de carte',
              description: `Recharge carte ID: ${card_id}`,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: card_id, // Store card ID for webhook processing
      metadata: {
        card_id: card_id,
        original_amount: amount.toString(),
        client_request_id: client_request_id,
        source: 'create-stripe-checkout'
      }
    });

    console.log('[create-stripe-checkout] Stripe session created:', {
      session_id: session.id,
      url: session.url
    });

    // Prepare successful response
    const response = {
      success: true,
      checkout_url: session.url,
      session_id: session.id
    };

    // Update idempotency key with completed status and response
    await supabase
      .from('idempotency_keys')
      .update({
        status: 'completed',
        response_payload: JSON.stringify(response),
        updated_at: new Date().toISOString()
      })
      .eq('request_id', client_request_id)
      .eq('source_function', 'create-stripe-checkout');

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[create-stripe-checkout] Error:', error);

    // Update idempotency key to failed status if we have client_request_id
    if (req.url) {
      try {
        const body = await req.clone().json();
        if (body?.client_request_id) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          if (supabaseUrl && supabaseServiceKey) {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            await supabase
              .from('idempotency_keys')
              .update({
                status: 'failed',
                error_details: error.message,
                updated_at: new Date().toISOString()
              })
              .eq('request_id', body.client_request_id)
              .eq('source_function', 'create-stripe-checkout');
          }
        }
      } catch (e) {
        // Ignore cleanup errors
        console.error('[create-stripe-checkout] Error during cleanup:', e);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        details: error.stack
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}); 