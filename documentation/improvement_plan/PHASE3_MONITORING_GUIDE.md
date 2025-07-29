# Phase 3 Monitoring and Operations Guide

## Overview

This guide provides comprehensive monitoring, alerting, and troubleshooting procedures for the Phase 3 NFC system. It covers operational monitoring, performance analysis, error detection, and maintenance procedures for production environments.

## 📊 Monitoring Dashboard

### Key Performance Indicators (KPIs)

#### System Health Metrics

| Metric | Target | Warning | Critical | Description |
|--------|--------|---------|----------|-------------|
| **NFC Scan Success Rate** | >95% | <95% | <90% | Percentage of successful NFC scans |
| **Average Processing Time** | <500ms | >500ms | >1000ms | Mean processing duration for operations |
| **Lock Acquisition Rate** | >99% | <99% | <95% | Percentage of successful lock acquisitions |
| **Duplicate Prevention Rate** | >99% | <99% | <95% | Percentage of duplicates successfully prevented |
| **Error Rate** | <5% | >5% | >10% | Percentage of operations resulting in errors |

#### Operational Metrics

| Metric | Description | Query Frequency |
|--------|-------------|-----------------|
| **Active Operations** | Current operations in progress | Real-time |
| **Queue Depth** | Pending operations waiting for locks | Every 30 seconds |
| **Database Performance** | Query execution times and connection usage | Every minute |
| **Storage Usage** | Table sizes and growth rates | Every hour |

### Real-Time Monitoring Queries

#### System Health Dashboard

```sql
-- Overall system health (last hour)
WITH health_metrics AS (
  SELECT 
    COUNT(*) as total_scans,
    COUNT(*) FILTER (WHERE scan_status = 'success') as successful_scans,
    COUNT(*) FILTER (WHERE scan_status IN ('failure', 'processing_error', 'timeout')) as failed_scans,
    COUNT(*) FILTER (WHERE scan_status = 'duplicate') as duplicate_scans,
    AVG(processing_duration_ms) as avg_processing_ms,
    MAX(processing_duration_ms) as max_processing_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_duration_ms) as p95_processing_ms
  FROM nfc_scan_log 
  WHERE scan_timestamp > NOW() - INTERVAL '1 hour'
    AND processing_duration_ms IS NOT NULL
)
SELECT 
  total_scans,
  successful_scans,
  ROUND((successful_scans::DECIMAL / NULLIF(total_scans, 0)) * 100, 2) as success_rate_percent,
  failed_scans,
  duplicate_scans,
  ROUND(avg_processing_ms, 2) as avg_processing_ms,
  max_processing_ms,
  ROUND(p95_processing_ms, 2) as p95_processing_ms
FROM health_metrics;
```

#### Active Operations Monitor

```sql
-- Current active operations and locks
SELECT 
  'Active Locks' as metric_type,
  COUNT(*) as count,
  array_agg(DISTINCT operation_type) as operation_types,
  array_agg(DISTINCT card_id) as active_cards
FROM nfc_operation_locks 
WHERE expires_at > NOW()

UNION ALL

SELECT 
  'Recent Operations' as metric_type,
  COUNT(*) as count,
  array_agg(DISTINCT scan_status) as statuses,
  array_agg(DISTINCT edge_function_name) as functions
FROM nfc_scan_log 
WHERE scan_timestamp > NOW() - INTERVAL '5 minutes';
```

#### Performance Trends

```sql
-- Hourly performance trends (last 24 hours)
SELECT 
  DATE_TRUNC('hour', scan_timestamp) as hour,
  COUNT(*) as total_operations,
  COUNT(*) FILTER (WHERE scan_status = 'success') as successful_operations,
  ROUND(AVG(processing_duration_ms), 2) as avg_processing_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_duration_ms), 2) as p95_processing_ms,
  COUNT(DISTINCT card_id_scanned) as unique_cards,
  COUNT(DISTINCT edge_function_name) as active_functions
FROM nfc_scan_log 
WHERE scan_timestamp > NOW() - INTERVAL '24 hours'
  AND processing_duration_ms IS NOT NULL
GROUP BY hour
ORDER BY hour DESC;
```

## 🚨 Alerting and Notifications

### Critical Alerts

#### High Error Rate Alert

```sql
-- Alert when error rate exceeds 10% in last 15 minutes
WITH error_metrics AS (
  SELECT 
    COUNT(*) as total_operations,
    COUNT(*) FILTER (WHERE scan_status IN ('failure', 'processing_error', 'timeout', 'backend_rejected')) as error_operations
  FROM nfc_scan_log 
  WHERE scan_timestamp > NOW() - INTERVAL '15 minutes'
)
SELECT 
  total_operations,
  error_operations,
  ROUND((error_operations::DECIMAL / NULLIF(total_operations, 0)) * 100, 2) as error_rate_percent,
  CASE 
    WHEN (error_operations::DECIMAL / NULLIF(total_operations, 0)) > 0.10 THEN 'CRITICAL'
    WHEN (error_operations::DECIMAL / NULLIF(total_operations, 0)) > 0.05 THEN 'WARNING'
    ELSE 'OK'
  END as alert_level
FROM error_metrics
WHERE total_operations > 10;  -- Only alert if we have sufficient data
```

#### Slow Processing Alert

```sql
-- Alert when average processing time exceeds thresholds
WITH performance_metrics AS (
  SELECT 
    AVG(processing_duration_ms) as avg_processing_ms,
    MAX(processing_duration_ms) as max_processing_ms,
    COUNT(*) as operation_count
  FROM nfc_scan_log 
  WHERE scan_timestamp > NOW() - INTERVAL '10 minutes'
    AND processing_duration_ms IS NOT NULL
)
SELECT 
  ROUND(avg_processing_ms, 2) as avg_processing_ms,
  max_processing_ms,
  operation_count,
  CASE 
    WHEN avg_processing_ms > 1000 THEN 'CRITICAL'
    WHEN avg_processing_ms > 500 THEN 'WARNING'
    ELSE 'OK'
  END as alert_level
FROM performance_metrics
WHERE operation_count > 5;
```

#### Stuck Locks Alert

```sql
-- Alert for locks that should have expired
SELECT 
  COUNT(*) as stuck_locks,
  array_agg(lock_id) as stuck_lock_ids,
  array_agg(card_id) as affected_cards,
  CASE 
    WHEN COUNT(*) > 5 THEN 'CRITICAL'
    WHEN COUNT(*) > 0 THEN 'WARNING'
    ELSE 'OK'
  END as alert_level
FROM nfc_operation_locks 
WHERE expires_at < NOW() - INTERVAL '1 minute';
```

### Alert Configuration

#### Recommended Alert Thresholds

```yaml
# Example alerting configuration (Prometheus/Grafana style)
alerts:
  - name: NFC_High_Error_Rate
    condition: error_rate > 10%
    duration: 5m
    severity: critical
    
  - name: NFC_Slow_Processing
    condition: avg_processing_time > 1000ms
    duration: 5m
    severity: warning
    
  - name: NFC_Stuck_Locks
    condition: stuck_locks > 0
    duration: 2m
    severity: critical
    
  - name: NFC_Low_Success_Rate
    condition: success_rate < 90%
    duration: 10m
    severity: critical
    
  - name: NFC_High_Duplicate_Rate
    condition: duplicate_rate > 20%
    duration: 15m
    severity: warning
```

## 🔍 Error Analysis and Troubleshooting

### Common Error Patterns

#### Error Classification

```sql
-- Comprehensive error analysis
SELECT 
  scan_status,
  error_code,
  COUNT(*) as error_count,
  ROUND((COUNT(*)::DECIMAL / SUM(COUNT(*)) OVER()) * 100, 2) as percentage,
  array_agg(DISTINCT error_message) as error_messages,
  array_agg(DISTINCT edge_function_name) as affected_functions,
  MIN(scan_timestamp) as first_occurrence,
  MAX(scan_timestamp) as last_occurrence
FROM nfc_scan_log 
WHERE scan_status IN ('failure', 'processing_error', 'backend_rejected', 'timeout')
  AND scan_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY scan_status, error_code
ORDER BY error_count DESC;
```

#### Card-Specific Issues

```sql
-- Cards experiencing frequent errors
SELECT 
  card_id_scanned,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE scan_status = 'success') as successful_attempts,
  COUNT(*) FILTER (WHERE scan_status IN ('failure', 'processing_error')) as failed_attempts,
  ROUND((COUNT(*) FILTER (WHERE scan_status = 'success')::DECIMAL / COUNT(*)) * 100, 2) as success_rate,
  array_agg(DISTINCT scan_status) as statuses,
  array_agg(DISTINCT error_message) FILTER (WHERE error_message IS NOT NULL) as error_messages
FROM nfc_scan_log 
WHERE scan_timestamp > NOW() - INTERVAL '24 hours'
  AND card_id_scanned IS NOT NULL
GROUP BY card_id_scanned
HAVING COUNT(*) > 5  -- Cards with multiple attempts
ORDER BY failed_attempts DESC, success_rate ASC;
```

### Troubleshooting Procedures

#### Procedure 1: High Error Rate Investigation

**Symptoms**: Error rate above 10% for sustained period

**Investigation Steps**:

1. **Check Error Distribution**:
```sql
-- Analyze error types and patterns
SELECT 
  scan_status,
  error_code,
  COUNT(*) as count,
  array_agg(DISTINCT edge_function_name) as functions
FROM nfc_scan_log 
WHERE scan_timestamp > NOW() - INTERVAL '1 hour'
  AND scan_status IN ('failure', 'processing_error', 'backend_rejected')
GROUP BY scan_status, error_code
ORDER BY count DESC;
```

2. **Check System Resources**:
```sql
-- Database performance metrics
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  n_tup_ins,
  n_tup_upd,
  n_tup_del
FROM pg_stat_user_tables 
WHERE tablename IN ('nfc_scan_log', 'nfc_operation_locks', 'idempotency_keys');
```

3. **Check Lock Contention**:
```sql
-- Active and recent locks
SELECT 
  operation_type,
  COUNT(*) as active_locks,
  AVG(EXTRACT(EPOCH FROM (expires_at - locked_at))) as avg_lock_duration
FROM nfc_operation_locks 
WHERE locked_at > NOW() - INTERVAL '1 hour'
GROUP BY operation_type;
```

**Resolution Actions**:
- If database performance issues: Scale database resources
- If lock contention: Reduce lock duration or optimize operations
- If specific error codes: Address root cause based on error type

#### Procedure 2: Slow Processing Investigation

**Symptoms**: Average processing time above 500ms

**Investigation Steps**:

1. **Identify Slow Operations**:
```sql
-- Slowest operations by function
SELECT 
  edge_function_name,
  COUNT(*) as operation_count,
  AVG(processing_duration_ms) as avg_duration,
  MAX(processing_duration_ms) as max_duration,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_duration_ms) as p95_duration
FROM nfc_scan_log 
WHERE scan_timestamp > NOW() - INTERVAL '1 hour'
  AND processing_duration_ms IS NOT NULL
GROUP BY edge_function_name
ORDER BY avg_duration DESC;
```

2. **Check Database Query Performance**:
```sql
-- Slow queries (requires pg_stat_statements)
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements 
WHERE query LIKE '%nfc_%' 
ORDER BY mean_time DESC 
LIMIT 10;
```

**Resolution Actions**:
- Optimize slow database queries
- Scale edge function resources
- Review and optimize stored procedures

#### Procedure 3: Lock Issues Investigation

**Symptoms**: Operations failing due to lock conflicts

**Investigation Steps**:

1. **Check Lock Patterns**:
```sql
-- Lock acquisition patterns
SELECT 
  card_id,
  operation_type,
  COUNT(*) as lock_attempts,
  COUNT(*) FILTER (WHERE expires_at > locked_at) as successful_locks,
  AVG(EXTRACT(EPOCH FROM (expires_at - locked_at))) as avg_lock_duration
FROM nfc_operation_locks 
WHERE locked_at > NOW() - INTERVAL '2 hours'
GROUP BY card_id, operation_type
HAVING COUNT(*) > 3
ORDER BY lock_attempts DESC;
```

2. **Identify Stuck Locks**:
```sql
-- Locks that should have been cleaned up
SELECT 
  lock_id,
  card_id,
  operation_type,
  locked_at,
  expires_at,
  EXTRACT(EPOCH FROM (NOW() - expires_at)) as expired_seconds_ago
FROM nfc_operation_locks 
WHERE expires_at < NOW()
ORDER BY expired_seconds_ago DESC;
```

**Resolution Actions**:
- Run manual cleanup: `SELECT cleanup_expired_nfc_resources();`
- Investigate application logic for proper lock release
- Consider reducing lock duration for high-frequency operations

## 📈 Performance Optimization

### Database Optimization

#### Index Performance Analysis

```sql
-- Index usage statistics
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  CASE 
    WHEN idx_scan = 0 THEN 'UNUSED'
    WHEN idx_scan < 100 THEN 'LOW_USAGE'
    ELSE 'ACTIVE'
  END as usage_status
FROM pg_stat_user_indexes 
WHERE tablename LIKE 'nfc_%'
ORDER BY idx_scan DESC;
```

#### Query Optimization

```sql
-- Analyze query performance for common patterns
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM nfc_scan_log 
WHERE card_id_scanned = 'ABC12345' 
  AND scan_timestamp > NOW() - INTERVAL '1 hour'
ORDER BY scan_timestamp DESC;

-- Check for sequential scans that should use indexes
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  CASE 
    WHEN seq_scan > idx_scan THEN 'NEEDS_INDEX_OPTIMIZATION'
    ELSE 'OK'
  END as optimization_status
FROM pg_stat_user_tables 
WHERE tablename LIKE 'nfc_%';
```

### Application Performance

#### NFC Hook Optimization

**Memory Usage Monitoring**:
```typescript
// Monitor NFC hook memory usage
const useNFCMemoryMonitor = () => {
  const { getScanHistory } = useNfc();
  
  useEffect(() => {
    const interval = setInterval(() => {
      const historySize = getScanHistory().length;
      const memoryUsage = (performance as any).memory?.usedJSHeapSize;
      
      console.log('NFC Memory Stats:', {
        scanHistorySize: historySize,
        memoryUsage: memoryUsage ? `${Math.round(memoryUsage / 1024 / 1024)}MB` : 'N/A'
      });
      
      // Alert if scan history grows too large
      if (historySize > 1000) {
        console.warn('NFC scan history size is large:', historySize);
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [getScanHistory]);
};
```

**Performance Metrics Collection**:
```typescript
// Collect NFC performance metrics
const collectNFCMetrics = () => {
  const metrics = {
    timestamp: new Date().toISOString(),
    scanHistory: nfcHook.getScanHistory().length,
    currentState: nfcHook.state,
    lastScanTime: nfcHook.lastScannedId ? Date.now() : null,
    errorCount: errorCount,
    successCount: successCount
  };
  
  // Send to monitoring system
  fetch('/api/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics)
  });
};
```

## 🔧 Maintenance Procedures

### Routine Maintenance

#### Daily Maintenance Tasks

```sql
-- Daily maintenance script
DO $$
DECLARE
  cleanup_result JSONB;
  table_sizes RECORD;
BEGIN
  -- 1. Clean up expired resources
  SELECT cleanup_expired_nfc_resources() INTO cleanup_result;
  RAISE NOTICE 'Cleanup completed: %', cleanup_result;
  
  -- 2. Check table sizes
  FOR table_sizes IN 
    SELECT 
      tablename,
      pg_size_pretty(pg_total_relation_size(tablename)) as size
    FROM pg_tables 
    WHERE tablename LIKE 'nfc_%' 
      AND schemaname = 'public'
  LOOP
    RAISE NOTICE 'Table % size: %', table_sizes.tablename, table_sizes.size;
  END LOOP;
  
  -- 3. Update table statistics
  ANALYZE nfc_scan_log;
  ANALYZE nfc_operation_locks;
  ANALYZE idempotency_keys;
  
END $$;
```

#### Weekly Maintenance Tasks

```sql
-- Weekly maintenance and optimization
DO $$
DECLARE
  index_stats RECORD;
BEGIN
  -- 1. Check for unused indexes
  FOR index_stats IN
    SELECT 
      schemaname,
      tablename,
      indexname,
      idx_scan
    FROM pg_stat_user_indexes 
    WHERE tablename LIKE 'nfc_%'
      AND idx_scan < 10
  LOOP
    RAISE NOTICE 'Low usage index: %.% (% scans)', 
      index_stats.tablename, index_stats.indexname, index_stats.idx_scan;
  END LOOP;
  
  -- 2. Vacuum and reindex if needed
  VACUUM ANALYZE nfc_scan_log;
  VACUUM ANALYZE nfc_operation_locks;
  
  -- 3. Check for table bloat
  SELECT 
    schemaname,
    tablename,
    n_dead_tup,
    n_live_tup,
    CASE 
      WHEN n_live_tup > 0 THEN (n_dead_tup::FLOAT / n_live_tup::FLOAT) * 100
      ELSE 0
    END as dead_tuple_percent
  FROM pg_stat_user_tables 
  WHERE tablename LIKE 'nfc_%'
    AND n_dead_tup > 1000;
END $$;
```

### Emergency Procedures

#### Emergency Lock Cleanup

```sql
-- Emergency procedure to clear all stuck locks
-- USE WITH CAUTION - Only in emergency situations
DO $$
DECLARE
  stuck_locks INTEGER;
BEGIN
  -- Count stuck locks
  SELECT COUNT(*) INTO stuck_locks
  FROM nfc_operation_locks 
  WHERE expires_at < NOW() - INTERVAL '5 minutes';
  
  IF stuck_locks > 0 THEN
    RAISE NOTICE 'Found % stuck locks, cleaning up...', stuck_locks;
    
    -- Delete stuck locks
    DELETE FROM nfc_operation_locks 
    WHERE expires_at < NOW() - INTERVAL '5 minutes';
    
    RAISE NOTICE 'Emergency cleanup completed';
  ELSE
    RAISE NOTICE 'No stuck locks found';
  END IF;
END $$;
```

#### Database Recovery Procedures

```sql
-- Emergency database recovery
-- Check for corruption or consistency issues
DO $$
BEGIN
  -- 1. Check table integrity
  RAISE NOTICE 'Checking table integrity...';
  
  -- Verify foreign key constraints
  SELECT 
    conname,
    conrelid::regclass,
    confrelid::regclass
  FROM pg_constraint 
  WHERE contype = 'f' 
    AND (conrelid::regclass::text LIKE '%nfc_%' 
         OR confrelid::regclass::text LIKE '%nfc_%');
  
  -- 2. Check for orphaned records
  SELECT COUNT(*) as orphaned_scan_logs
  FROM nfc_scan_log nsl
  LEFT JOIN idempotency_keys ik ON ik.nfc_scan_log_id = nsl.scan_log_id
  WHERE nsl.client_request_id IS NOT NULL 
    AND ik.request_id IS NULL;
    
  -- 3. Verify data consistency
  SELECT 
    'nfc_scan_log' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE scan_timestamp IS NULL) as null_timestamps,
    COUNT(*) FILTER (WHERE scan_status IS NULL) as null_statuses
  FROM nfc_scan_log
  
  UNION ALL
  
  SELECT 
    'nfc_operation_locks' as table_name,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE locked_at IS NULL) as null_locked_at,
    COUNT(*) FILTER (WHERE expires_at IS NULL) as null_expires_at
  FROM nfc_operation_locks;
END $$;
```

## 📊 Reporting and Analytics

### Daily Reports

#### System Health Report

```sql
-- Daily system health summary
WITH daily_stats AS (
  SELECT 
    DATE(scan_timestamp) as report_date,
    COUNT(*) as total_operations,
    COUNT(*) FILTER (WHERE scan_status = 'success') as successful_operations,
    COUNT(*) FILTER (WHERE scan_status = 'duplicate') as duplicate_operations,
    COUNT(*) FILTER (WHERE scan_status IN ('failure', 'processing_error')) as failed_operations,
    COUNT(DISTINCT card_id_scanned) as unique_cards,
    COUNT(DISTINCT edge_function_name) as active_functions,
    AVG(processing_duration_ms) as avg_processing_time,
    MAX(processing_duration_ms) as max_processing_time
  FROM nfc_scan_log 
  WHERE scan_timestamp >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY DATE(scan_timestamp)
)
SELECT 
  report_date,
  total_operations,
  successful_operations,
  ROUND((successful_operations::DECIMAL / total_operations) * 100, 2) as success_rate_percent,
  duplicate_operations,
  failed_operations,
  unique_cards,
  active_functions,
  ROUND(avg_processing_time, 2) as avg_processing_time_ms,
  max_processing_time as max_processing_time_ms
FROM daily_stats
ORDER BY report_date DESC;
```

#### Performance Trends Report

```sql
-- Weekly performance trends
SELECT 
  DATE_TRUNC('week', scan_timestamp) as week_start,
  COUNT(*) as total_operations,
  ROUND(AVG(processing_duration_ms), 2) as avg_processing_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_duration_ms), 2) as p95_processing_ms,
  COUNT(*) FILTER (WHERE scan_status = 'success') as successful_operations,
  ROUND((COUNT(*) FILTER (WHERE scan_status = 'success')::DECIMAL / COUNT(*)) * 100, 2) as success_rate_percent,
  COUNT(DISTINCT card_id_scanned) as unique_cards_served
FROM nfc_scan_log 
WHERE scan_timestamp >= CURRENT_DATE - INTERVAL '4 weeks'
  AND processing_duration_ms IS NOT NULL
GROUP BY DATE_TRUNC('week', scan_timestamp)
ORDER BY week_start DESC;
```

### Custom Dashboards

#### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "NFC System Phase 3 Monitoring",
    "panels": [
      {
        "title": "NFC Scan Success Rate",
        "type": "stat",
        "targets": [
          {
            "rawSql": "SELECT (COUNT(*) FILTER (WHERE scan_status = 'success')::DECIMAL / COUNT(*)) * 100 as success_rate FROM nfc_scan_log WHERE scan_timestamp > NOW() - INTERVAL '1 hour'"
          }
        ],
        "thresholds": [
          {"color": "red", "value": 90},
          {"color": "yellow", "value": 95},
          {"color": "green", "value": 100}
        ]
      },
      {
        "title": "Average Processing Time",
        "type": "stat",
        "targets": [
          {
            "rawSql": "SELECT AVG(processing_duration_ms) as avg_processing FROM nfc_scan_log WHERE scan_timestamp > NOW() - INTERVAL '1 hour' AND processing_duration_ms IS NOT NULL"
          }
        ],
        "unit": "ms",
        "thresholds": [
          {"color": "green", "value": 0},
          {"color": "yellow", "value": 500},
          {"color": "red", "value": 1000}
        ]
      },
      {
        "title": "Operations Over Time",
        "type": "graph",
        "targets": [
          {
            "rawSql": "SELECT scan_timestamp as time, COUNT(*) as operations FROM nfc_scan_log WHERE scan_timestamp > NOW() - INTERVAL '24 hours' GROUP BY DATE_TRUNC('minute', scan_timestamp) ORDER BY time"
          }
        ]
      }
    ]
  }
}
```

## 🚀 Deployment and Rollback

### Health Checks

#### Pre-Deployment Verification

```sql
-- Pre-deployment health check
DO $$
DECLARE
  health_status TEXT := 'HEALTHY';
  check_result RECORD;
BEGIN
  -- Check 1: Verify all required tables exist
  SELECT COUNT(*) as table_count INTO check_result
  FROM information_schema.tables 
  WHERE table_name IN ('nfc_scan_log', 'nfc_operation_locks') 
    AND table_schema = 'public';
    
  IF check_result.table_count < 2 THEN
    health_status := 'UNHEALTHY - Missing tables';
  END IF;
  
  -- Check 2: Verify functions exist
  SELECT COUNT(*) as function_count INTO check_result
  FROM information_schema.routines 
  WHERE routine_name LIKE '%nfc%' 
    AND routine_schema = 'public';
    
  IF check_result.function_count < 3 THEN
    health_status := 'UNHEALTHY - Missing functions';
  END IF;
  
  -- Check 3: Test basic functionality
  BEGIN
    PERFORM acquire_nfc_operation_lock('HEALTH_CHECK', 'balance_check', 'health_check_req');
    PERFORM cleanup_expired_nfc_resources();
  EXCEPTION WHEN OTHERS THEN
    health_status := 'UNHEALTHY - Function test failed';
  END;
  
  RAISE NOTICE 'Health check status: %', health_status;
END $$;
```

#### Post-Deployment Verification

```sql
-- Post-deployment verification
SELECT 
  'System Status' as check_type,
  CASE 
    WHEN COUNT(*) > 0 THEN 'ACTIVE'
    ELSE 'INACTIVE'
  END as status
FROM nfc_scan_log 
WHERE scan_timestamp > NOW() - INTERVAL '5 minutes'

UNION ALL

SELECT 
  'Lock System' as check_type,
  CASE 
    WHEN COUNT(*) >= 0 THEN 'OPERATIONAL'
    ELSE 'ERROR'
  END as status
FROM nfc_operation_locks

UNION ALL

SELECT 
  'Cleanup Function' as check_type,
  CASE 
    WHEN (cleanup_expired_nfc_resources()->>'deleted_locks')::INTEGER >= 0 THEN 'OPERATIONAL'
    ELSE 'ERROR'
  END as status;
```

## 📚 Related Documentation

- **[`PHASE3_NFC_STATE_MACHINE.md`](PHASE3_NFC_STATE_MACHINE.md:1)**: Detailed NFC state machine implementation
- **[`PHASE3_DATABASE_SCHEMA.md`](PHASE3_DATABASE_SCHEMA.md:1)**: Complete database schema reference
- **[`PHASE3_API_REFERENCE.md`](PHASE3_API_REFERENCE.md:1)**: API specifications and integration guide
- **[`PHASE3_IMPLEMENTATION_SUMMARY.md`](PHASE3_IMPLEMENTATION_SUMMARY.md:1)**: High-level implementation overview
- **[`../supabase/migrations/20250609_phase3_debouncing.sql`](../supabase/migrations/20250609_phase3_debouncing.sql:1)**: Database migration script
- **[`../deploy-phase3.sh`](../deploy-phase3.sh:1)**: Automated deployment script

## 🎯 Best Practices

### Monitoring Best Practices

1. **Set up automated alerts** for critical metrics
2. **Monitor trends** rather than just current values
3. **Use composite metrics** that combine multiple indicators
4. **Implement gradual alerting** (warning → critical)
5. **Document all alert responses** and resolution procedures

### Performance Best Practices

1. **Regular maintenance** scheduling and execution
2. **Proactive monitoring** of resource usage
3. **Capacity planning** based on growth trends
4. **Performance testing** before major releases
5. **Database optimization** through regular analysis

### Operational Best Practices

1. **Comprehensive logging** of all operations
2. **Structured error handling** with clear categorization
3. **Regular backup verification** and recovery testing
4. **Documentation maintenance** and updates
5. **Team training** on monitoring and troubleshooting procedures