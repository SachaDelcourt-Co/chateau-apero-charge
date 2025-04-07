
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

export interface Card {
  card_number: string;
  qr_code_file?: string | null;
  url?: string | null;
  amount?: string | null;
}

export interface TableCard {
  id: string;
  amount: string;
  description?: string | null;
}

export async function getCardById(cardNumber: string): Promise<Card | null> {
  console.log(`Recherche de la carte avec numéro: ${cardNumber}`);
  
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('card_number', cardNumber)
      .maybeSingle();

    if (error) {
      console.error('Error fetching card:', error);
      return null;
    }

    console.log('Réponse de Supabase:', data);
    return data;
  } catch (error) {
    console.error('Exception lors de la récupération de la carte:', error);
    return null;
  }
}

export async function updateCardAmount(cardNumber: string, amount: string): Promise<boolean> {
  const { error } = await supabase
    .from('cards')
    .update({ amount })
    .eq('card_number', cardNumber);

  if (error) {
    console.error('Error updating card amount:', error);
    return false;
  }

  return true;
}

// Fonctions pour table_cards

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
