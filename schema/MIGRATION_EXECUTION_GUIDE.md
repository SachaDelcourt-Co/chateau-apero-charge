# Database Migration Execution Guide - Phase 2.5

## Overview
This guide provides instructions for executing the Supabase database schema evolution migrations for Phase 2.5 of the improvement plan. These migrations add core tables for idempotency, transaction logging, and NFC scan logging, along with modifications to existing tables and new stored procedures.

## Migration Status
✅ **Migration files created and ready for execution**
❌ **Migrations not yet applied to database**

## Required Migrations

### 1. Core Tables Creation (`07_add_core_tables.sql`)
Creates three new tables:
- `idempotency_keys` - Prevents duplicate processing of requests
- `app_transaction_log` - Comprehensive audit trail for all transactions
- `nfc_scan_log` - Logs all NFC scan attempts

### 2. Existing Tables Modification (`08_alter_existing_tables.sql`)
Modifies existing tables:
- `recharges` table: Adds `staff_id`, `checkpoint_id`, `client_request_id` columns
- `bar_orders` table: Adds `client_request_id` column
- Adds UNIQUE constraints for idempotency

### 3. Stored Procedures Creation (`09_create_stored_procedures.sql`)
Creates three atomic stored procedures:
- `sp_process_bar_order()` - Processes bar orders with idempotency
- `sp_process_stripe_recharge()` - Processes Stripe recharges
- `sp_process_checkpoint_recharge()` - Processes staff-assisted recharges

## Execution Methods

### Method 1: Supabase Dashboard (Recommended)
1. Go to [Supabase Dashboard SQL Editor](https://supabase.com/dashboard/project/dqghjrpeoyqvkvoivfnz/sql)
2. Execute the migration files in order:
   - Copy and paste contents of `07_add_core_tables.sql`
   - Execute and verify success
   - Copy and paste contents of `08_alter_existing_tables.sql`
   - Execute and verify success
   - Copy and paste contents of `09_create_stored_procedures.sql`
   - Execute and verify success

### Method 2: psql Command Line
If you have the PostgreSQL connection string:
```bash
psql "postgresql://[connection-string]" -f schema/07_add_core_tables.sql
psql "postgresql://[connection-string]" -f schema/08_alter_existing_tables.sql
psql "postgresql://[connection-string]" -f schema/09_create_stored_procedures.sql
```

### Method 3: Any PostgreSQL Client
Use any PostgreSQL client (pgAdmin, DBeaver, etc.) to execute the SQL files in order.

## Verification

After executing the migrations, run the verification script:
```bash
cd schema
SUPABASE_URL="https://dqghjrpeoyqvkvoivfnz.supabase.co" \
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y" \
node execute-migrations-direct.cjs
```

Expected output after successful migration:
```
✅ Idempotency keys table - EXISTS
✅ Application transaction log table - EXISTS
✅ NFC scan log table - EXISTS
✅ recharges table - New columns exist
✅ bar_orders table - New columns exist
🎉 All migrations appear to be complete!
```

## Rollback Plan

If issues occur during migration, you can rollback using:
```sql
-- Drop new tables (if created)
DROP TABLE IF EXISTS public.nfc_scan_log;
DROP TABLE IF EXISTS public.app_transaction_log;
DROP TABLE IF EXISTS public.idempotency_keys;

-- Remove new columns from existing tables
ALTER TABLE public.recharges 
DROP COLUMN IF EXISTS staff_id,
DROP COLUMN IF EXISTS checkpoint_id,
DROP COLUMN IF EXISTS client_request_id;

ALTER TABLE public.bar_orders 
DROP COLUMN IF EXISTS client_request_id;

-- Drop stored procedures
DROP FUNCTION IF EXISTS public.sp_process_bar_order(TEXT, JSONB, DECIMAL, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.sp_process_stripe_recharge(TEXT, DECIMAL, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.sp_process_checkpoint_recharge(TEXT, DECIMAL, TEXT, TEXT, TEXT, TEXT);
```

## Post-Migration Steps

1. **Update Edge Functions**: Modify existing Edge Functions to use the new stored procedures
2. **Update Frontend**: Modify frontend code to generate and send `client_request_id` for idempotency
3. **Test Idempotency**: Verify that duplicate requests are properly handled
4. **Monitor Logs**: Check that transactions are being logged to `app_transaction_log`

## Important Notes

- ⚠️ **Execute migrations in order** - Dependencies exist between the files
- ⚠️ **Backup database** before executing migrations in production
- ⚠️ **Test in development** environment first
- ⚠️ **Monitor performance** after migration - new logging may impact performance
- ⚠️ **Schema compatibility** - Stored procedures are updated to match current schema (uses `amount` instead of `balance`)

## Support

If you encounter issues:
1. Check the Supabase dashboard logs
2. Verify table structures match expectations
3. Test stored procedures individually
4. Use the verification script to check migration status

## Files Included

- `07_add_core_tables.sql` - Creates new tables with indexes and comments
- `08_alter_existing_tables.sql` - Modifies existing tables with new columns
- `09_create_stored_procedures.sql` - Creates atomic stored procedures
- `execute-migrations-direct.cjs` - Verification script
- `MIGRATION_EXECUTION_GUIDE.md` - This guide