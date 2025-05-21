/**
 * API functions for Stripe integration
 */

import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe with the public key
const stripePromise = loadStripe('pk_live_51RBXwRAWk9DBMhnhHYkcORHp7CoL5HqSHRSlR1hJX9BFNOof4UFjK44DGaksREIm90E6e9QYWmqsnPflzWAS7HW300YwBI1ubB');

/**
 * Method to directly redirect to Stripe payment page
 * This replaces the previous Edge Function approach
 * 
 * @param amount The amount to charge in euros
 * @param cardId The ID of the card to recharge
 */
export const redirectToCheckout = async (amount: number, cardId: string) => {
  try {
    console.log(`Creating checkout session for card ${cardId} with amount ${amount}`);
    
    // Get the Stripe instance
    const stripe = await stripePromise;
    if (!stripe) throw new Error("Couldn't load Stripe");
    
    // Format price and success/cancel URLs
    const priceInCents = Math.round(amount * 100);
    const successUrl = `${window.location.origin}/payment/success?card_id=${cardId}&amount=${amount}`;
    const cancelUrl = `${window.location.origin}/payment?canceled=true`;
    
    // Redirect to Stripe Checkout
    const { error } = await stripe.redirectToCheckout({
      lineItems: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Recharge de carte',
              description: `Recharge carte ID: ${cardId}`,
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      successUrl,
      cancelUrl,
      payment_method_types: ['card', 'bancontact'], // Specify payment methods
      client_reference_id: cardId,
    });
    
    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.error('Error redirecting to checkout:', error);
    throw error;
  }
};
