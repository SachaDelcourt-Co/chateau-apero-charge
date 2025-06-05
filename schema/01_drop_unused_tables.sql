-- Drop unused tables
DROP TABLE IF EXISTS public.card_transactions;
DROP TABLE IF EXISTS public.card_balance;

-- Add comment explaining the changes
COMMENT ON DATABASE postgres IS 'Removed unused legacy tables card_transactions and card_balance as part of schema cleanup.'; 