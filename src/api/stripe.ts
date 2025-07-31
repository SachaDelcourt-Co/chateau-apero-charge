/**
 * API functions for Stripe integration
 */

import { createStripeCheckout, generateClientRequestId } from '../lib/supabase';

/**
 * Method to create a Stripe checkout session through the backend edge function
 * This centralizes the process to avoid race conditions and frontend complexity
 * 
 * @param amount The amount to charge in euros
 * @param cardId The ID of the card to recharge
 */
export const redirectToCheckout = async (amount: number, cardId: string) => {
  try {
    console.log(`Creating checkout session for card ${cardId} with amount ${amount}`);
    
    // Validate amount (must be positive and reasonable)
    if (typeof amount !== 'number' || amount <= 0 || amount > 1000) {
      throw new Error('Amount must be a positive number between 0.01 and 1000 euros');
    }

    // Validate card ID
    if (!cardId || typeof cardId !== 'string') {
      throw new Error('Card ID is required and must be a string');
    }

    // Generate client request ID for idempotency
    const clientRequestId = generateClientRequestId();
    
    // Format success/cancel URLs (Stripe will automatically append session_id parameter)
    const successUrl = `${window.location.origin}/payment-success?card_id=${cardId}&amount=${amount}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${window.location.origin}/payment?canceled=true`;
    
    console.log(`[stripe-api] Constructed success URL: ${successUrl}`);
    console.log(`[stripe-api] Card ID being used: ${cardId}`);
    
    console.log(`[stripe-api] Calling createStripeCheckout with clientRequestId: ${clientRequestId}`);
    
    // Create checkout session through edge function
    const result = await createStripeCheckout({
      card_id: cardId,
      amount: amount,
      client_request_id: clientRequestId,
      success_url: successUrl,
      cancel_url: cancelUrl
    });
    
    console.log('[stripe-api] createStripeCheckout result:', result);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create checkout session');
    }
    
    if (!result.checkout_url) {
      throw new Error('No checkout URL returned from server');
    }
    
    // Redirect to the Stripe checkout URL
    console.log(`[stripe-api] Redirecting to checkout URL: ${result.checkout_url}`);
    window.location.href = result.checkout_url;
    
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};
