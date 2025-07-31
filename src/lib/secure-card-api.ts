/**
 * Secure Card API - Client-side utilities for calling Supabase Edge Functions
 * This module handles card operations without exposing API keys client-side
 */

export interface CardInfo {
  id: string;
  amount: string;
  description?: string | null; // Optional since table_cards may not have this column
}

export interface CardInfoResponse {
  success: boolean;
  card?: CardInfo;
  error?: string;
}

/**
 * Fetch card information securely via Edge Function
 * @param cardId - The ID of the card to fetch
 * @returns Promise<CardInfo | null> - Card info or null if not found
 * @throws Error if the request fails
 */
export async function getCardInfoSecurely(cardId: string): Promise<CardInfo | null> {
  if (!cardId || typeof cardId !== 'string' || cardId.trim().length === 0) {
    throw new Error('Invalid card ID provided');
  }

  try {
    // Get environment variables (both are safe to expose client-side)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration not complete');
    }

    // Construct the Edge Function URL
    const functionUrl = `${supabaseUrl}/functions/v1/get-card-info`;
    
    // Make the request to the Edge Function with anon key authorization
    const response = await fetch(`${functionUrl}?cardId=${encodeURIComponent(cardId.trim())}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
    });

    // Parse the response
    const data: CardInfoResponse = await response.json();

    // Handle different response statuses
    if (response.status === 404) {
      console.log(`Card not found: ${cardId}`);
      return null;
    }

    if (response.status === 400) {
      throw new Error(data.error || 'Invalid request');
    }

    if (response.status === 500) {
      throw new Error('Server error occurred. Please try again later.');
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Request failed`);
    }

    // Check for successful response
    if (!data.success || !data.card) {
      throw new Error(data.error || 'Invalid response from server');
    }

    console.log(`Card info retrieved securely: ${cardId}`);
    return data.card;

  } catch (error) {
    // Log error for debugging (remove in production)
    console.error('Error fetching card info:', error);
    
    // Re-throw with user-friendly message
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error('Failed to fetch card information');
    }
  }
}

/**
 * Check if a card exists without fetching full details
 * @param cardId - The ID of the card to check
 * @returns Promise<boolean> - True if card exists, false otherwise
 */
export async function cardExists(cardId: string): Promise<boolean> {
  try {
    const cardInfo = await getCardInfoSecurely(cardId);
    return cardInfo !== null;
  } catch (error) {
    console.error('Error checking card existence:', error);
    return false;
  }
} 