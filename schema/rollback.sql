-- Rollback Script 
-- This script undoes the schema changes in case of problems

BEGIN;

-- 1. Remove row-level security policies
DROP POLICY IF EXISTS admin_table_cards_policy ON public.table_cards;
DROP POLICY IF EXISTS view_table_cards_policy ON public.table_cards;
DROP POLICY IF EXISTS bar_orders_for_bar_role ON public.bar_orders;
DROP POLICY IF EXISTS recharges_for_recharge_role ON public.recharges;
DROP POLICY IF EXISTS bar_items_for_bar_role ON public.bar_order_items;
DROP POLICY IF EXISTS anon_card_view ON public.table_cards;

-- Disable RLS on tables
ALTER TABLE IF EXISTS public.table_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.recharges DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bar_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bar_order_items DISABLE ROW LEVEL SECURITY;

-- 2. Drop the card_statistics view
DROP VIEW IF EXISTS public.card_statistics;

-- 3. Recreate original table_cards structure
-- Revert any column type changes (e.g. if amount was changed to decimal)
ALTER TABLE IF EXISTS public.table_cards 
  ALTER COLUMN amount TYPE VARCHAR;

-- 4. Rename recharges back to paiements
-- First, preserve the data if the table exists
CREATE TABLE IF NOT EXISTS public.paiements_temp AS 
  SELECT 
    id, 
    amount, 
    created_at, 
    card_id AS id_card, 
    paid_by_card,
    transaction_id,
    stripe_session_id,
    notes
  FROM public.recharges;

-- Drop the recharges table
DROP TABLE IF EXISTS public.recharges CASCADE;

-- Rename the backup table to paiements
ALTER TABLE IF EXISTS public.paiements_temp RENAME TO paiements;

-- 5. Recreate the card_transactions table (empty)
CREATE TABLE IF NOT EXISTS public.card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id TEXT REFERENCES public.table_cards(id),
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  payment_method TEXT,
  point_of_sale INTEGER,
  transaction_type TEXT NOT NULL
);

-- 6. Create empty card_balance table if it was used
CREATE TABLE IF NOT EXISTS public.card_balance (
  card_id TEXT PRIMARY KEY REFERENCES public.table_cards(id),
  current_balance NUMERIC DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  total_recharged NUMERIC DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add notice about rollback
DO $$
BEGIN
    RAISE NOTICE 'Rollback completed. Database schema has been restored to original state.';
    RAISE NOTICE 'Note: Data in newly created tables is empty. Backup data may be available in temporary tables.';
END $$;

COMMIT; 