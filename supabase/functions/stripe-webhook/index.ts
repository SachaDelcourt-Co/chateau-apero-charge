
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
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
      
      // Extract metadata
      const cardId = session.metadata?.cardId;
      const amount = session.metadata?.amount;
      
      if (!cardId || !amount) {
        return new Response('Missing cardId or amount in metadata', { status: 400 });
      }

      console.log(`Processing payment for card ${cardId} with amount ${amount}`);

      // Get the current card details
      const { data: cardData, error: cardError } = await supabaseClient
        .from('table_cards')
        .select('amount')
        .eq('id', cardId)
        .single();

      if (cardError || !cardData) {
        console.error('Error fetching card data:', cardError);
        return new Response(`Error fetching card data: ${cardError?.message || 'Card not found'}`, { status: 400 });
      }

      // Calculate new amount - ensure proper addition with toFixed(2)
      const currentAmount = parseFloat(cardData.amount || '0');
      const rechargeAmount = parseFloat(amount);
      // Addition and then format to 2 decimal places
      const newAmount = (currentAmount + rechargeAmount).toFixed(2);

      console.log(`Card ${cardId} current balance: ${currentAmount}, recharge: ${rechargeAmount}, new balance: ${newAmount}`);

      // Update the card amount
      const { error: updateError } = await supabaseClient
        .from('table_cards')
        .update({ amount: newAmount })
        .eq('id', cardId);

      if (updateError) {
        console.error('Error updating card amount:', updateError);
        return new Response(`Error updating card amount: ${updateError.message}`, { status: 400 });
      }

      console.log(`Successfully updated card ${cardId} balance to ${newAmount}`);

      // Log the payment in the paiements table
      const { error: paymentError } = await supabaseClient
        .from('paiements')
        .insert({
          id_card: cardId,
          amount: rechargeAmount,
          paid_by_card: true,
          stripe_session_id: session.id
        });

      if (paymentError) {
        console.error('Error logging payment:', paymentError);
        // We don't return an error here because the card has been successfully recharged
      }

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
