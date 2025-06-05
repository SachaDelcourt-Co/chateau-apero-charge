-- Enhance table_cards with additional metadata and constraints
ALTER TABLE public.table_cards 
  ALTER COLUMN amount TYPE DECIMAL(10,2),
  ALTER COLUMN amount SET DEFAULT 0.0;

-- Add consistent and useful indexes
CREATE INDEX IF NOT EXISTS idx_table_cards_last_recharge_date ON public.table_cards(last_recharge_date);

-- Add comments for documentation
COMMENT ON TABLE public.table_cards IS 'Core table for card records, storing unique identifiers and current balance';
COMMENT ON COLUMN public.table_cards.amount IS 'Current card balance in EUR, stored with 2 decimal precision';
COMMENT ON COLUMN public.table_cards.description IS 'Optional description or user-friendly name for the card';
COMMENT ON COLUMN public.table_cards.id IS 'Unique card identifier, typically an 8-character string';
COMMENT ON COLUMN public.table_cards.last_payment_method IS 'Method used for the most recent recharge';
COMMENT ON COLUMN public.table_cards.last_recharge_date IS 'Timestamp of the most recent recharge';
COMMENT ON COLUMN public.table_cards.recharge_count IS 'Count of total recharges performed on this card'; 