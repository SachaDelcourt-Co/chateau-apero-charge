/**
 * Phase 4 Monitoring System - Type Definitions Index
 * 
 * This file provides a centralized export point for all monitoring system types,
 * making it easy to import and use types throughout the application.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-14
 */

// =====================================================
// CORE MONITORING TYPES
// =====================================================

export * from './monitoring';
export * from './monitoring-api';

// =====================================================
// RE-EXPORT COMMONLY USED TYPES
// =====================================================

// Import types first to avoid circular dependencies
import type {
  MonitoringEvent,
  MonitoringEventInsert,
  MonitoringEventUpdate,
  SystemHealthSnapshot,
  AlertHistory,
  MonitoringEventsFilters,
  SystemHealthStatus,
  HealthCheckResponse,
  MonitoringEventsResponse,
  MetricsResponse,
  DashboardResponse,
} from './monitoring';

import type {
  APIResponse,
  APIError,
  DetectionService,
  BackgroundProcessingService,
  CircuitBreakerService,
  MonitoringDataService,
  MonitoringClient,
} from './monitoring-api';

// Core entities
export type {
  MonitoringEvent,
  MonitoringEventInsert,
  MonitoringEventUpdate,
  SystemHealthSnapshot,
  AlertHistory,
} from './monitoring';

// Enums
export {
  MonitoringEventType,
  MonitoringSeverity,
  MonitoringEventStatus,
  SystemHealthStatus,
  AlertLevel,
  CircuitBreakerState,
  ComponentStatus,
} from './monitoring';

// API types from monitoring.ts
export type {
  HealthCheckResponse,
  MonitoringEventsResponse,
  MetricsResponse,
  DashboardResponse,
} from './monitoring';

// API types from monitoring-api.ts
export type {
  APIResponse,
  APIError,
} from './monitoring-api';

// Service interfaces
export type {
  DetectionService,
  BackgroundProcessingService,
  CircuitBreakerService,
  MonitoringDataService,
  MonitoringClient,
} from './monitoring-api';

// =====================================================
// TYPE UTILITIES AND HELPERS
// =====================================================

/**
 * Utility type to extract the data type from an API response
 */
export type ExtractAPIData<T> = T extends APIResponse<infer U> ? U : never;

/**
 * Utility type to make all properties of a monitoring event optional except ID
 */
export type PartialMonitoringEvent = Partial<MonitoringEvent> & Pick<MonitoringEvent, 'event_id'>;

/**
 * Utility type for monitoring event filters with strict typing
 */
export type StrictMonitoringFilters = {
  [K in keyof MonitoringEventsFilters]-?: NonNullable<MonitoringEventsFilters[K]>;
};

// =====================================================
// CONSTANTS FOR EASY ACCESS
// =====================================================

export {
  DEFAULT_MONITORING_CONFIG,
  DETECTION_PRIORITIES,
  SEVERITY_WEIGHTS,
} from './monitoring';

// =====================================================
// TYPE GUARDS FOR EASY ACCESS
// =====================================================

export {
  isMonitoringEvent,
  isTransactionFailureEvent,
  isBalanceDiscrepancyEvent,
  isDuplicateNFCEvent,
  isRaceConditionEvent,
  isSystemHealthEvent,
  getSeverityWeight,
  isCriticalEvent,
  requiresImmediateAttention,
} from './monitoring';

export {
  isAPIResponse,
  isAPIError,
  createAPIResponse,
  createAPIError,
} from './monitoring-api';

// =====================================================
// ADDITIONAL UTILITY TYPES
// =====================================================

/**
 * Union type for all monitoring-related database tables
 */
export type MonitoringTable = 'monitoring_events' | 'system_health_snapshots' | 'alert_history';

/**
 * Union type for all detection algorithm names
 */
export type DetectionAlgorithmName = 
  | 'balance_deduction_on_failure'
  | 'consecutive_failures'
  | 'system_failure_spike'
  | 'balance_mismatch_detection'
  | 'negative_balance_detection'
  | 'temporal_duplicate_detection'
  | 'concurrent_transaction_detection'
  | 'system_initialization';

/**
 * Union type for all API endpoint paths
 */
export type MonitoringAPIEndpoint = 
  | '/api/v1/monitoring/health'
  | '/api/v1/monitoring/health/detailed'
  | '/api/v1/monitoring/events'
  | '/api/v1/monitoring/events/:id'
  | '/api/v1/monitoring/events/stats'
  | '/api/v1/monitoring/events/export'
  | '/api/v1/monitoring/metrics'
  | '/api/v1/monitoring/metrics/realtime'
  | '/api/v1/monitoring/metrics/performance'
  | '/api/v1/monitoring/dashboard'
  | '/api/v1/monitoring/dashboard/widgets'
  | '/api/v1/monitoring/dashboard/config'
  | '/api/v1/monitoring/health/snapshot'
  | '/api/v1/monitoring/health/history'
  | '/api/v1/monitoring/health/check'
  | '/api/v1/monitoring/alerts'
  | '/api/v1/monitoring/alerts/:id/acknowledge'
  | '/api/v1/monitoring/alerts/:id/resolve'
  | '/api/v1/monitoring/alerts/:id/escalate';

/**
 * Configuration type for monitoring system initialization
 */
export interface MonitoringSystemInit {
  readonly database_url: string;
  readonly api_base_url: string;
  readonly enable_real_time: boolean;
  readonly enable_background_processing: boolean;
  readonly log_level: 'debug' | 'info' | 'warn' | 'error';
  readonly environment: 'development' | 'staging' | 'production';
}

/**
 * Monitoring system status for health checks
 */
export interface MonitoringSystemStatus {
  readonly initialized: boolean;
  readonly database_connected: boolean;
  readonly background_processing_active: boolean;
  readonly last_detection_cycle: string | null;
  readonly active_circuit_breakers: string[];
  readonly system_health: SystemHealthStatus;
  readonly uptime_seconds: number;
}

// =====================================================
// INTEGRATION WITH EXISTING TYPES
// =====================================================

// Re-export relevant types from existing integrations
export type { Json } from '../integrations/supabase/types';

/**
 * Extended database types that include monitoring tables
 */
export interface ExtendedDatabase {
  public: {
    Tables: {
      monitoring_events: {
        Row: MonitoringEvent;
        Insert: MonitoringEventInsert;
        Update: MonitoringEventUpdate;
      };
      system_health_snapshots: {
        Row: SystemHealthSnapshot;
        Insert: Omit<SystemHealthSnapshot, 'snapshot_id' | 'snapshot_timestamp'>;
        Update: Partial<Omit<SystemHealthSnapshot, 'snapshot_id'>>;
      };
      alert_history: {
        Row: AlertHistory;
        Insert: Omit<AlertHistory, 'alert_id' | 'alert_timestamp'>;
        Update: Partial<Omit<AlertHistory, 'alert_id'>>;
      };
    };
  };
}

// =====================================================
// DOCUMENTATION AND EXAMPLES
// =====================================================

/**
 * Example usage of monitoring types:
 * 
 * ```typescript
 * import { 
 *   MonitoringEvent, 
 *   MonitoringEventType, 
 *   MonitoringSeverity,
 *   isTransactionFailureEvent,
 *   createAPIResponse 
 * } from '@/types';
 * 
 * // Type-safe event creation
 * const event: MonitoringEventInsert = {
 *   event_type: MonitoringEventType.TRANSACTION_FAILURE,
 *   severity: MonitoringSeverity.CRITICAL,
 *   detection_algorithm: 'balance_deduction_on_failure',
 *   card_id: 'card_123',
 *   affected_amount: 25.50,
 *   event_data: {
 *     detection_time: new Date().toISOString(),
 *     previous_balance: 50.00,
 *     new_balance: 24.50,
 *     discrepancy: 25.50
 *   }
 * };
 * 
 * // Type guards for runtime checking
 * if (isTransactionFailureEvent(monitoringEvent)) {
 *   // TypeScript knows this is a transaction failure event
 *   console.log(monitoringEvent.event_data.previous_balance);
 * }
 * 
 * // API response creation
 * const response = createAPIResponse(event, true);
 * ```
 */

/**
 * Type-safe database query examples:
 * 
 * ```typescript
 * import { MonitoringEvent, MonitoringEventType } from '@/types';
 * 
 * // Type-safe Supabase queries
 * const { data, error } = await supabase
 *   .from('monitoring_events')
 *   .select('*')
 *   .eq('event_type', MonitoringEventType.BALANCE_DISCREPANCY)
 *   .returns<MonitoringEvent[]>();
 * ```
 */

/**
 * Service implementation example:
 * 
 * ```typescript
 * import { DetectionService, MonitoringResult } from '@/types';
 * 
 * class TransactionFailureDetectionService implements DetectionService {
 *   async runDetectionCycle(): Promise<MonitoringResult<MonitoringDetectionCycleResult>> {
 *     // Implementation with full type safety
 *   }
 * }
 * ```
 */