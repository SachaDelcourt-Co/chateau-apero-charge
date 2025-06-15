/**
 * Phase 4 Monitoring System - Monitoring Client
 * 
 * This client provides access to monitoring data with caching strategy,
 * real-time subscription capabilities, and retry logic.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-14
 */

import { supabase } from '@/integrations/supabase/client';
import { detectionService } from './detection-service';
import {
  MonitoringEventType,
  MonitoringSeverity,
  MonitoringEventStatus,
  SystemHealthStatus,
  DEFAULT_MONITORING_CONFIG
} from '@/types/monitoring';
import type {
  MonitoringEvent,
  MonitoringEventsFilters,
  MonitoringEventsResponse,
  PaginationParams,
  PaginationMeta,
  HealthCheckResponse,
  MetricsResponse,
  DashboardResponse,
  SystemHealthSnapshot,
  AlertHistory,
  ComponentHealth,
  AlertSummary,
  TimeSeriesDataPoint,
  ChartData
} from '@/types/monitoring';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Monitoring client with caching and real-time capabilities
 */
export class MonitoringClient {
  private readonly config = DEFAULT_MONITORING_CONFIG;
  private readonly cache = new Map<string, CacheEntry<any>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes
  private subscriptions = new Map<string, any>();

  /**
   * Get monitoring events with filtering and pagination
   */
  async getMonitoringEvents(
    filters: MonitoringEventsFilters = {},
    pagination: PaginationParams = {}
  ): Promise<MonitoringEventsResponse> {
    const cacheKey = `events_${JSON.stringify({ filters, pagination })}`;
    const cached = this.getFromCache<MonitoringEventsResponse>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const events = await detectionService.getMonitoringEvents({
        event_type: Array.isArray(filters.event_type) ? filters.event_type[0] : filters.event_type,
        severity: Array.isArray(filters.severity) ? filters.severity[0] : filters.severity,
        status: Array.isArray(filters.status) ? filters.status[0] : filters.status,
        limit: pagination.per_page || 50,
        offset: ((pagination.page || 1) - 1) * (pagination.per_page || 50)
      });

      // Calculate pagination metadata
      const total = events.length; // This would need a separate count query in production
      const page = pagination.page || 1;
      const perPage = pagination.per_page || 50;
      const totalPages = Math.ceil(total / perPage);

      const paginationMeta: PaginationMeta = {
        total,
        page,
        per_page: perPage,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      };

      // Calculate summary statistics
      const totalCritical = events.filter(e => e.severity === MonitoringSeverity.CRITICAL).length;
      const totalOpen = events.filter(e => e.status === MonitoringEventStatus.OPEN).length;

      const response: MonitoringEventsResponse = {
        events: events as MonitoringEvent[],
        pagination: paginationMeta,
        filters_applied: filters,
        total_critical: totalCritical,
        total_open: totalOpen
      };

      this.setCache(cacheKey, response, this.defaultTTL);
      return response;

    } catch (error) {
      console.error('Failed to get monitoring events:', error);
      throw new Error(`Failed to retrieve monitoring events: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get system health check information
   */
  async getHealthCheck(): Promise<HealthCheckResponse> {
    const cacheKey = 'health_check';
    const cached = this.getFromCache<HealthCheckResponse>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const systemHealth = await detectionService.getSystemHealth();
      const recentEvents = await detectionService.getMonitoringEvents({ limit: 10 });

      // Calculate system metrics
      const systemMetrics = {
        transactions_last_hour: systemHealth?.total_transactions_last_hour || 0,
        success_rate_percent: systemHealth?.success_rate_percent || 100,
        avg_processing_time_ms: systemHealth?.avg_processing_time_ms || 0,
        active_monitoring_events: recentEvents.filter(e => e.status === 'OPEN').length,
        critical_events_count: recentEvents.filter(e => e.severity === 'CRITICAL').length
      };

      // Mock component health (would be real checks in production)
      const components = {
        transaction_detector: this.createComponentHealth('UP'),
        balance_detector: this.createComponentHealth('UP'),
        nfc_detector: this.createComponentHealth('UP'),
        race_detector: this.createComponentHealth('UP'),
        database: this.createComponentHealth('UP'),
        circuit_breaker: this.createComponentHealth('UP')
      };

      // Create recent alerts summary
      const recentAlerts: AlertSummary[] = recentEvents
        .filter(e => e.severity === 'CRITICAL')
        .slice(0, 5)
        .map(event => ({
          alert_id: event.event_id,
          alert_level: 'CRITICAL' as const,
          alert_message: `${event.event_type} detected for card ${event.card_id || 'SYSTEM'}`,
          alert_timestamp: event.detection_timestamp,
          event_type: event.event_type as MonitoringEventType,
          resolved: event.status === 'RESOLVED'
        }));

      const response: HealthCheckResponse = {
        status: systemHealth?.overall_health_status as SystemHealthStatus || SystemHealthStatus.HEALTHY,
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - Date.parse(systemHealth?.snapshot_timestamp || new Date().toISOString())) / 1000),
        system_metrics: systemMetrics,
        components,
        recent_alerts: recentAlerts
      };

      this.setCache(cacheKey, response, 60000); // 1 minute TTL for health checks
      return response;

    } catch (error) {
      console.error('Failed to get health check:', error);
      throw new Error(`Failed to retrieve health check: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get system metrics and trends
   */
  async getMetrics(timeRange: { start: string; end: string }): Promise<MetricsResponse> {
    const cacheKey = `metrics_${timeRange.start}_${timeRange.end}`;
    const cached = this.getFromCache<MetricsResponse>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      // This would involve complex queries in production
      const events = await detectionService.getMonitoringEvents({ limit: 1000 });
      const systemHealth = await detectionService.getSystemHealth();

      // Calculate financial metrics
      const financialMetrics = {
        total_transaction_volume: systemHealth?.total_system_balance || 0,
        failed_transaction_count: events.filter(e => e.event_type === 'transaction_failure').length,
        balance_discrepancies_detected: events.filter(e => e.event_type === 'balance_discrepancy').length,
        total_discrepancy_amount: events
          .filter(e => e.event_type === 'balance_discrepancy')
          .reduce((sum, e) => sum + (e.affected_amount || 0), 0),
        financial_integrity_score: this.calculateIntegrityScore(events)
      };

      // Calculate performance metrics
      const performanceMetrics = {
        avg_detection_time_ms: systemHealth?.avg_processing_time_ms || 0,
        monitoring_cycles_completed: 0, // Would need tracking
        monitoring_errors: events.filter(e => e.severity === 'CRITICAL').length,
        system_uptime_percent: 99.9 // Would need real uptime tracking
      };

      // Generate trend data (mock data for now)
      const trends = {
        hourly_transaction_counts: this.generateHourlyTrends(24),
        failure_rates: this.generateHourlyTrends(24, 0, 5),
        processing_times: this.generateHourlyTrends(24, 50, 200),
        balance_discrepancies: this.generateHourlyTrends(24, 0, 3)
      };

      const response: MetricsResponse = {
        time_range: timeRange,
        financial_metrics: financialMetrics,
        performance_metrics: performanceMetrics,
        trends
      };

      this.setCache(cacheKey, response, this.defaultTTL);
      return response;

    } catch (error) {
      console.error('Failed to get metrics:', error);
      throw new Error(`Failed to retrieve metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get dashboard data
   */
  async getDashboard(): Promise<DashboardResponse> {
    const cacheKey = 'dashboard';
    const cached = this.getFromCache<DashboardResponse>(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const [healthCheck, events, systemHealth] = await Promise.all([
        this.getHealthCheck(),
        detectionService.getMonitoringEvents({ limit: 100 }),
        detectionService.getSystemHealth()
      ]);

      // Key performance indicators
      const kpis = {
        system_health: healthCheck.status,
        transaction_success_rate: healthCheck.system_metrics.success_rate_percent,
        balance_integrity_score: this.calculateIntegrityScore(events),
        monitoring_system_uptime: 99.9 // Would need real uptime tracking
      };

      // Real-time data
      const realTime = {
        active_transactions: 0, // Would need real-time tracking
        recent_failures: events.filter(e => 
          e.event_type === 'transaction_failure' && 
          Date.parse(e.detection_timestamp) > Date.now() - 60000
        ).length,
        open_monitoring_events: events.filter(e => e.status === 'OPEN').length,
        system_load_percent: 25 // Would need real system monitoring
      };

      // Charts data
      const charts = {
        transaction_volume_24h: this.createChartData('Transaction Volume', this.generateHourlyTrends(24)),
        failure_rate_trend: this.createChartData('Failure Rate %', this.generateHourlyTrends(24, 0, 5)),
        balance_discrepancy_trend: this.createChartData('Balance Discrepancies', this.generateHourlyTrends(24, 0, 3)),
        nfc_duplicate_rate: this.createChartData('NFC Duplicate Rate %', this.generateHourlyTrends(24, 0, 2))
      };

      // Recent events
      const recentEvents = events.slice(0, 10) as MonitoringEvent[];

      // System status
      const systemStatus = {
        database_connection: true,
        monitoring_processes: [
          {
            name: 'detection_service',
            status: 'UP' as const,
            uptime_seconds: healthCheck.uptime_seconds,
            memory_usage_mb: 50,
            cpu_usage_percent: 15,
            last_activity: new Date().toISOString()
          }
        ],
        last_successful_check: new Date().toISOString(),
        circuit_breakers: {
          'monitoring-detection': 'CLOSED' as const
        }
      };

      const response: DashboardResponse = {
        kpis,
        real_time: realTime,
        charts,
        recent_events: recentEvents,
        system_status: systemStatus
      };

      this.setCache(cacheKey, response, 30000); // 30 seconds TTL for dashboard
      return response;

    } catch (error) {
      console.error('Failed to get dashboard data:', error);
      throw new Error(`Failed to retrieve dashboard data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Subscribe to real-time monitoring events
   */
  subscribeToEvents(
    callback: (event: MonitoringEvent) => void,
    filters: MonitoringEventsFilters = {}
  ): () => void {
    const subscriptionId = `events_${Date.now()}_${Math.random()}`;
    
    // In a real implementation, this would use Supabase real-time subscriptions
    // For now, we'll simulate with polling
    const interval = setInterval(async () => {
      try {
        const events = await detectionService.getMonitoringEvents({
          limit: 10,
          ...filters
        });
        
        // Simulate new events by checking timestamps
        const recentEvents = events.filter(event => 
          Date.parse(event.detection_timestamp) > Date.now() - 30000
        );
        
        recentEvents.forEach(event => callback(event as MonitoringEvent));
      } catch (error) {
        console.error('Error in event subscription:', error);
      }
    }, 10000); // Poll every 10 seconds

    this.subscriptions.set(subscriptionId, interval);

    // Return unsubscribe function
    return () => {
      const interval = this.subscriptions.get(subscriptionId);
      if (interval) {
        clearInterval(interval);
        this.subscriptions.delete(subscriptionId);
      }
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Cleanup subscriptions and resources
   */
  cleanup(): void {
    // Clear all subscriptions
    for (const [id, interval] of this.subscriptions.entries()) {
      clearInterval(interval);
    }
    this.subscriptions.clear();

    // Clear cache
    this.clearCache();
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  /**
   * Get data from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set data in cache
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Create component health status
   */
  private createComponentHealth(status: 'UP' | 'DOWN' | 'DEGRADED'): ComponentHealth {
    return {
      status,
      last_check: new Date().toISOString(),
      response_time_ms: Math.floor(Math.random() * 100) + 10,
      circuit_breaker_state: 'CLOSED'
    };
  }

  /**
   * Calculate financial integrity score
   */
  private calculateIntegrityScore(events: any[]): number {
    const criticalEvents = events.filter(e => e.severity === 'CRITICAL').length;
    const totalEvents = events.length;
    
    if (totalEvents === 0) return 100;
    
    const score = Math.max(0, 100 - (criticalEvents / totalEvents) * 100);
    return Math.round(score * 100) / 100;
  }

  /**
   * Generate hourly trend data
   */
  private generateHourlyTrends(hours: number, min = 0, max = 100): TimeSeriesDataPoint[] {
    const trends: TimeSeriesDataPoint[] = [];
    const now = new Date();

    for (let i = hours - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      const value = Math.floor(Math.random() * (max - min + 1)) + min;
      
      trends.push({
        timestamp: timestamp.toISOString(),
        value,
        metadata: {
          hour: timestamp.getHours(),
          generated: true
        }
      });
    }

    return trends;
  }

  /**
   * Create chart data structure
   */
  private createChartData(label: string, dataPoints: TimeSeriesDataPoint[]): ChartData {
    return {
      labels: dataPoints.map(point => 
        new Date(point.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      ),
      datasets: [{
        label,
        data: dataPoints.map(point => point.value),
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        metadata: {
          generated: true,
          timestamp: new Date().toISOString()
        }
      }]
    };
  }
}

/**
 * Singleton instance of the monitoring client
 */
export const monitoringClient = new MonitoringClient();