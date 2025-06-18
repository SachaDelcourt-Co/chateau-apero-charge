/**
 * Phase 4 Monitoring System - API and Service Type Definitions
 * 
 * This file contains TypeScript type definitions specifically for API endpoints,
 * service interfaces, and client-side monitoring operations.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-14
 */

import type {
  MonitoringEvent,
  MonitoringEventInsert,
  MonitoringEventUpdate,
  SystemHealthSnapshot,
  AlertHistory,
  MonitoringEventType,
  MonitoringSeverity,
  MonitoringEventStatus,
  SystemHealthStatus,
  AlertLevel,
  MonitoringEventsFilters,
  PaginationParams,
  HealthCheckResponse,
  MonitoringEventsResponse,
  MetricsResponse,
  DashboardResponse,
  MonitoringDetectionCycleResult,
  BackgroundJobResult,
  CircuitBreakerInfo,
  MonitoringResult,
  MonitoringError,
  PerformanceMetrics
} from './monitoring';

// =====================================================
// API ENDPOINT INTERFACES
// =====================================================

/**
 * Base API response wrapper
 */
export interface APIResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: APIError;
  readonly timestamp: string;
  readonly request_id?: string;
}

/**
 * API error structure
 */
export interface APIError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly field_errors?: Record<string, string[]>;
}

/**
 * Health check endpoint
 */
export interface HealthCheckAPI {
  /**
   * Get system health status
   * GET /api/v1/monitoring/health
   */
  getHealth(): Promise<APIResponse<HealthCheckResponse>>;
  
  /**
   * Get detailed component health
   * GET /api/v1/monitoring/health/detailed
   */
  getDetailedHealth(): Promise<APIResponse<DetailedHealthResponse>>;
}

/**
 * Detailed health response with additional diagnostics
 */
export interface DetailedHealthResponse extends HealthCheckResponse {
  readonly diagnostics: {
    readonly database_performance: DatabasePerformanceMetrics;
    readonly memory_usage: MemoryUsageMetrics;
    readonly detection_performance: DetectionPerformanceMetrics;
    readonly recent_errors: MonitoringError[];
  };
}

/**
 * Database performance metrics
 */
export interface DatabasePerformanceMetrics {
  readonly connection_pool_size: number;
  readonly active_connections: number;
  readonly avg_query_time_ms: number;
  readonly slow_queries_count: number;
  readonly deadlocks_count: number;
  readonly table_sizes: Record<string, number>;
}

/**
 * Memory usage metrics
 */
export interface MemoryUsageMetrics {
  readonly heap_used_mb: number;
  readonly heap_total_mb: number;
  readonly external_mb: number;
  readonly rss_mb: number;
  readonly gc_collections: number;
  readonly gc_duration_ms: number;
}

/**
 * Detection performance metrics
 */
export interface DetectionPerformanceMetrics {
  readonly avg_cycle_duration_ms: number;
  readonly successful_cycles: number;
  readonly failed_cycles: number;
  readonly events_detected_per_hour: number;
  readonly false_positive_rate: number;
}

/**
 * Monitoring events API
 */
export interface MonitoringEventsAPI {
  /**
   * Get monitoring events with filtering and pagination
   * GET /api/v1/monitoring/events
   */
  getEvents(
    filters?: MonitoringEventsFilters,
    pagination?: PaginationParams
  ): Promise<APIResponse<MonitoringEventsResponse>>;
  
  /**
   * Get a specific monitoring event
   * GET /api/v1/monitoring/events/:id
   */
  getEvent(eventId: number): Promise<APIResponse<MonitoringEvent>>;
  
  /**
   * Update a monitoring event (resolution, status, etc.)
   * PATCH /api/v1/monitoring/events/:id
   */
  updateEvent(
    eventId: number,
    update: MonitoringEventUpdate
  ): Promise<APIResponse<MonitoringEvent>>;
  
  /**
   * Get event statistics
   * GET /api/v1/monitoring/events/stats
   */
  getEventStats(
    filters?: MonitoringEventsFilters
  ): Promise<APIResponse<EventStatistics>>;
  
  /**
   * Export events to CSV/JSON
   * GET /api/v1/monitoring/events/export
   */
  exportEvents(
    filters?: MonitoringEventsFilters,
    format?: 'csv' | 'json'
  ): Promise<APIResponse<ExportResult>>;
}

/**
 * Event statistics response
 */
export interface EventStatistics {
  readonly total_events: number;
  readonly events_by_type: Record<MonitoringEventType, number>;
  readonly events_by_severity: Record<MonitoringSeverity, number>;
  readonly events_by_status: Record<MonitoringEventStatus, number>;
  readonly resolution_time_stats: {
    readonly avg_resolution_time_minutes: number;
    readonly median_resolution_time_minutes: number;
    readonly max_resolution_time_minutes: number;
  };
  readonly trend_data: {
    readonly daily_counts: Array<{ date: string; count: number }>;
    readonly hourly_distribution: Array<{ hour: number; count: number }>;
  };
}

/**
 * Export result
 */
export interface ExportResult {
  readonly export_id: string;
  readonly format: 'csv' | 'json';
  readonly file_size_bytes: number;
  readonly record_count: number;
  readonly download_url: string;
  readonly expires_at: string;
}

/**
 * Metrics API
 */
export interface MetricsAPI {
  /**
   * Get system metrics
   * GET /api/v1/monitoring/metrics
   */
  getMetrics(
    startDate?: string,
    endDate?: string
  ): Promise<APIResponse<MetricsResponse>>;
  
  /**
   * Get real-time metrics
   * GET /api/v1/monitoring/metrics/realtime
   */
  getRealTimeMetrics(): Promise<APIResponse<RealTimeMetrics>>;
  
  /**
   * Get performance metrics
   * GET /api/v1/monitoring/metrics/performance
   */
  getPerformanceMetrics(): Promise<APIResponse<PerformanceMetrics[]>>;
}

/**
 * Real-time metrics
 */
export interface RealTimeMetrics {
  readonly timestamp: string;
  readonly transactions_per_second: number;
  readonly failure_rate_percent: number;
  readonly avg_response_time_ms: number;
  readonly active_monitoring_events: number;
  readonly system_load_percent: number;
  readonly memory_usage_percent: number;
  readonly database_connections: number;
}

/**
 * Dashboard API
 */
export interface DashboardAPI {
  /**
   * Get dashboard data
   * GET /api/v1/monitoring/dashboard
   */
  getDashboard(): Promise<APIResponse<DashboardResponse>>;
  
  /**
   * Get dashboard widgets data
   * GET /api/v1/monitoring/dashboard/widgets
   */
  getWidgets(widgetIds: string[]): Promise<APIResponse<WidgetData[]>>;
  
  /**
   * Update dashboard configuration
   * POST /api/v1/monitoring/dashboard/config
   */
  updateDashboardConfig(
    config: DashboardConfig
  ): Promise<APIResponse<DashboardConfig>>;
}

/**
 * Widget data for dashboard
 */
export interface WidgetData {
  readonly widget_id: string;
  readonly widget_type: 'chart' | 'metric' | 'table' | 'alert';
  readonly title: string;
  readonly data: unknown;
  readonly last_updated: string;
  readonly refresh_interval_seconds: number;
}

/**
 * Dashboard configuration
 */
export interface DashboardConfig {
  readonly layout: DashboardLayout;
  readonly widgets: WidgetConfig[];
  readonly refresh_settings: RefreshSettings;
  readonly alert_settings: AlertSettings;
}

/**
 * Dashboard layout configuration
 */
export interface DashboardLayout {
  readonly columns: number;
  readonly rows: number;
  readonly widget_positions: Record<string, { x: number; y: number; w: number; h: number }>;
}

/**
 * Widget configuration
 */
export interface WidgetConfig {
  readonly widget_id: string;
  readonly widget_type: 'chart' | 'metric' | 'table' | 'alert';
  readonly title: string;
  readonly data_source: string;
  readonly filters?: Record<string, unknown>;
  readonly refresh_interval_seconds: number;
  readonly visible: boolean;
}

/**
 * Refresh settings
 */
export interface RefreshSettings {
  readonly auto_refresh: boolean;
  readonly refresh_interval_seconds: number;
  readonly pause_on_error: boolean;
}

/**
 * Alert settings
 */
export interface AlertSettings {
  readonly show_notifications: boolean;
  readonly notification_levels: AlertLevel[];
  readonly sound_enabled: boolean;
  readonly auto_acknowledge_timeout_minutes: number;
}

/**
 * System health API
 */
export interface SystemHealthAPI {
  /**
   * Get current system health snapshot
   * GET /api/v1/monitoring/health/snapshot
   */
  getCurrentSnapshot(): Promise<APIResponse<SystemHealthSnapshot>>;
  
  /**
   * Get system health history
   * GET /api/v1/monitoring/health/history
   */
  getHealthHistory(
    startDate?: string,
    endDate?: string
  ): Promise<APIResponse<SystemHealthSnapshot[]>>;
  
  /**
   * Trigger manual health check
   * POST /api/v1/monitoring/health/check
   */
  triggerHealthCheck(): Promise<APIResponse<SystemHealthSnapshot>>;
}

/**
 * Alerts API
 */
export interface AlertsAPI {
  /**
   * Get alerts
   * GET /api/v1/monitoring/alerts
   */
  getAlerts(
    filters?: AlertFilters,
    pagination?: PaginationParams
  ): Promise<APIResponse<AlertsResponse>>;
  
  /**
   * Acknowledge alert
   * POST /api/v1/monitoring/alerts/:id/acknowledge
   */
  acknowledgeAlert(
    alertId: number,
    acknowledgedBy: string,
    notes?: string
  ): Promise<APIResponse<AlertHistory>>;
  
  /**
   * Resolve alert
   * POST /api/v1/monitoring/alerts/:id/resolve
   */
  resolveAlert(
    alertId: number,
    resolvedBy: string,
    notes?: string
  ): Promise<APIResponse<AlertHistory>>;
  
  /**
   * Escalate alert
   * POST /api/v1/monitoring/alerts/:id/escalate
   */
  escalateAlert(
    alertId: number,
    escalationLevel: number,
    reason: string
  ): Promise<APIResponse<AlertHistory>>;
}

/**
 * Alert filters
 */
export interface AlertFilters {
  readonly alert_level?: AlertLevel | AlertLevel[];
  readonly monitoring_event_id?: number;
  readonly acknowledged?: boolean;
  readonly resolved?: boolean;
  readonly escalation_level?: number;
  readonly start_date?: string;
  readonly end_date?: string;
}

/**
 * Alerts response
 */
export interface AlertsResponse {
  readonly alerts: AlertHistory[];
  readonly pagination: {
    readonly total: number;
    readonly page: number;
    readonly per_page: number;
    readonly has_next: boolean;
  };
  readonly summary: {
    readonly total_unacknowledged: number;
    readonly total_unresolved: number;
    readonly critical_count: number;
    readonly avg_resolution_time_minutes: number;
  };
}

// =====================================================
// SERVICE INTERFACES
// =====================================================

/**
 * Detection service interface
 */
export interface DetectionService {
  /**
   * Run detection cycle manually
   */
  runDetectionCycle(): Promise<MonitoringResult<MonitoringDetectionCycleResult>>;
  
  /**
   * Run specific detection algorithm
   */
  runDetection(
    algorithm: 'transaction_failures' | 'balance_discrepancies' | 'duplicate_nfc' | 'race_conditions'
  ): Promise<MonitoringResult<unknown>>;
  
  /**
   * Get detection status
   */
  getDetectionStatus(): Promise<MonitoringResult<DetectionStatus>>;
  
  /**
   * Configure detection parameters
   */
  configureDetection(config: DetectionConfiguration): Promise<MonitoringResult<void>>;
}

/**
 * Detection status
 */
export interface DetectionStatus {
  readonly is_running: boolean;
  readonly last_cycle_timestamp: string;
  readonly next_cycle_timestamp: string;
  readonly active_detectors: string[];
  readonly failed_detectors: string[];
  readonly performance_metrics: DetectionPerformanceMetrics;
}

/**
 * Detection configuration
 */
export interface DetectionConfiguration {
  readonly intervals: Record<string, number>;
  readonly thresholds: Record<string, number>;
  readonly enabled_detectors: string[];
  readonly circuit_breaker_config: Record<string, unknown>;
}

/**
 * Background processing service
 */
export interface BackgroundProcessingService {
  /**
   * Get background job status
   */
  getJobStatus(): Promise<MonitoringResult<BackgroundJobStatus>>;
  
  /**
   * Start background processing
   */
  startProcessing(): Promise<MonitoringResult<void>>;
  
  /**
   * Stop background processing
   */
  stopProcessing(): Promise<MonitoringResult<void>>;
  
  /**
   * Get job history
   */
  getJobHistory(limit?: number): Promise<MonitoringResult<BackgroundJobResult[]>>;
}

/**
 * Background job status
 */
export interface BackgroundJobStatus {
  readonly is_running: boolean;
  readonly active_jobs: string[];
  readonly queued_jobs: number;
  readonly failed_jobs: number;
  readonly last_job_timestamp: string;
  readonly uptime_seconds: number;
}

/**
 * Circuit breaker service
 */
export interface CircuitBreakerService {
  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): Promise<MonitoringResult<CircuitBreakerInfo[]>>;
  
  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(name: string): Promise<MonitoringResult<void>>;
  
  /**
   * Configure circuit breaker
   */
  configureCircuitBreaker(
    name: string,
    config: Record<string, unknown>
  ): Promise<MonitoringResult<void>>;
}

/**
 * Monitoring data service
 */
export interface MonitoringDataService {
  /**
   * Create monitoring event
   */
  createEvent(event: MonitoringEventInsert): Promise<MonitoringResult<MonitoringEvent>>;
  
  /**
   * Update monitoring event
   */
  updateEvent(
    eventId: number,
    update: MonitoringEventUpdate
  ): Promise<MonitoringResult<MonitoringEvent>>;
  
  /**
   * Delete monitoring event
   */
  deleteEvent(eventId: number): Promise<MonitoringResult<void>>;
  
  /**
   * Bulk operations
   */
  bulkUpdateEvents(
    eventIds: number[],
    update: MonitoringEventUpdate
  ): Promise<MonitoringResult<number>>;
  
  /**
   * Cleanup old data
   */
  cleanupOldData(retentionDays: number): Promise<MonitoringResult<CleanupResult>>;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  readonly cleanup_timestamp: string;
  readonly retention_days: number;
  readonly deleted_events: number;
  readonly deleted_snapshots: number;
  readonly deleted_alerts: number;
  readonly success: boolean;
}

// =====================================================
// CLIENT-SIDE TYPES
// =====================================================

/**
 * Monitoring client configuration
 */
export interface MonitoringClientConfig {
  readonly base_url: string;
  readonly api_key?: string;
  readonly timeout_ms: number;
  readonly retry_attempts: number;
  readonly retry_delay_ms: number;
  readonly enable_caching: boolean;
  readonly cache_ttl_ms: number;
}

/**
 * Real-time subscription options
 */
export interface SubscriptionOptions {
  readonly event_types?: MonitoringEventType[];
  readonly severity_levels?: MonitoringSeverity[];
  readonly card_ids?: string[];
  readonly include_resolved?: boolean;
}

/**
 * Real-time event notification
 */
export interface EventNotification {
  readonly type: 'event_created' | 'event_updated' | 'event_resolved' | 'alert_triggered';
  readonly event: MonitoringEvent;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Monitoring client interface
 */
export interface MonitoringClient {
  // API methods
  readonly health: HealthCheckAPI;
  readonly events: MonitoringEventsAPI;
  readonly metrics: MetricsAPI;
  readonly dashboard: DashboardAPI;
  readonly systemHealth: SystemHealthAPI;
  readonly alerts: AlertsAPI;
  
  // Real-time subscriptions
  subscribe(
    options: SubscriptionOptions,
    callback: (notification: EventNotification) => void
  ): Promise<() => void>;
  
  // Configuration
  configure(config: Partial<MonitoringClientConfig>): void;
  
  // Utility methods
  isConnected(): boolean;
  getLastError(): APIError | null;
  clearCache(): void;
}

// =====================================================
// WEBHOOK AND INTEGRATION TYPES
// =====================================================

/**
 * Webhook payload for external integrations
 */
export interface MonitoringWebhookPayload {
  readonly event_type: 'monitoring_event' | 'alert' | 'system_health';
  readonly timestamp: string;
  readonly data: MonitoringEvent | AlertHistory | SystemHealthSnapshot;
  readonly metadata: {
    readonly source: 'phase4_monitoring';
    readonly version: string;
    readonly environment: string;
  };
}

/**
 * External monitoring integration
 */
export interface ExternalMonitoringIntegration {
  readonly name: string;
  readonly type: 'webhook' | 'api' | 'log_aggregator';
  readonly endpoint_url: string;
  readonly authentication: {
    readonly type: 'api_key' | 'bearer_token' | 'basic_auth';
    readonly credentials: Record<string, string>;
  };
  readonly event_filters: {
    readonly event_types: MonitoringEventType[];
    readonly severity_levels: MonitoringSeverity[];
    readonly include_resolved: boolean;
  };
  readonly retry_config: {
    readonly max_retries: number;
    readonly retry_delay_ms: number;
    readonly backoff_multiplier: number;
  };
}

// =====================================================
// TESTING AND MOCK TYPES
// =====================================================

/**
 * Mock data generator options
 */
export interface MockDataOptions {
  readonly event_count: number;
  readonly event_types: MonitoringEventType[];
  readonly severity_distribution: Record<MonitoringSeverity, number>;
  readonly time_range_hours: number;
  readonly include_resolved: boolean;
}

/**
 * Test scenario configuration
 */
export interface TestScenario {
  readonly name: string;
  readonly description: string;
  readonly setup_data: MockDataOptions;
  readonly expected_detections: number;
  readonly expected_alerts: number;
  readonly validation_rules: ValidationRule[];
}

/**
 * Validation rule for testing
 */
export interface ValidationRule {
  readonly field: string;
  readonly operator: 'equals' | 'greater_than' | 'less_than' | 'contains';
  readonly expected_value: unknown;
  readonly error_message: string;
}

// =====================================================
// UTILITY FUNCTIONS AND HELPERS
// =====================================================

/**
 * Type guard for API responses
 */
export const isAPIResponse = <T>(obj: unknown): obj is APIResponse<T> => {
  return typeof obj === 'object' && obj !== null && 'success' in obj;
};

/**
 * Type guard for API errors
 */
export const isAPIError = (obj: unknown): obj is APIError => {
  return typeof obj === 'object' && obj !== null && 'code' in obj && 'message' in obj;
};

/**
 * Helper to create API response
 */
export const createAPIResponse = <T>(
  data: T,
  success = true,
  error?: APIError
): APIResponse<T> => ({
  success,
  data: success ? data : undefined,
  error: success ? undefined : error,
  timestamp: new Date().toISOString(),
});

/**
 * Helper to create API error
 */
export const createAPIError = (
  code: string,
  message: string,
  details?: Record<string, unknown>
): APIError => ({
  code,
  message,
  details,
});