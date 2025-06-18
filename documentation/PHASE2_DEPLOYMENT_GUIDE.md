# Phase 2 Deployment Guide - Cashless Festival Payment System

## 📋 Overview

This guide provides comprehensive instructions for deploying Phase 2 enhancements to the cashless festival payment system. Phase 2 introduces atomic operations, race condition prevention, and enhanced reliability through database-level stored procedures.

## 🎯 Phase 2 Key Features

### Database Enhancements
- **Atomic Stored Procedures**: All critical operations now use stored procedures with database-level locking
- **Idempotency Protection**: Client request IDs prevent duplicate processing
- **Comprehensive Logging**: Full audit trail with transaction logging
- **Race Condition Prevention**: Database-level locks eliminate concurrent update issues

### Edge Function Improvements
- **Enhanced Error Handling**: Categorized error responses with user-friendly messages
- **Request Tracing**: Unique request IDs for comprehensive logging
- **Input Validation**: Robust validation with detailed error reporting
- **Performance Monitoring**: Processing time tracking and metrics

## 🚀 Quick Deployment

### Automated Deployment (Recommended)

```bash
# 1. Set required environment variables
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export STRIPE_SECRET_KEY_FINAL="your-stripe-secret-key"
export STRIPE_WEBHOOK_SECRET="your-webhook-secret"

# 2. Run the deployment script
./deploy-phase2.sh
```

The automated script handles:
- ✅ Pre-flight checks and validation
- ✅ Database migration deployment
- ✅ Edge function deployment
- ✅ Health checks and verification
- ✅ Rollback script creation

## 📋 Pre-Deployment Checklist

### Environment Requirements

- [ ] **Supabase CLI** installed and configured
  ```bash
  npm install -g supabase
  supabase --version
  ```

- [ ] **Project Access** verified
  ```bash
  supabase projects list
  supabase status
  ```

- [ ] **Environment Variables** configured:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY_FINAL`
  - `STRIPE_WEBHOOK_SECRET`

### Pre-Deployment Verification

- [ ] **Database Backup** created (recommended)
- [ ] **Current System** functioning properly
- [ ] **Edge Functions** currently deployed and working
- [ ] **Test Environment** validated (if available)

## 🔧 Manual Deployment Steps

If you prefer manual deployment or need to troubleshoot:

### Step 1: Database Migration

```bash
# Apply the Phase 2 migration
supabase db push

# Verify migration applied
supabase db diff --schema public
```

**What this deploys:**
- `idempotency_keys` table for duplicate request prevention
- `app_transaction_log` table for comprehensive audit trail
- `nfc_scan_log` table for NFC debugging and monitoring
- Enhanced columns in existing tables (`client_request_id`, `staff_id`, etc.)
- Three atomic stored procedures:
  - `sp_process_bar_order`
  - `sp_process_stripe_recharge`
  - `sp_process_checkpoint_recharge`

### Step 2: Edge Function Deployment

Deploy each enhanced edge function:

```bash
# Deploy bar order processing function
supabase functions deploy process-bar-order --no-verify-jwt

# Deploy checkpoint recharge function
supabase functions deploy process-checkpoint-recharge --no-verify-jwt

# Deploy enhanced stripe webhook
supabase functions deploy stripe-webhook --no-verify-jwt
```

### Step 3: Verification

```bash
# Test edge function connectivity
curl -X GET https://your-project.supabase.co/functions/v1/process-bar-order
# Expected: 405 Method Not Allowed (function is running)

# Test database connectivity
supabase db ping
```

## 🧪 Post-Deployment Verification

### Database Verification

```sql
-- Check if new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('idempotency_keys', 'app_transaction_log', 'nfc_scan_log');

-- Check if stored procedures exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'sp_process_%';

-- Verify new columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'recharges' 
AND column_name IN ('client_request_id', 'staff_id', 'checkpoint_id');
```

### Edge Function Testing

#### Test Bar Order Processing

```bash
curl -X POST https://your-project.supabase.co/functions/v1/process-bar-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "card_id": "TEST1234",
    "items": [{"name": "Test Item", "quantity": 1, "unit_price": 5.00}],
    "total_amount": 5.00,
    "client_request_id": "test-' $(date +%s) '"
  }'
```

#### Test Checkpoint Recharge

```bash
curl -X POST https://your-project.supabase.co/functions/v1/process-checkpoint-recharge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "card_id": "TEST1234",
    "amount": 10.00,
    "payment_method": "cash",
    "staff_id": "staff123",
    "client_request_id": "test-recharge-' $(date +%s) '"
  }'
```

### Idempotency Testing

Test that duplicate requests are handled correctly:

```bash
# Send the same request twice with identical client_request_id
REQUEST_ID="idempotency-test-$(date +%s)"

# First request
curl -X POST https://your-project.supabase.co/functions/v1/process-bar-order \
  -H "Content-Type: application/json" \
  -d "{\"card_id\":\"TEST1234\",\"items\":[{\"name\":\"Test\",\"quantity\":1,\"unit_price\":1.00}],\"total_amount\":1.00,\"client_request_id\":\"$REQUEST_ID\"}"

# Second request (should return cached result)
curl -X POST https://your-project.supabase.co/functions/v1/process-bar-order \
  -H "Content-Type: application/json" \
  -d "{\"card_id\":\"TEST1234\",\"items\":[{\"name\":\"Test\",\"quantity\":1,\"unit_price\":1.00}],\"total_amount\":1.00,\"client_request_id\":\"$REQUEST_ID\"}"
```

## 🔍 Monitoring and Logging

### Database Monitoring

```sql
-- Monitor transaction log
SELECT * FROM app_transaction_log 
ORDER BY timestamp DESC 
LIMIT 10;

-- Check idempotency key usage
SELECT source_function, status, COUNT(*) 
FROM idempotency_keys 
GROUP BY source_function, status;

-- Monitor NFC scan activity
SELECT scan_status, COUNT(*) 
FROM nfc_scan_log 
WHERE scan_timestamp > NOW() - INTERVAL '1 hour'
GROUP BY scan_status;
```

### Edge Function Logs

```bash
# View real-time logs
supabase functions logs process-bar-order --follow

# View specific function logs
supabase functions logs process-checkpoint-recharge

# View webhook logs
supabase functions logs stripe-webhook
```

## 🚨 Troubleshooting

### Common Issues

#### Migration Fails

**Problem**: Database migration fails to apply

**Solutions**:
```bash
# Check current migration status
supabase db diff

# Reset and reapply (CAUTION: This will lose data)
supabase db reset
supabase db push

# Manual migration application
supabase db push --dry-run  # Preview changes first
```

#### Edge Function Deployment Fails

**Problem**: Edge function fails to deploy

**Solutions**:
```bash
# Check function syntax
cd supabase/functions/function-name
deno check index.ts

# Deploy with verbose output
supabase functions deploy function-name --debug

# Check function logs
supabase functions logs function-name
```

#### Environment Variable Issues

**Problem**: Missing or incorrect environment variables

**Solutions**:
```bash
# Verify environment variables
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Check Supabase project settings
supabase projects list
```

#### Idempotency Key Conflicts

**Problem**: Idempotency keys causing unexpected behavior

**Solutions**:
```sql
-- Clear expired idempotency keys
SELECT cleanup_expired_idempotency_keys();

-- Check current idempotency keys
SELECT * FROM idempotency_keys WHERE expires_at > NOW();

-- Manually clear specific keys (if needed)
DELETE FROM idempotency_keys WHERE request_id = 'specific-request-id';
```

### Performance Issues

#### Slow Database Operations

**Solutions**:
```sql
-- Check for missing indexes
EXPLAIN ANALYZE SELECT * FROM app_transaction_log WHERE card_id = 'TEST1234';

-- Monitor active connections
SELECT * FROM pg_stat_activity WHERE state = 'active';

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Edge Function Timeouts

**Solutions**:
```bash
# Check function performance
supabase functions logs function-name | grep "Processing Time"

# Monitor function metrics
curl -X GET https://your-project.supabase.co/functions/v1/function-name
```

## 🔄 Rollback Procedures

### Automated Rollback

If deployment issues occur, use the generated rollback script:

```bash
# Run the rollback script
./rollback-phase2.sh
```

### Manual Rollback

#### Database Rollback

```bash
# Reset database to previous state
supabase db reset

# Or apply specific rollback migration
supabase db push --include-all
```

#### Edge Function Rollback

```bash
# Redeploy previous versions of edge functions
# (Requires previous deployment artifacts or git history)

git checkout previous-commit
supabase functions deploy process-bar-order --no-verify-jwt
supabase functions deploy process-checkpoint-recharge --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

## 📊 Performance Monitoring

### Key Metrics to Monitor

1. **Transaction Processing Time**
   - Bar orders: < 500ms average
   - Recharges: < 300ms average
   - Stripe webhooks: < 200ms average

2. **Error Rates**
   - Overall error rate: < 1%
   - Idempotency conflicts: Expected during high load

3. **Database Performance**
   - Connection pool usage
   - Query execution times
   - Lock wait times

### Monitoring Queries

```sql
-- Average processing times by function
SELECT 
    edge_function_name,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_seconds,
    COUNT(*) as total_requests
FROM app_transaction_log 
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY edge_function_name;

-- Error rate analysis
SELECT 
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM app_transaction_log 
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY status;

-- Idempotency key usage patterns
SELECT 
    source_function,
    status,
    COUNT(*) as requests,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time
FROM idempotency_keys 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY source_function, status;
```

## 🔐 Security Considerations

### Environment Variables

- Store sensitive keys in secure environment variable management
- Use different keys for development, staging, and production
- Regularly rotate API keys and webhook secrets

### Database Security

- Service role key should only be used by edge functions
- Regular security audits of database permissions
- Monitor for unusual transaction patterns

### Edge Function Security

- All functions use service role authentication
- Input validation prevents injection attacks
- Comprehensive logging for security monitoring

## 📞 Support and Maintenance

### Regular Maintenance Tasks

1. **Weekly**:
   - Clean up expired idempotency keys: `SELECT cleanup_expired_idempotency_keys();`
   - Review error logs and patterns
   - Monitor performance metrics

2. **Monthly**:
   - Analyze transaction log growth
   - Review and optimize database indexes
   - Update dependencies if needed

3. **Quarterly**:
   - Full security audit
   - Performance optimization review
   - Backup and recovery testing

### Getting Help

- **Deployment Issues**: Check deployment logs in `phase2-deployment.log`
- **Database Issues**: Use Supabase dashboard and query logs
- **Edge Function Issues**: Check function logs with `supabase functions logs`
- **Performance Issues**: Use monitoring queries provided above

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] Supabase CLI installed and working
- [ ] Database backup created
- [ ] Test environment validated

### Deployment
- [ ] Database migration applied successfully
- [ ] All edge functions deployed
- [ ] Health checks passed
- [ ] Rollback script created

### Post-Deployment
- [ ] Database verification completed
- [ ] Edge function testing completed
- [ ] Idempotency testing completed
- [ ] Monitoring setup verified
- [ ] Documentation updated

### Production Readiness
- [ ] Load testing completed
- [ ] Security review completed
- [ ] Team training completed
- [ ] Monitoring alerts configured

---

**🎉 Congratulations! Your Phase 2 deployment is complete and ready for production use.**

For additional support or questions, refer to the project documentation or contact the development team.