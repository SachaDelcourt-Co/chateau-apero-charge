-- Database Schema Optimization Script
-- This script should be run on your Supabase database to implement all schema changes

-- 1. Drop unused tables
\i 01_drop_unused_tables.sql

-- 2. Rename paiements to recharges and enhance structure
\i 02_rename_paiements_to_recharges.sql

-- 3. Enhance table_cards with proper types and indexes
\i 03_enhance_table_cards.sql

-- 4. Create improved real-time card statistics view
\i 04_create_card_statistics_view.sql

-- 5. Add row-level security to protect financial data
\i 05_add_row_level_security.sql

-- Final message
DO $$
BEGIN
    RAISE NOTICE 'Schema migration completed successfully!';
    RAISE NOTICE 'Tables removed: card_transactions, card_balance';
    RAISE NOTICE 'Tables renamed: paiements → recharges';
    RAISE NOTICE 'Views created: card_statistics';
    RAISE NOTICE 'Security: Row-level security policies applied to financial tables';
END $$; 