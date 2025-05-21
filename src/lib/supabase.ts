import { createClient } from '@supabase/supabase-js';
import { supabase as integrationSupabase } from "@/integrations/supabase/client";
import { logger } from '@/lib/logger';

// We use the client from the integrations directory, which is already configured
export const supabase = integrationSupabase;

// Export interfaces and types
export interface TableCard {
  id: string;
  amount: string; // Keep as string to match the DB schema
  description?: string | null;
}

// For backward compatibility, keep the Card interface but modify the implementation
export interface Card {
  card_number: string;
  qr_code_file?: string | null;
  url?: string | null;
  amount?: string | null;
}

export async function getCardById(cardNumber: string): Promise<Card | null> {
  console.log(`Recherche de la carte avec numéro: ${cardNumber}`);
  
  try {
    // Try to find the card in table_cards
    const { data, error } = await supabase
      .from('table_cards')
      .select('*')
      .eq('id', cardNumber)
      .maybeSingle();

    if (error) {
      console.error('Error fetching card:', error);
      return null;
    }
    
    if (data) {
      // Convert from table_cards format to Card format
      return {
        card_number: data.id,
        amount: data.amount?.toString(), // Ensure string type
      };
    }

    console.log('Aucune carte trouvée avec ce numéro');
    return null;
  } catch (error) {
    console.error('Exception lors de la récupération de la carte:', error);
    return null;
  }
}

export async function updateCardAmount(cardNumber: string, amount: string): Promise<boolean> {
  const { error } = await supabase
    .from('table_cards')
    .update({ 
      amount: amount // Sending as string as expected by the schema
    })
    .eq('id', cardNumber);

  if (error) {
    console.error('Error updating card amount:', error);
    return false;
  }

  return true;
}

// Functions for table_cards

export async function getTableCardById(id: string): Promise<TableCard | null> {
  console.log(`Recherche de la carte avec ID: ${id}`);
  
  try {
    const { data, error } = await supabase
      .from('table_cards')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching card from table_cards:', error);
      return null;
    }

    console.log('Réponse de Supabase (table_cards):', data);
    
    // Ensure the amount is a string
    if (data) {
      return {
        ...data,
        amount: data.amount?.toString() || "0" // Convert to string
      };
    }
    
    return null;
  } catch (error) {
    console.error('Exception lors de la récupération de la carte (table_cards):', error);
    return null;
  }
}

export async function updateTableCardAmount(id: string, amount: string): Promise<boolean> {
  const { error } = await supabase
    .from('table_cards')
    .update({ 
      amount: amount // Sending as string as expected by the schema
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating table_card amount:', error);
    return false;
  }

  return true;
}

// Bar page specific functions
export interface BarProduct {
  id: number;
  name: string;
  price: number;
  category: string | null;
  is_deposit: boolean;
  is_return: boolean;
}

export interface OrderItem {
  product_name: string;
  price: number;
  quantity: number;
  is_deposit: boolean;
  is_return: boolean;
}

export interface BarOrder {
  id?: string;
  card_id: string;
  total_amount: number;
  created_at?: string;
  status?: string;
  items: OrderItem[];
}

// Cache des produits pour optimiser les performances
let barProductsCache: BarProduct[] = [];
let lastFetchTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes en millisecondes

export async function getBarProducts(forceRefresh: boolean = false): Promise<BarProduct[]> {
  const now = Date.now();
  
  // Si on force le rafraîchissement ou si le cache est expiré, on récupère les données
  if (forceRefresh || barProductsCache.length === 0 || (now - lastFetchTime) > CACHE_TTL) {
    try {
      console.log(`Récupération des produits depuis Supabase (${forceRefresh ? 'forcé' : 'cache expiré'})`);
      
      const { data, error } = await supabase
        .from('bar_products')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching bar products:', error);
        // En cas d'erreur, retourner le cache actuel s'il existe
        return barProductsCache.length > 0 ? barProductsCache : [];
      }

      // Mettre à jour le cache et l'horodatage
      barProductsCache = data || [];
      lastFetchTime = now;
      
      console.log(`${barProductsCache.length} produits récupérés et mis en cache`);
      return barProductsCache;
    } catch (error) {
      console.error('Exception lors de la récupération des produits:', error);
      // En cas d'erreur, retourner le cache actuel s'il existe
      return barProductsCache.length > 0 ? barProductsCache : [];
    }
  } else {
    console.log(`Utilisation des ${barProductsCache.length} produits en cache`);
    return barProductsCache;
  }
}

export async function createBarOrder(order: BarOrder): Promise<{ success: boolean; orderId?: string }> {
  try {
    console.log("Processing order:", order);
    console.log("Total amount to charge:", order.total_amount);
    
    // Start a transaction by beginning a single batch
    // 1. First get the current card amount to make sure it has enough balance
    const { data: cardData, error: cardError } = await supabase
      .from('table_cards')
      .select('amount')
      .eq('id', order.card_id)
      .maybeSingle();

    if (cardError || !cardData) {
      console.error('Error fetching card data:', cardError);
      return { success: false };
    }

    // Parse the string amount to a number for calculations
    const currentAmount = parseFloat(cardData.amount?.toString() || '0');
    if (currentAmount < order.total_amount) {
      console.error('Insufficient funds:', currentAmount, 'required:', order.total_amount);
      return { success: false };
    }

    // 2. Create the order
    const { data: orderData, error: orderError } = await supabase
      .from('bar_orders')
      .insert({
        card_id: order.card_id,
        total_amount: order.total_amount,
        status: 'completed',
        point_of_sale: 1 // Ensure this is a number to match DB schema
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating bar order:', orderError);
      return { success: false };
    }

    // 3. Add all the order items
    const orderItems = order.items.map(item => ({
      order_id: orderData.id,
      product_name: item.product_name,
      price: item.price,
      quantity: item.quantity,
      is_deposit: item.is_deposit,
      is_return: item.is_return
    }));

    const { error: itemsError } = await supabase
      .from('bar_order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      // Even if we fail here, we still want to update the card amount
      // since the order was created
    }

    // 4. Update the card amount
    const newAmount = (currentAmount - order.total_amount).toFixed(2);
    console.log("Updating card amount from:", currentAmount, "to:", newAmount);
    
    const { error: updateError } = await supabase
      .from('table_cards')
      .update({ 
        amount: newAmount // Storing as string as expected by the schema
      })
      .eq('id', order.card_id);

    if (updateError) {
      console.error('Error updating card amount:', updateError);
      return { success: false };
    }

    // Supprimer le cache des produits pour forcer un rafraîchissement lors de la prochaine requête
    barProductsCache = [];

    return { success: true, orderId: orderData.id };
  } catch (error) {
    console.error('Exception lors de la création de la commande:', error);
    return { success: false };
  }
}

// Add a return type for the transaction function
interface BarOrderTransactionResult {
  success: boolean;
  order_id?: number;
  previous_balance?: number;
  new_balance?: number;
  error?: string;
  details?: any;
}

/**
 * Process a bar order through the Edge Function for transaction safety
 * @param orderData Order data including card_id, items, and total_amount
 * @returns Result of the transaction including success status and balance information
 */
export async function processBarOrder(orderData: {
  card_id: string;
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    name: string;
    is_deposit?: boolean;
    is_return?: boolean;
  }>;
  total_amount: number;
}): Promise<BarOrderTransactionResult> {
  try {
    // Log the original data
    console.log('[process-bar-order] Called with:', JSON.stringify(orderData, null, 2));
    
    // Create a clean payload with proper boolean handling
    const payload = {
      card_id: orderData.card_id,
      total_amount: orderData.total_amount,
      items: orderData.items.map(item => ({
        product_id: item.product_id || 0,
        quantity: item.quantity,
        unit_price: item.unit_price,
        name: item.name,
        is_deposit: item.is_deposit === true,
        is_return: item.is_return === true
      }))
    };
    
    // Log the payload for debugging
    console.log('[process-bar-order] Sending payload:', JSON.stringify(payload, null, 2));
    
    // *** CORS FIX: Use relative URL to send the request to the current domain ***
    // This will be handled by the Vite dev server or production host which will proxy to Supabase
    // avoiding direct browser-to-Supabase requests that can cause CORS issues
    
    // New approach using relative URL that will be handled by proxy
    const apiUrl = '/api/process-bar-order';
    
    // Fallback to direct URL only when needed
    const directUrl = 'https://dqghjrpeoyqvkvoivfnz.supabase.co/functions/v1/process-bar-order';
    
    // Choose the URL based on environment
    // In development or when using tunnels like ngrok, use the proxy approach
    const functionUrl = window.location.hostname.includes('localhost') || 
                       window.location.hostname.includes('ngrok') || 
                       window.location.hostname.includes('.app') ? 
                       apiUrl : directUrl;
    
    console.log(`[process-bar-order] Using endpoint: ${functionUrl} (${functionUrl === apiUrl ? 'proxy' : 'direct'})`);
    
    // Test the JSON serialization separately to catch any issues
    const jsonPayload = JSON.stringify(payload);
    console.log('[process-bar-order] JSON payload length:', jsonPayload.length);
    console.log('[process-bar-order] JSON payload first 100 chars:', jsonPayload.substring(0, 100));
    
    // Add detailed timing and request information
    const startTime = Date.now();
    console.log(`[process-bar-order] Starting fetch request at ${new Date().toISOString()}`);
    
    // Make a direct fetch request with explicit content type
    // Use a timeout promise to handle hanging requests
    const FETCH_TIMEOUT = 15000; // 15 seconds timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout after 15s')), FETCH_TIMEOUT)
    );
    
    const fetchPromise = fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: jsonPayload,
      // Use credentials for cookies if needed by your auth setup
      credentials: 'same-origin'
    });
    
    // Race between the fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
    
    const responseTime = Date.now() - startTime;
    console.log(`[process-bar-order] Response received in ${responseTime}ms`);
    
    // Log response status for debugging
    console.log(`[process-bar-order] Response status: ${response.status} ${response.statusText}`);
    
    // Check if the response is OK
    if (!response.ok) {
      console.error(`[process-bar-order] Error response:`, response.status, response.statusText);
      
      let errorDetail = 'Unknown error';
      let errorDetails = null;
      
      // Try to get error details from response
      try {
        const errorText = await response.text();
        console.error(`[process-bar-order] Error response body:`, errorText);
        
        try {
          // Try to parse as JSON
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error || errorJson.details || response.statusText;
          errorDetails = errorJson;
        } catch (parseError) {
          // If not JSON, use as text
          errorDetail = errorText || response.statusText;
        }
      } catch (e) {
        // If we can't get response text
        errorDetail = response.statusText;
      }
      
      return { 
        success: false, 
        error: errorDetail,
        details: errorDetails
      };
    }
    
    // Parse the response as JSON
    const responseText = await response.text();
    console.log(`[process-bar-order] Raw response (${responseText.length} chars):`, 
      responseText.length > 200 ? responseText.substring(0, 200) + '...' : responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
      console.error(`[process-bar-order] JSON parse error:`, jsonError);
      console.error(`[process-bar-order] Non-parseable response:`, responseText);
      return {
        success: false,
        error: 'Invalid JSON response from server',
        details: {
          parseError: jsonError.message,
          responseText: responseText.substring(0, 500) // Log first 500 chars
        }
      };
    }
    
    console.log('[process-bar-order] Parsed response:', data);
    
    return data;
  } catch (e) {
    // Get detailed error info
    const errorInfo = {
      name: e.name,
      message: e.message,
      stack: e.stack,
      toString: e.toString(),
      constructor: e.constructor ? e.constructor.name : 'unknown'
    };
    
    console.error('[process-bar-order] Client error details:', errorInfo);
    
    return { 
      success: false, 
      error: 'Network or client error',
      details: errorInfo
    };
  }
}
