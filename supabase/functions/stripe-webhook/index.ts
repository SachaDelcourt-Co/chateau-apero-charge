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
      const amount = session.metadata?.amount;
      const sessionId = session.id;
      
      if (!cardId || !amount) {
        console.error('Missing metadata in Stripe session:', session.metadata);
        return new Response('Missing cardId or amount in metadata', { status: 400 });
      }

      console.log(`Processing payment for card ${cardId} with amount ${amount}`);

      // Rate limit handling variables
      const maxRetries = 5;
      let retryCount = 0;

      // Function to perform database operations with retry
      const performDatabaseOperationWithRetry = async (operation: () => Promise<any>) => {
        while (retryCount <= maxRetries) {
          try {
            return await operation();
          } catch (error) {
            // Check if it's a rate limit error
            if (error.code === '429' || error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
              retryCount++;
              
              // If we've exhausted our retries, throw the error
              if (retryCount > maxRetries) {
                console.error(`Rate limit hit, max retries (${maxRetries}) exceeded.`);
                throw error;
              }
              
              // Calculate backoff time (exponential with jitter)
              const sleepTime = Math.min(Math.pow(2, retryCount) * 500 + Math.random() * 500, 10000);
              console.log(`Rate limit hit, retrying in ${sleepTime}ms (attempt ${retryCount}/${maxRetries})...`);
              
              // Sleep for the backoff time
              await new Promise(resolve => setTimeout(resolve, sleepTime));
            } else {
              // For non-rate-limit errors, throw immediately
              throw error;
            }
          }
        }
      };

      // Check if this transaction has already been processed with retry
      const existingPayment = await performDatabaseOperationWithRetry(async () => {
        const { data, error } = await supabaseClient
          .from('paiements')
          .select('id')
          .eq('stripe_session_id', sessionId)
          .maybeSingle();
          
        if (error) throw error;
        return data;
      });

      // Get the current card details with retry
      const cardData = await performDatabaseOperationWithRetry(async () => {
        const { data, error } = await supabaseClient
          .from('table_cards')
          .select('amount')
          .eq('id', cardId)
          .single();
          
        if (error) throw error;
        return data;
      });

      if (!cardData) {
        console.error('Error fetching card data: Card not found');
        return new Response('Error fetching card data: Card not found', { status: 400 });
      }

      // Calculate new amount - ensure proper addition with toFixed(2)
      const currentAmount = parseFloat(cardData.amount || '0');
      const rechargeAmount = parseFloat(amount);
      // Addition and then format to 2 decimal places
      const newAmount = (currentAmount + rechargeAmount).toFixed(2);

      console.log(`Card ${cardId} current balance: ${currentAmount}, recharge: ${rechargeAmount}, new balance: ${newAmount}`);

      // Update the card amount with retry
      await performDatabaseOperationWithRetry(async () => {
        const { error } = await supabaseClient
          .from('table_cards')
          .update({ amount: newAmount })
          .eq('id', cardId);
          
        if (error) throw error;
      });

      console.log(`Successfully updated card ${cardId} balance to ${newAmount}`);

      // Log the payment in the paiements table with retry
      await performDatabaseOperationWithRetry(async () => {
        const { error } = await supabaseClient
          .from('paiements')
          .insert({
            id_card: cardId,
            amount: rechargeAmount,
            paid_by_card: true,
            stripe_session_id: session.id
          });
          
        if (error) throw error;
      });

      return new Response(JSON.stringify({ 
        received: true,
        cardId: cardId,
        rechargeAmount: rechargeAmount,
        newBalance: newAmount 
      }), { status: 200 });
    }

    // Return a response for other events
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error(`Error handling webhook: ${err.message}`);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }
});
