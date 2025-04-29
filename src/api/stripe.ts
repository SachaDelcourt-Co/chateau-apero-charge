
/**
 * API functions for Stripe integration
 */

import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabase';

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
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { amount, cardId }
    });
    
    if (error) {
      throw new Error(error.message || 'Failed to create checkout session');
    }
    
    return data;
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
