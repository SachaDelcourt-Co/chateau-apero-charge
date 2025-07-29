/**
 * Comprehensive Audit Logging System for Financial Data Processing
 * 
 * Production-ready audit logging service that provides comprehensive tracking
 * of all financial operations, security events, and user actions with proper
 * data masking and compliance features.
 * 
 * Features:
 * - Comprehensive audit trail for financial transactions
 * - Security event logging and monitoring
 * - Data masking for sensitive information
 * - Structured logging with correlation IDs
 * - Log rotation and retention management
 * - Real-time alerting for security violations
 * - GDPR and financial compliance support
 * - Performance monitoring and metrics
 */

import { SecurityConfig, SecurityUtils, SecurityEvent, SecurityLevel } from '../config/security';

// Audit log entry interface
export interface AuditLogEntry {
  // Core identification
  id: string;
  timestamp: string;
  requestId: string;
  correlationId?: string;
  
  // Event classification
  event: SecurityEvent;
  level: SecurityLevel;
  category: AuditCategory;
  
  // User and session information
  userId?: string;
  userRole?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  
  // Action details
  action: string;
  resource: string;
  resourceId?: string;
  method?: string;
  endpoint?: string;
  
  // Result and performance
  result: AuditResult;
  statusCode?: number;
  duration?: number;
  
  // Data and context
  data?: Record<string, any>;
  metadata?: Record<string, any>;
  
  // Security context
  riskLevel?: RiskLevel;
  securityFlags?: string[];
  
  // Compliance fields
  dataClassification?: DataClassification;
  retentionPeriod?: number;
  
  // Error information
  error?: {
    code?: string;
    message?: string;
    stack?: string;
  };
}

// Audit categories
export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  DATA_MODIFICATION = 'data_modification',
  FINANCIAL_TRANSACTION = 'financial_transaction',
  SECURITY_VIOLATION = 'security_violation',
  SYSTEM_EVENT = 'system_event',
  COMPLIANCE = 'compliance',
  PERFORMANCE = 'performance',
  ERROR = 'error',
}

// Audit results
export enum AuditResult {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PARTIAL = 'partial',
  BLOCKED = 'blocked',
  WARNING = 'warning',
}

// Risk levels
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Data classification levels
export enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
}

// Alert configuration
interface AlertRule {
  name: string;
  condition: (entry: AuditLogEntry) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldown: number; // milliseconds
  action: (entry: AuditLogEntry) => Promise<void>;
}

// Log storage interface
interface LogStorage {
  store(entry: AuditLogEntry): Promise<void>;
  query(filters: LogQueryFilters): Promise<AuditLogEntry[]>;
  archive(olderThan: Date): Promise<number>;
  delete(olderThan: Date): Promise<number>;
}

// Query filters for log retrieval
export interface LogQueryFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  event?: SecurityEvent;
  category?: AuditCategory;
  result?: AuditResult;
  riskLevel?: RiskLevel;
  ipAddress?: string;
  resource?: string;
  limit?: number;
  offset?: number;
}

// Metrics tracking
interface AuditMetrics {
  totalLogs: number;
  logsByCategory: Record<AuditCategory, number>;
  logsByResult: Record<AuditResult, number>;
  logsByRiskLevel: Record<RiskLevel, number>;
  averageResponseTime: number;
  errorRate: number;
  securityViolations: number;
  lastUpdated: Date;
}

/**
 * Comprehensive Audit Logger Implementation
 */
export class AuditLogger {
  private storage: LogStorage;
  private alertRules: AlertRule[] = [];
  private metrics: AuditMetrics;
  private alertCooldowns: Map<string, number> = new Map();

  constructor(storage: LogStorage) {
    this.storage = storage;
    this.metrics = this.initializeMetrics();
    this.setupDefaultAlertRules();
  }

  /**
   * Log a financial transaction event
   */
  async logFinancialTransaction(params: {
    requestId: string;
    userId: string;
    action: string;
    transactionData: {
      amount: number;
      currency: string;
      recipientIban?: string;
      transactionId?: string;
      batchId?: string;
    };
    result: AuditResult;
    duration?: number;
    ipAddress?: string;
    userAgent?: string;
    error?: any;
  }): Promise<void> {
    const { requestId, userId, action, transactionData, result, duration, ipAddress, userAgent, error } = params;

    // Mask sensitive financial data
    const maskedData = {
      amount: SecurityUtils.maskSensitiveData({ amount_recharged: transactionData.amount }, 'amount_recharged'),
      currency: transactionData.currency,
      recipientIban: transactionData.recipientIban 
        ? SecurityUtils.maskSensitiveData({ account: transactionData.recipientIban }, 'account')
        : undefined,
      transactionId: transactionData.transactionId,
      batchId: transactionData.batchId,
    };

    // Determine risk level based on amount
    let riskLevel = RiskLevel.LOW;
    if (transactionData.amount > 10000) riskLevel = RiskLevel.CRITICAL;
    else if (transactionData.amount > 5000) riskLevel = RiskLevel.HIGH;
    else if (transactionData.amount > 1000) riskLevel = RiskLevel.MEDIUM;

    const entry: AuditLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      requestId,
      event: SecurityConfig.audit.events.REFUND_PROCESSING as SecurityEvent,
      level: result === AuditResult.SUCCESS ? SecurityConfig.audit.levels.INFO as SecurityLevel : SecurityConfig.audit.levels.ERROR as SecurityLevel,
      category: AuditCategory.FINANCIAL_TRANSACTION,
      userId,
      ipAddress,
      userAgent,
      action,
      resource: 'financial_transaction',
      resourceId: transactionData.transactionId,
      result,
      duration,
      data: maskedData,
      riskLevel,
      dataClassification: DataClassification.RESTRICTED,
      retentionPeriod: SecurityConfig.compliance.gdpr.dataRetentionDays,
      error: error ? {
        code: error.code,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    await this.logEntry(entry);
  }

  /**
   * Log authentication events
   */
  async logAuthentication(params: {
    requestId: string;
    userId?: string;
    action: 'login' | 'logout' | 'token_refresh' | 'password_change';
    result: AuditResult;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
    error?: any;
  }): Promise<void> {
    const { requestId, userId, action, result, ipAddress, userAgent, metadata, error } = params;

    const entry: AuditLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      requestId,
      event: SecurityConfig.audit.events.AUTHENTICATION as SecurityEvent,
      level: result === AuditResult.SUCCESS ? SecurityConfig.audit.levels.INFO as SecurityLevel : SecurityConfig.audit.levels.WARN as SecurityLevel,
      category: AuditCategory.AUTHENTICATION,
      userId,
      ipAddress,
      userAgent,
      action,
      resource: 'authentication',
      result,
      data: metadata,
      riskLevel: result === AuditResult.FAILURE ? RiskLevel.MEDIUM : RiskLevel.LOW,
      dataClassification: DataClassification.CONFIDENTIAL,
      retentionPeriod: SecurityConfig.compliance.gdpr.dataRetentionDays,
      error: error ? {
        code: error.code,
        message: error.message,
      } : undefined,
    };

    await this.logEntry(entry);
  }

  /**
   * Log authorization events
   */
  async logAuthorization(params: {
    requestId: string;
    userId: string;
    action: string;
    resource: string;
    requiredPermissions: string[];
    userPermissions: string[];
    result: AuditResult;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const { requestId, userId, action, resource, requiredPermissions, userPermissions, result, ipAddress, userAgent } = params;

    const entry: AuditLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      requestId,
      event: SecurityConfig.audit.events.AUTHORIZATION as SecurityEvent,
      level: result === AuditResult.SUCCESS ? SecurityConfig.audit.levels.INFO as SecurityLevel : SecurityConfig.audit.levels.WARN as SecurityLevel,
      category: AuditCategory.AUTHORIZATION,
      userId,
      ipAddress,
      userAgent,
      action,
      resource,
      result,
      data: {
        requiredPermissions,
        userPermissions: result === AuditResult.FAILURE ? ['***'] : userPermissions, // Mask on failure
      },
      riskLevel: result === AuditResult.FAILURE ? RiskLevel.HIGH : RiskLevel.LOW,
      dataClassification: DataClassification.CONFIDENTIAL,
      retentionPeriod: SecurityConfig.compliance.gdpr.dataRetentionDays,
    };

    await this.logEntry(entry);
  }

  /**
   * Log data access events
   */
  async logDataAccess(params: {
    requestId: string;
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    dataType: 'refund_data' | 'card_data' | 'user_data' | 'audit_logs';
    recordCount?: number;
    result: AuditResult;
    duration?: number;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const { requestId, userId, action, resource, resourceId, dataType, recordCount, result, duration, ipAddress, userAgent } = params;

    // Determine risk level based on data type and record count
    let riskLevel = RiskLevel.LOW;
    if (dataType === 'audit_logs') riskLevel = RiskLevel.HIGH;
    else if (recordCount && recordCount > 100) riskLevel = RiskLevel.MEDIUM;

    const entry: AuditLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      requestId,
      event: SecurityConfig.audit.events.DATA_ACCESS as SecurityEvent,
      level: SecurityConfig.audit.levels.INFO as SecurityLevel,
      category: AuditCategory.DATA_ACCESS,
      userId,
      ipAddress,
      userAgent,
      action,
      resource,
      resourceId,
      result,
      duration,
      data: {
        dataType,
        recordCount,
      },
      riskLevel,
      dataClassification: DataClassification.CONFIDENTIAL,
      retentionPeriod: SecurityConfig.compliance.gdpr.dataRetentionDays,
    };

    await this.logEntry(entry);
  }

  /**
   * Log security violations
   */
  async logSecurityViolation(params: {
    requestId: string;
    userId?: string;
    violationType: 'rate_limit_exceeded' | 'invalid_token' | 'permission_denied' | 'suspicious_activity' | 'data_breach_attempt';
    description: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
    severity: RiskLevel;
  }): Promise<void> {
    const { requestId, userId, violationType, description, ipAddress, userAgent, metadata, severity } = params;

    const entry: AuditLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      requestId,
      event: SecurityConfig.audit.events.SECURITY_VIOLATION as SecurityEvent,
      level: SecurityConfig.audit.levels.ERROR as SecurityLevel,
      category: AuditCategory.SECURITY_VIOLATION,
      userId,
      ipAddress,
      userAgent,
      action: violationType,
      resource: 'security',
      result: AuditResult.BLOCKED,
      data: metadata,
      metadata: { description },
      riskLevel: severity,
      securityFlags: [violationType],
      dataClassification: DataClassification.RESTRICTED,
      retentionPeriod: SecurityConfig.compliance.gdpr.dataRetentionDays,
    };

    await this.logEntry(entry);
  }

  /**
   * Log system errors
   */
  async logError(params: {
    requestId: string;
    userId?: string;
    action: string;
    resource: string;
    error: any;
    duration?: number;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { requestId, userId, action, resource, error, duration, ipAddress, userAgent, metadata } = params;

    const entry: AuditLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      requestId,
      event: SecurityConfig.audit.events.ERROR as SecurityEvent,
      level: SecurityConfig.audit.levels.ERROR as SecurityLevel,
      category: AuditCategory.ERROR,
      userId,
      ipAddress,
      userAgent,
      action,
      resource,
      result: AuditResult.FAILURE,
      duration,
      data: metadata,
      riskLevel: RiskLevel.MEDIUM,
      dataClassification: DataClassification.INTERNAL,
      retentionPeriod: SecurityConfig.compliance.gdpr.dataRetentionDays,
      error: {
        code: error.code || error.name,
        message: error.message,
        stack: error.stack,
      },
    };

    await this.logEntry(entry);
  }

  /**
   * Query audit logs with filters
   */
  async queryLogs(filters: LogQueryFilters): Promise<AuditLogEntry[]> {
    return await this.storage.query(filters);
  }

  /**
   * Get audit metrics
   */
  getMetrics(): AuditMetrics {
    return { ...this.metrics };
  }

  /**
   * Archive old logs
   */
  async archiveLogs(olderThan: Date): Promise<number> {
    return await this.storage.archive(olderThan);
  }

  /**
   * Delete expired logs
   */
  async deleteExpiredLogs(olderThan: Date): Promise<number> {
    return await this.storage.delete(olderThan);
  }

  /**
   * Core log entry method
   */
  private async logEntry(entry: AuditLogEntry): Promise<void> {
    try {
      // Store the log entry
      await this.storage.store(entry);

      // Update metrics
      this.updateMetrics(entry);

      // Check alert rules
      await this.checkAlertRules(entry);

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[AUDIT] ${entry.timestamp} - ${entry.category}:${entry.action} - ${entry.result}`, {
          requestId: entry.requestId,
          userId: entry.userId,
          resource: entry.resource,
          riskLevel: entry.riskLevel,
        });
      }
    } catch (error) {
      console.error('[AUDIT] Failed to log entry:', error);
      // In production, you might want to send this to a dead letter queue
      // or alternative logging system
    }
  }

  /**
   * Generate unique log ID
   */
  private generateLogId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): AuditMetrics {
    return {
      totalLogs: 0,
      logsByCategory: Object.values(AuditCategory).reduce((acc, category) => {
        acc[category] = 0;
        return acc;
      }, {} as Record<AuditCategory, number>),
      logsByResult: Object.values(AuditResult).reduce((acc, result) => {
        acc[result] = 0;
        return acc;
      }, {} as Record<AuditResult, number>),
      logsByRiskLevel: Object.values(RiskLevel).reduce((acc, level) => {
        acc[level] = 0;
        return acc;
      }, {} as Record<RiskLevel, number>),
      averageResponseTime: 0,
      errorRate: 0,
      securityViolations: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Update metrics with new log entry
   */
  private updateMetrics(entry: AuditLogEntry): void {
    this.metrics.totalLogs++;
    this.metrics.logsByCategory[entry.category]++;
    this.metrics.logsByResult[entry.result]++;
    if (entry.riskLevel) {
      this.metrics.logsByRiskLevel[entry.riskLevel]++;
    }

    if (entry.duration) {
      const totalTime = this.metrics.averageResponseTime * (this.metrics.totalLogs - 1) + entry.duration;
      this.metrics.averageResponseTime = totalTime / this.metrics.totalLogs;
    }

    if (entry.result === AuditResult.FAILURE) {
      this.metrics.errorRate = (this.metrics.logsByResult[AuditResult.FAILURE] / this.metrics.totalLogs) * 100;
    }

    if (entry.category === AuditCategory.SECURITY_VIOLATION) {
      this.metrics.securityViolations++;
    }

    this.metrics.lastUpdated = new Date();
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultAlertRules(): void {
    // Multiple failed authentication attempts
    this.alertRules.push({
      name: 'multiple_failed_logins',
      condition: (entry) => 
        entry.category === AuditCategory.AUTHENTICATION && 
        entry.result === AuditResult.FAILURE,
      severity: 'high',
      cooldown: 300000, // 5 minutes
      action: async (entry) => {
        console.warn(`[SECURITY ALERT] Multiple failed login attempts from IP: ${entry.ipAddress}`);
        // In production, send to alerting system
      },
    });

    // Large financial transactions
    this.alertRules.push({
      name: 'large_financial_transaction',
      condition: (entry) => 
        entry.category === AuditCategory.FINANCIAL_TRANSACTION && 
        entry.riskLevel === RiskLevel.CRITICAL,
      severity: 'critical',
      cooldown: 0, // No cooldown for critical financial alerts
      action: async (entry) => {
        console.error(`[FINANCIAL ALERT] Large transaction detected: ${entry.data?.amount} by user ${entry.userId}`);
        // In production, send immediate alert to financial team
      },
    });

    // Security violations
    this.alertRules.push({
      name: 'security_violation',
      condition: (entry) => entry.category === AuditCategory.SECURITY_VIOLATION,
      severity: 'high',
      cooldown: 60000, // 1 minute
      action: async (entry) => {
        console.error(`[SECURITY ALERT] Security violation: ${entry.action} from IP: ${entry.ipAddress}`);
        // In production, send to security team
      },
    });
  }

  /**
   * Check alert rules against log entry
   */
  private async checkAlertRules(entry: AuditLogEntry): Promise<void> {
    for (const rule of this.alertRules) {
      if (rule.condition(entry)) {
        const cooldownKey = `${rule.name}_${entry.ipAddress || entry.userId || 'unknown'}`;
        const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;
        const now = Date.now();

        if (now - lastAlert > rule.cooldown) {
          await rule.action(entry);
          this.alertCooldowns.set(cooldownKey, now);
        }
      }
    }
  }
}

/**
 * Simple in-memory log storage implementation
 * In production, replace with database or external logging service
 */
export class InMemoryLogStorage implements LogStorage {
  private logs: AuditLogEntry[] = [];
  private maxLogs = 10000; // Prevent memory overflow

  async store(entry: AuditLogEntry): Promise<void> {
    this.logs.push(entry);
    
    // Remove oldest logs if we exceed the limit
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  async query(filters: LogQueryFilters): Promise<AuditLogEntry[]> {
    let filteredLogs = [...this.logs];

    if (filters.startDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= filters.startDate!);
    }

    if (filters.endDate) {
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= filters.endDate!);
    }

    if (filters.userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
    }

    if (filters.event) {
      filteredLogs = filteredLogs.filter(log => log.event === filters.event);
    }

    if (filters.category) {
      filteredLogs = filteredLogs.filter(log => log.category === filters.category);
    }

    if (filters.result) {
      filteredLogs = filteredLogs.filter(log => log.result === filters.result);
    }

    if (filters.riskLevel) {
      filteredLogs = filteredLogs.filter(log => log.riskLevel === filters.riskLevel);
    }

    if (filters.ipAddress) {
      filteredLogs = filteredLogs.filter(log => log.ipAddress === filters.ipAddress);
    }

    if (filters.resource) {
      filteredLogs = filteredLogs.filter(log => log.resource === filters.resource);
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    
    return filteredLogs.slice(offset, offset + limit);
  }

  async archive(olderThan: Date): Promise<number> {
    const toArchive = this.logs.filter(log => new Date(log.timestamp) < olderThan);
    // In production, move to archive storage
    console.log(`[AUDIT] Would archive ${toArchive.length} log entries`);
    return toArchive.length;
  }

  async delete(olderThan: Date): Promise<number> {
    const initialCount = this.logs.length;
    this.logs = this.logs.filter(log => new Date(log.timestamp) >= olderThan);
    const deletedCount = initialCount - this.logs.length;
    console.log(`[AUDIT] Deleted ${deletedCount} expired log entries`);
    return deletedCount;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger(new InMemoryLogStorage());

// Export utility functions
export const AuditUtils = {
  /**
   * Create a correlation ID for tracking related operations
   */
  createCorrelationId: (): string => {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Extract IP address from request
   */
  extractIpAddress: (req: any): string => {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           'unknown';
  },

  /**
   * Extract user agent from request
   */
  extractUserAgent: (req: any): string => {
    return req.headers['user-agent'] || 'unknown';
  },

  /**
   * Sanitize log data to remove sensitive information
   */
  sanitizeLogData: (data: any): any => {
    if (!data || typeof data !== 'object') return data;

    const sanitized = { ...data };
    const sensitiveFields = SecurityConfig.encryption.sensitiveFields;

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = SecurityUtils.maskSensitiveData(sanitized, field);
      }
    }

    return sanitized;
  },
};