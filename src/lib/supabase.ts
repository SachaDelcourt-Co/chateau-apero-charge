
import { createClient } from '@supabase/supabase-js';

// We use the values from the Supabase integration
const supabaseUrl = "https://dqghjrpeoyqvkvoivfnz.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

export interface TableCard {
  id: string;
  amount: string;
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
        amount: data.amount?.toString(),
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
    return data;
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

export async function getBarProducts(): Promise<BarProduct[]> {
  try {
    const { data, error } = await supabase
      .from('bar_products')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching bar products:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception lors de la récupération des produits:', error);
    return [];
  }
}

export async function createBarOrder(order: BarOrder): Promise<{ success: boolean; orderId?: string }> {
  try {
    // First create the order
    const { data: orderData, error: orderError } = await supabase
      .from('bar_orders')
      .insert({
        card_id: order.card_id,
        total_amount: order.total_amount,
        status: 'completed'
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating bar order:', orderError);
      return { success: false };
    }

    // Then add all the items
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
      return { success: false };
    }

    // Update the card amount
    // Get the current amount first
    const { data: cardData } = await supabase
      .from('table_cards')
      .select('amount')
      .eq('id', order.card_id)
      .maybeSingle();

    if (cardData) {
      const currentAmount = parseFloat(cardData.amount || '0');
      const newAmount = (currentAmount - order.total_amount).toString();
      
      const { error: updateError } = await supabase
        .from('table_cards')
        .update({ amount: newAmount })
        .eq('id', order.card_id);

      if (updateError) {
        console.error('Error updating card amount:', updateError);
        return { success: false };
      }
    }

    return { success: true, orderId: orderData.id };
  } catch (error) {
    console.error('Exception lors de la création de la commande:', error);
    return { success: false };
  }
}
