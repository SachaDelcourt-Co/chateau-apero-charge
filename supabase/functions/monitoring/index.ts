/**
 * Phase 4 Monitoring System - Main Edge Function
 * 
 * This Edge Function serves as the main orchestration point for all monitoring activities.
 * It implements the circuit breaker pattern for fault tolerance, handles background 
 * processing scheduling, and provides API endpoints for monitoring data access.
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

interface MonitoringDetectionCycleResult {
  cycle_timestamp: string;
  cycle_duration_seconds: number;
  total_events_created: number;
  health_snapshot_id: number | null;
  detection_results: {
    transaction_failures: any;
    balance_discrepancies: any;
    duplicate_nfc_scans: any;
    race_conditions: any;
  };
  success: boolean;
  errors?: string[];
}

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failure_count: number;
  last_failure_time: number;
  half_open_calls: number;
}

interface MonitoringConfig {
  intervals: {
    critical_checks: number;
    medium_checks: number;
    health_checks: number;
    cleanup: number;
  };
  circuit_breaker: {
    failure_threshold: number;
    recovery_timeout_ms: number;
    half_open_max_calls: number;
    timeout_ms: number;
  };
}

// =====================================================
// CONFIGURATION
// =====================================================

const MONITORING_CONFIG: MonitoringConfig = {
  intervals: {
    critical_checks: 30000,      // 30 seconds
    medium_checks: 120000,       // 2 minutes
    health_checks: 300000,       // 5 minutes
    cleanup: 3600000,            // 1 hour
  },
  circuit_breaker: {
    failure_threshold: 5,
    recovery_timeout_ms: 60000,
    half_open_max_calls: 2,
    timeout_ms: 30000,
  },
};

// =====================================================
// CIRCUIT BREAKER IMPLEMENTATION
// =====================================================

class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: 'CLOSED',
    failure_count: 0,
    last_failure_time: 0,
    half_open_calls: 0,
  };

  constructor(private config: MonitoringConfig['circuit_breaker']) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (Date.now() - this.state.last_failure_time > this.config.recovery_timeout_ms) {
        this.state.state = 'HALF_OPEN';
        this.state.half_open_calls = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - operation blocked');
      }
    }

    if (this.state.state === 'HALF_OPEN') {
      if (this.state.half_open_calls >= this.config.half_open_max_calls) {
        throw new Error('Circuit breaker HALF_OPEN - max calls exceeded');
      }
      this.state.half_open_calls++;
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout_ms)
        ),
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.state.failure_count = 0;
    this.state.state = 'CLOSED';
    this.state.half_open_calls = 0;
  }

  private onFailure(): void {
    this.state.failure_count++;
    this.state.last_failure_time = Date.now();

    if (this.state.failure_count >= this.config.failure_threshold) {
      this.state.state = 'OPEN';
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

// =====================================================
// MONITORING SERVICE
// =====================================================

class MonitoringService {
  private supabase: any;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.circuitBreaker = new CircuitBreaker(MONITORING_CONFIG.circuit_breaker);
  }

  /**
   * Run a complete monitoring detection cycle
   */
  async runDetectionCycle(): Promise<MonitoringDetectionCycleResult> {
    return await this.circuitBreaker.execute(async () => {
      const startTime = Date.now();
      const cycleTimestamp = new Date().toISOString();

      try {
        console.log('Starting monitoring detection cycle...');

        // Run all detection algorithms using database functions
        const [
          transactionResult,
          balanceResult,
          nfcResult,
          raceResult,
        ] = await Promise.allSettled([
          this.executeDetectionFunction('detect_transaction_failures'),
          this.executeDetectionFunction('detect_balance_discrepancies'),
          this.executeDetectionFunction('detect_duplicate_nfc_scans'),
          this.executeDetectionFunction('detect_race_conditions'),
        ]);

        // Process results
        const detectionResults = {
          transaction_failures: this.processResult(transactionResult, 'transaction_failures'),
          balance_discrepancies: this.processResult(balanceResult, 'balance_discrepancies'),
          duplicate_nfc_scans: this.processResult(nfcResult, 'duplicate_nfc_scans'),
          race_conditions: this.processResult(raceResult, 'race_conditions'),
        };

        // Calculate total events created
        const totalEvents = Object.values(detectionResults).reduce(
          (sum, result) => sum + (result.events_created || 0),
          0
        );

        // Create system health snapshot
        const healthSnapshotId = await this.createHealthSnapshot();

        const cycleDuration = (Date.now() - startTime) / 1000;

        console.log(`Detection cycle completed in ${cycleDuration}s, created ${totalEvents} events`);

        return {
          cycle_timestamp: cycleTimestamp,
          cycle_duration_seconds: cycleDuration,
          total_events_created: totalEvents,
          health_snapshot_id: healthSnapshotId,
          detection_results: detectionResults,
          success: true,
        };

      } catch (error) {
        console.error('Detection cycle failed:', error);
        
        return {
          cycle_timestamp: cycleTimestamp,
          cycle_duration_seconds: (Date.now() - startTime) / 1000,
          total_events_created: 0,
          health_snapshot_id: null,
          detection_results: {
            transaction_failures: { error: error.message, events_created: 0 },
            balance_discrepancies: { error: error.message, events_created: 0 },
            duplicate_nfc_scans: { error: error.message, events_created: 0 },
            race_conditions: { error: error.message, events_created: 0 },
          },
          success: false,
          errors: [error.message],
        };
      }
    });
  }

  /**
   * Execute a detection function
   */
  private async executeDetectionFunction(functionName: string): Promise<any> {
    try {
      const { data, error } = await this.supabase.rpc(functionName);

      if (error) {
        throw new Error(`${functionName} failed: ${error.message}`);
      }

      return data || { events_created: 0, success: true };
    } catch (error) {
      console.error(`Error executing ${functionName}:`, error);
      throw error;
    }
  }

  /**
   * Create system health snapshot
   */
  private async createHealthSnapshot(): Promise<number | null> {
    try {
      const { data, error } = await this.supabase.rpc('update_system_health_snapshot');

      if (error) {
        console.error('Failed to create health snapshot:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating health snapshot:', error);
      return null;
    }
  }

  /**
   * Process detection result from Promise.allSettled
   */
  private processResult(result: PromiseSettledResult<any>, detectionType: string): any {
    if (result.status === 'fulfilled') {
      return {
        detection_type: detectionType,
        events_created: result.value?.events_created || 0,
        detection_timestamp: new Date().toISOString(),
        success: true,
        ...result.value,
      };
    } else {
      return {
        detection_type: detectionType,
        events_created: 0,
        detection_timestamp: new Date().toISOString(),
        success: false,
        error: result.reason?.message || String(result.reason),
      };
    }
  }

  /**
   * Get system health information
   */
  async getSystemHealth(): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('system_health_snapshots')
        .select('*')
        .order('snapshot_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return data || {
        overall_health_status: 'UNKNOWN',
        snapshot_timestamp: new Date().toISOString(),
        total_transactions_last_hour: 0,
        success_rate_percent: 100,
        monitoring_events_last_hour: 0,
        critical_events_last_hour: 0,
      };
    } catch (error) {
      console.error('Error getting system health:', error);
      return null;
    }
  }

  /**
   * Get monitoring events
   */
  async getMonitoringEvents(filters: any = {}): Promise<any[]> {
    try {
      let query = this.supabase
        .from('monitoring_events')
        .select('*')
        .order('detection_timestamp', { ascending: false });

      if (filters.event_type) {
        query = query.eq('event_type', filters.event_type);
      }

      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error getting monitoring events:', error);
      return [];
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): any {
    const state = this.circuitBreaker.getState();
    return {
      state: state.state,
      failure_count: state.failure_count,
      last_failure_time: state.last_failure_time ? new Date(state.last_failure_time).toISOString() : null,
      half_open_calls: state.half_open_calls,
      config: MONITORING_CONFIG.circuit_breaker,
    };
  }
}

// =====================================================
// REQUEST HANDLERS
// =====================================================

const monitoringService = new MonitoringService();

/**
 * Handle monitoring cycle execution
 */
async function handleMonitoringCycle(): Promise<Response> {
  try {
    const result = await monitoringService.runDetectionCycle();
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error('Monitoring cycle handler error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}

/**
 * Handle health check requests
 */
async function handleHealthCheck(): Promise<Response> {
  try {
    const [systemHealth, circuitBreakerStatus] = await Promise.all([
      monitoringService.getSystemHealth(),
      monitoringService.getCircuitBreakerStatus(),
    ]);

    const healthResponse = {
      status: systemHealth?.overall_health_status || 'UNKNOWN',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - Date.parse(systemHealth?.snapshot_timestamp || new Date().toISOString())) / 1000),
      system_metrics: {
        transactions_last_hour: systemHealth?.total_transactions_last_hour || 0,
        success_rate_percent: systemHealth?.success_rate_percent || 100,
        monitoring_events_last_hour: systemHealth?.monitoring_events_last_hour || 0,
        critical_events_last_hour: systemHealth?.critical_events_last_hour || 0,
      },
      circuit_breaker: circuitBreakerStatus,
    };

    return new Response(JSON.stringify(healthResponse), {
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
async function handleMonitoringEvents(url: URL): Promise<Response> {
  try {
    const filters = {
      event_type: url.searchParams.get('event_type'),
      severity: url.searchParams.get('severity'),
      status: url.searchParams.get('status'),
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 50,
    };

    const events = await monitoringService.getMonitoringEvents(filters);

    return new Response(JSON.stringify({
      events,
      total: events.length,
      filters_applied: filters,
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Monitoring events handler error:', error);
    
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
 * Handle status requests
 */
async function handleStatus(): Promise<Response> {
  try {
    const status = {
      service: 'Phase 4 Monitoring System',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: Deno.env.get('ENVIRONMENT') || 'development',
      circuit_breaker: monitoringService.getCircuitBreakerStatus(),
      config: {
        intervals: MONITORING_CONFIG.intervals,
        circuit_breaker: MONITORING_CONFIG.circuit_breaker,
      },
    };

    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Status handler error:', error);
    
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle preflight requests
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Route requests
    switch (url.pathname) {
      case '/':
      case '/cycle':
        if (method === 'POST') {
          const response = await handleMonitoringCycle();
          Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
          return response;
        }
        break;

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
          const response = await handleMonitoringEvents(url);
          Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
          return response;
        }
        break;

      case '/status':
        if (method === 'GET') {
          const response = await handleStatus();
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
            'POST /cycle - Run monitoring detection cycle',
            'GET /health - Get system health status',
            'GET /events - Get monitoring events',
            'GET /status - Get service status',
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

console.log('Phase 4 Monitoring Edge Function started successfully');