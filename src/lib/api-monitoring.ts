/**
 * Comprehensive API Monitoring and Logging System
 * 
 * This module provides real-time monitoring, logging, and alerting capabilities
 * for API endpoints, security events, and system performance metrics.
 * 
 * Features:
 * - Real-time API request/response monitoring
 * - Performance metrics collection and analysis
 * - Security event detection and alerting
 * - Rate limiting monitoring and enforcement
 * - Error tracking and analysis
 * - Health check and uptime monitoring
 * - Custom metrics and dashboards
 * - Log aggregation and search
 * - Automated alerting and notifications
 * - Compliance and audit trail logging
 */

import { logger } from './logger';
import { auditLogger, RiskLevel, AuditResult } from './audit-logger';
import { SecurityUtils } from '../config/security';

// Monitoring event types
export enum MonitoringEventType {
  API_REQUEST = 'api_request',
  API_RESPONSE = 'api_response',
  SECURITY_VIOLATION = 'security_violation',
  PERFORMANCE_ALERT = 'performance_alert',
  ERROR_OCCURRED = 'error_occurred',
  RATE_LIMIT_HIT = 'rate_limit_hit',
  HEALTH_CHECK = 'health_check',
  SYSTEM_METRIC = 'system_metric',
}

// Monitoring event interface
export interface MonitoringEvent {
  id: string;
  timestamp: number;
  type: MonitoringEventType;
  source: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: Record<string, any>;
  tags: string[];
  requestId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// API metrics interface
export interface ApiMetrics {
  endpoint: string;
  method: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  lastRequestTime: number;
  errorRate: number;
  rateLimit: {
    current: number;
    limit: number;
    resetTime: number;
  };
  statusCodes: Record<number, number>;
}

// Performance metrics interface
export interface PerformanceMetrics {
  timestamp: number;
  cpuUsage?: number;
  memoryUsage?: number;
  activeConnections: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  uptime: number;
}

// Alert rule interface
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  condition: (event: MonitoringEvent, metrics: ApiMetrics) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldown: number; // milliseconds
  actions: AlertAction[];
}

// Alert action interface
export interface AlertAction {
  type: 'log' | 'email' | 'webhook' | 'slack' | 'sms';
  config: Record<string, any>;
}

// Health check result interface
export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  message?: string;
  details?: Record<string, any>;
}

/**
 * Comprehensive API Monitoring System
 */
export class ApiMonitoringSystem {
  private events: MonitoringEvent[] = [];
  private metrics: Map<string, ApiMetrics> = new Map();
  private performanceHistory: PerformanceMetrics[] = [];
  private alertRules: AlertRule[] = [];
  private alertCooldowns: Map<string, number> = new Map();
  private healthChecks: Map<string, HealthCheckResult> = new Map();
  private startTime: number = Date.now();

  constructor() {
    this.initializeDefaultAlertRules();
    this.startPerformanceCollection();
    this.startCleanupTasks();
  }

  /**
   * Log API request
   */
  async logApiRequest(params: {
    requestId: string;
    method: string;
    endpoint: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    requestSize?: number;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: any;
  }): Promise<void> {
    const { requestId, method, endpoint, userId, ipAddress, userAgent, requestSize, headers, query, body } = params;
    
    const event: MonitoringEvent = {
      id: SecurityUtils.generateRequestId(),
      timestamp: Date.now(),
      type: MonitoringEventType.API_REQUEST,
      source: 'api_gateway',
      severity: 'low',
      message: `API request: ${method} ${endpoint}`,
      data: {
        method,
        endpoint,
        requestSize,
        headers: this.sanitizeHeaders(headers),
        query,
        bodySize: body ? JSON.stringify(body).length : 0,
      },
      tags: ['api', 'request', method.toLowerCase()],
      requestId,
      userId,
      ipAddress,
      userAgent,
    };

    await this.recordEvent(event);
    this.updateApiMetrics(endpoint, method, 'request');
  }

  /**
   * Log API response
   */
  async logApiResponse(params: {
    requestId: string;
    method: string;
    endpoint: string;
    statusCode: number;
    responseTime: number;
    responseSize?: number;
    userId?: string;
    ipAddress?: string;
    error?: any;
  }): Promise<void> {
    const { requestId, method, endpoint, statusCode, responseTime, responseSize, userId, ipAddress, error } = params;
    
    const severity = statusCode >= 500 ? 'high' : 
                    statusCode >= 400 ? 'medium' : 
                    responseTime > 5000 ? 'medium' : 'low';

    const event: MonitoringEvent = {
      id: SecurityUtils.generateRequestId(),
      timestamp: Date.now(),
      type: MonitoringEventType.API_RESPONSE,
      source: 'api_gateway',
      severity,
      message: `API response: ${method} ${endpoint} - ${statusCode} (${responseTime}ms)`,
      data: {
        method,
        endpoint,
        statusCode,
        responseTime,
        responseSize,
        error: error ? {
          message: error.message,
          code: error.code,
        } : undefined,
      },
      tags: ['api', 'response', method.toLowerCase(), `status_${statusCode}`],
      requestId,
      userId,
      ipAddress,
    };

    await this.recordEvent(event);
    this.updateApiMetrics(endpoint, method, 'response', statusCode, responseTime);

    // Check for performance alerts
    if (responseTime > 10000) { // 10 seconds
      await this.triggerPerformanceAlert(endpoint, method, responseTime, 'slow_response');
    }

    if (statusCode >= 500) {
      await this.triggerErrorAlert(endpoint, method, statusCode, error);
    }
  }

  /**
   * Log security violation
   */
  async logSecurityViolation(params: {
    requestId: string;
    violationType: string;
    description: string;
    severity: RiskLevel;
    endpoint?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { requestId, violationType, description, severity, endpoint, userId, ipAddress, userAgent, metadata } = params;
    
    const event: MonitoringEvent = {
      id: SecurityUtils.generateRequestId(),
      timestamp: Date.now(),
      type: MonitoringEventType.SECURITY_VIOLATION,
      source: 'security_middleware',
      severity: severity === RiskLevel.CRITICAL ? 'critical' :
               severity === RiskLevel.HIGH ? 'high' :
               severity === RiskLevel.MEDIUM ? 'medium' : 'low',
      message: `Security violation: ${violationType} - ${description}`,
      data: {
        violationType,
        description,
        endpoint,
        metadata,
      },
      tags: ['security', 'violation', violationType],
      requestId,
      userId,
      ipAddress,
      userAgent,
    };

    await this.recordEvent(event);

    // Trigger immediate alert for critical security violations
    if (severity === RiskLevel.CRITICAL) {
      await this.triggerSecurityAlert(violationType, description, ipAddress, userAgent);
    }
  }

  /**
   * Log rate limit hit
   */
  async logRateLimitHit(params: {
    requestId: string;
    endpoint: string;
    method: string;
    limit: number;
    current: number;
    resetTime: number;
    userId?: string;
    ipAddress?: string;
  }): Promise<void> {
    const { requestId, endpoint, method, limit, current, resetTime, userId, ipAddress } = params;
    
    const event: MonitoringEvent = {
      id: SecurityUtils.generateRequestId(),
      timestamp: Date.now(),
      type: MonitoringEventType.RATE_LIMIT_HIT,
      source: 'rate_limiter',
      severity: 'medium',
      message: `Rate limit exceeded: ${method} ${endpoint} (${current}/${limit})`,
      data: {
        endpoint,
        method,
        limit,
        current,
        resetTime,
      },
      tags: ['rate_limit', 'throttling', method.toLowerCase()],
      requestId,
      userId,
      ipAddress,
    };

    await this.recordEvent(event);
    this.updateRateLimitMetrics(endpoint, method, current, limit, resetTime);
  }

  /**
   * Perform health check
   */
  async performHealthCheck(service: string, checkFunction: () => Promise<HealthCheckResult>): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        checkFunction(),
        new Promise<HealthCheckResult>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 30000)
        )
      ]);
      
      result.responseTime = Date.now() - startTime;
      this.healthChecks.set(service, result);
      
      const event: MonitoringEvent = {
        id: SecurityUtils.generateRequestId(),
        timestamp: Date.now(),
        type: MonitoringEventType.HEALTH_CHECK,
        source: 'health_monitor',
        severity: result.status === 'healthy' ? 'low' : 
                 result.status === 'degraded' ? 'medium' : 'high',
        message: `Health check: ${service} - ${result.status} (${result.responseTime}ms)`,
        data: {
          service,
          status: result.status,
          responseTime: result.responseTime,
          details: result.details,
        },
        tags: ['health_check', service, result.status],
      };

      await this.recordEvent(event);
      return result;
      
    } catch (error) {
      const result: HealthCheckResult = {
        service,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        message: error.message,
        details: { error: error.toString() },
      };
      
      this.healthChecks.set(service, result);
      
      const event: MonitoringEvent = {
        id: SecurityUtils.generateRequestId(),
        timestamp: Date.now(),
        type: MonitoringEventType.HEALTH_CHECK,
        source: 'health_monitor',
        severity: 'high',
        message: `Health check failed: ${service} - ${error.message}`,
        data: {
          service,
          status: 'unhealthy',
          responseTime: result.responseTime,
          error: error.message,
        },
        tags: ['health_check', service, 'unhealthy'],
      };

      await this.recordEvent(event);
      return result;
    }
  }

  /**
   * Get API metrics
   */
  getApiMetrics(endpoint?: string): ApiMetrics[] {
    if (endpoint) {
      const metrics = this.metrics.get(endpoint);
      return metrics ? [metrics] : [];
    }
    
    return Array.from(this.metrics.values());
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.performanceHistory.slice(-limit);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100, type?: MonitoringEventType): MonitoringEvent[] {
    let events = this.events;
    
    if (type) {
      events = events.filter(event => event.type === type);
    }
    
    return events.slice(-limit).reverse();
  }

  /**
   * Get health status
   */
  getHealthStatus(): Record<string, HealthCheckResult> {
    const status: Record<string, HealthCheckResult> = {};
    
    for (const [service, result] of this.healthChecks.entries()) {
      status[service] = result;
    }
    
    return status;
  }

  /**
   * Get system overview
   */
  getSystemOverview(): {
    uptime: number;
    totalRequests: number;
    totalErrors: number;
    averageResponseTime: number;
    activeEndpoints: number;
    healthyServices: number;
    totalServices: number;
    securityViolations: number;
    rateLimitHits: number;
  } {
    const totalRequests = Array.from(this.metrics.values())
      .reduce((sum, metrics) => sum + metrics.totalRequests, 0);
    
    const totalErrors = Array.from(this.metrics.values())
      .reduce((sum, metrics) => sum + metrics.failedRequests, 0);
    
    const averageResponseTime = Array.from(this.metrics.values())
      .reduce((sum, metrics, _, arr) => sum + metrics.averageResponseTime / arr.length, 0);
    
    const healthyServices = Array.from(this.healthChecks.values())
      .filter(result => result.status === 'healthy').length;
    
    const securityViolations = this.events
      .filter(event => event.type === MonitoringEventType.SECURITY_VIOLATION).length;
    
    const rateLimitHits = this.events
      .filter(event => event.type === MonitoringEventType.RATE_LIMIT_HIT).length;

    return {
      uptime: Date.now() - this.startTime,
      totalRequests,
      totalErrors,
      averageResponseTime,
      activeEndpoints: this.metrics.size,
      healthyServices,
      totalServices: this.healthChecks.size,
      securityViolations,
      rateLimitHits,
    };
  }

  /**
   * Record monitoring event
   */
  private async recordEvent(event: MonitoringEvent): Promise<void> {
    this.events.push(event);
    
    // Keep only recent events to prevent memory overflow
    if (this.events.length > 10000) {
      this.events = this.events.slice(-5000);
    }

    // Log to audit system
    await auditLogger.logDataAccess({
      requestId: event.requestId || SecurityUtils.generateRequestId(),
      userId: event.userId || 'system',
      action: 'monitoring_event',
      resource: 'monitoring_system',
      dataType: 'audit_logs',
      result: AuditResult.SUCCESS,
      ipAddress: event.ipAddress || 'unknown',
      userAgent: event.userAgent || 'monitoring_system',
    });

    // Check alert rules
    await this.checkAlertRules(event);
  }

  /**
   * Update API metrics
   */
  private updateApiMetrics(
    endpoint: string,
    method: string,
    type: 'request' | 'response',
    statusCode?: number,
    responseTime?: number
  ): void {
    const key = `${method}:${endpoint}`;
    let metrics = this.metrics.get(key);
    
    if (!metrics) {
      metrics = {
        endpoint,
        method,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        lastRequestTime: 0,
        errorRate: 0,
        rateLimit: {
          current: 0,
          limit: 100,
          resetTime: Date.now() + 60000,
        },
        statusCodes: {},
      };
    }

    if (type === 'request') {
      metrics.totalRequests++;
      metrics.lastRequestTime = Date.now();
    } else if (type === 'response' && statusCode && responseTime !== undefined) {
      // Update response metrics
      if (statusCode >= 200 && statusCode < 400) {
        metrics.successfulRequests++;
      } else {
        metrics.failedRequests++;
      }
      
      // Update response time metrics
      const totalResponseTime = metrics.averageResponseTime * (metrics.successfulRequests + metrics.failedRequests - 1);
      metrics.averageResponseTime = (totalResponseTime + responseTime) / (metrics.successfulRequests + metrics.failedRequests);
      metrics.minResponseTime = Math.min(metrics.minResponseTime, responseTime);
      metrics.maxResponseTime = Math.max(metrics.maxResponseTime, responseTime);
      
      // Update status code counts
      metrics.statusCodes[statusCode] = (metrics.statusCodes[statusCode] || 0) + 1;
      
      // Update error rate
      metrics.errorRate = (metrics.failedRequests / metrics.totalRequests) * 100;
    }

    this.metrics.set(key, metrics);
  }

  /**
   * Update rate limit metrics
   */
  private updateRateLimitMetrics(
    endpoint: string,
    method: string,
    current: number,
    limit: number,
    resetTime: number
  ): void {
    const key = `${method}:${endpoint}`;
    const metrics = this.metrics.get(key);
    
    if (metrics) {
      metrics.rateLimit = { current, limit, resetTime };
      this.metrics.set(key, metrics);
    }
  }

  /**
   * Trigger performance alert
   */
  private async triggerPerformanceAlert(
    endpoint: string,
    method: string,
    responseTime: number,
    alertType: string
  ): Promise<void> {
    const event: MonitoringEvent = {
      id: SecurityUtils.generateRequestId(),
      timestamp: Date.now(),
      type: MonitoringEventType.PERFORMANCE_ALERT,
      source: 'performance_monitor',
      severity: responseTime > 30000 ? 'critical' : 'high',
      message: `Performance alert: ${method} ${endpoint} took ${responseTime}ms`,
      data: {
        endpoint,
        method,
        responseTime,
        alertType,
        threshold: alertType === 'slow_response' ? 10000 : 0,
      },
      tags: ['performance', 'alert', alertType],
    };

    await this.recordEvent(event);
  }

  /**
   * Trigger error alert
   */
  private async triggerErrorAlert(
    endpoint: string,
    method: string,
    statusCode: number,
    error?: any
  ): Promise<void> {
    const event: MonitoringEvent = {
      id: SecurityUtils.generateRequestId(),
      timestamp: Date.now(),
      type: MonitoringEventType.ERROR_OCCURRED,
      source: 'error_monitor',
      severity: statusCode >= 500 ? 'high' : 'medium',
      message: `Error occurred: ${method} ${endpoint} - ${statusCode}`,
      data: {
        endpoint,
        method,
        statusCode,
        error: error ? {
          message: error.message,
          code: error.code,
          stack: error.stack,
        } : undefined,
      },
      tags: ['error', 'alert', `status_${statusCode}`],
    };

    await this.recordEvent(event);
  }

  /**
   * Trigger security alert
   */
  private async triggerSecurityAlert(
    violationType: string,
    description: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const event: MonitoringEvent = {
      id: SecurityUtils.generateRequestId(),
      timestamp: Date.now(),
      type: MonitoringEventType.SECURITY_VIOLATION,
      source: 'security_monitor',
      severity: 'critical',
      message: `CRITICAL SECURITY ALERT: ${violationType} - ${description}`,
      data: {
        violationType,
        description,
        immediate: true,
      },
      tags: ['security', 'critical', 'alert', violationType],
      ipAddress,
      userAgent,
    };

    await this.recordEvent(event);
    
    // Log critical security event
    logger.error(`[CRITICAL SECURITY ALERT] ${violationType}: ${description}`, {
      ipAddress,
      userAgent,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    this.alertRules = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds 10%',
        enabled: true,
        condition: (event, metrics) => metrics.errorRate > 10,
        severity: 'high',
        cooldown: 300000, // 5 minutes
        actions: [{ type: 'log', config: {} }],
      },
      {
        id: 'slow_response_time',
        name: 'Slow Response Time',
        description: 'Alert when average response time exceeds 5 seconds',
        enabled: true,
        condition: (event, metrics) => metrics.averageResponseTime > 5000,
        severity: 'medium',
        cooldown: 300000, // 5 minutes
        actions: [{ type: 'log', config: {} }],
      },
      {
        id: 'security_violation',
        name: 'Security Violation',
        description: 'Alert on any security violation',
        enabled: true,
        condition: (event) => event.type === MonitoringEventType.SECURITY_VIOLATION,
        severity: 'critical',
        cooldown: 0, // No cooldown for security alerts
        actions: [{ type: 'log', config: {} }],
      },
    ];
  }

  /**
   * Check alert rules
   */
  private async checkAlertRules(event: MonitoringEvent): Promise<void> {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;
      
      const metrics = this.metrics.get(`${event.data.method}:${event.data.endpoint}`);
      if (!metrics) continue;
      
      if (rule.condition(event, metrics)) {
        const cooldownKey = `${rule.id}_${event.ipAddress || 'unknown'}`;
        const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;
        const now = Date.now();
        
        if (now - lastAlert > rule.cooldown) {
          await this.executeAlertActions(rule, event, metrics);
          this.alertCooldowns.set(cooldownKey, now);
        }
      }
    }
  }

  /**
   * Execute alert actions
   */
  private async executeAlertActions(
    rule: AlertRule,
    event: MonitoringEvent,
    metrics: ApiMetrics
  ): Promise<void> {
    for (const action of rule.actions) {
      try {
        switch (action.type) {
          case 'log':
            logger.warn(`[ALERT] ${rule.name}: ${rule.description}`, {
              event,
              metrics,
              rule: rule.name,
            });
            break;
          // Add other action types (email, webhook, etc.) as needed
        }
      } catch (error) {
        logger.error(`Failed to execute alert action: ${action.type}`, error);
      }
    }
  }

  /**
   * Start performance metrics collection
   */
  private startPerformanceCollection(): void {
    setInterval(() => {
      const now = Date.now();
      const recentEvents = this.events.filter(event => now - event.timestamp < 60000); // Last minute
      
      const performanceMetrics: PerformanceMetrics = {
        timestamp: now,
        activeConnections: this.metrics.size,
        requestsPerSecond: recentEvents.filter(e => e.type === MonitoringEventType.API_REQUEST).length / 60,
        averageResponseTime: Array.from(this.metrics.values())
          .reduce((sum, m, _, arr) => sum + m.averageResponseTime / arr.length, 0),
        errorRate: Array.from(this.metrics.values())
          .reduce((sum, m, _, arr) => sum + m.errorRate / arr.length, 0),
        uptime: now - this.startTime,
      };
      
      this.performanceHistory.push(performanceMetrics);
      
      // Keep only recent performance data
      if (this.performanceHistory.length > 1440) { // 24 hours of minute data
        this.performanceHistory = this.performanceHistory.slice(-720); // Keep 12 hours
      }
    }, 60000); // Every minute
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean old events every hour
    setInterval(() => {
      const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      this.events = this.events.filter(event => event.timestamp > cutoff);
    }, 60 * 60 * 1000);

    // Clean alert cooldowns every hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.alertCooldowns.entries()) {
        if (now - timestamp > 3600000) { // 1 hour
          this.alertCooldowns.delete(key);
        }
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Sanitize headers for logging
   */
  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};
    
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    
    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}

// Export singleton instance
export const apiMonitoringSystem = new ApiMonitoringSystem();

// Export utility functions
export const MonitoringUtils = {
  /**
   * Create monitoring middleware for API endpoints
   */
  createMonitoringMiddleware: () => {
    return async (req: any, res: any, next: any) => {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || SecurityUtils.generateRequestId();
      
      // Log request
      await apiMonitoringSystem.logApiRequest({
        requestId,
        method: req.method,
        endpoint: req.path,
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestSize: req.headers['content-length'] ? parseInt(req.headers['content-length']) : undefined,
        headers: req.headers,
        query: req.query,
        body: req.body,
      });

      // Override res.end to capture response
      const originalEnd = res.end;
      res.end = function(chunk: any, encoding: any) {
        const responseTime = Date.now() - startTime;
        
        // Log response
        apiMonitoringSystem.logApiResponse({
          requestId,
          method: req.method,
          endpoint: req.path,
          statusCode: res.statusCode,
          responseTime,
          responseSize: chunk ? chunk.length : 0,
          userId: req.user?.id,
          ipAddress: req.ip,
        });
        
        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  },

  /**
   * Create health check function
   */
  createHealthCheck: (service: string, checkFn: () => Promise<boolean>) => {
    return async (): Promise<HealthCheckResult> => {
      try {
        const isHealthy = await checkFn();
        return {
          service,
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime: 0, // Will be set by monitoring system
          message: isHealthy ? 'Service is healthy' : 'Service check failed',
        };
      } catch (error) {
        return {
          service,
          status: 'unhealthy',
          responseTime: 0,
          message: error.message,
          details: { error: error.toString() },
        };
      }
    };
  },

  /**
   * Generate monitoring report
   */
  generateMonitoringReport: (): string => {
    const overview = apiMonitoringSystem.getSystemOverview();
    const healthStatus = apiMonitoringSystem.getHealthStatus();
    const recentEvents = apiMonitoringSystem.getRecentEvents(10);
    
    return `
# API Monitoring Report

## System Overview
- **Uptime**: ${Math.floor(overview.uptime / 1000 / 60)} minutes
- **Total Requests**: ${overview.totalRequests}
- **Total Errors**: ${overview.totalErrors}
- **Average Response Time**: ${overview.averageResponseTime.toFixed(2)}ms
- **Active Endpoints**: ${overview.activeEndpoints}
- **Healthy Services**: ${overview.healthyServices}/${overview.totalServices}
- **Security Violations**: ${overview.securityViolations}
- **Rate Limit Hits**: ${overview.rateLimitHits}

## Health Status
${Object.entries(healthStatus).map(([service, result]) => 
  `- **${service}**: ${result.status} (${result.responseTime}ms)`
).join('\n')}

## Recent Events
${recentEvents.map(event => 
  `- **${new Date(event.timestamp).toISOString()}**: ${event.message} [${event.severity}]`
).join('\n')}

Generated at: ${new Date().toISOString()}
    `.trim();
  },
};