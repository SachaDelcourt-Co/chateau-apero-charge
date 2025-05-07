import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    // Parse the request body
    const { amount, cardId, paymentMethods = ['card'] } = await req.json();
    
    if (!amount || !cardId) {
      return new Response(
        JSON.stringify({ error: 'Amount and cardId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating checkout session for card ${cardId} with amount ${amount}`);

    // Initialize Stripe with the final secret key
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY_FINAL') || '', {
      apiVersion: '2022-11-15',
    });

    // Rate limit handling variables
    const maxRetries = 5;
    let retryCount = 0;
    let session;

    // Implement exponential backoff retry logic
    while (retryCount <= maxRetries) {
      try {
        // Create the checkout session
        session = await stripe.checkout.sessions.create({
          payment_method_types: paymentMethods, // Use the provided payment methods or default to card
          line_items: [
            {
              price_data: {
                currency: 'eur',
                product_data: {
                  name: 'Rechargement de carte',
                  description: `Rechargement de la carte ${cardId}`,
                },
                unit_amount: Math.round(amount * 100), // Convert euros to cents
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${req.headers.get('origin')}/payment-success?cardId=${cardId}&amount=${amount}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.headers.get('origin')}/payment/${cardId}`,
          metadata: {
            cardId: cardId,
            amount: amount.toString()
          }
        });
        
        // If we get here, the request was successful
        console.log(`Checkout session created with ID: ${session.id}`);
        break;
      } catch (stripeError) {
        // Check if it's a rate limit error
        if (
          stripeError.type === 'StripeRateLimitError' || 
          stripeError.code === 'rate_limit' ||
          stripeError.statusCode === 429
        ) {
          retryCount++;
          
          // If we've exhausted our retries, throw the error
          if (retryCount > maxRetries) {
            console.error(`Rate limit hit, max retries (${maxRetries}) exceeded.`);
            throw stripeError;
          }
          
          // Calculate backoff time (exponential with jitter)
          const sleepTime = Math.min(Math.pow(2, retryCount) * 500 + Math.random() * 500, 10000);
          console.log(`Rate limit hit, retrying in ${sleepTime}ms (attempt ${retryCount}/${maxRetries})...`);
          
          // Sleep for the backoff time
          await new Promise(resolve => setTimeout(resolve, sleepTime));
        } else {
          // For non-rate-limit errors, throw immediately
          throw stripeError;
        }
      }
    }

    // Return the session ID
    return new Response(
      JSON.stringify({ id: session.id, url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
