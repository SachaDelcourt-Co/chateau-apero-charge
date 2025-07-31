-- Fix Database Trigger Issue
-- 
-- The error "record 'new' has no field 'matched_card'" indicates there's a database trigger
-- or constraint that's still referencing the deleted matched_card column.
-- 
-- This script helps identify and fix the issue.

-- Step 1: Check for triggers on the refunds table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement,
    action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'refunds';

-- Step 2: Check for functions that might reference the deleted columns
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines 
WHERE routine_definition ILIKE '%matched_card%' 
   OR routine_definition ILIKE '%amount_recharged%' 
   OR routine_definition ILIKE '%card_balance%';

-- Step 3: Check for constraints that might reference deleted columns
SELECT 
    constraint_name,
    constraint_type,
    table_name
FROM information_schema.table_constraints 
WHERE table_name = 'refunds';

-- Step 4: Get detailed constraint information
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'refunds';

-- Step 5: Check for any remaining references to deleted columns in the database
-- This will help identify what needs to be cleaned up
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats 
WHERE tablename = 'refunds' 
  AND (attname = 'matched_card' OR attname = 'amount_recharged' OR attname = 'card_balance');

-- Step 6: List all triggers and their definitions
SELECT 
    t.trigger_name,
    t.event_manipulation,
    t.action_timing,
    t.action_statement,
    p.prosrc as function_definition
FROM information_schema.triggers t
LEFT JOIN pg_proc p ON p.proname = SUBSTRING(t.action_statement FROM 'EXECUTE FUNCTION ([^(]+)')
WHERE t.event_object_table = 'refunds';

-- COMMON FIXES:

-- If you find a trigger that references matched_card, you'll need to either:
-- 1. Drop the trigger if it's no longer needed:
-- DROP TRIGGER IF EXISTS trigger_name ON refunds;

-- 2. Or update the trigger function to remove references to deleted columns
-- Example of updating a trigger function:
-- CREATE OR REPLACE FUNCTION your_trigger_function()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     -- Remove any references to NEW.matched_card, NEW.amount_recharged, NEW.card_balance
--     -- Update the function logic accordingly
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- Step 7: Manual fix for the most common case
-- If there's a simple audit or logging trigger, you might need to update it like this:

-- Example trigger function fix (adjust based on your actual trigger):
/*
CREATE OR REPLACE FUNCTION handle_refund_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Remove references to deleted columns
    -- OLD version might have referenced:
    -- NEW.matched_card, NEW.amount_recharged, NEW.card_balance
    
    -- Updated version should only reference existing columns:
    -- NEW.id, NEW.created_at, NEW."first name", NEW."last name", 
    -- NEW.account, NEW.email, NEW.id_card, NEW.file_generated
    
    -- Example: If this was an audit trigger
    INSERT INTO audit_log (
        table_name,
        operation,
        record_id,
        changed_at,
        new_values
    ) VALUES (
        'refunds',
        TG_OP,
        NEW.id,
        NOW(),
        row_to_json(NEW)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
*/

-- Step 8: Test the fix
-- After making changes, test with a simple update:
-- UPDATE refunds SET file_generated = true WHERE id = 1;

-- Step 9: Verify the fix worked
-- SELECT id, file_generated FROM refunds WHERE id = 1;