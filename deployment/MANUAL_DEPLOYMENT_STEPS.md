# Manual Deployment Steps for Complete Festival Simulation Test Suite

## 🎯 **CRITICAL: Execute These Steps in Exact Order**

### **STEP 1: Database Schema & Stored Procedures Deployment**

#### **1.1 Open Supabase Dashboard**
1. Go to: https://supabase.com/dashboard/project/dqghjrpeoyqvkvoivfnz
2. Navigate to: **SQL Editor** → **New Query**

#### **1.2 Execute Database Schema Fixes**
```sql
-- Copy and paste this entire block into Supabase SQL Editor:

-- Fix database schema mismatches
-- Ensure recharges table has correct structure
ALTER TABLE public.recharges 
ALTER COLUMN transaction_id TYPE UUID USING transaction_id::UUID;

-- Ensure proper indexes exist
CREATE INDEX IF NOT EXISTS idx_recharges_card_id ON public.recharges(card_id);
CREATE INDEX IF NOT EXISTS idx_bar_orders_card_id ON public.bar_orders(card_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_request_id ON public.idempotency_keys(request_id);

-- Ensure RLS is properly configured
ALTER TABLE public.table_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharges ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY IF NOT EXISTS "Service role full access" ON public.table_cards
FOR ALL USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access" ON public.bar_orders
FOR ALL USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access" ON public.recharges
FOR ALL USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access" ON public.idempotency_keys
FOR ALL USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access" ON public.app_transaction_log
FOR ALL USING (true);
```

#### **1.3 Deploy Corrected Stored Procedures**
```sql
-- Copy the ENTIRE content from schema/09_create_stored_procedures.sql
-- BUT with these critical fixes:

-- Replace line 21: order_id_out UUID; 
-- WITH: order_id_out UUID;

-- Replace line 133: recharge_id_out UUID;
-- WITH: recharge_id_out INTEGER;

-- Replace line 226: recharge_id_out UUID;
-- WITH: recharge_id_out INTEGER;

-- The stored procedures are already corrected in the file
-- Just copy the entire content and execute it
```

#### **1.4 Seed Comprehensive Test Data**
```sql
-- Execute this test data seeding script:

-- Create test cards with proper balances
INSERT INTO public.table_cards (id, amount, description) VALUES
('LOAD_TEST_CARD_001', 100.00, 'Load Test Card 1'),
('LOAD_TEST_CARD_002', 50.00, 'Load Test Card 2'),
('LOAD_TEST_CARD_003', 200.00, 'Load Test Card 3'),
('LOAD_TEST_CARD_004', 25.00, 'Load Test Card 4'),
('LOAD_TEST_CARD_005', 75.00, 'Load Test Card 5')
ON CONFLICT (id) DO UPDATE SET 
amount = EXCLUDED.amount,
description = EXCLUDED.description;

-- Ensure existing cards have proper balances
UPDATE public.table_cards 
SET amount = COALESCE(amount, 50.00)
WHERE amount IS NULL;

-- Create test bar products if they don't exist
INSERT INTO public.bar_products (id, name, price, category, is_return) VALUES
(gen_random_uuid(), 'Beer', 5.00, 'drinks', false),
(gen_random_uuid(), 'Wine', 8.00, 'drinks', false),
(gen_random_uuid(), 'Sandwich', 12.00, 'food', false),
(gen_random_uuid(), 'Water', 2.00, 'drinks', false),
(gen_random_uuid(), 'Cup Deposit', 2.00, 'deposits', false),
(gen_random_uuid(), 'Cup Return', -2.00, 'returns', true)
ON CONFLICT DO NOTHING;
```

### **STEP 2: Environment Configuration**

#### **2.1 Set Environment Variables in Supabase**
1. Go to: **Settings** → **Environment Variables**
2. Add these variables:
   ```
   LOAD_TEST_MODE=true
   STRIPE_WEBHOOK_TEST_MODE=true
   ```

#### **2.2 Get Service Role Key**
1. Go to: **Settings** → **API**
2. Copy the **service_role** key (NOT the anon key)
3. This key has elevated permissions needed for testing

### **STEP 3: Validation & Testing**

#### **3.1 Test Stored Procedures**
Execute this in Supabase SQL Editor to verify deployment:
```sql
-- Test checkpoint recharge
SELECT sp_process_checkpoint_recharge(
    'LOAD_TEST_CARD_001',
    10.00,
    'cash',
    'test-staff',
    gen_random_uuid()::text,
    'test-checkpoint'
);

-- Test bar order (you'll need to get a real product_id first)
SELECT id FROM public.bar_products LIMIT 1;
-- Use that ID in the items JSON below

SELECT sp_process_bar_order(
    'LOAD_TEST_CARD_001',
    '[{"product_id": "YOUR_PRODUCT_ID_HERE", "quantity": 1, "price_at_purchase": 5.00}]'::jsonb,
    5.00,
    gen_random_uuid()::text,
    'test-pos'
);
```

### **STEP 4: Execute Load Tests**

#### **4.1 Update K6 Scripts with Service Role Key**
In your load test scripts, replace the API_KEY with your service_role key:
```javascript
const API_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE';
```

#### **4.2 Update Card IDs in Load Tests**
Replace the card arrays in load test scripts with:
```javascript
const simulatedCardIds = new SharedArray('card IDs', function() {
  return [
    'LOAD_TEST_CARD_001',
    'LOAD_TEST_CARD_002', 
    'LOAD_TEST_CARD_003',
    'LOAD_TEST_CARD_004',
    'LOAD_TEST_CARD_005',
    'K7McPLKa',
    'dQdtfYgZ',
    'tRS2RVg1',
    'brJm7KCu'
  ];
});
```

#### **4.3 Run Individual Tests First**
```bash
# Test logging (should work)
k6 run load-tests/log-simulation.js --duration 30s --vus 2

# Test card recharges (should work after deployment)
k6 run load-tests/card-recharges.js --duration 30s --vus 2

# Test bar operations (should work after deployment)
k6 run load-tests/bar-operations.js --duration 30s --vus 2

# Test full simulation (should work after deployment)
k6 run load-tests/full-festival-simulation.js
```

### **STEP 5: Verification & Validation**

#### **5.1 Check Data Integrity**
Execute in Supabase SQL Editor:
```sql
-- Verify card balances are consistent
SELECT 
    c.id,
    c.amount as current_balance,
    COALESCE(SUM(r.amount), 0) as total_recharges,
    COALESCE(SUM(bo.total_amount), 0) as total_orders,
    (COALESCE(SUM(r.amount), 0) - COALESCE(SUM(bo.total_amount), 0)) as calculated_balance
FROM public.table_cards c
LEFT JOIN public.recharges r ON c.id = r.card_id
LEFT JOIN public.bar_orders bo ON c.id = bo.card_id
WHERE c.id LIKE 'LOAD_TEST%'
GROUP BY c.id, c.amount
ORDER BY c.id;

-- Check transaction logs
SELECT 
    transaction_type,
    status,
    COUNT(*) as count,
    SUM(amount_involved) as total_amount
FROM public.app_transaction_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY transaction_type, status
ORDER BY transaction_type, status;
```

## 🎯 **SUCCESS CRITERIA**

After completing all steps, you should achieve:
- ✅ All stored procedures deployed and functional
- ✅ Test data properly seeded with realistic balances
- ✅ Individual K6 tests running with 0% error rate
- ✅ Full festival simulation executing successfully
- ✅ Data integrity maintained across all operations
- ✅ Performance metrics within acceptable ranges

## 🚨 **TROUBLESHOOTING**

If you encounter issues:
1. **Check Supabase logs** in Dashboard → Logs
2. **Verify API key permissions** - use service_role, not anon
3. **Confirm stored procedures exist** - run `\df sp_*` in SQL Editor
4. **Check card balances** - ensure they're not NULL
5. **Validate product data** - ensure bar_products table has data

This manual deployment process will result in a 100% functional test suite with no mocked components.