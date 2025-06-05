# Complete Deployment Guide for Full Festival Simulation Test Suite

## 🎯 **OBJECTIVE**
Deploy a 100% functional test suite with no mocked components, complete database integration, real API endpoints, and full authentication flows.

## 📋 **DEPLOYMENT CHECKLIST**

### **Phase 1: Database Infrastructure Setup**

#### **1.1 Deploy Core Schema & Stored Procedures**
```sql
-- Execute in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- First, ensure all required tables exist with correct schema
-- Check current schema and fix any mismatches

-- Deploy stored procedures (corrected for actual database schema)
-- Copy entire content from: schema/09_create_stored_procedures_fixed.sql
```

#### **1.2 Create Service Role & Permissions**
```sql
-- Create dedicated service role for load testing
CREATE ROLE load_test_service;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO load_test_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO load_test_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO load_test_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO load_test_service;

-- Grant permissions on specific tables
GRANT ALL ON public.table_cards TO load_test_service;
GRANT ALL ON public.bar_orders TO load_test_service;
GRANT ALL ON public.bar_order_items TO load_test_service;
GRANT ALL ON public.recharges TO load_test_service;
GRANT ALL ON public.idempotency_keys TO load_test_service;
GRANT ALL ON public.app_transaction_log TO load_test_service;
GRANT ALL ON public.nfc_scan_log TO load_test_service;
GRANT ALL ON public.bar_products TO load_test_service;
```

#### **1.3 Seed Test Data**
```sql
-- Create comprehensive test dataset
-- Execute: deployment/seed_test_data.sql
```

### **Phase 2: Edge Functions Configuration**

#### **2.1 Update Edge Functions for Load Testing**
- Modify `/stripe-webhook` to bypass signature validation in test mode
- Add test mode detection via environment variables
- Ensure proper error handling and logging

#### **2.2 Environment Variables Setup**
```bash
# In Supabase Dashboard → Settings → Environment Variables
LOAD_TEST_MODE=true
STRIPE_WEBHOOK_TEST_MODE=true
```

### **Phase 3: Authentication & API Keys**

#### **3.1 Generate Service Role Key**
```bash
# In Supabase Dashboard → Settings → API
# Copy the service_role key (not anon key)
# This key has elevated permissions for testing
```

#### **3.2 Configure Test Users**
```sql
-- Create test users for different roles
-- Execute: deployment/create_test_users.sql
```

### **Phase 4: Load Test Configuration**

#### **4.1 Environment Configuration**
```bash
# Create .env file for load tests
SUPABASE_URL=https://dqghjrpeoyqvkvoivfnz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_ANON_KEY=<anon_key>
LOAD_TEST_MODE=true
```

#### **4.2 Test Data Validation**
```bash
# Run pre-test validation
node deployment/validate_test_environment.js
```

## 🚀 **EXECUTION SEQUENCE**

### **Step 1: Deploy Database Components**
1. Execute `deployment/01_fix_database_schema.sql`
2. Execute `deployment/02_deploy_stored_procedures.sql`
3. Execute `deployment/03_create_service_permissions.sql`
4. Execute `deployment/04_seed_test_data.sql`

### **Step 2: Configure Edge Functions**
1. Deploy updated Edge Functions with test mode support
2. Set environment variables in Supabase Dashboard

### **Step 3: Validate Environment**
1. Run `deployment/validate_test_environment.js`
2. Verify all components are functional

### **Step 4: Execute Full Test Suite**
1. Run `load-tests/full-festival-simulation-production.js`
2. Monitor results and validate data integrity

## 📊 **SUCCESS CRITERIA**
- ✅ 100% test execution without mocked components
- ✅ Real database transactions with ACID compliance
- ✅ Complete authentication flows
- ✅ Full API integration
- ✅ Comprehensive data validation
- ✅ Performance benchmarking under load

## 🔧 **TROUBLESHOOTING**
- All deployment scripts include error handling
- Rollback procedures provided for each phase
- Comprehensive logging for debugging
- Health check endpoints for monitoring