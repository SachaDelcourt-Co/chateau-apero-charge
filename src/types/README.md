# Phase 4 Monitoring System - TypeScript Types Documentation

This directory contains comprehensive TypeScript type definitions for the Phase 4 monitoring system, providing strong type safety for all monitoring operations, detection algorithms, API endpoints, and database entities.

## 📁 File Structure

```
src/types/
├── monitoring.ts          # Core monitoring types and database entities
├── monitoring-api.ts      # API endpoints and service interfaces
├── index.ts              # Centralized exports and utilities
└── README.md             # This documentation file
```

## 🎯 Overview

The Phase 4 monitoring system types are designed to provide:

- **Strong Type Safety**: No `any` types, comprehensive interfaces
- **Database Compatibility**: Types that match the PostgreSQL schema exactly
- **API Consistency**: Request/response types for all endpoints
- **Runtime Safety**: Type guards and validation utilities
- **Developer Experience**: Comprehensive JSDoc documentation

## 📊 Core Types

### Database Entities

#### MonitoringEvent
The core entity for all monitoring events detected by the system.

```typescript
import { MonitoringEvent, MonitoringEventType, MonitoringSeverity } from '@/types';

const event: MonitoringEvent = {
  event_id: 1,
  event_type: MonitoringEventType.TRANSACTION_FAILURE,
  severity: MonitoringSeverity.CRITICAL,
  card_id: 'card_123',
  transaction_id: 'txn_456',
  affected_amount: 25.50,
  detection_timestamp: '2025-06-14T17:15:00Z',
  detection_algorithm: 'balance_deduction_on_failure',
  confidence_score: 1.0,
  event_data: {
    detection_time: '2025-06-14T17:15:00Z',
    previous_balance: 50.00,
    new_balance: 24.50,
    discrepancy: 25.50
  },
  context_data: {
    detection_time: '2025-06-14T17:15:00Z',
    requires_immediate_investigation: true,
    financial_impact: 'high'
  },
  status: MonitoringEventStatus.OPEN,
  resolved_at: null,
  resolution_notes: null,
  created_at: '2025-06-14T17:15:00Z',
  updated_at: '2025-06-14T17:15:00Z'
};
```

#### SystemHealthSnapshot
Periodic snapshots of system health metrics.

```typescript
import { SystemHealthSnapshot, SystemHealthStatus } from '@/types';

const snapshot: SystemHealthSnapshot = {
  snapshot_id: 1,
  snapshot_timestamp: '2025-06-14T17:15:00Z',
  total_transactions_last_hour: 150,
  successful_transactions_last_hour: 148,
  failed_transactions_last_hour: 2,
  success_rate_percent: 98.67,
  avg_processing_time_ms: 250,
  p95_processing_time_ms: 450,
  max_processing_time_ms: 800,
  total_nfc_scans_last_hour: 200,
  duplicate_nfc_scans_last_hour: 3,
  nfc_success_rate_percent: 98.5,
  active_cards_count: 1250,
  total_system_balance: 15750.25,
  monitoring_events_last_hour: 2,
  critical_events_last_hour: 1,
  overall_health_status: SystemHealthStatus.WARNING,
  metrics_data: {
    snapshot_generation_time_ms: 125,
    database_connections: 8
  }
};
```

#### AlertHistory
Alert escalation and resolution tracking.

```typescript
import { AlertHistory, AlertLevel } from '@/types';

const alert: AlertHistory = {
  alert_id: 1,
  monitoring_event_id: 1,
  alert_level: AlertLevel.CRITICAL,
  alert_message: 'Critical transaction failure detected for card card_123',
  alert_timestamp: '2025-06-14T17:15:00Z',
  escalation_level: 0,
  escalated_at: null,
  acknowledged_at: null,
  acknowledged_by: null,
  resolved_at: null,
  resolution_time_seconds: null,
  alert_data: {
    auto_generated: true,
    event_type: MonitoringEventType.TRANSACTION_FAILURE,
    detection_algorithm: 'balance_deduction_on_failure',
    affected_amount: 25.50
  }
};
```

### Enums and Constants

```typescript
// Event types
export enum MonitoringEventType {
  TRANSACTION_FAILURE = 'transaction_failure',
  BALANCE_DISCREPANCY = 'balance_discrepancy',
  DUPLICATE_NFC = 'duplicate_nfc',
  RACE_CONDITION = 'race_condition',
  SYSTEM_HEALTH = 'system_health'
}

// Severity levels
export enum MonitoringSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO'
}

// Event status
export enum MonitoringEventStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  FALSE_POSITIVE = 'FALSE_POSITIVE'
}
```

## 🔧 Detection Algorithm Types

### Transaction Failure Detection

```typescript
import { 
  TransactionFailureDetectionParams,
  TransactionFailureDetectionResult 
} from '@/types';

const params: TransactionFailureDetectionParams = {
  balance_deduction_check_interval_minutes: 5,
  consecutive_failures_threshold: 3,
  consecutive_failures_window_minutes: 10,
  system_failure_rate_threshold: 0.05,
  system_failure_rate_window_minutes: 15,
  minimum_transactions_for_rate_calculation: 10
};

const result: TransactionFailureDetectionResult = {
  detection_type: 'transaction_failures',
  events_created: 2,
  detection_timestamp: '2025-06-14T17:15:00Z',
  success: true,
  balance_deduction_failures: 1,
  consecutive_failures: 1,
  system_failure_spikes: 0
};
```

### Balance Discrepancy Detection

```typescript
import { 
  BalanceDiscrepancyDetectionParams,
  BalanceDiscrepancyDetectionResult 
} from '@/types';

const params: BalanceDiscrepancyDetectionParams = {
  discrepancy_threshold_cents: 1,
  check_interval_minutes: 30,
  large_discrepancy_threshold: 10.00
};

const result: BalanceDiscrepancyDetectionResult = {
  detection_type: 'balance_discrepancies',
  events_created: 1,
  detection_timestamp: '2025-06-14T17:15:00Z',
  success: true,
  balance_mismatches: 1,
  negative_balances: 0
};
```

## 🌐 API Types

### Health Check API

```typescript
import { HealthCheckResponse, ComponentHealth, ComponentStatus } from '@/types';

const healthResponse: HealthCheckResponse = {
  status: SystemHealthStatus.HEALTHY,
  timestamp: '2025-06-14T17:15:00Z',
  uptime_seconds: 86400,
  system_metrics: {
    transactions_last_hour: 150,
    success_rate_percent: 98.67,
    avg_processing_time_ms: 250,
    active_monitoring_events: 2,
    critical_events_count: 0
  },
  components: {
    transaction_detector: {
      status: ComponentStatus.UP,
      last_check: '2025-06-14T17:14:30Z',
      response_time_ms: 45
    },
    balance_detector: {
      status: ComponentStatus.UP,
      last_check: '2025-06-14T17:14:30Z',
      response_time_ms: 38
    },
    nfc_detector: {
      status: ComponentStatus.UP,
      last_check: '2025-06-14T17:14:30Z',
      response_time_ms: 52
    },
    race_detector: {
      status: ComponentStatus.UP,
      last_check: '2025-06-14T17:14:30Z',
      response_time_ms: 41
    },
    database: {
      status: ComponentStatus.UP,
      last_check: '2025-06-14T17:14:30Z',
      response_time_ms: 15
    },
    circuit_breaker: {
      status: ComponentStatus.UP,
      last_check: '2025-06-14T17:14:30Z'
    }
  },
  recent_alerts: []
};
```

### Monitoring Events API

```typescript
import { 
  MonitoringEventsFilters,
  MonitoringEventsResponse,
  PaginationParams 
} from '@/types';

// Request filters
const filters: MonitoringEventsFilters = {
  event_type: [MonitoringEventType.TRANSACTION_FAILURE, MonitoringEventType.BALANCE_DISCREPANCY],
  severity: MonitoringSeverity.CRITICAL,
  status: MonitoringEventStatus.OPEN,
  start_date: '2025-06-14T00:00:00Z',
  end_date: '2025-06-14T23:59:59Z',
  min_confidence_score: 0.8
};

// Pagination parameters
const pagination: PaginationParams = {
  page: 1,
  per_page: 50,
  sort_by: 'detection_timestamp',
  sort_order: 'desc'
};

// API response
const response: MonitoringEventsResponse = {
  events: [/* array of MonitoringEvent objects */],
  pagination: {
    total: 125,
    page: 1,
    per_page: 50,
    total_pages: 3,
    has_next: true,
    has_prev: false
  },
  filters_applied: filters,
  total_critical: 15,
  total_open: 45
};
```

## 🛠️ Service Interfaces

### Detection Service

```typescript
import { DetectionService, MonitoringResult } from '@/types';

class TransactionFailureDetectionService implements DetectionService {
  async runDetectionCycle(): Promise<MonitoringResult<MonitoringDetectionCycleResult>> {
    try {
      const result = await this.performDetection();
      
      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
        duration_ms: 1250
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        duration_ms: 500
      };
    }
  }

  async runDetection(algorithm: string): Promise<MonitoringResult<unknown>> {
    // Implementation
  }

  async getDetectionStatus(): Promise<MonitoringResult<DetectionStatus>> {
    // Implementation
  }

  async configureDetection(config: DetectionConfiguration): Promise<MonitoringResult<void>> {
    // Implementation
  }
}
```

### Monitoring Client

```typescript
import { MonitoringClient, APIResponse } from '@/types';

const client: MonitoringClient = {
  health: {
    async getHealth(): Promise<APIResponse<HealthCheckResponse>> {
      // Implementation
    },
    async getDetailedHealth(): Promise<APIResponse<DetailedHealthResponse>> {
      // Implementation
    }
  },
  
  events: {
    async getEvents(filters?, pagination?): Promise<APIResponse<MonitoringEventsResponse>> {
      // Implementation
    },
    async getEvent(eventId: number): Promise<APIResponse<MonitoringEvent>> {
      // Implementation
    },
    async updateEvent(eventId: number, update: MonitoringEventUpdate): Promise<APIResponse<MonitoringEvent>> {
      // Implementation
    }
  },
  
  // ... other API methods
  
  subscribe(options, callback) {
    // Real-time subscription implementation
  },
  
  configure(config) {
    // Client configuration
  },
  
  isConnected() {
    return true;
  },
  
  getLastError() {
    return null;
  },
  
  clearCache() {
    // Cache clearing implementation
  }
};
```

## 🔍 Type Guards and Utilities

### Runtime Type Checking

```typescript
import { 
  isMonitoringEvent,
  isTransactionFailureEvent,
  isBalanceDiscrepancyEvent,
  isCriticalEvent,
  requiresImmediateAttention 
} from '@/types';

// Type guard usage
function processEvent(data: unknown) {
  if (isMonitoringEvent(data)) {
    // TypeScript knows data is MonitoringEvent
    console.log(`Processing event ${data.event_id}`);
    
    if (isTransactionFailureEvent(data)) {
      // TypeScript knows this is a transaction failure event
      console.log(`Previous balance: ${data.event_data.previous_balance}`);
    }
    
    if (isCriticalEvent(data)) {
      console.log('Critical event detected!');
    }
    
    if (requiresImmediateAttention(data)) {
      console.log('Immediate attention required!');
    }
  }
}
```

### Typed Event Data

```typescript
import { TypedMonitoringEvent, MonitoringEventType } from '@/types';

// Get strongly typed event based on event type
function handleTransactionFailure(
  event: TypedMonitoringEvent<MonitoringEventType.TRANSACTION_FAILURE>
) {
  // TypeScript knows event_data is TransactionFailureEventData
  const { previous_balance, new_balance, discrepancy } = event.event_data;
  
  console.log(`Balance discrepancy: ${discrepancy}`);
  console.log(`Previous: ${previous_balance}, New: ${new_balance}`);
}
```

## 📊 Configuration and Constants

### Default Configuration

```typescript
import { DEFAULT_MONITORING_CONFIG, DETECTION_PRIORITIES, SEVERITY_WEIGHTS } from '@/types';

// Use default configuration
const config = {
  ...DEFAULT_MONITORING_CONFIG,
  intervals: {
    ...DEFAULT_MONITORING_CONFIG.intervals,
    critical_checks: 15000 // Override to 15 seconds
  }
};

// Get detection priority
const priority = DETECTION_PRIORITIES[MonitoringEventType.TRANSACTION_FAILURE]; // 'CRITICAL'

// Sort events by severity
const events = [...monitoringEvents].sort((a, b) => 
  SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]
);
```

## 🧪 Testing and Mocking

### Mock Data Generation

```typescript
import { MockDataOptions, TestScenario } from '@/types';

const mockOptions: MockDataOptions = {
  event_count: 100,
  event_types: [MonitoringEventType.TRANSACTION_FAILURE, MonitoringEventType.BALANCE_DISCREPANCY],
  severity_distribution: {
    [MonitoringSeverity.CRITICAL]: 0.1,
    [MonitoringSeverity.HIGH]: 0.2,
    [MonitoringSeverity.MEDIUM]: 0.3,
    [MonitoringSeverity.LOW]: 0.3,
    [MonitoringSeverity.INFO]: 0.1
  },
  time_range_hours: 24,
  include_resolved: true
};

const testScenario: TestScenario = {
  name: 'High Volume Transaction Failures',
  description: 'Test system behavior under high transaction failure rates',
  setup_data: mockOptions,
  expected_detections: 15,
  expected_alerts: 5,
  validation_rules: [
    {
      field: 'events_created',
      operator: 'greater_than',
      expected_value: 10,
      error_message: 'Should detect at least 10 events'
    }
  ]
};
```

## 🔗 Integration Examples

### Database Queries

```typescript
import { MonitoringEvent, MonitoringEventType } from '@/types';
import { supabase } from '@/lib/supabase';

// Type-safe Supabase queries
async function getCriticalEvents(): Promise<MonitoringEvent[]> {
  const { data, error } = await supabase
    .from('monitoring_events')
    .select('*')
    .eq('severity', 'CRITICAL')
    .eq('status', 'OPEN')
    .order('detection_timestamp', { ascending: false })
    .returns<MonitoringEvent[]>();

  if (error) throw error;
  return data || [];
}

// Insert new monitoring event
async function createEvent(event: MonitoringEventInsert): Promise<MonitoringEvent> {
  const { data, error } = await supabase
    .from('monitoring_events')
    .insert(event)
    .select()
    .single()
    .returns<MonitoringEvent>();

  if (error) throw error;
  return data;
}
```

### API Client Usage

```typescript
import { createAPIResponse, createAPIError } from '@/types';

// Create API responses
const successResponse = createAPIResponse(healthData, true);
const errorResponse = createAPIResponse(null, false, createAPIError(
  'DETECTION_FAILED',
  'Transaction failure detection algorithm failed',
  { algorithm: 'balance_deduction_on_failure', retry_count: 3 }
));
```

## 📝 Best Practices

### 1. Always Use Type Guards
```typescript
// Good
if (isMonitoringEvent(data)) {
  processEvent(data);
}

// Bad
processEvent(data as MonitoringEvent);
```

### 2. Leverage Discriminated Unions
```typescript
// Good - TypeScript can narrow the type
if (event.event_type === MonitoringEventType.TRANSACTION_FAILURE) {
  // TypeScript knows this is a transaction failure event
  handleTransactionFailure(event);
}
```

### 3. Use Readonly Types
```typescript
// All interfaces use readonly properties to prevent mutation
const event: MonitoringEvent = getEvent();
// event.status = 'RESOLVED'; // TypeScript error - readonly property
```

### 4. Provide Complete Type Information
```typescript
// Good - explicit typing
const filters: MonitoringEventsFilters = {
  event_type: MonitoringEventType.TRANSACTION_FAILURE,
  severity: MonitoringSeverity.CRITICAL
};

// Avoid - implicit any
const filters = {
  event_type: 'transaction_failure',
  severity: 'CRITICAL'
};
```

## 🚀 Getting Started

1. **Import types from the centralized index:**
   ```typescript
   import { MonitoringEvent, MonitoringEventType, isMonitoringEvent } from '@/types';
   ```

2. **Use enums instead of string literals:**
   ```typescript
   // Good
   event.event_type === MonitoringEventType.TRANSACTION_FAILURE
   
   // Bad
   event.event_type === 'transaction_failure'
   ```

3. **Leverage type guards for runtime safety:**
   ```typescript
   if (isMonitoringEvent(data) && isCriticalEvent(data)) {
     handleCriticalEvent(data);
   }
   ```

4. **Use the configuration constants:**
   ```typescript
   import { DEFAULT_MONITORING_CONFIG } from '@/types';
   
   const detectionInterval = DEFAULT_MONITORING_CONFIG.intervals.critical_checks;
   ```

This comprehensive type system ensures type safety across the entire Phase 4 monitoring system while providing excellent developer experience and runtime safety.