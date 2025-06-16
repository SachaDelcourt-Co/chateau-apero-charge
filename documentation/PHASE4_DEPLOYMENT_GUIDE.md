# Phase 4 Monitoring System - Deployment Guide

## 🎯 Overview

This guide provides comprehensive step-by-step instructions for deploying the Phase 4 Production Monitoring System. The deployment process is designed to be safe, repeatable, and production-ready for high-volume festival environments.

**Target Environment**: Production festival environment  
**Estimated Deployment Time**: 30-45 minutes  
**Prerequisites**: Phase 1-3 systems operational  
**Rollback Time**: <5 minutes if needed

## 📋 Pre-Deployment Checklist

### ✅ Environment Validation

```bash
# 1. Verify Supabase CLI installation
supabase --version
# Expected: >= 1.100.0

# 2. Verify project connection
supabase status
# Expected: All services running

# 3. Check database connectivity
supabase db ping
# Expected: Connection successful

# 4. Verify existing Phase 1-3 tables
supabase db list
# Expected: app_transaction_log, table_cards, nfc_scan_log present
```

### ✅ Required Permissions

Ensure you have the following permissions:
- [ ] Supabase project admin access
- [ ] Database migration permissions
- [ ] Edge function deployment permissions
- [ ] Environment variable configuration access

### ✅ Backup Verification

```bash
# Create pre-deployment backup
supabase db dump --file backup_pre_phase4_$(date +%Y%m%d_%H%M%S).sql

# Verify backup file
ls -la backup_pre_phase4_*.sql
```

### ✅ Environment Configuration

Create or verify environment variables:

```bash
# Required environment variables
export SUPABASE_URL="your_supabase_project_url"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
export ENVIRONMENT="production"

# Optional monitoring configuration
export MONITORING_INTERVAL_CRITICAL=30000
export MONITORING_INTERVAL_MEDIUM=120000
export MONITORING_INTERVAL_HEALTH=300000
export MONITORING_CLEANUP_RETENTION_DAYS=30
```

## 🚀 Deployment Steps

### Step 1: Database Migration

#### 1.1 Apply Phase 4 Migration

```bash
# Navigate to project root
cd /path/to/chateau-apero-charge

# Apply the main Phase 4 monitoring migration
supabase db push

# Verify migration applied successfully
supabase db list
```

**Expected Output:**
```
✓ monitoring_events table created
✓ system_health_snapshots table created  
✓ alert_history table created
✓ 15+ indexes created
✓ 8 stored procedures created
✓ 2 materialized views created
✓ 2 triggers created
✓ Security roles configured
```

#### 1.2 Verify Database Schema

```sql
-- Connect to database and verify tables
\dt monitoring_*
\dt system_health_*
\dt alert_*

-- Verify functions
\df detect_*
\df *monitoring*

-- Check initial data
SELECT COUNT(*) FROM monitoring_events;
SELECT COUNT(*) FROM system_health_snapshots;
```

**Expected Results:**
- `monitoring_events`: 1 row (initialization event)
- `system_health_snapshots`: 1 row (initial snapshot)
- All detection functions present

#### 1.3 Test Database Functions

```sql
-- Test detection functions
SELECT detect_transaction_failures();
SELECT detect_balance_discrepancies();
SELECT detect_duplicate_nfc_scans();
SELECT detect_race_conditions();

-- Test system health update
SELECT update_system_health_snapshot();

-- Test complete detection cycle
SELECT run_monitoring_detection_cycle();
```

### Step 2: Edge Function Deployment

#### 2.1 Deploy Monitoring Processor Function

```bash
# Deploy the main monitoring edge function
supabase functions deploy monitoring

# Verify deployment
supabase functions list
```

**Expected Output:**
```
✓ monitoring function deployed successfully
✓ Function URL: https://your-project.supabase.co/functions/v1/monitoring
```

#### 2.2 Deploy Monitoring API Function

```bash
# Deploy the monitoring API edge function
supabase functions deploy monitoring-api

# Verify deployment
supabase functions list
```

**Expected Output:**
```
✓ monitoring-api function deployed successfully
✓ Function URL: https://your-project.supabase.co/functions/v1/monitoring-api
```

#### 2.3 Test Edge Functions

```bash
# Test monitoring processor health
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring/health" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Test monitoring API health
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/health" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Test detection cycle execution
curl -X POST "https://your-project.supabase.co/functions/v1/monitoring/cycle" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Expected Response:**
```json
{
  "status": "HEALTHY",
  "timestamp": "2025-06-15T13:45:00.000Z",
  "uptime_seconds": 300,
  "system_metrics": {
    "transactions_last_hour": 0,
    "success_rate_percent": 100,
    "active_monitoring_events": 1,
    "critical_events_count": 0
  }
}
```

### Step 3: Frontend Integration

#### 3.1 Verify Monitoring Components

```bash
# Check if monitoring components are built
npm run build

# Verify no TypeScript errors
npm run type-check
```

#### 3.2 Test Admin Dashboard Access

1. Navigate to admin dashboard: `/admin`
2. Verify monitoring tab is visible
3. Check monitoring dashboard loads without errors
4. Verify real-time data display

#### 3.3 Test Monitoring Event Display

1. Create a test monitoring event:
```sql
SELECT create_monitoring_event(
    'system_health',
    'INFO',
    'deployment_test',
    NULL,
    NULL,
    NULL,
    1.0,
    '{"test": true}',
    '{"deployment_verification": true}'
);
```

2. Verify event appears in dashboard
3. Test event filtering and pagination

### Step 4: Configuration Validation

#### 4.1 Verify Monitoring Configuration

```bash
# Test monitoring system status
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring/status" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Expected Configuration:**
```json
{
  "service": "Phase 4 Monitoring System",
  "version": "1.0.0",
  "environment": "production",
  "config": {
    "intervals": {
      "critical_checks": 30000,
      "medium_checks": 120000,
      "health_checks": 300000,
      "cleanup": 3600000
    },
    "circuit_breaker": {
      "failure_threshold": 5,
      "recovery_timeout_ms": 60000,
      "half_open_max_calls": 2,
      "timeout_ms": 30000
    }
  }
}
```

#### 4.2 Verify Performance Indexes

```sql
-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename LIKE 'monitoring_%'
ORDER BY tablename, indexname;

-- Verify covering indexes
\d+ monitoring_events
```

#### 4.3 Test Materialized Views

```sql
-- Refresh materialized views
SELECT refresh_monitoring_views();

-- Verify view data
SELECT * FROM monitoring_dashboard_summary LIMIT 5;
SELECT * FROM system_health_trend LIMIT 5;
```

### Step 5: Integration Testing

#### 5.1 Test Transaction Monitoring

```sql
-- Create test transaction failure scenario
INSERT INTO app_transaction_log (
    transaction_id,
    card_id,
    transaction_type,
    status,
    amount_involved,
    previous_balance,
    new_balance,
    timestamp,
    details
) VALUES (
    gen_random_uuid(),
    'TEST_CARD_001',
    'bar_order',
    'failed',
    10.00,
    50.00,
    40.00,  -- Balance changed despite failure
    NOW(),
    '{"test": "deployment_verification"}'
);

-- Run detection cycle
SELECT detect_transaction_failures();

-- Verify event created
SELECT * FROM monitoring_events 
WHERE event_type = 'transaction_failure' 
AND card_id = 'TEST_CARD_001';
```

#### 5.2 Test Balance Monitoring

```sql
-- Create test balance discrepancy
UPDATE table_cards 
SET amount = -5.00 
WHERE id = 'TEST_CARD_001';

-- Run detection
SELECT detect_balance_discrepancies();

-- Verify detection
SELECT * FROM monitoring_events 
WHERE event_type = 'balance_discrepancy' 
AND card_id = 'TEST_CARD_001';

-- Cleanup test data
UPDATE table_cards 
SET amount = 0.00 
WHERE id = 'TEST_CARD_001';
```

#### 5.3 Test NFC Monitoring

```sql
-- Create duplicate NFC scans
INSERT INTO nfc_scan_log (card_id_scanned, scan_timestamp) VALUES
('TEST_CARD_001', NOW()),
('TEST_CARD_001', NOW() + INTERVAL '1 second'),
('TEST_CARD_001', NOW() + INTERVAL '2 seconds');

-- Run detection
SELECT detect_duplicate_nfc_scans();

-- Verify detection
SELECT * FROM monitoring_events 
WHERE event_type = 'duplicate_nfc' 
AND card_id = 'TEST_CARD_001';
```

### Step 6: Performance Validation

#### 6.1 Load Testing

```bash
# Test API performance
for i in {1..10}; do
  time curl -s -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/health" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > /dev/null
done

# Test detection cycle performance
time curl -s -X POST "https://your-project.supabase.co/functions/v1/monitoring/cycle" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Performance Targets:**
- API response time: <500ms
- Detection cycle: <5 seconds
- Database queries: <100ms

#### 6.2 Memory and Resource Monitoring

```sql
-- Check database connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Monitor query performance
SELECT 
    query,
    mean_exec_time,
    calls,
    total_exec_time
FROM pg_stat_statements 
WHERE query LIKE '%monitoring_%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Step 7: Security Validation

#### 7.1 Verify Database Permissions

```sql
-- Check monitoring roles
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb 
FROM pg_roles 
WHERE rolname LIKE 'monitoring_%';

-- Verify table permissions
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name LIKE 'monitoring_%';
```

#### 7.2 Test API Security

```bash
# Test without authentication (should fail)
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/health"
# Expected: 401 Unauthorized

# Test with invalid key (should fail)
curl -X GET "https://your-project.supabase.co/functions/v1/monitoring-api/health" \
  -H "Authorization: Bearer invalid_key"
# Expected: 401 Unauthorized

# Test CORS headers
curl -X OPTIONS "https://your-project.supabase.co/functions/v1/monitoring-api/health" \
  -H "Origin: https://your-domain.com"
# Expected: CORS headers present
```

## 🔧 Configuration Management

### Environment-Specific Settings

#### Production Configuration

```bash
# Set production environment variables
supabase secrets set ENVIRONMENT=production
supabase secrets set MONITORING_INTERVAL_CRITICAL=30000
supabase secrets set MONITORING_INTERVAL_MEDIUM=120000
supabase secrets set MONITORING_INTERVAL_HEALTH=300000
supabase secrets set MONITORING_CLEANUP_RETENTION_DAYS=30
```

#### Development Configuration

```bash
# Set development environment variables
supabase secrets set ENVIRONMENT=development
supabase secrets set MONITORING_INTERVAL_CRITICAL=60000
supabase secrets set MONITORING_INTERVAL_MEDIUM=300000
supabase secrets set MONITORING_INTERVAL_HEALTH=600000
supabase secrets set MONITORING_CLEANUP_RETENTION_DAYS=7
```

### Database Configuration

```sql
-- Set optimal database parameters for monitoring
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';
ALTER SYSTEM SET log_statement = 'mod';
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Reload configuration
SELECT pg_reload_conf();
```

## 📊 Health Checks and Validation

### Automated Health Check Script

Create `scripts/health-check.sh`:

```bash
#!/bin/bash

echo "=== Phase 4 Monitoring System Health Check ==="

# Check database connectivity
echo "1. Testing database connectivity..."
supabase db ping || exit 1

# Check edge functions
echo "2. Testing edge functions..."
curl -f -s -X GET "$SUPABASE_URL/functions/v1/monitoring/health" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > /dev/null || exit 1

curl -f -s -X GET "$SUPABASE_URL/functions/v1/monitoring-api/health" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > /dev/null || exit 1

# Check detection functions
echo "3. Testing detection functions..."
psql "$DATABASE_URL" -c "SELECT detect_transaction_failures();" > /dev/null || exit 1

# Check system health
echo "4. Testing system health..."
psql "$DATABASE_URL" -c "SELECT update_system_health_snapshot();" > /dev/null || exit 1

echo "✅ All health checks passed!"
```

### Monitoring Dashboard Validation

1. **Access Dashboard**: Navigate to `/admin` and verify monitoring tab
2. **Real-time Data**: Confirm live data updates every 30 seconds
3. **Event Display**: Verify events show with proper formatting
4. **Filtering**: Test event type and severity filters
5. **Performance**: Confirm dashboard loads in <2 seconds

## 🚨 Troubleshooting

### Common Issues and Solutions

#### Issue: Migration Fails

**Symptoms**: Database migration errors during deployment

**Solution**:
```bash
# Check current migration status
supabase db status

# Reset to last known good state
supabase db reset

# Reapply migrations one by one
supabase db push --dry-run
supabase db push
```

#### Issue: Edge Function Deployment Fails

**Symptoms**: Function deployment timeout or errors

**Solution**:
```bash
# Check function logs
supabase functions logs monitoring
supabase functions logs monitoring-api

# Redeploy with verbose output
supabase functions deploy monitoring --debug
supabase functions deploy monitoring-api --debug
```

#### Issue: Detection Functions Not Working

**Symptoms**: No monitoring events being created

**Solution**:
```sql
-- Check function permissions
SELECT has_function_privilege('monitoring_writer', 'detect_transaction_failures()', 'EXECUTE');

-- Test functions manually
SELECT detect_transaction_failures();

-- Check for errors in logs
SELECT * FROM pg_stat_statements WHERE query LIKE '%detect_%';
```

#### Issue: Poor Performance

**Symptoms**: Slow API responses or detection cycles

**Solution**:
```sql
-- Check index usage
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

-- Analyze table statistics
ANALYZE monitoring_events;
ANALYZE system_health_snapshots;

-- Check for blocking queries
SELECT * FROM pg_stat_activity WHERE state = 'active' AND wait_event IS NOT NULL;
```

#### Issue: High Memory Usage

**Symptoms**: Edge functions running out of memory

**Solution**:
```bash
# Check function memory limits
supabase functions inspect monitoring
supabase functions inspect monitoring-api

# Optimize batch sizes in configuration
export MONITORING_BATCH_SIZE=500
```

### Emergency Rollback Procedure

If critical issues occur during deployment:

```bash
# 1. Stop monitoring functions
supabase functions delete monitoring
supabase functions delete monitoring-api

# 2. Restore database from backup
supabase db reset
psql "$DATABASE_URL" < backup_pre_phase4_YYYYMMDD_HHMMSS.sql

# 3. Verify system restoration
supabase db status
curl -X GET "$SUPABASE_URL/rest/v1/app_transaction_log?limit=1" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# 4. Notify team and investigate issues
echo "Rollback completed. System restored to pre-Phase 4 state."
```

## 📈 Post-Deployment Monitoring

### First 24 Hours

1. **Monitor System Health**: Check dashboard every 2 hours
2. **Review Detection Accuracy**: Validate event generation
3. **Performance Tracking**: Monitor API response times
4. **Error Monitoring**: Watch for any error patterns

### First Week

1. **Tune Detection Thresholds**: Adjust based on real data
2. **Optimize Performance**: Fine-tune based on usage patterns
3. **User Feedback**: Collect feedback from admin users
4. **Documentation Updates**: Update based on operational experience

### Ongoing Monitoring

1. **Weekly Performance Reviews**: Analyze trends and patterns
2. **Monthly Capacity Planning**: Assess scaling needs
3. **Quarterly Security Reviews**: Validate security measures
4. **Continuous Improvement**: Implement enhancements based on feedback

## 📚 Related Documentation

- **[Phase 4 Implementation Summary](PHASE4_IMPLEMENTATION_SUMMARY.md)** - Complete system overview
- **[Phase 4 Operational Guide](PHASE4_OPERATIONAL_GUIDE.md)** - Day-to-day operations
- **[Phase 4 API Reference](PHASE4_API_REFERENCE.md)** - API documentation
- **[Phase 4 Architecture](PHASE4_MONITORING_SYSTEM_ARCHITECTURE.md)** - Technical architecture

## ✅ Deployment Completion Checklist

### Pre-Deployment
- [ ] Environment validated
- [ ] Permissions verified
- [ ] Backup created
- [ ] Configuration prepared

### Database Deployment
- [ ] Migration applied successfully
- [ ] Tables and indexes created
- [ ] Functions deployed
- [ ] Initial data populated
- [ ] Performance validated

### Edge Function Deployment
- [ ] Monitoring function deployed
- [ ] Monitoring API deployed
- [ ] Health checks passing
- [ ] Performance validated

### Frontend Integration
- [ ] Components loading correctly
- [ ] Dashboard accessible
- [ ] Real-time updates working
- [ ] No console errors

### Testing and Validation
- [ ] Integration tests passed
- [ ] Performance tests passed
- [ ] Security validation completed
- [ ] Load testing completed

### Post-Deployment
- [ ] Health monitoring active
- [ ] Documentation updated
- [ ] Team notified
- [ ] Monitoring schedule established

## 🎉 Deployment Success

Upon successful completion of all steps, the Phase 4 Monitoring System will be fully operational and ready to provide comprehensive financial integrity monitoring for your festival payment platform.

**Next Steps:**
1. Begin 24-hour monitoring period
2. Schedule regular health checks
3. Plan threshold tuning based on real data
4. Prepare operational procedures

The system is now ready to protect your festival's financial operations with real-time monitoring and alerting capabilities.