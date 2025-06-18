/**
 * Phase 4 Monitoring System - API Edge Function
 * 
 * This Edge Function provides API endpoints for monitoring data access:
 * - Health check endpoint (/health)
 * - Monitoring events endpoint (/events)
 * - System metrics endpoint (/metrics)
 * - Simple dashboard data endpoint (/dashboard)
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-14
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =====================================================
// TYPES AND INTERFACES
// =====================================================

interface HealthCheckResponse {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  timestamp: string;
  uptime_seconds: number;
  system_metrics: {
    transactions_last_hour: number;
    success_rate_percent: number;
    avg_processing_time_ms: number;
    active_monitoring_events: number;
    critical_events_count: number;
  };
  components: {
    transaction_detector: ComponentHealth;
    balance_detector: ComponentHealth;
    nfc_detector: ComponentHealth;
    race_detector: ComponentHealth;
    database: ComponentHealth;
    circuit_breaker: ComponentHealth;
  };
  recent_alerts: AlertSummary[];
}

interface ComponentHealth {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  last_check: string;
  response_time_ms?: number;
  error_message?: string;
  circuit_breaker_state?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface AlertSummary {
  alert_id: number;
  alert_level: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  alert_message: string;
  alert_timestamp: string;
  event_type: string;
  resolved: boolean;
}

interface MetricsResponse {
  time_range: {
    start: string;
    end: string;
  };
  financial_metrics: {
    total_transaction_volume: number;
    failed_transaction_count: number;
    balance_discrepancies_detected: number;
    total_discrepancy_amount: number;
    financial_integrity_score: number;
  };
  performance_metrics: {
    avg_detection_time_ms: number;
    monitoring_cycles_completed: number;
    monitoring_errors: number;
    system_uptime_percent: number;
  };
  trends: {
    hourly_transaction_counts: TimeSeriesDataPoint[];
    failure_rates: TimeSeriesDataPoint[];
    processing_times: TimeSeriesDataPoint[];
    balance_discrepancies: TimeSeriesDataPoint[];
  };
}

interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
  metadata?: Record<string, any>;
}

interface DashboardResponse {
  kpis: {
    system_health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    transaction_success_rate: number;
    balance_integrity_score: number;
    monitoring_system_uptime: number;
  };
  real_time: {
    active_transactions: number;
    recent_failures: number;
    open_monitoring_events: number;
    system_load_percent: number;
  };
  charts: {
    transaction_volume_24h: ChartData;
    failure_rate_trend: ChartData;
    balance_discrepancy_trend: ChartData;
    nfc_duplicate_rate: ChartData;
  };
  recent_events: any[];
  system_status: {
    database_connection: boolean;
    monitoring_processes: ProcessStatus[];
    last_successful_check: string;
    circuit_breakers: Record<string, 'CLOSED' | 'OPEN' | 'HALF_OPEN'>;
  };
}

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
    metadata?: Record<string, any>;
  }>;
}

interface ProcessStatus {
  name: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
  pid?: number;
  uptime_seconds?: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
  last_activity?: string;
}

// =====================================================
// MONITORING API SERVICE
// =====================================================

class MonitoringAPIService {
  private supabase: any;

  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get health check information
   */
  async getHealthCheck(): Promise<HealthCheckResponse> {
    try {
      // Get latest system health snapshot
      const { data: healthSnapshot, error: healthError } = await this.supabase
        .from('system_health_snapshots')
        .select('*')
        .order('snapshot_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (healthError && healthError.code !== 'PGRST116') {
        throw healthError;
      }

      // Get recent monitoring events
      const { data: recentEvents, error: eventsError } = await this.supabase
        .from('monitoring_events')
        .select('*')
        .order('detection_timestamp', { ascending: false })
        .limit(10);

      if (eventsError) {
        console.warn('Failed to get recent events:', eventsError);
      }

      const events = recentEvents || [];
      const health = healthSnapshot || this.getDefaultHealthSnapshot();

      // Calculate system metrics
      const systemMetrics = {
        transactions_last_hour: health.total_transactions_last_hour || 0,
        success_rate_percent: health.success_rate_percent || 100,
        avg_processing_time_ms: health.avg_processing_time_ms || 0,
        active_monitoring_events: events.filter((e: any) => e.status === 'OPEN').length,
        critical_events_count: events.filter((e: any) => e.severity === 'CRITICAL').length,
      };

      // Mock component health (would be real checks in production)
      const components = {
        transaction_detector: this.createComponentHealth('UP'),
        balance_detector: this.createComponentHealth('UP'),
        nfc_detector: this.createComponentHealth('UP'),
        race_detector: this.createComponentHealth('UP'),
        database: this.createComponentHealth('UP'),
        circuit_breaker: this.createComponentHealth('UP'),
      };

      // Create recent alerts summary
      const recentAlerts: AlertSummary[] = events
        .filter((e: any) => e.severity === 'CRITICAL')
        .slice(0, 5)
        .map((event: any) => ({
          alert_id: event.event_id,
          alert_level: 'CRITICAL' as const,
          alert_message: `${event.event_type} detected for card ${event.card_id || 'SYSTEM'}`,
          alert_timestamp: event.detection_timestamp,
          event_type: event.event_type,
          resolved: event.status === 'RESOLVED',
        }));

      return {
        status: health.overall_health_status || 'HEALTHY',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - Date.parse(health.snapshot_timestamp || new Date().toISOString())) / 1000),
        system_metrics: systemMetrics,
        components,
        recent_alerts: recentAlerts,
      };

    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  /**
   * Get monitoring events with filtering
   */
  async getMonitoringEvents(filters: any = {}): Promise<any> {
    try {
      let query = this.supabase
        .from('monitoring_events')
        .select('*')
        .order('detection_timestamp', { ascending: false });

      // Apply filters
      if (filters.event_type) {
        query = query.eq('event_type', filters.event_type);
      }

      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.card_id) {
        query = query.eq('card_id', filters.card_id);
      }

      if (filters.start_date) {
        query = query.gte('detection_timestamp', filters.start_date);
      }

      if (filters.end_date) {
        query = query.lte('detection_timestamp', filters.end_date);
      }

      // Pagination
      const page = parseInt(filters.page) || 1;
      const perPage = parseInt(filters.per_page) || 50;
      const offset = (page - 1) * perPage;

      query = query.range(offset, offset + perPage - 1);

      const { data: events, error, count } = await query;

      if (error) {
        throw error;
      }

      // Calculate summary statistics
      const totalCritical = events?.filter((e: any) => e.severity === 'CRITICAL').length || 0;
      const totalOpen = events?.filter((e: any) => e.status === 'OPEN').length || 0;

      return {
        events: events || [],
        pagination: {
          total: count || events?.length || 0,
          page,
          per_page: perPage,
          total_pages: Math.ceil((count || events?.length || 0) / perPage),
          has_next: page * perPage < (count || events?.length || 0),
          has_prev: page > 1,
        },
        filters_applied: filters,
        total_critical: totalCritical,
        total_open: totalOpen,
      };

    } catch (error) {
      console.error('Failed to get monitoring events:', error);
      throw error;
    }
  }

  /**
   * Get system metrics and trends
   */
  async getMetrics(timeRange: { start: string; end: string }): Promise<MetricsResponse> {
    try {
      // Get monitoring events in time range
      const { data: events, error: eventsError } = await this.supabase
        .from('monitoring_events')
        .select('*')
        .gte('detection_timestamp', timeRange.start)
        .lte('detection_timestamp', timeRange.end);

      if (eventsError) {
        throw eventsError;
      }

      // Get latest system health
      const { data: healthSnapshot, error: healthError } = await this.supabase
        .from('system_health_snapshots')
        .select('*')
        .order('snapshot_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (healthError && healthError.code !== 'PGRST116') {
        console.warn('Failed to get health snapshot:', healthError);
      }

      const health = healthSnapshot || this.getDefaultHealthSnapshot();
      const eventList = events || [];

      // Calculate financial metrics
      const financialMetrics = {
        total_transaction_volume: health.total_system_balance || 0,
        failed_transaction_count: eventList.filter((e: any) => e.event_type === 'transaction_failure').length,
        balance_discrepancies_detected: eventList.filter((e: any) => e.event_type === 'balance_discrepancy').length,
        total_discrepancy_amount: eventList
          .filter((e: any) => e.event_type === 'balance_discrepancy')
          .reduce((sum: number, e: any) => sum + (e.affected_amount || 0), 0),
        financial_integrity_score: this.calculateIntegrityScore(eventList),
      };

      // Calculate performance metrics
      const performanceMetrics = {
        avg_detection_time_ms: health.avg_processing_time_ms || 0,
        monitoring_cycles_completed: 0, // Would need tracking
        monitoring_errors: eventList.filter((e: any) => e.severity === 'CRITICAL').length,
        system_uptime_percent: 99.9, // Would need real uptime tracking
      };

      // Generate trend data
      const trends = {
        hourly_transaction_counts: this.generateHourlyTrends(24),
        failure_rates: this.generateHourlyTrends(24, 0, 5),
        processing_times: this.generateHourlyTrends(24, 50, 200),
        balance_discrepancies: this.generateHourlyTrends(24, 0, 3),
      };

      return {
        time_range: timeRange,
        financial_metrics: financialMetrics,
        performance_metrics: performanceMetrics,
        trends,
      };

    } catch (error) {
      console.error('Failed to get metrics:', error);
      throw error;
    }
  }

  /**
   * Get dashboard data
   */
  async getDashboard(): Promise<DashboardResponse> {
    try {
      const [healthCheck, events, systemHealth] = await Promise.all([
        this.getHealthCheck(),
        this.getMonitoringEvents({ limit: 100 }),
        this.getSystemHealth(),
      ]);

      // Key performance indicators
      const kpis = {
        system_health: healthCheck.status,
        transaction_success_rate: healthCheck.system_metrics.success_rate_percent,
        balance_integrity_score: this.calculateIntegrityScore(events.events),
        monitoring_system_uptime: 99.9, // Would need real uptime tracking
      };

      // Real-time data
      const realTime = {
        active_transactions: 0, // Would need real-time tracking
        recent_failures: events.events.filter((e: any) => 
          e.event_type === 'transaction_failure' && 
          Date.parse(e.detection_timestamp) > Date.now() - 60000
        ).length,
        open_monitoring_events: events.total_open,
        system_load_percent: 25, // Would need real system monitoring
      };

      // Charts data
      const charts = {
        transaction_volume_24h: this.createChartData('Transaction Volume', this.generateHourlyTrends(24)),
        failure_rate_trend: this.createChartData('Failure Rate %', this.generateHourlyTrends(24, 0, 5)),
        balance_discrepancy_trend: this.createChartData('Balance Discrepancies', this.generateHourlyTrends(24, 0, 3)),
        nfc_duplicate_rate: this.createChartData('NFC Duplicate Rate %', this.generateHourlyTrends(24, 0, 2)),
      };

      // Recent events
      const recentEvents = events.events.slice(0, 10);

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
            last_activity: new Date().toISOString(),
          },
        ],
        last_successful_check: new Date().toISOString(),
        circuit_breakers: {
          'monitoring-detection': 'CLOSED' as const,
        },
      };

      return {
        kpis,
        real_time: realTime,
        charts,
        recent_events: recentEvents,
        system_status: systemStatus,
      };

    } catch (error) {
      console.error('Failed to get dashboard data:', error);
      throw error;
    }
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private getDefaultHealthSnapshot(): any {
    return {
      overall_health_status: 'HEALTHY',
      snapshot_timestamp: new Date().toISOString(),
      total_transactions_last_hour: 0,
      success_rate_percent: 100,
      avg_processing_time_ms: 0,
      total_system_balance: 0,
      monitoring_events_last_hour: 0,
      critical_events_last_hour: 0,
    };
  }

  private createComponentHealth(status: 'UP' | 'DOWN' | 'DEGRADED'): ComponentHealth {
    return {
      status,
      last_check: new Date().toISOString(),
      response_time_ms: Math.floor(Math.random() * 100) + 10,
      circuit_breaker_state: 'CLOSED',
    };
  }

  private calculateIntegrityScore(events: any[]): number {
    const criticalEvents = events.filter((e: any) => e.severity === 'CRITICAL').length;
    const totalEvents = events.length;
    
    if (totalEvents === 0) return 100;
    
    const score = Math.max(0, 100 - (criticalEvents / totalEvents) * 100);
    return Math.round(score * 100) / 100;
  }

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
          generated: true,
        },
      });
    }

    return trends;
  }

  private createChartData(label: string, dataPoints: TimeSeriesDataPoint[]): ChartData {
    return {
      labels: dataPoints.map((point) => 
        new Date(point.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      ),
      datasets: [{
        label,
        data: dataPoints.map((point) => point.value),
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        metadata: {
          generated: true,
          timestamp: new Date().toISOString(),
        },
      }],
    };
  }

  private async getSystemHealth(): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('system_health_snapshots')
        .select('*')
        .order('snapshot_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || this.getDefaultHealthSnapshot();
    } catch (error) {
      console.error('Error getting system health:', error);
      return this.getDefaultHealthSnapshot();
    }
  }
}

// =====================================================
// REQUEST HANDLERS
// =====================================================

const apiService = new MonitoringAPIService();

/**
 * Handle health check requests
 */
async function handleHealthCheck(): Promise<Response> {
  try {
    const healthCheck = await apiService.getHealthCheck();
    
    return new Response(JSON.stringify(healthCheck), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Health check handler error:', error);
    
    return new Response(JSON.stringify({
      status: 'CRITICAL',
      error: error.message,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

/**
 * Handle monitoring events requests
 */
async function handleEvents(url: URL): Promise<Response> {
  try {
    const filters = {
      event_type: url.searchParams.get('event_type'),
      severity: url.searchParams.get('severity'),
      status: url.searchParams.get('status'),
      card_id: url.searchParams.get('card_id'),
      start_date: url.searchParams.get('start_date'),
      end_date: url.searchParams.get('end_date'),
      page: url.searchParams.get('page'),
      per_page: url.searchParams.get('per_page'),
    };

    const result = await apiService.getMonitoringEvents(filters);
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Events handler error:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

/**
 * Handle metrics requests
 */
async function handleMetrics(url: URL): Promise<Response> {
  try {
    const start = url.searchParams.get('start') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end = url.searchParams.get('end') || new Date().toISOString();

    const metrics = await apiService.getMetrics({ start, end });
    
    return new Response(JSON.stringify(metrics), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Metrics handler error:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

/**
 * Handle dashboard requests
 */
async function handleDashboard(): Promise<Response> {
  try {
    const dashboard = await apiService.getDashboard();
    
    return new Response(JSON.stringify(dashboard), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Dashboard handler error:', error);
    
    return new Response(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

// =====================================================
// MAIN HANDLER
// =====================================================

serve(async (req) => {
  const url = new URL(req.url);
  const method = req.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Handle preflight requests
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Route requests
    switch (url.pathname) {
      case '/health':
        if (method === 'GET') {
          const response = await handleHealthCheck();
          Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
          return response;
        }
        break;

      case '/events':
        if (method === 'GET') {
          const response = await handleEvents(url);
          Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
          return response;
        }
        break;

      case '/metrics':
        if (method === 'GET') {
          const response = await handleMetrics(url);
          Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
          return response;
        }
        break;

      case '/dashboard':
        if (method === 'GET') {
          const response = await handleDashboard();
          Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
          return response;
        }
        break;

      default:
        return new Response(JSON.stringify({
          error: 'Not Found',
          message: 'Endpoint not found',
          available_endpoints: [
            'GET /health - Get system health status',
            'GET /events - Get monitoring events',
            'GET /metrics - Get system metrics and trends',
            'GET /dashboard - Get dashboard data',
          ],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
    }

    // Method not allowed
    return new Response(JSON.stringify({
      error: 'Method Not Allowed',
      message: `Method ${method} not allowed for ${url.pathname}`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });

  } catch (error) {
    console.error('Request handler error:', error);
    
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

console.log('Phase 4 Monitoring API Edge Function started successfully');