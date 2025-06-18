/**
 * Phase 4 Monitoring System - Monitoring Dashboard Component
 * 
 * This component provides a comprehensive monitoring dashboard with real-time
 * system health overview, recent events, metrics visualization, and key performance indicators.
 * 
 * @version 1.0.0
 * @author Phase 4 Implementation Team
 * @date 2025-06-15
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Shield, 
  Zap, 
  Database, 
  Server, 
  Eye,
  AlertCircle,
  Info,
  Settings
} from "lucide-react";
import { 
  useDashboard, 
  useHealthCheck, 
  useMonitoringEvents, 
  useRealTimeEvents,
  useMonitoringStatus
} from '@/hooks/use-monitoring';
import { MonitoringEvent } from './MonitoringEvent';
import { SystemHealthStatus, MonitoringSeverity, MonitoringEventStatus } from '@/types/monitoring';
import { toast } from "@/hooks/use-toast";

// =====================================================
// COMPONENT INTERFACES
// =====================================================

interface MonitoringDashboardProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  status?: 'healthy' | 'warning' | 'critical';
  loading?: boolean;
}

interface SystemStatusIndicatorProps {
  status: SystemHealthStatus;
  uptime: number;
  lastCheck: string;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Get status color based on health status
 */
function getStatusColor(status: SystemHealthStatus): string {
  switch (status) {
    case SystemHealthStatus.HEALTHY:
      return 'text-green-600';
    case SystemHealthStatus.WARNING:
      return 'text-yellow-600';
    case SystemHealthStatus.CRITICAL:
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Get status background color
 */
function getStatusBgColor(status: SystemHealthStatus): string {
  switch (status) {
    case SystemHealthStatus.HEALTHY:
      return 'bg-green-50 border-green-200';
    case SystemHealthStatus.WARNING:
      return 'bg-yellow-50 border-yellow-200';
    case SystemHealthStatus.CRITICAL:
      return 'bg-red-50 border-red-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

// =====================================================
// SUB-COMPONENTS
// =====================================================

/**
 * KPI Card component
 */
function KPICard({ title, value, change, icon: Icon, status = 'healthy', loading }: KPICardProps) {
  const statusColors = {
    healthy: 'text-green-600',
    warning: 'text-yellow-600',
    critical: 'text-red-600'
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${statusColors[status]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className={`text-xs flex items-center mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
            {Math.abs(change).toFixed(1)}% from last hour
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * System Status Indicator component
 */
function SystemStatusIndicator({ status, uptime, lastCheck }: SystemStatusIndicatorProps) {
  const statusConfig = {
    [SystemHealthStatus.HEALTHY]: {
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'System Healthy'
    },
    [SystemHealthStatus.WARNING]: {
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'System Warning'
    },
    [SystemHealthStatus.CRITICAL]: {
      icon: AlertCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'System Critical'
    },
    [SystemHealthStatus.UNKNOWN]: {
      icon: Info,
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'Status Unknown'
    }
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card className={`${config.bg} ${config.border}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon className={`h-6 w-6 ${config.color}`} />
            <div>
              <div className="font-semibold">{config.text}</div>
              <div className="text-sm text-gray-600">
                Uptime: {formatUptime(uptime)}
              </div>
            </div>
          </div>
          <div className="text-right text-sm text-gray-500">
            <div>Last Check</div>
            <div>{new Date(lastCheck).toLocaleTimeString()}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Real-time Events Feed component
 */
function RealTimeEventsFeed() {
  const { events, isConnected, connect, disconnect } = useRealTimeEvents({
    maxEvents: 10,
    onNewEvent: (event) => {
      if (event.severity === MonitoringSeverity.CRITICAL) {
        toast({
          title: "Critical Event Detected",
          description: `${event.event_type} for card ${event.card_id || 'SYSTEM'}`,
          variant: "destructive"
        });
      }
    }
  });

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Real-time Events</CardTitle>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-600">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-center text-gray-500 py-4">
              No recent events
            </div>
          ) : (
            events.map((event) => (
              <MonitoringEvent
                key={event.event_id}
                event={event}
                compact={true}
                showActions={false}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================

/**
 * MonitoringDashboard component
 */
export function MonitoringDashboard({ 
  className = '', 
  autoRefresh = true, 
  refreshInterval = 30000 
}: MonitoringDashboardProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [activeTab, setActiveTab] = useState('overview');

  // Hooks for data fetching
  const { 
    dashboardData, 
    loading: dashboardLoading, 
    error: dashboardError, 
    refresh: refreshDashboard,
    kpis,
    realTimeData,
    charts
  } = useDashboard(autoRefresh, refreshInterval);

  const { 
    healthData, 
    loading: healthLoading, 
    error: healthError,
    isHealthy,
    criticalAlerts
  } = useHealthCheck(autoRefresh, 60000); // Health check every minute

  const { 
    events: recentEvents, 
    loading: eventsLoading,
    totalCritical,
    totalOpen,
    refresh: refreshEvents
  } = useMonitoringEvents({
    pagination: { page: 1, per_page: 10 },
    autoRefresh: false
  });

  const { overallStatus } = useMonitoringStatus();

  // Manual refresh function
  const handleRefresh = async () => {
    try {
      await Promise.all([
        refreshDashboard(),
        refreshEvents()
      ]);
      toast({
        title: "Dashboard Refreshed",
        description: "All monitoring data has been updated"
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh dashboard data",
        variant: "destructive"
      });
    }
  };

  // Error handling
  if (dashboardError || healthError) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load monitoring dashboard: {dashboardError || healthError}
          </AlertDescription>
        </Alert>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const loading = dashboardLoading || healthLoading;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Monitoring Dashboard</h2>
          <p className="text-gray-600">Real-time system monitoring and event tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Status */}
      {healthData && (
        <SystemStatusIndicator
          status={healthData.status}
          uptime={healthData.uptime_seconds}
          lastCheck={healthData.timestamp}
        />
      )}

      {/* Key Performance Indicators */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="System Health"
          value={kpis?.system_health || 'Unknown'}
          icon={isHealthy ? CheckCircle : AlertTriangle}
          status={isHealthy ? 'healthy' : 'critical'}
          loading={loading}
        />
        <KPICard
          title="Success Rate"
          value={kpis ? `${kpis.transaction_success_rate.toFixed(1)}%` : '0%'}
          icon={TrendingUp}
          status={kpis && kpis.transaction_success_rate > 95 ? 'healthy' : 'warning'}
          loading={loading}
        />
        <KPICard
          title="Integrity Score"
          value={kpis ? `${kpis.balance_integrity_score.toFixed(1)}%` : '0%'}
          icon={Shield}
          status={kpis && kpis.balance_integrity_score > 98 ? 'healthy' : 'warning'}
          loading={loading}
        />
        <KPICard
          title="System Uptime"
          value={kpis ? `${kpis.monitoring_system_uptime.toFixed(1)}%` : '0%'}
          icon={Server}
          status={kpis && kpis.monitoring_system_uptime > 99 ? 'healthy' : 'warning'}
          loading={loading}
        />
      </div>

      {/* Real-time Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{realTimeData?.active_transactions || 0}</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Failures</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-red-600">{realTimeData?.recent_failures || 0}</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Events</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-orange-600">{totalOpen}</div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Critical Events</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-red-600">{totalCritical}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="realtime">Real-time</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Transaction Volume Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Transaction Volume (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  {loading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={charts?.transaction_volume_24h?.datasets[0]?.data?.map((value, index) => ({
                        time: charts?.transaction_volume_24h?.labels[index],
                        value
                      })) || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Failure Rate Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Failure Rate Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  {loading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={charts?.failure_rate_trend?.datasets[0]?.data?.map((value, index) => ({
                        time: charts?.failure_rate_trend?.labels[index],
                        value
                      })) || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value}%`, 'Failure Rate']} />
                        <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Monitoring Events</CardTitle>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : recentEvents.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No monitoring events found
                </div>
              ) : (
                <div className="space-y-4">
                  {recentEvents.map((event) => (
                    <MonitoringEvent
                      key={event.event_id}
                      event={event}
                      onResolve={(eventId, notes) => {
                        console.log('Resolve event:', eventId, notes);
                        // Implement resolve logic
                      }}
                      onDismiss={(eventId, notes) => {
                        console.log('Dismiss event:', eventId, notes);
                        // Implement dismiss logic
                      }}
                      onInvestigate={(eventId) => {
                        console.log('Investigate event:', eventId);
                        // Implement investigate logic
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Balance Discrepancy Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Balance Discrepancies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  {loading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts?.balance_discrepancy_trend?.datasets[0]?.data?.map((value, index) => ({
                        time: charts?.balance_discrepancy_trend?.labels[index],
                        value
                      })) || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* NFC Duplicate Rate */}
            <Card>
              <CardHeader>
                <CardTitle>NFC Duplicate Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  {loading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={charts?.nfc_duplicate_rate?.datasets[0]?.data?.map((value, index) => ({
                        time: charts?.nfc_duplicate_rate?.labels[index],
                        value
                      })) || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value}%`, 'Duplicate Rate']} />
                        <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="realtime" className="space-y-4">
          <RealTimeEventsFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MonitoringDashboard;