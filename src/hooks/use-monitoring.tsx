/**
 * Phase 4 Monitoring System - React Hook
 * 
 * This hook provides React components with access to monitoring data,
 * real-time updates, and state management for the monitoring system.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-15
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { monitoringClient } from '@/lib/monitoring/monitoring-client';
import {
  MonitoringEvent,
  MonitoringEventsFilters,
  MonitoringEventsResponse,
  PaginationParams,
  HealthCheckResponse,
  DashboardResponse,
  MetricsResponse,
  SystemHealthStatus,
  MonitoringEventType,
  MonitoringSeverity,
  MonitoringEventStatus
} from '@/types/monitoring';

// =====================================================
// HOOK INTERFACES
// =====================================================

interface UseMonitoringEventsOptions {
  filters?: MonitoringEventsFilters;
  pagination?: PaginationParams;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseMonitoringEventsResult {
  events: MonitoringEvent[];
  loading: boolean;
  error: string | null;
  pagination: MonitoringEventsResponse['pagination'] | null;
  totalCritical: number;
  totalOpen: number;
  refresh: () => Promise<void>;
  updateFilters: (filters: MonitoringEventsFilters) => void;
  updatePagination: (pagination: PaginationParams) => void;
}

interface UseHealthCheckResult {
  healthData: HealthCheckResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isHealthy: boolean;
  criticalAlerts: number;
}

interface UseDashboardResult {
  dashboardData: DashboardResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  kpis: DashboardResponse['kpis'] | null;
  realTimeData: DashboardResponse['real_time'] | null;
  charts: DashboardResponse['charts'] | null;
  recentEvents: MonitoringEvent[];
}

interface UseRealTimeEventsOptions {
  filters?: MonitoringEventsFilters;
  onNewEvent?: (event: MonitoringEvent) => void;
  maxEvents?: number;
}

interface UseRealTimeEventsResult {
  events: MonitoringEvent[];
  isConnected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

// =====================================================
// MONITORING EVENTS HOOK
// =====================================================

/**
 * Hook for managing monitoring events with filtering, pagination, and auto-refresh
 */
export function useMonitoringEvents(options: UseMonitoringEventsOptions = {}): UseMonitoringEventsResult {
  const {
    filters = {},
    pagination = { page: 1, per_page: 50 },
    autoRefresh = false,
    refreshInterval = 30000 // 30 seconds
  } = options;

  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paginationData, setPaginationData] = useState<MonitoringEventsResponse['pagination'] | null>(null);
  const [totalCritical, setTotalCritical] = useState(0);
  const [totalOpen, setTotalOpen] = useState(0);
  const [currentFilters, setCurrentFilters] = useState(filters);
  const [currentPagination, setCurrentPagination] = useState(pagination);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await monitoringClient.getMonitoringEvents(
        currentFilters,
        currentPagination
      );

      setEvents(response.events);
      setPaginationData(response.pagination);
      setTotalCritical(response.total_critical);
      setTotalOpen(response.total_open);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch monitoring events';
      setError(errorMessage);
      console.error('Error fetching monitoring events:', err);
    } finally {
      setLoading(false);
    }
  }, [currentFilters, currentPagination]);

  const refresh = useCallback(async () => {
    await fetchEvents();
  }, [fetchEvents]);

  const updateFilters = useCallback((newFilters: MonitoringEventsFilters) => {
    setCurrentFilters(newFilters);
    setCurrentPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  const updatePagination = useCallback((newPagination: PaginationParams) => {
    setCurrentPagination(prev => ({ ...prev, ...newPagination }));
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh setup
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(fetchEvents, refreshInterval);
      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, refreshInterval, fetchEvents]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  return {
    events,
    loading,
    error,
    pagination: paginationData,
    totalCritical,
    totalOpen,
    refresh,
    updateFilters,
    updatePagination
  };
}

// =====================================================
// HEALTH CHECK HOOK
// =====================================================

/**
 * Hook for monitoring system health status
 */
export function useHealthCheck(autoRefresh = true, refreshInterval = 60000): UseHealthCheckResult {
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHealthCheck = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await monitoringClient.getHealthCheck();
      setHealthData(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch health check';
      setError(errorMessage);
      console.error('Error fetching health check:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchHealthCheck();
  }, [fetchHealthCheck]);

  // Initial fetch
  useEffect(() => {
    fetchHealthCheck();
  }, [fetchHealthCheck]);

  // Auto-refresh setup
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(fetchHealthCheck, refreshInterval);
      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, refreshInterval, fetchHealthCheck]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  const isHealthy = healthData?.status === SystemHealthStatus.HEALTHY;
  const criticalAlerts = healthData?.recent_alerts?.filter(alert => alert.alert_level === 'CRITICAL').length || 0;

  return {
    healthData,
    loading,
    error,
    refresh,
    isHealthy,
    criticalAlerts
  };
}

// =====================================================
// DASHBOARD HOOK
// =====================================================

/**
 * Hook for dashboard data with comprehensive monitoring metrics
 */
export function useDashboard(autoRefresh = true, refreshInterval = 30000): UseDashboardResult {
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await monitoringClient.getDashboard();
      setDashboardData(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
      setError(errorMessage);
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchDashboard();
  }, [fetchDashboard]);

  // Initial fetch
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-refresh setup
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(fetchDashboard, refreshInterval);
      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, refreshInterval, fetchDashboard]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  return {
    dashboardData,
    loading,
    error,
    refresh,
    kpis: dashboardData?.kpis || null,
    realTimeData: dashboardData?.real_time || null,
    charts: dashboardData?.charts || null,
    recentEvents: dashboardData?.recent_events || []
  };
}

// =====================================================
// REAL-TIME EVENTS HOOK
// =====================================================

/**
 * Hook for real-time monitoring events subscription
 */
export function useRealTimeEvents(options: UseRealTimeEventsOptions = {}): UseRealTimeEventsResult {
  const {
    filters = {},
    onNewEvent,
    maxEvents = 100
  } = options;

  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (isConnected) return;

    try {
      setError(null);
      
      const unsubscribe = monitoringClient.subscribeToEvents(
        (event: MonitoringEvent) => {
          setEvents(prevEvents => {
            const newEvents = [event, ...prevEvents].slice(0, maxEvents);
            return newEvents;
          });

          if (onNewEvent) {
            onNewEvent(event);
          }
        },
        filters
      );

      unsubscribeRef.current = unsubscribe;
      setIsConnected(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to real-time events';
      setError(errorMessage);
      console.error('Error connecting to real-time events:', err);
    }
  }, [isConnected, filters, onNewEvent, maxEvents]);

  const disconnect = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    events,
    isConnected,
    error,
    connect,
    disconnect
  };
}

// =====================================================
// UTILITY HOOKS
// =====================================================

/**
 * Hook for monitoring metrics with time range support
 */
export function useMonitoringMetrics(timeRange: { start: string; end: string }) {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await monitoringClient.getMetrics(timeRange);
      setMetrics(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch metrics';
      setError(errorMessage);
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    metrics,
    loading,
    error,
    refresh: fetchMetrics
  };
}

/**
 * Hook for filtering and sorting monitoring events
 */
export function useEventFilters() {
  const [filters, setFilters] = useState<MonitoringEventsFilters>({});
  const [sortBy, setSortBy] = useState<keyof MonitoringEvent>('detection_timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const updateFilter = useCallback((key: keyof MonitoringEventsFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const toggleSort = useCallback((field: keyof MonitoringEvent) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }, [sortBy]);

  return {
    filters,
    sortBy,
    sortOrder,
    updateFilter,
    clearFilters,
    toggleSort,
    setFilters
  };
}

/**
 * Hook for monitoring system status indicators
 */
export function useMonitoringStatus() {
  const { healthData, loading: healthLoading } = useHealthCheck();
  const { dashboardData, loading: dashboardLoading } = useDashboard();

  const isSystemHealthy = healthData?.status === SystemHealthStatus.HEALTHY;
  const hasActiveAlerts = (healthData?.recent_alerts?.length || 0) > 0;
  const criticalEventsCount = dashboardData?.real_time?.open_monitoring_events || 0;
  const systemUptime = dashboardData?.kpis?.monitoring_system_uptime || 0;

  const overallStatus = isSystemHealthy && !hasActiveAlerts ? 'healthy' : 
                       hasActiveAlerts ? 'warning' : 'critical';

  return {
    overallStatus,
    isSystemHealthy,
    hasActiveAlerts,
    criticalEventsCount,
    systemUptime,
    loading: healthLoading || dashboardLoading,
    healthData,
    dashboardData
  };
}