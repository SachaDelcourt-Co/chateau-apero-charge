import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY_FINAL') || '', {
  apiVersion: '2022-11-15',
});
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

// Create a Supabase client with the service role key
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false } }
);

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    return new Response('Missing stripe signature', { status: 400 });
  }

  try {
    const body = await req.text();
    let event;
    
    // Verify the webhook signature
    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      console.log('Processing Stripe webhook: checkout.session.completed');
      console.log('Session data:', JSON.stringify(session, null, 2));
      
      // Extract metadata
      const cardId = session.metadata?.cardId;
      const amountString = session.metadata?.amount;
      const sessionId = session.id;

      if (!cardId || !amountString) {
        console.error('Missing metadata in Stripe session:', session.metadata);
        return new Response(JSON.stringify({ error: 'Missing cardId or amount in metadata' }), { status: 400 });
      }

      const amountNumber = parseFloat(amountString);

      if (isNaN(amountNumber) || amountNumber <= 0) {
        console.error('Invalid or non-positive amount in metadata. cardId:', cardId, 'amountString:', amountString);
        return new Response(JSON.stringify({ error: 'Invalid or non-positive amount in metadata' }), { status: 400 });
      }

      console.log(`Calling sp_process_stripe_recharge for card ${cardId}, amount ${amountNumber}, session ${sessionId}`);

      try {
        const { data: spResult, error: spError } = await supabaseClient.rpc(
          'sp_process_stripe_recharge',
          {
            card_id_in: cardId,
            amount_in: amountNumber,
            stripe_session_id_in: sessionId,
            stripe_metadata_in: session, // Pass the whole session object as metadata
          }
        );

        if (spError) {
          console.error('Error calling stored procedure sp_process_stripe_recharge:', JSON.stringify(spError, null, 2));
          // Check for specific PostgreSQL error codes or custom codes raised by the SP
          if (spError.code === 'P0001') { // Assuming P0001 is custom 'Card Not Found'
            return new Response(JSON.stringify({ error: 'Card not found', cardId }), { status: 404 });
          } else if (spError.code === '23505' || spError.code === 'P0002') { // 23505 for unique_violation (idempotency), P0002 custom for idempotency
            return new Response(JSON.stringify({ message: 'Transaction already processed or idempotency conflict', cardId }), { status: 200 });
          }
          // Generic database error
          return new Response(JSON.stringify({ error: 'Database error processing recharge', details: spError.message, code: spError.code }), { status: 500 });
        }

        let newBalance;
        if (spResult && typeof spResult === 'object' && spResult.hasOwnProperty('new_balance')) {
            newBalance = spResult.new_balance;
        } else if (spResult && typeof spResult === 'number') { // If SP directly returns the new balance
            newBalance = spResult;
        } else {
            console.warn('Stored procedure sp_process_stripe_recharge did not return new_balance in the expected format. Response will not include it.');
        }

        console.log(`Successfully processed recharge for card ${cardId} via stored procedure. New balance from SP: ${newBalance ?? 'N/A'}`);
        return new Response(JSON.stringify({
          received: true,
          status: 'success',
          message: 'Recharge processed successfully via stored procedure.',
          cardId: cardId,
          rechargeAmount: amountNumber,
          ...(newBalance !== undefined && { newBalance: newBalance }),
        }), { status: 200 });

      } catch (rpcCallError) {
        // Catch any unexpected errors during the RPC call itself (e.g. network issues)
        console.error('Unexpected error calling RPC sp_process_stripe_recharge:', JSON.stringify(rpcCallError, null, 2));
        // It's important to check if rpcCallError has a message property
        const errorMessage = rpcCallError instanceof Error ? rpcCallError.message : String(rpcCallError);
        return new Response(JSON.stringify({ error: 'Failed to communicate with database service', details: errorMessage }), { status: 503 });
      }
    }

    // Return a response for other events
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error(`Error handling webhook: ${err.message}`);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }
});
