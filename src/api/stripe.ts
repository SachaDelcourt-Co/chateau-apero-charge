
/**
 * API functions for Stripe integration
 */

import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe with the public key
const stripePromise = loadStripe('pk_test_51RBXwoPK5Kb6COYPP4YQqSTKUrScqdkZD0KYx8amXdFISxpulmfyPpHWFx8EzK72Ulo6t94D3s9TeZgc7sDsuuLq00zvPP4z4k');

/**
 * Creates a Stripe checkout session
 * @param amount The amount to charge in euros
 * @param cardId The ID of the card to recharge
 * @returns The checkout session data
 */
export const createCheckoutSession = async (amount: number, cardId: string) => {
  try {
    // Build the URL for the Supabase Edge Function
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount, cardId }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout session');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};

/**
 * Redirects to the Stripe checkout page
 * @param amount The amount to charge in euros
 * @param cardId The ID of the card to recharge
 */
export const redirectToCheckout = async (amount: number, cardId: string) => {
  try {
    // Create a checkout session
    const session = await createCheckoutSession(amount, cardId);
    
    // Initialize Stripe
    const stripe = await stripePromise;
    if (!stripe) throw new Error("Couldn't load Stripe");
    
    // Redirect to checkout
    const result = await stripe.redirectToCheckout({
      sessionId: session.id,
    });
    
    if (result.error) {
      throw new Error(result.error.message);
    }
  } catch (error) {
    console.error('Error redirecting to checkout:', error);
    throw error;
  }
};
