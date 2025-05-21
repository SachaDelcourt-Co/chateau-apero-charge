import { createClient } from '@supabase/supabase-js';
import { supabase as integrationSupabase } from "@/integrations/supabase/client";

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
    .update({ amount })
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
    .update({ amount })
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

    const currentAmount = parseFloat(cardData.amount || '0');
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
      .update({ amount: newAmount })
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
  }>;
  total_amount: number;
}): Promise<BarOrderTransactionResult> {
  try {
    const { data, error } = await supabase.functions.invoke('process-bar-order', {
      body: orderData
    });
    
    if (error) {
      console.error('Edge function error:', error);
      return { 
        success: false, 
        error: 'Error calling order processing service' 
      };
    }
    
    return data;
  } catch (e) {
    console.error('Client error calling order function:', e);
    return { 
      success: false, 
      error: 'Network or client error' 
    };
  }
}
