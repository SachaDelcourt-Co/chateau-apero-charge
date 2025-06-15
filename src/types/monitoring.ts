/**
 * Phase 4 Monitoring System - TypeScript Type Definitions
 * 
 * This file contains comprehensive type definitions for the Phase 4 monitoring system,
 * providing strong type safety for all monitoring operations, detection algorithms,
 * API endpoints, and database entities.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-14
 */

import type { Json } from '../integrations/supabase/types';

// =====================================================
// CORE ENUMS AND CONSTANTS
// =====================================================

/**
 * Event types supported by the monitoring system
 */
export enum MonitoringEventType {
  TRANSACTION_FAILURE = 'transaction_failure',
  BALANCE_DISCREPANCY = 'balance_discrepancy',
  DUPLICATE_NFC = 'duplicate_nfc',
  RACE_CONDITION = 'race_condition',
  SYSTEM_HEALTH = 'system_health'
}

/**
 * Severity levels for monitoring events
 */
export enum MonitoringSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO'
}

/**
 * Status values for monitoring events
 */
export enum MonitoringEventStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  FALSE_POSITIVE = 'FALSE_POSITIVE'
}

/**
 * System health status levels
 */
export enum SystemHealthStatus {
  HEALTHY = 'HEALTHY',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Alert levels for escalation
 */
export enum AlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  EMERGENCY = 'EMERGENCY'
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Component health status
 */
export enum ComponentStatus {
  UP = 'UP',
  DOWN = 'DOWN',
  DEGRADED = 'DEGRADED'
}

// =====================================================
// DATABASE ENTITY TYPES
// =====================================================

/**
 * Core monitoring event entity matching the database table
 */
export interface MonitoringEvent {
  readonly event_id: number;
  readonly event_type: MonitoringEventType;
  readonly severity: MonitoringSeverity;
  
  // Event details
  readonly card_id: string | null;
  readonly transaction_id: string | null;
  readonly affected_amount: number | null;
  
  // Detection metadata
  readonly detection_timestamp: string;
  readonly detection_algorithm: string;
  readonly confidence_score: number;
  
  // Event data (strongly typed JSONB fields)
  readonly event_data: MonitoringEventData;
  readonly context_data: MonitoringContextData;
  
  // Resolution tracking
  readonly status: MonitoringEventStatus;
  readonly resolved_at: string | null;
  readonly resolution_notes: string | null;
  
  // Audit fields
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Insert type for creating new monitoring events
 */
export interface MonitoringEventInsert {
  readonly event_type: MonitoringEventType;
  readonly severity: MonitoringSeverity;
  readonly card_id?: string | null;
  readonly transaction_id?: string | null;
  readonly affected_amount?: number | null;
  readonly detection_algorithm: string;
  readonly confidence_score?: number;
  readonly event_data?: MonitoringEventData;
  readonly context_data?: MonitoringContextData;
  readonly status?: MonitoringEventStatus;
  readonly resolution_notes?: string | null;
}

/**
 * Update type for modifying monitoring events
 */
export interface MonitoringEventUpdate {
  readonly status?: MonitoringEventStatus;
  readonly resolved_at?: string | null;
  readonly resolution_notes?: string | null;
  readonly updated_at?: string;
}

/**
 * System health snapshot entity
 */
export interface SystemHealthSnapshot {
  readonly snapshot_id: number;
  readonly snapshot_timestamp: string;
  
  // Transaction metrics
  readonly total_transactions_last_hour: number;
  readonly successful_transactions_last_hour: number;
  readonly failed_transactions_last_hour: number;
  readonly success_rate_percent: number | null;
  
  // Performance metrics
  readonly avg_processing_time_ms: number | null;
  readonly p95_processing_time_ms: number | null;
  readonly max_processing_time_ms: number | null;
  
  // NFC metrics
  readonly total_nfc_scans_last_hour: number;
  readonly duplicate_nfc_scans_last_hour: number;
  readonly nfc_success_rate_percent: number | null;
  
  // System metrics
  readonly active_cards_count: number | null;
  readonly total_system_balance: number | null;
  readonly monitoring_events_last_hour: number;
  readonly critical_events_last_hour: number;
  
  // Health status
  readonly overall_health_status: SystemHealthStatus;
  
  // Additional metrics
  readonly metrics_data: SystemHealthMetricsData;
}

/**
 * Alert history entity
 */
export interface AlertHistory {
  readonly alert_id: number;
  readonly monitoring_event_id: number;
  
  // Alert details
  readonly alert_level: AlertLevel;
  readonly alert_message: string;
  readonly alert_timestamp: string;
  
  // Escalation tracking
  readonly escalation_level: number;
  readonly escalated_at: string | null;
  readonly acknowledged_at: string | null;
  readonly acknowledged_by: string | null;
  
  // Resolution tracking
  readonly resolved_at: string | null;
  readonly resolution_time_seconds: number | null;
  
  // Alert metadata
  readonly alert_data: AlertMetadata;
}

// =====================================================
// JSONB FIELD TYPES
// =====================================================

/**
 * Base interface for all monitoring event data
 */
export interface BaseMonitoringEventData {
  readonly detection_time: string;
  readonly [key: string]: Json;
}

/**
 * Transaction failure event data
 */
export interface TransactionFailureEventData extends BaseMonitoringEventData {
  readonly previous_balance?: number;
  readonly new_balance?: number;
  readonly current_balance?: number;
  readonly discrepancy?: number;
  readonly failure_count?: number;
  readonly failed_transactions?: string[];
  readonly time_span_minutes?: number;
  readonly first_failure?: string;
  readonly last_failure?: string;
  readonly total_transactions?: number;
  readonly failed_transactions_count?: number;
  readonly failure_rate_percent?: number;
  readonly threshold_percent?: number;
  readonly time_window_minutes?: number;
}

/**
 * Balance discrepancy event data
 */
export interface BalanceDiscrepancyEventData extends BaseMonitoringEventData {
  readonly actual_balance: number;
  readonly expected_balance: number;
  readonly discrepancy: number;
  readonly transaction_count?: number;
  readonly last_transaction?: string;
  readonly negative_balance?: number;
  readonly impossible_scenario?: boolean;
}

/**
 * Duplicate NFC event data
 */
export interface DuplicateNFCEventData extends BaseMonitoringEventData {
  readonly scan_count: number;
  readonly scan_ids: number[];
  readonly scan_timestamps: string[];
  readonly time_span_seconds: number;
  readonly threshold_seconds: number;
}

/**
 * Race condition event data
 */
export interface RaceConditionEventData extends BaseMonitoringEventData {
  readonly concurrent_count: number;
  readonly transaction_ids: string[];
  readonly timestamps: string[];
  readonly transaction_types: string[];
  readonly time_span_seconds: number;
  readonly threshold_seconds: number;
}

/**
 * System health event data
 */
export interface SystemHealthEventData extends BaseMonitoringEventData {
  readonly migration_completed?: boolean;
  readonly tables_created?: string[];
  readonly functions_created?: string[];
  readonly system_metrics?: Record<string, Json>;
}

/**
 * Union type for all event data types
 */
export type MonitoringEventData = 
  | TransactionFailureEventData
  | BalanceDiscrepancyEventData
  | DuplicateNFCEventData
  | RaceConditionEventData
  | SystemHealthEventData
  | BaseMonitoringEventData;

/**
 * Context data for monitoring events
 */
export interface MonitoringContextData {
  readonly detection_time: string;
  readonly transaction_details?: Json;
  readonly requires_immediate_investigation?: boolean;
  readonly financial_impact?: 'low' | 'medium' | 'high';
  readonly system_wide_issue?: boolean;
  readonly requires_system_investigation?: boolean;
  readonly pattern_type?: string;
  readonly potential_user_error?: boolean;
  readonly potential_race_condition?: boolean;
  readonly requires_investigation?: boolean;
  readonly system_integrity_issue?: boolean;
  readonly ready_for_production?: boolean;
  readonly next_steps?: string;
  readonly [key: string]: Json;
}

/**
 * System health metrics data
 */
export interface SystemHealthMetricsData {
  readonly snapshot_generation_time_ms?: number;
  readonly database_connections?: number;
  readonly initialization_timestamp?: string;
  readonly migration_version?: string;
  readonly system_initialized?: boolean;
  readonly [key: string]: Json;
}

/**
 * Alert metadata
 */
export interface AlertMetadata {
  readonly auto_generated?: boolean;
  readonly event_type?: MonitoringEventType;
  readonly detection_algorithm?: string;
  readonly affected_amount?: number;
  readonly escalation_reason?: string;
  readonly notification_sent?: boolean;
  readonly [key: string]: Json;
}

// =====================================================
// DETECTION ALGORITHM TYPES
// =====================================================

/**
 * Base interface for all detection algorithms
 */
export interface DetectionAlgorithm {
  readonly name: string;
  readonly priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  readonly interval_ms: number;
  readonly timeout_ms: number;
}

/**
 * Transaction failure detection parameters
 */
export interface TransactionFailureDetectionParams {
  readonly balance_deduction_check_interval_minutes: number;
  readonly consecutive_failures_threshold: number;
  readonly consecutive_failures_window_minutes: number;
  readonly system_failure_rate_threshold: number;
  readonly system_failure_rate_window_minutes: number;
  readonly minimum_transactions_for_rate_calculation: number;
}

/**
 * Transaction failure detection result
 */
export interface TransactionFailureDetectionResult {
  readonly detection_type: 'transaction_failures';
  readonly events_created: number;
  readonly detection_timestamp: string;
  readonly success: boolean;
  readonly error?: string;
  readonly balance_deduction_failures?: number;
  readonly consecutive_failures?: number;
  readonly system_failure_spikes?: number;
}

/**
 * Balance discrepancy detection parameters
 */
export interface BalanceDiscrepancyDetectionParams {
  readonly discrepancy_threshold_cents: number;
  readonly check_interval_minutes: number;
  readonly large_discrepancy_threshold: number;
}

/**
 * Balance discrepancy detection result
 */
export interface BalanceDiscrepancyDetectionResult {
  readonly detection_type: 'balance_discrepancies';
  readonly events_created: number;
  readonly detection_timestamp: string;
  readonly success: boolean;
  readonly error?: string;
  readonly balance_mismatches?: number;
  readonly negative_balances?: number;
}

/**
 * Duplicate NFC detection parameters
 */
export interface DuplicateNFCDetectionParams {
  readonly temporal_window_seconds: number;
  readonly check_interval_minutes: number;
  readonly minimum_scans_for_detection: number;
}

/**
 * Duplicate NFC detection result
 */
export interface DuplicateNFCDetectionResult {
  readonly detection_type: 'duplicate_nfc_scans';
  readonly events_created: number;
  readonly detection_timestamp: string;
  readonly success: boolean;
  readonly error?: string;
  readonly temporal_duplicates?: number;
}

/**
 * Race condition detection parameters
 */
export interface RaceConditionDetectionParams {
  readonly concurrent_window_seconds: number;
  readonly check_interval_minutes: number;
  readonly minimum_concurrent_transactions: number;
}

/**
 * Race condition detection result
 */
export interface RaceConditionDetectionResult {
  readonly detection_type: 'race_conditions';
  readonly events_created: number;
  readonly detection_timestamp: string;
  readonly success: boolean;
  readonly error?: string;
  readonly concurrent_transactions?: number;
}

/**
 * Combined detection cycle result
 */
export interface MonitoringDetectionCycleResult {
  readonly cycle_timestamp: string;
  readonly cycle_duration_seconds: number;
  readonly total_events_created: number;
  readonly health_snapshot_id: number | null;
  readonly detection_results: {
    readonly transaction_failures: TransactionFailureDetectionResult;
    readonly balance_discrepancies: BalanceDiscrepancyDetectionResult;
    readonly duplicate_nfc_scans: DuplicateNFCDetectionResult;
    readonly race_conditions: RaceConditionDetectionResult;
  };
  readonly success: boolean;
  readonly errors?: string[];
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

/**
 * Health check API response
 */
export interface HealthCheckResponse {
  readonly status: SystemHealthStatus;
  readonly timestamp: string;
  readonly uptime_seconds: number;
  
  // System metrics
  readonly system_metrics: {
    readonly transactions_last_hour: number;
    readonly success_rate_percent: number;
    readonly avg_processing_time_ms: number;
    readonly active_monitoring_events: number;
    readonly critical_events_count: number;
  };
  
  // Component health
  readonly components: {
    readonly transaction_detector: ComponentHealth;
    readonly balance_detector: ComponentHealth;
    readonly nfc_detector: ComponentHealth;
    readonly race_detector: ComponentHealth;
    readonly database: ComponentHealth;
    readonly circuit_breaker: ComponentHealth;
  };
  
  // Recent alerts
  readonly recent_alerts: AlertSummary[];
}

/**
 * Component health status
 */
export interface ComponentHealth {
  readonly status: ComponentStatus;
  readonly last_check: string;
  readonly response_time_ms?: number;
  readonly error_message?: string;
  readonly circuit_breaker_state?: CircuitBreakerState;
}

/**
 * Alert summary for health check
 */
export interface AlertSummary {
  readonly alert_id: number;
  readonly alert_level: AlertLevel;
  readonly alert_message: string;
  readonly alert_timestamp: string;
  readonly event_type: MonitoringEventType;
  readonly resolved: boolean;
}

/**
 * Monitoring events API request filters
 */
export interface MonitoringEventsFilters {
  readonly event_type?: MonitoringEventType | MonitoringEventType[];
  readonly severity?: MonitoringSeverity | MonitoringSeverity[];
  readonly status?: MonitoringEventStatus | MonitoringEventStatus[];
  readonly card_id?: string;
  readonly transaction_id?: string;
  readonly detection_algorithm?: string;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly min_confidence_score?: number;
  readonly has_resolution_notes?: boolean;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  readonly page?: number;
  readonly per_page?: number;
  readonly sort_by?: keyof MonitoringEvent;
  readonly sort_order?: 'asc' | 'desc';
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  readonly total: number;
  readonly page: number;
  readonly per_page: number;
  readonly total_pages: number;
  readonly has_next: boolean;
  readonly has_prev: boolean;
}

/**
 * Monitoring events API response
 */
export interface MonitoringEventsResponse {
  readonly events: MonitoringEvent[];
  readonly pagination: PaginationMeta;
  readonly filters_applied: MonitoringEventsFilters;
  readonly total_critical: number;
  readonly total_open: number;
}

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  readonly timestamp: string;
  readonly value: number;
  readonly metadata?: Record<string, Json>;
}

/**
 * Chart data structure
 */
export interface ChartData {
  readonly labels: string[];
  readonly datasets: Array<{
    readonly label: string;
    readonly data: number[];
    readonly backgroundColor?: string;
    readonly borderColor?: string;
    readonly metadata?: Record<string, Json>;
  }>;
}

/**
 * Metrics API response
 */
export interface MetricsResponse {
  readonly time_range: {
    readonly start: string;
    readonly end: string;
  };
  
  // Financial integrity metrics
  readonly financial_metrics: {
    readonly total_transaction_volume: number;
    readonly failed_transaction_count: number;
    readonly balance_discrepancies_detected: number;
    readonly total_discrepancy_amount: number;
    readonly financial_integrity_score: number;
  };
  
  // Performance metrics
  readonly performance_metrics: {
    readonly avg_detection_time_ms: number;
    readonly monitoring_cycles_completed: number;
    readonly monitoring_errors: number;
    readonly system_uptime_percent: number;
  };
  
  // Trend data
  readonly trends: {
    readonly hourly_transaction_counts: TimeSeriesDataPoint[];
    readonly failure_rates: TimeSeriesDataPoint[];
    readonly processing_times: TimeSeriesDataPoint[];
    readonly balance_discrepancies: TimeSeriesDataPoint[];
  };
}

/**
 * Process status information
 */
export interface ProcessStatus {
  readonly name: string;
  readonly status: ComponentStatus;
  readonly pid?: number;
  readonly uptime_seconds?: number;
  readonly memory_usage_mb?: number;
  readonly cpu_usage_percent?: number;
  readonly last_activity?: string;
}

/**
 * Dashboard API response
 */
export interface DashboardResponse {
  // Key performance indicators
  readonly kpis: {
    readonly system_health: SystemHealthStatus;
    readonly transaction_success_rate: number;
    readonly balance_integrity_score: number;
    readonly monitoring_system_uptime: number;
  };
  
  // Real-time data
  readonly real_time: {
    readonly active_transactions: number;
    readonly recent_failures: number;
    readonly open_monitoring_events: number;
    readonly system_load_percent: number;
  };
  
  // Charts data
  readonly charts: {
    readonly transaction_volume_24h: ChartData;
    readonly failure_rate_trend: ChartData;
    readonly balance_discrepancy_trend: ChartData;
    readonly nfc_duplicate_rate: ChartData;
  };
  
  // Recent events
  readonly recent_events: MonitoringEvent[];
  
  // System status
  readonly system_status: {
    readonly database_connection: boolean;
    readonly monitoring_processes: ProcessStatus[];
    readonly last_successful_check: string;
    readonly circuit_breakers: Record<string, CircuitBreakerState>;
  };
}

// =====================================================
// BACKGROUND PROCESSING TYPES
// =====================================================

/**
 * Background job configuration
 */
export interface BackgroundJobConfig {
  readonly name: string;
  readonly interval_ms: number;
  readonly priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'MAINTENANCE';
  readonly timeout_ms: number;
  readonly retry_attempts: number;
  readonly retry_delay_ms: number;
}

/**
 * Background job result
 */
export interface BackgroundJobResult {
  readonly job_name: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly duration_ms: number;
  readonly success: boolean;
  readonly error?: string;
  readonly events_processed?: number;
  readonly metadata?: Record<string, Json>;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  readonly failure_threshold: number;
  readonly recovery_timeout_ms: number;
  readonly half_open_max_calls: number;
  readonly timeout_ms: number;
}

/**
 * Circuit breaker state information
 */
export interface CircuitBreakerInfo {
  readonly name: string;
  readonly state: CircuitBreakerState;
  readonly failure_count: number;
  readonly last_failure_time: string | null;
  readonly half_open_calls: number;
  readonly config: CircuitBreakerConfig;
}

// =====================================================
// UTILITY AND HELPER TYPES
// =====================================================

/**
 * Generic monitoring result wrapper
 */
export interface MonitoringResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: string;
  readonly duration_ms?: number;
  readonly metadata?: Record<string, Json>;
}

/**
 * Error details for monitoring operations
 */
export interface MonitoringError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, Json>;
  readonly timestamp: string;
  readonly component: string;
  readonly severity: MonitoringSeverity;
  readonly recoverable: boolean;
}

/**
 * Configuration for monitoring system
 */
export interface MonitoringSystemConfig {
  // Detection intervals (milliseconds)
  readonly intervals: {
    readonly critical_checks: number;
    readonly medium_checks: number;
    readonly health_checks: number;
    readonly cleanup: number;
  };
  
  // Detection thresholds
  readonly thresholds: {
    readonly failure_rate_warning: number;
    readonly failure_rate_critical: number;
    readonly balance_discrepancy_threshold: number;
    readonly consecutive_failures_threshold: number;
    readonly duplicate_scan_window_seconds: number;
    readonly race_condition_window_seconds: number;
  };
  
  // Performance settings
  readonly performance: {
    readonly max_concurrent_detectors: number;
    readonly detection_timeout_ms: number;
    readonly batch_size: number;
    readonly memory_threshold_mb: number;
    readonly query_timeout_ms: number;
  };
  
  // Circuit breaker settings
  readonly circuit_breaker: CircuitBreakerConfig;
  
  // Retention policies
  readonly retention: {
    readonly monitoring_events_days: number;
    readonly system_health_snapshots_days: number;
    readonly alert_history_days: number;
  };
}

/**
 * Performance metrics for monitoring operations
 */
export interface PerformanceMetrics {
  readonly operation_name: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly duration_ms: number;
  readonly memory_usage_mb: number;
  readonly cpu_usage_percent: number;
  readonly database_queries: number;
  readonly cache_hits: number;
  readonly cache_misses: number;
}

/**
 * Audit trail entry for monitoring events
 */
export interface MonitoringAuditEntry {
  readonly audit_id: string;
  readonly event_id: number;
  readonly action: 'CREATED' | 'UPDATED' | 'RESOLVED' | 'DISMISSED';
  readonly performed_by: string | null;
  readonly performed_at: string;
  readonly old_values?: Partial<MonitoringEvent>;
  readonly new_values?: Partial<MonitoringEvent>;
  readonly reason?: string;
}

// =====================================================
// INTEGRATION TYPES
// =====================================================

/**
 * Integration with existing transaction log
 */
export interface TransactionLogIntegration {
  readonly transaction_id: string;
  readonly card_id: string;
  readonly transaction_type: 'stripe_recharge' | 'checkpoint_recharge' | 'bar_order';
  readonly status: 'pending' | 'completed' | 'failed';
  readonly amount_involved: number;
  readonly previous_balance: number;
  readonly new_balance: number;
  readonly timestamp: string;
  readonly details: Json;
}

/**
 * Integration with NFC scan log
 */
export interface NFCScanLogIntegration {
  readonly scan_log_id: number;
  readonly card_id_scanned: string | null;
  readonly scan_timestamp: string;
  readonly scan_result: 'success' | 'failure' | 'duplicate';
  readonly processing_time_ms: number | null;
  readonly error_details: Json | null;
}

/**
 * Integration with existing card system
 */
export interface CardSystemIntegration {
  readonly card_id: string;
  readonly current_amount: number;
  readonly last_recharge_date: string | null;
  readonly recharge_count: number;
  readonly last_payment_method: string | null;
  readonly description: string | null;
}

// =====================================================
// EXPORT UTILITY TYPES
// =====================================================

/**
 * Union type for all monitoring event types
 */
export type AnyMonitoringEvent = MonitoringEvent;

/**
 * Union type for all detection results
 */
export type AnyDetectionResult =
  | TransactionFailureDetectionResult
  | BalanceDiscrepancyDetectionResult
  | DuplicateNFCDetectionResult
  | RaceConditionDetectionResult;

/**
 * Union type for all API responses
 */
export type AnyAPIResponse =
  | HealthCheckResponse
  | MonitoringEventsResponse
  | MetricsResponse
  | DashboardResponse;

/**
 * Readonly deep utility type for immutable data structures
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Optional fields utility type
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Required fields utility type
 */
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/**
 * Monitoring event with typed event data based on event type
 */
export type TypedMonitoringEvent<T extends MonitoringEventType> =
  T extends MonitoringEventType.TRANSACTION_FAILURE
    ? MonitoringEvent & { event_data: TransactionFailureEventData }
  : T extends MonitoringEventType.BALANCE_DISCREPANCY
    ? MonitoringEvent & { event_data: BalanceDiscrepancyEventData }
  : T extends MonitoringEventType.DUPLICATE_NFC
    ? MonitoringEvent & { event_data: DuplicateNFCEventData }
  : T extends MonitoringEventType.RACE_CONDITION
    ? MonitoringEvent & { event_data: RaceConditionEventData }
  : T extends MonitoringEventType.SYSTEM_HEALTH
    ? MonitoringEvent & { event_data: SystemHealthEventData }
  : MonitoringEvent;

// =====================================================
// CONSTANTS AND DEFAULTS
// =====================================================

/**
 * Default configuration values
 */
export const DEFAULT_MONITORING_CONFIG: MonitoringSystemConfig = {
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
  performance: {
    max_concurrent_detectors: 4,
    detection_timeout_ms: 30000,
    batch_size: 1000,
    memory_threshold_mb: 100,
    query_timeout_ms: 30000,
  },
  circuit_breaker: {
    failure_threshold: 5,
    recovery_timeout_ms: 60000,
    half_open_max_calls: 2,
    timeout_ms: 30000,
  },
  retention: {
    monitoring_events_days: 30,
    system_health_snapshots_days: 30,
    alert_history_days: 90,
  },
} as const;

/**
 * Detection algorithm priorities
 */
export const DETECTION_PRIORITIES = {
  [MonitoringEventType.TRANSACTION_FAILURE]: 'CRITICAL',
  [MonitoringEventType.BALANCE_DISCREPANCY]: 'CRITICAL',
  [MonitoringEventType.DUPLICATE_NFC]: 'MEDIUM',
  [MonitoringEventType.RACE_CONDITION]: 'MEDIUM',
  [MonitoringEventType.SYSTEM_HEALTH]: 'LOW',
} as const;

/**
 * Severity level numeric values for sorting
 */
export const SEVERITY_WEIGHTS = {
  [MonitoringSeverity.CRITICAL]: 5,
  [MonitoringSeverity.HIGH]: 4,
  [MonitoringSeverity.MEDIUM]: 3,
  [MonitoringSeverity.LOW]: 2,
  [MonitoringSeverity.INFO]: 1,
} as const;

/**
 * Type guard functions for runtime type checking
 */
export const isMonitoringEvent = (obj: unknown): obj is MonitoringEvent => {
  return typeof obj === 'object' && obj !== null && 'event_id' in obj;
};

export const isTransactionFailureEvent = (event: MonitoringEvent): event is TypedMonitoringEvent<MonitoringEventType.TRANSACTION_FAILURE> => {
  return event.event_type === MonitoringEventType.TRANSACTION_FAILURE;
};

export const isBalanceDiscrepancyEvent = (event: MonitoringEvent): event is TypedMonitoringEvent<MonitoringEventType.BALANCE_DISCREPANCY> => {
  return event.event_type === MonitoringEventType.BALANCE_DISCREPANCY;
};

export const isDuplicateNFCEvent = (event: MonitoringEvent): event is TypedMonitoringEvent<MonitoringEventType.DUPLICATE_NFC> => {
  return event.event_type === MonitoringEventType.DUPLICATE_NFC;
};

export const isRaceConditionEvent = (event: MonitoringEvent): event is TypedMonitoringEvent<MonitoringEventType.RACE_CONDITION> => {
  return event.event_type === MonitoringEventType.RACE_CONDITION;
};

export const isSystemHealthEvent = (event: MonitoringEvent): event is TypedMonitoringEvent<MonitoringEventType.SYSTEM_HEALTH> => {
  return event.event_type === MonitoringEventType.SYSTEM_HEALTH;
};

/**
 * Helper function to get severity weight for sorting
 */
export const getSeverityWeight = (severity: MonitoringSeverity): number => {
  return SEVERITY_WEIGHTS[severity];
};

/**
 * Helper function to determine if an event is critical
 */
export const isCriticalEvent = (event: MonitoringEvent): boolean => {
  return event.severity === MonitoringSeverity.CRITICAL;
};

/**
 * Helper function to determine if an event requires immediate attention
 */
export const requiresImmediateAttention = (event: MonitoringEvent): boolean => {
  return event.severity === MonitoringSeverity.CRITICAL ||
         (event.context_data.requires_immediate_investigation === true);
};