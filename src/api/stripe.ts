
/**
 * API functions for Stripe integration
 */

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
