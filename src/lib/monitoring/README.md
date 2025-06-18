# Phase 4 Monitoring System

This directory contains the core monitoring detection logic and services for the Phase 4 monitoring system. The system implements comprehensive financial integrity monitoring with four main detection algorithms.

## 🏗️ Architecture Overview

The monitoring system consists of several key components:

- **Detection Service** (`detection-service.ts`) - Implements all four detection algorithms
- **Background Processor** (`background-processor.ts`) - Manages scheduled detection cycles with circuit breaker patterns
- **Monitoring Client** (`monitoring-client.ts`) - Provides API access with caching and real-time subscriptions
- **Edge Functions** - Serverless functions for monitoring orchestration and API endpoints

## 🔍 Detection Algorithms

### 1. Transaction Failure Detection (Critical Priority)
- **Balance deduction on failed transactions** - Detects when money is deducted despite transaction failure
- **Consecutive failures** - Identifies cards with multiple consecutive failed transactions
- **System-wide failure spikes** - Monitors overall system failure rates

### 2. Balance Discrepancy Detection (Critical Priority)
- **Balance mismatches** - Compares actual vs expected balances using transaction history
- **Negative balances** - Detects impossible negative balance scenarios

### 3. Duplicate NFC Detection (Medium Priority)
- **Temporal duplicates** - Identifies same card scanned multiple times within 5-second windows

### 4. Race Condition Detection (Medium Priority)
- **Concurrent transactions** - Monitors overlapping transactions for the same card within 2-second intervals

## 📊 Monitoring Intervals

The system uses staggered processing schedules to optimize resource usage:

- **Critical checks** (Transaction failures, Balance discrepancies): Every 30 seconds
- **Medium checks** (Duplicate NFC, Race conditions): Every 2 minutes
- **Health snapshots**: Every 5 minutes
- **Cleanup operations**: Every hour

## 🚀 Usage

### Basic Usage

```typescript
import { 
  initializeMonitoring, 
  runManualDetectionCycle,
  getCurrentSystemHealth,
  subscribeToMonitoringEvents
} from '@/lib/monitoring';

// Initialize the monitoring system
await initializeMonitoring();

// Run a manual detection cycle
const result = await runManualDetectionCycle();
console.log('Detection cycle result:', result);

// Get current system health
const health = await getCurrentSystemHealth();
console.log('System health:', health.status);

// Subscribe to real-time events
const unsubscribe = subscribeToMonitoringEvents((event) => {
  console.log('New monitoring event:', event);
});

// Later, unsubscribe
unsubscribe();
```

### Advanced Usage

```typescript
import { 
  detectionService, 
  backgroundProcessor, 
  monitoringClient 
} from '@/lib/monitoring';

// Direct service access
const events = await detectionService.getMonitoringEvents({
  event_type: 'transaction_failure',
  severity: 'CRITICAL',
  limit: 10
});

// Background processor control
const status = backgroundProcessor.getStatus();
console.log('Processor status:', status);

// Monitoring client with filters
const dashboard = await monitoringClient.getDashboard();
console.log('Dashboard data:', dashboard);
```

## 🛡️ Circuit Breaker Pattern

The system implements circuit breaker patterns for fault tolerance:

- **Failure threshold**: 5 consecutive failures
- **Recovery timeout**: 60 seconds
- **Half-open max calls**: 2 test calls before full recovery

## 📈 Performance Considerations

### Caching Strategy
- **Default TTL**: 5 minutes for most data
- **Health checks**: 1 minute TTL
- **Dashboard data**: 30 seconds TTL

### Resource Management
- **Memory threshold**: 100MB
- **Query timeout**: 30 seconds
- **Batch processing**: 1000 records per batch
- **Automatic garbage collection** when memory usage is high

## 🔧 Configuration

The system uses the `DEFAULT_MONITORING_CONFIG` from the types file:

```typescript
const config = {
  intervals: {
    critical_checks: 30000,      // 30 seconds
    medium_checks: 120000,       // 2 minutes
    health_checks: 300000,       // 5 minutes
    cleanup: 3600000,            // 1 hour
  },
  thresholds: {
    failure_rate_warning: 0.05,  // 5%
    failure_rate_critical: 0.10, // 10%
    balance_discrepancy_threshold: 0.01, // 1 cent
    consecutive_failures_threshold: 3,
    duplicate_scan_window_seconds: 5,
    race_condition_window_seconds: 2,
  },
  circuit_breaker: {
    failure_threshold: 5,
    recovery_timeout_ms: 60000,
    half_open_max_calls: 2,
    timeout_ms: 30000,
  }
};
```

## 🌐 Edge Functions

### Monitoring Edge Function (`/supabase/functions/monitoring/`)
Main orchestration function that coordinates all monitoring activities:

- `POST /cycle` - Run monitoring detection cycle
- `GET /health` - Get system health status
- `GET /events` - Get monitoring events
- `GET /status` - Get service status

### Monitoring API Edge Function (`/supabase/functions/monitoring-api/`)
Provides API endpoints for monitoring data access:

- `GET /health` - Health check endpoint
- `GET /events` - Monitoring events endpoint
- `GET /metrics` - System metrics endpoint
- `GET /dashboard` - Dashboard data endpoint

## 🗄️ Database Integration

The system integrates with existing Phase 3 tables:

- **`app_transaction_log`** - Transaction history for failure detection
- **`table_cards`** - Card balances for discrepancy detection
- **`nfc_scan_log`** - NFC scan data for duplicate detection
- **`idempotency_keys`** - Race condition detection

New Phase 4 tables:

- **`monitoring_events`** - Core monitoring events storage
- **`system_health_snapshots`** - System health metrics
- **`alert_history`** - Alert tracking and escalation

## 📝 Logging and Error Handling

The system includes comprehensive logging and error handling:

- **Structured logging** with timestamps and context
- **Error recovery** with exponential backoff retry logic
- **Circuit breaker protection** to prevent cascade failures
- **Performance monitoring** with execution time tracking

## 🔒 Security Considerations

- **Read-only operations** on existing tables to prevent data corruption
- **Service role authentication** for database access
- **Input validation** and sanitization
- **Rate limiting** through circuit breaker patterns

## 🧪 Testing

The monitoring system is designed to be testable:

- **Mock data generation** for development and testing
- **Isolated service instances** for unit testing
- **Integration test support** with database functions
- **Performance benchmarking** capabilities

## 📊 Monitoring the Monitoring System

The system includes meta-monitoring capabilities:

- **Self-health checks** to ensure monitoring system availability
- **Performance metrics** tracking detection cycle times
- **Resource usage monitoring** (memory, CPU, database connections)
- **Circuit breaker status** monitoring

## 🚨 Alerting

The system supports multiple alerting mechanisms:

- **Automatic alert creation** for critical events
- **Escalation levels** based on severity and duration
- **Real-time subscriptions** for immediate notification
- **Dashboard integration** for visual monitoring

## 📚 Related Documentation

- [`PHASE4_MONITORING_SYSTEM_ARCHITECTURE.md`](../../../documentation/PHASE4_MONITORING_SYSTEM_ARCHITECTURE.md) - Comprehensive architecture design
- [`monitoring.ts`](../../types/monitoring.ts) - TypeScript type definitions
- [`monitoring-api.ts`](../../types/monitoring-api.ts) - API type definitions
- Database migration: [`20250614_155252_phase4_monitoring.sql`](../../../supabase/migrations/20250614_155252_phase4_monitoring.sql)

## 🎯 Production Deployment

For production deployment:

1. **Deploy database migration** to create monitoring tables and functions
2. **Deploy Edge Functions** for monitoring orchestration and API access
3. **Configure scheduled execution** of detection cycles
4. **Set up external monitoring** integration (Grafana, Prometheus)
5. **Configure alerting** and notification systems
6. **Monitor system performance** and adjust thresholds as needed

The monitoring system is designed to be production-ready with high availability, fault tolerance, and comprehensive observability.