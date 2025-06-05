import { createClient } from '@supabase/supabase-js';
import { supabase as integrationSupabase } from "@/integrations/supabase/client";
import { logger } from '@/lib/logger';

// We use the client from the integrations directory, which is already configured
export const supabase = integrationSupabase;

// Export interfaces and types
export interface TableCard {
  id: string;
  amount: string; // We still maintain string in the interface for backward compatibility
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
  // Convert to number for database
  const numericAmount = parseFloat(amount);
  
  const { error } = await supabase
    .from('table_cards')
    .update({ 
      amount: numericAmount // Send as number to match the database schema
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
    
    // Ensure the amount is a string (for backward compatibility)
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
  // Convert to a decimal/number when sending to the database
  const numericAmount = parseFloat(amount);
  
  const { error } = await supabase
    .from('table_cards')
    .update({ 
      amount: numericAmount // Send as number to match new schema
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
  product_id: number; 
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
        return barProductsCache.length > 0 ? barProductsCache : [];
      }

      barProductsCache = data || [];
      lastFetchTime = now;
      
      console.log(`${barProductsCache.length} produits récupérés et mis en cache`);
      return barProductsCache;
  } catch (error) {
    console.error('Exception lors de la récupération des produits:', error);
      return barProductsCache.length > 0 ? barProductsCache : [];
    }
  } else {
    console.log(`Utilisation des ${barProductsCache.length} produits en cache`);
    return barProductsCache;
  }
}

interface BarOrderTransactionResult {
  status: 'success' | 'error' | 'card_not_found' | 'insufficient_funds' | 'idempotency_conflict' | 'invalid_input';
  message: string;
  order_id?: string; 
  new_balance?: number;
  previous_balance?: number;
  client_request_id?: string; 
}

// Define a type for the payload of processBarOrder
export interface ProcessBarOrderPayload {
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
  client_request_id: string;
  point_of_sale?: string;
}

/**
 * Process a bar order through the Edge Function for transaction safety
 * @param orderData Order data including card_id, items, and total_amount
 * @returns Result of the transaction including success status and balance information
 */
export async function processBarOrder(orderData: ProcessBarOrderPayload): Promise<BarOrderTransactionResult> {
  try {
    console.log('[process-bar-order] Called with:', JSON.stringify(orderData, null, 2));
    
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
      })),
      client_request_id: orderData.client_request_id,
      point_of_sale: orderData.point_of_sale
    };
    
    console.log('[process-bar-order] Sending payload:', JSON.stringify(payload, null, 2));
    
    const apiUrl = '/api/process-bar-order';
    const directUrl = 'https://dqghjrpeoyqvkvoivfnz.supabase.co/functions/v1/process-bar-order';
    
    const functionUrl = window.location.hostname.includes('localhost') || 
                       window.location.hostname.includes('ngrok') || 
                       window.location.hostname.includes('.app') ? 
                       apiUrl : directUrl;
    
    console.log(`[process-bar-order] Using endpoint: ${functionUrl} (${functionUrl === apiUrl ? 'proxy' : 'direct'})`);
    
    const jsonPayload = JSON.stringify(payload);
    console.log('[process-bar-order] JSON payload length:', jsonPayload.length);
    console.log('[process-bar-order] JSON payload first 100 chars:', jsonPayload.substring(0, 100));
    
    const startTime = Date.now();
    console.log(`[process-bar-order] Starting fetch request at ${new Date().toISOString()}`);
    
    const FETCH_TIMEOUT = 15000; 
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
      credentials: 'same-origin'
    });
    
    const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
    
    const responseTime = Date.now() - startTime;
    console.log(`[process-bar-order] Response received in ${responseTime}ms`);
    
    console.log(`[process-bar-order] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error(`[process-bar-order] Error response:`, response.status, response.statusText);
      
      let errorDetail = 'Unknown error';
      let errorDetailsObject = null; // Renamed to avoid conflict with BarOrderTransactionResult.details
      
      try {
        const errorText = await response.text();
        console.error(`[process-bar-order] Error response body:`, errorText);
        
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error || errorJson.message || response.statusText; // Prefer message if error is not present
          errorDetailsObject = errorJson;
        } catch (parseError) {
          errorDetail = errorText || response.statusText;
        }
      } catch (e) {
        errorDetail = response.statusText;
      }
      
      return {
        status: 'error',
        message: `Server error: ${errorDetail}`,
        // details: errorDetailsObject // 'details' is not part of BarOrderTransactionResult, log separately if needed
      } as BarOrderTransactionResult; 
    }
    
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
        status: 'error',
        message: 'Invalid JSON response from server',
        // details: { 
        //   parseError: jsonError.message,
        //   responseText: responseText.substring(0, 500)
        // }
      } as BarOrderTransactionResult; 
    }
    
    console.log('[process-bar-order] Parsed response:', data);
    
    return data as BarOrderTransactionResult;

  } catch (e: any) { // Added type any for e
    const errorInfo = {
      name: e.name,
      message: e.message,
      stack: e.stack,
      toString: e.toString(),
      constructor: e.constructor ? e.constructor.name : 'unknown'
    };
    
    console.error('[process-bar-order] Client error details:', errorInfo);
    
    return {
      status: 'error',
      message: 'Network or client error: ' + e.message,
      // details: errorInfo
    } as BarOrderTransactionResult; 
  }
}
