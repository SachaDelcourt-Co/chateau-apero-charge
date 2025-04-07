
import { createClient } from '@supabase/supabase-js';

// Nous prenons les valeurs depuis l'environnement ou initialisons avec des valeurs vides
// Ces valeurs doivent être fournies par l'intégration Supabase de Lovable
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Card {
  id: string;
  card_number: string;
  amount: number;
  created_at: string;
}

export async function getCardByNumber(cardNumber: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('card_number', cardNumber)
    .single();

  if (error) {
    console.error('Error fetching card:', error);
    return null;
  }

  return data;
}

export async function updateCardAmount(id: string, amount: number): Promise<boolean> {
  const { error } = await supabase
    .from('cards')
    .update({ amount })
    .eq('id', id);

  if (error) {
    console.error('Error updating card amount:', error);
    return false;
  }

  return true;
}
