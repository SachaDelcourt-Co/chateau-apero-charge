-- =====================================================
-- Fix Card Transactions Reference
-- =====================================================
-- Description: Removes or updates references to the old card_transactions table
-- Author: Assistant
-- Date: 2025-06-15
-- Version: 1.0.0
-- =====================================================

-- Drop the old function that references card_transactions
DROP FUNCTION IF EXISTS create_purchase_transaction() CASCADE;

-- Create the updated version that works with app_transaction_log
CREATE OR REPLACE FUNCTION create_purchase_transaction()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert into app_transaction_log instead of card_transactions
    -- This matches the current database schema
    INSERT INTO app_transaction_log (
        card_id,
        transaction_type,
        status,
        amount_involved,
        details,
        edge_function_name,
        timestamp
    ) VALUES (
        NEW.card_id,
        'bar_order',  -- Updated from 'purchase' to match current schema conventions
        NEW.status,   -- Use the order status
        NEW.total_amount,  -- Maps to amount_involved
        jsonb_build_object(
            'order_id', NEW.id,
            'point_of_sale', NEW.point_of_sale,
            'created_at', NEW.created_at,
            'trigger_source', 'bar_order_insert'
        ),
        'bar-order-trigger',
        NOW()
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (it should already exist, but this ensures it's properly linked)
DROP TRIGGER IF EXISTS create_purchase_transaction_trigger ON bar_orders;
CREATE TRIGGER create_purchase_transaction_trigger
    AFTER INSERT ON bar_orders
    FOR EACH ROW
    EXECUTE FUNCTION create_purchase_transaction();

-- Drop any other references to card_transactions if they exist
-- This is a safety measure to ensure no old references remain
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Check for any views that might reference card_transactions
    FOR r IN (
        SELECT schemaname, viewname 
        FROM pg_views 
        WHERE definition ILIKE '%card_transactions%'
        AND schemaname = 'public'
    ) LOOP
        EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.schemaname) || '.' || quote_ident(r.viewname) || ' CASCADE';
        RAISE NOTICE 'Dropped view %.% that referenced card_transactions', r.schemaname, r.viewname;
    END LOOP;

    -- Check for any functions that might reference card_transactions
    FOR r IN (
        SELECT n.nspname as schema_name, p.proname as function_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosrc ILIKE '%card_transactions%'
        AND n.nspname = 'public'
        AND p.proname != 'create_purchase_transaction'
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.schema_name) || '.' || quote_ident(r.function_name) || '() CASCADE';
        RAISE NOTICE 'Dropped function %.% that referenced card_transactions', r.schema_name, r.function_name;
    END LOOP;
END $$;

-- Add a comment to document the change
COMMENT ON FUNCTION create_purchase_transaction IS 'Updated trigger function that logs bar order transactions to app_transaction_log instead of the deprecated card_transactions table'; 