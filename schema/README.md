# Database Schema Optimization

This directory contains SQL migration scripts to clean up and optimize the Supabase database schema.

## Overview of Changes

1. **Removing Unused Tables**:
   - `card_transactions` - Removed as redundant with bar_orders
   - `card_balance` - Removed as redundant with card_statistics view

2. **Table Renaming**:
   - `paiements` → `recharges` - Renamed for better semantic clarity
   - Added explicit `payment_method` field to track payment type: 'cash', 'card', or 'stripe'

3. **Data Type Standardization**:
   - Changed `amount` columns to `DECIMAL(10,2)` for precise financial calculations
   - Ensured all foreign keys have proper constraints and indexes

4. **Analytics Improvements**:
   - Created `card_statistics` view for real-time card usage metrics
   - Added indexes to support efficient aggregation queries

5. **Security Enhancements**:
   - Added Row Level Security policies to protect financial data
   - Created role-based access controls: admin, bar, recharge

## How to Apply Migrations

### Option 1: Using Supabase CLI (Recommended)

1. Install the Supabase CLI if you haven't already:
   ```bash
   npm install -g supabase
   ```

2. Login to your Supabase account:
   ```bash
   supabase login
   ```

3. Link to your Supabase project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. Apply the migrations in order:
   ```bash
   supabase db push
   ```

### Option 2: Using Supabase Dashboard

1. Navigate to your Supabase project in the browser
2. Go to the SQL Editor
3. Copy the contents of `run-migrations.sql` or individual migration files
4. Run the queries in the SQL Editor

### Option 3: Using psql (if you have direct database access)

1. Connect to your database:
   ```bash
   psql postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
   ```

2. Run the migrations from the psql console:
   ```sql
   \i run-migrations.sql
   ```

## Verifying Migrations

After applying the migrations, you can verify they were successful:

1. Check that tables `card_transactions` and `card_balance` no longer exist
2. Confirm that `recharges` table exists (replaced `paiements`)
3. Query the new `card_statistics` view to see card metrics:

```sql
SELECT * FROM card_statistics LIMIT 10;
```

## Rollback Plan

If you encounter issues, a rollback script is available in `rollback.sql`. This will:

1. Recreate dropped tables (empty)
2. Rename `recharges` back to `paiements`
3. Remove Row Level Security policies

## Contact

If you encounter any issues applying these migrations, please contact the development team. 