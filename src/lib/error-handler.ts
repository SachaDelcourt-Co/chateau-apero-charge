/**
 * Comprehensive Error Handling System
 * 
 * This module provides robust error handling, classification, and recovery
 * mechanisms for API endpoints and application components.
 * 
 * Features:
 * - Structured error classification and handling
 * - Automatic error recovery and retry mechanisms
 * - Security-aware error sanitization
 * - Error tracking and analytics
 * - User-friendly error messages
 * - Developer debugging information
 * - Error reporting and alerting
 * - Circuit breaker pattern implementation
 * - Graceful degradation strategies
 * - Error boundary components
 */

import { logger } from './logger';
import { auditLogger, RiskLevel, AuditResult } from './audit-logger';
import { apiMonitoringSystem } from './api-monitoring';
import { SecurityUtils } from '../config/security';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Error categories
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NETWORK = 'network',
  DATABASE = 'database',
  EXTERNAL_SERVICE = 'external_service',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  SECURITY = 'security',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

// Error recovery strategies
export enum RecoveryStrategy {
  NONE = 'none',
  RETRY = 'retry',
  FALLBACK = 'fallback',
  CIRCUIT_BREAKER = 'circuit_breaker',
  GRACEFUL_DEGRADATION = 'graceful_degradation',
  USER_INTERVENTION = 'user_intervention',
}

// Structured error interface
export interface StructuredError {
  id: string;
  timestamp: number;
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  context: {
    requestId?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    endpoint?: string;
    method?: string;
    stack?: string;
    metadata?: Record<string, any>;
  };
  userMessage: string;
  developerMessage: string;
  suggestions: string[];
  retryable: boolean;
  sensitive: boolean;
}

// Error recovery result
export interface ErrorRecoveryResult {
  success: boolean;
  result?: any;
  error?: StructuredError;
  attempts: number;
  strategy: RecoveryStrategy;
  duration: number;
}

// Circuit breaker state
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors: string[];
}

// Circuit breaker instance
export interface CircuitBreaker {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  config: CircuitBreakerConfig;
}

/**
 * Comprehensive Error Handler
 */
export class ErrorHandler {
  private errorHistory: StructuredError[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private errorPatterns: Map<string, ErrorCategory> = new Map();
  private recoveryStrategies: Map<ErrorCategory, RecoveryStrategy> = new Map();

  constructor() {
    this.initializeErrorPatterns();
    this.initializeRecoveryStrategies();
    this.startCleanupTasks();
  }

  /**
   * Handle and process error
   */
  async handleError(
    error: any,
    context: {
      requestId?: string;
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      endpoint?: string;
      method?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<StructuredError> {
    const structuredError = this.createStructuredError(error, context);
    
    // Log error
    await this.logError(structuredError);
    
    // Store error for analytics
    this.storeError(structuredError);
    
    // Update circuit breaker if applicable
    if (context.endpoint) {
      this.updateCircuitBreaker(context.endpoint, structuredError);
    }
    
    // Trigger monitoring alerts
    await this.triggerMonitoringAlert(structuredError);
    
    return structuredError;
  }

  /**
   * Execute operation with error recovery
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      timeout?: number;
      circuitBreakerKey?: string;
      fallbackFn?: () => Promise<T>;
      context?: Record<string, any>;
    } = {}
  ): Promise<ErrorRecoveryResult> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      timeout = 30000,
      circuitBreakerKey,
      fallbackFn,
      context = {},
    } = options;

    const startTime = Date.now();
    let attempts = 0;
    let lastError: StructuredError | null = null;

    // Check circuit breaker
    if (circuitBreakerKey) {
      const circuitBreaker = this.getCircuitBreaker(circuitBreakerKey);
      if (circuitBreaker.state === CircuitBreakerState.OPEN) {
        if (Date.now() < circuitBreaker.nextAttemptTime) {
          // Circuit is open, try fallback
          if (fallbackFn) {
            try {
              const result = await fallbackFn();
              return {
                success: true,
                result,
                attempts: 0,
                strategy: RecoveryStrategy.FALLBACK,
                duration: Date.now() - startTime,
              };
            } catch (fallbackError) {
              const structuredError = await this.handleError(fallbackError, context);
              return {
                success: false,
                error: structuredError,
                attempts: 0,
                strategy: RecoveryStrategy.FALLBACK,
                duration: Date.now() - startTime,
              };
            }
          }
          
          // No fallback available
          const circuitOpenError = await this.handleError(
            new Error('Circuit breaker is open'),
            context
          );
          return {
            success: false,
            error: circuitOpenError,
            attempts: 0,
            strategy: RecoveryStrategy.CIRCUIT_BREAKER,
            duration: Date.now() - startTime,
          };
        } else {
          // Try to transition to half-open
          circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
        }
      }
    }

    // Retry loop
    while (attempts <= maxRetries) {
      attempts++;
      
      try {
        // Execute with timeout
        const result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), timeout)
          ),
        ]);

        // Success - reset circuit breaker if applicable
        if (circuitBreakerKey) {
          this.resetCircuitBreaker(circuitBreakerKey);
        }

        return {
          success: true,
          result,
          attempts,
          strategy: attempts > 1 ? RecoveryStrategy.RETRY : RecoveryStrategy.NONE,
          duration: Date.now() - startTime,
        };

      } catch (error) {
        lastError = await this.handleError(error, {
          ...context,
          metadata: { ...context.metadata, attempt: attempts, maxRetries },
        });

        // Check if error is retryable
        if (!lastError.retryable || attempts > maxRetries) {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempts <= maxRetries) {
          const delay = retryDelay * Math.pow(2, attempts - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed, try fallback
    if (fallbackFn) {
      try {
        const result = await fallbackFn();
        return {
          success: true,
          result,
          attempts,
          strategy: RecoveryStrategy.FALLBACK,
          duration: Date.now() - startTime,
        };
      } catch (fallbackError) {
        lastError = await this.handleError(fallbackError, {
          ...context,
          metadata: { ...context.metadata, fallbackAttempt: true },
        });
      }
    }

    return {
      success: false,
      error: lastError!,
      attempts,
      strategy: RecoveryStrategy.RETRY,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Create structured error from raw error
   */
  private createStructuredError(error: any, context: any): StructuredError {
    const errorId = SecurityUtils.generateRequestId();
    const timestamp = Date.now();
    
    // Extract error information
    const message = error?.message || 'Unknown error occurred';
    const stack = error?.stack;
    const code = error?.code || error?.name || 'UNKNOWN_ERROR';
    
    // Classify error
    const category = this.classifyError(error, message, code);
    const severity = this.determineSeverity(category, error);
    const recoveryStrategy = this.getRecoveryStrategy(category);
    
    // Determine if error is retryable
    const retryable = this.isRetryable(category, error);
    
    // Check if error contains sensitive information
    const sensitive = this.containsSensitiveInfo(message, stack);
    
    // Generate user-friendly message
    const userMessage = this.generateUserMessage(category, code);
    
    // Generate developer message
    const developerMessage = sensitive ? 
      'Error details have been logged for security review' : 
      message;
    
    // Generate suggestions
    const suggestions = this.generateSuggestions(category, code);

    return {
      id: errorId,
      timestamp,
      code,
      message,
      category,
      severity,
      recoveryStrategy,
      context: {
        requestId: context.requestId,
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        endpoint: context.endpoint,
        method: context.method,
        stack: sensitive ? '[REDACTED]' : stack,
        metadata: context.metadata,
      },
      userMessage,
      developerMessage,
      suggestions,
      retryable,
      sensitive,
    };
  }

  /**
   * Classify error into category
   */
  private classifyError(error: any, message: string, code: string): ErrorCategory {
    // Check specific error patterns
    for (const [pattern, category] of this.errorPatterns.entries()) {
      if (message.toLowerCase().includes(pattern) || code.toLowerCase().includes(pattern)) {
        return category;
      }
    }

    // Check error properties
    if (error?.status || error?.statusCode) {
      const status = error.status || error.statusCode;
      if (status === 401) return ErrorCategory.AUTHENTICATION;
      if (status === 403) return ErrorCategory.AUTHORIZATION;
      if (status === 400) return ErrorCategory.VALIDATION;
      if (status === 429) return ErrorCategory.RATE_LIMIT;
      if (status >= 500) return ErrorCategory.SYSTEM;
      if (status >= 400) return ErrorCategory.BUSINESS_LOGIC;
    }

    // Check error types
    if (error instanceof TypeError) return ErrorCategory.VALIDATION;
    if (error instanceof ReferenceError) return ErrorCategory.SYSTEM;
    if (error instanceof SyntaxError) return ErrorCategory.VALIDATION;

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(category: ErrorCategory, error: any): ErrorSeverity {
    // Critical errors
    if (category === ErrorCategory.SECURITY) return ErrorSeverity.CRITICAL;
    if (category === ErrorCategory.SYSTEM && error?.critical) return ErrorSeverity.CRITICAL;
    
    // High severity errors
    if (category === ErrorCategory.DATABASE) return ErrorSeverity.HIGH;
    if (category === ErrorCategory.EXTERNAL_SERVICE) return ErrorSeverity.HIGH;
    if (category === ErrorCategory.AUTHENTICATION) return ErrorSeverity.HIGH;
    
    // Medium severity errors
    if (category === ErrorCategory.AUTHORIZATION) return ErrorSeverity.MEDIUM;
    if (category === ErrorCategory.BUSINESS_LOGIC) return ErrorSeverity.MEDIUM;
    if (category === ErrorCategory.NETWORK) return ErrorSeverity.MEDIUM;
    
    // Low severity errors
    if (category === ErrorCategory.VALIDATION) return ErrorSeverity.LOW;
    if (category === ErrorCategory.RATE_LIMIT) return ErrorSeverity.LOW;
    
    return ErrorSeverity.MEDIUM;
  }

  /**
   * Get recovery strategy for error category
   */
  private getRecoveryStrategy(category: ErrorCategory): RecoveryStrategy {
    return this.recoveryStrategies.get(category) || RecoveryStrategy.NONE;
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(category: ErrorCategory, error: any): boolean {
    // Never retry these categories
    const nonRetryableCategories = [
      ErrorCategory.AUTHENTICATION,
      ErrorCategory.AUTHORIZATION,
      ErrorCategory.VALIDATION,
      ErrorCategory.SECURITY,
    ];
    
    if (nonRetryableCategories.includes(category)) {
      return false;
    }
    
    // Check specific status codes
    const status = error?.status || error?.statusCode;
    if (status) {
      // Don't retry client errors (except rate limiting and timeouts)
      if (status >= 400 && status < 500 && status !== 429 && status !== 408) {
        return false;
      }
    }
    
    // Retry network, timeout, and server errors
    return [
      ErrorCategory.NETWORK,
      ErrorCategory.TIMEOUT,
      ErrorCategory.EXTERNAL_SERVICE,
      ErrorCategory.SYSTEM,
      ErrorCategory.RATE_LIMIT,
    ].includes(category);
  }

  /**
   * Check if error contains sensitive information
   */
  private containsSensitiveInfo(message: string, stack?: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /key/i,
      /secret/i,
      /credential/i,
      /authorization/i,
      /bearer/i,
      /api[_-]?key/i,
      /access[_-]?token/i,
      /refresh[_-]?token/i,
    ];
    
    const content = `${message} ${stack || ''}`.toLowerCase();
    return sensitivePatterns.some(pattern => pattern.test(content));
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserMessage(category: ErrorCategory, code: string): string {
    const messages = {
      [ErrorCategory.VALIDATION]: 'Please check your input and try again.',
      [ErrorCategory.AUTHENTICATION]: 'Please log in to continue.',
      [ErrorCategory.AUTHORIZATION]: 'You do not have permission to perform this action.',
      [ErrorCategory.NETWORK]: 'Network connection issue. Please check your internet connection.',
      [ErrorCategory.DATABASE]: 'Service temporarily unavailable. Please try again later.',
      [ErrorCategory.EXTERNAL_SERVICE]: 'External service is currently unavailable. Please try again later.',
      [ErrorCategory.BUSINESS_LOGIC]: 'Unable to complete the requested operation.',
      [ErrorCategory.SYSTEM]: 'System error occurred. Our team has been notified.',
      [ErrorCategory.SECURITY]: 'Security error detected. Please contact support.',
      [ErrorCategory.RATE_LIMIT]: 'Too many requests. Please wait a moment and try again.',
      [ErrorCategory.TIMEOUT]: 'Request timed out. Please try again.',
      [ErrorCategory.UNKNOWN]: 'An unexpected error occurred. Please try again.',
    };
    
    return messages[category] || messages[ErrorCategory.UNKNOWN];
  }

  /**
   * Generate error suggestions
   */
  private generateSuggestions(category: ErrorCategory, code: string): string[] {
    const suggestions = {
      [ErrorCategory.VALIDATION]: [
        'Verify all required fields are filled',
        'Check data format and constraints',
        'Ensure input values are within acceptable ranges',
      ],
      [ErrorCategory.AUTHENTICATION]: [
        'Log in with valid credentials',
        'Check if your session has expired',
        'Reset your password if needed',
      ],
      [ErrorCategory.AUTHORIZATION]: [
        'Contact administrator for access',
        'Verify your account permissions',
        'Log in with appropriate role',
      ],
      [ErrorCategory.NETWORK]: [
        'Check internet connection',
        'Try refreshing the page',
        'Contact support if problem persists',
      ],
      [ErrorCategory.RATE_LIMIT]: [
        'Wait a few moments before retrying',
        'Reduce request frequency',
        'Contact support for rate limit increase',
      ],
    };
    
    return suggestions[category] || [
      'Try refreshing the page',
      'Contact support if the problem persists',
    ];
  }

  /**
   * Log structured error
   */
  private async logError(error: StructuredError): Promise<void> {
    // Log to application logger
    const logLevel = error.severity === ErrorSeverity.CRITICAL ? 'error' :
                    error.severity === ErrorSeverity.HIGH ? 'error' :
                    error.severity === ErrorSeverity.MEDIUM ? 'warn' : 'info';
    
    logger[logLevel](`[${error.category.toUpperCase()}] ${error.message}`, {
      errorId: error.id,
      code: error.code,
      category: error.category,
      severity: error.severity,
      context: error.context,
      userMessage: error.userMessage,
    });

    // Log to audit system
    await auditLogger.logError({
      requestId: error.context.requestId || error.id,
      userId: error.context.userId,
      action: 'error_occurred',
      resource: error.context.endpoint || 'unknown',
      error: {
        code: error.code,
        message: error.sensitive ? '[REDACTED]' : error.message,
        category: error.category,
        severity: error.severity,
      },
      ipAddress: error.context.ipAddress || 'unknown',
      userAgent: error.context.userAgent || 'unknown',
    });
  }

  /**
   * Store error for analytics
   */
  private storeError(error: StructuredError): void {
    this.errorHistory.push(error);
    
    // Keep only recent errors to prevent memory overflow
    if (this.errorHistory.length > 1000) {
      this.errorHistory = this.errorHistory.slice(-500);
    }
  }

  /**
   * Trigger monitoring alert
   */
  private async triggerMonitoringAlert(error: StructuredError): Promise<void> {
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
      // Use monitoring system to trigger alerts
      // This would integrate with the monitoring system created earlier
      logger.error(`[ALERT] ${error.severity.toUpperCase()} ERROR: ${error.message}`, {
        errorId: error.id,
        category: error.category,
        context: error.context,
      });
    }
  }

  /**
   * Get or create circuit breaker
   */
  private getCircuitBreaker(key: string): CircuitBreaker {
    let circuitBreaker = this.circuitBreakers.get(key);
    
    if (!circuitBreaker) {
      circuitBreaker = {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
        config: {
          failureThreshold: 5,
          recoveryTimeout: 60000, // 1 minute
          monitoringPeriod: 300000, // 5 minutes
          expectedErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR'],
        },
      };
      this.circuitBreakers.set(key, circuitBreaker);
    }
    
    return circuitBreaker;
  }

  /**
   * Update circuit breaker state
   */
  private updateCircuitBreaker(key: string, error: StructuredError): void {
    const circuitBreaker = this.getCircuitBreaker(key);
    
    // Only count unexpected errors
    if (!circuitBreaker.config.expectedErrors.includes(error.code)) {
      circuitBreaker.failureCount++;
      circuitBreaker.lastFailureTime = Date.now();
      
      // Open circuit if threshold exceeded
      if (circuitBreaker.failureCount >= circuitBreaker.config.failureThreshold) {
        circuitBreaker.state = CircuitBreakerState.OPEN;
        circuitBreaker.nextAttemptTime = Date.now() + circuitBreaker.config.recoveryTimeout;
        
        logger.warn(`Circuit breaker opened for ${key}`, {
          failureCount: circuitBreaker.failureCount,
          threshold: circuitBreaker.config.failureThreshold,
        });
      }
    }
  }

  /**
   * Reset circuit breaker
   */
  private resetCircuitBreaker(key: string): void {
    const circuitBreaker = this.circuitBreakers.get(key);
    
    if (circuitBreaker) {
      circuitBreaker.state = CircuitBreakerState.CLOSED;
      circuitBreaker.failureCount = 0;
      circuitBreaker.lastFailureTime = 0;
      circuitBreaker.nextAttemptTime = 0;
    }
  }

  /**
   * Initialize error patterns
   */
  private initializeErrorPatterns(): void {
    this.errorPatterns.set('validation', ErrorCategory.VALIDATION);
    this.errorPatterns.set('invalid', ErrorCategory.VALIDATION);
    this.errorPatterns.set('required', ErrorCategory.VALIDATION);
    this.errorPatterns.set('unauthorized', ErrorCategory.AUTHENTICATION);
    this.errorPatterns.set('forbidden', ErrorCategory.AUTHORIZATION);
    this.errorPatterns.set('permission', ErrorCategory.AUTHORIZATION);
    this.errorPatterns.set('network', ErrorCategory.NETWORK);
    this.errorPatterns.set('connection', ErrorCategory.NETWORK);
    this.errorPatterns.set('timeout', ErrorCategory.TIMEOUT);
    this.errorPatterns.set('database', ErrorCategory.DATABASE);
    this.errorPatterns.set('sql', ErrorCategory.DATABASE);
    this.errorPatterns.set('rate limit', ErrorCategory.RATE_LIMIT);
    this.errorPatterns.set('too many requests', ErrorCategory.RATE_LIMIT);
    this.errorPatterns.set('security', ErrorCategory.SECURITY);
    this.errorPatterns.set('malicious', ErrorCategory.SECURITY);
  }

  /**
   * Initialize recovery strategies
   */
  private initializeRecoveryStrategies(): void {
    this.recoveryStrategies.set(ErrorCategory.NETWORK, RecoveryStrategy.RETRY);
    this.recoveryStrategies.set(ErrorCategory.TIMEOUT, RecoveryStrategy.RETRY);
    this.recoveryStrategies.set(ErrorCategory.EXTERNAL_SERVICE, RecoveryStrategy.CIRCUIT_BREAKER);
    this.recoveryStrategies.set(ErrorCategory.RATE_LIMIT, RecoveryStrategy.RETRY);
    this.recoveryStrategies.set(ErrorCategory.SYSTEM, RecoveryStrategy.FALLBACK);
    this.recoveryStrategies.set(ErrorCategory.DATABASE, RecoveryStrategy.CIRCUIT_BREAKER);
    this.recoveryStrategies.set(ErrorCategory.VALIDATION, RecoveryStrategy.USER_INTERVENTION);
    this.recoveryStrategies.set(ErrorCategory.AUTHENTICATION, RecoveryStrategy.USER_INTERVENTION);
    this.recoveryStrategies.set(ErrorCategory.AUTHORIZATION, RecoveryStrategy.USER_INTERVENTION);
    this.recoveryStrategies.set(ErrorCategory.SECURITY, RecoveryStrategy.NONE);
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean old errors every hour
    setInterval(() => {
      const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      this.errorHistory = this.errorHistory.filter(error => error.timestamp > cutoff);
    }, 60 * 60 * 1000);

    // Reset circuit breakers periodically
    setInterval(() => {
      const now = Date.now();
      for (const [key, circuitBreaker] of this.circuitBreakers.entries()) {
        // Reset old failures outside monitoring period
        if (now - circuitBreaker.lastFailureTime > circuitBreaker.config.monitoringPeriod) {
          circuitBreaker.failureCount = 0;
          if (circuitBreaker.state === CircuitBreakerState.OPEN) {
            circuitBreaker.state = CircuitBreakerState.CLOSED;
          }
        }
      }
    }, 60 * 1000); // Every minute
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    circuitBreakerStates: Record<string, CircuitBreakerState>;
    recentErrors: StructuredError[];
  } {
    const errorsByCategory = {} as Record<ErrorCategory, number>;
    const errorsBySeverity = {} as Record<ErrorSeverity, number>;
    
    // Initialize counters
    Object.values(ErrorCategory).forEach(category => {
      errorsByCategory[category] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = 0;
    });
    
    // Count errors
    this.errorHistory.forEach(error => {
      errorsByCategory[error.category]++;
      errorsBySeverity[error.severity]++;
    });
    
    // Get circuit breaker states
    const circuitBreakerStates: Record<string, CircuitBreakerState> = {};
    for (const [key, circuitBreaker] of this.circuitBreakers.entries()) {
      circuitBreakerStates[key] = circuitBreaker.state;
    }
    
    return {
      totalErrors: this.errorHistory.length,
      errorsByCategory,
      errorsBySeverity,
      circuitBreakerStates,
      recentErrors: this.errorHistory.slice(-10),
    };
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// Export utility functions
export const ErrorUtils = {
  /**
   * Create error handling middleware
   */
  createErrorMiddleware: () => {
    return async (error: any, req: any, res: any, next: any) => {
      const structuredError = await errorHandler.handleError(error, {
        requestId: req.headers['x-request-id'],
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        endpoint: req.path,
        method: req.method,
      });

      // Send appropriate response
      const statusCode = error.status || error.statusCode || 500;
      res.status(statusCode).json({
        error: {
          id: structuredError.id,
          code: structuredError.code,
          message: structuredError.userMessage,
          suggestions: structuredError.suggestions,
        },
        ...(process.env.NODE_ENV === 'development' && {
          debug: {
            category: structuredError.category,
            severity: structuredError.severity,
            developerMessage: structuredError.developerMessage,
          },
        }),
      });
    };
  },

  /**
   * Wrap async function with error handling
   */
  wrapAsync: <T extends any[], R>(
    fn: (...args: T) => Promise<R>
  ) => {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        const structuredError = await errorHandler.handleError(error);
        throw structuredError;
      }
    };
  },

  /**
   * Create error handler for async operations
   */
  handleAsyncError: async (error: any, context?: Record<string, any>): Promise<StructuredError> => {
    return await errorHandler.handleError(error, context);
  },

  /**
   * Generate error report
   */
  generateErrorReport: (): string => {
    const stats = errorHandler.getErrorStatistics();
    
    return `
# Error Handling Report

## Summary
- **Total Errors**: ${stats.totalErrors}
- **Recent Errors**: ${stats.recentErrors.length}

## Errors by Category
${Object.entries(stats.errorsByCategory)
  .filter(([_, count]) => count > 0)
  .map(([category, count]) => `- **${category}**: ${count}`)
  .join('\n')}

## Errors by Severity
${Object.entries(stats.errorsBySeverity)
  .filter(([_, count]) => count > 0)
  .map(([severity, count]) => `- **${severity}**: ${count}`)
  .join('\n')}

## Circuit Breaker Status
${Object.entries(stats.circuitBreakerStates)
  .map(([key, state]) => `- **${key}**: ${state}`)
  .join('\n')}

## Recent Errors
${stats.recentErrors.map(error => 
  `- **${new Date(error.timestamp).toISOString()}**: ${error.message} [${error.severity}]`
).join('\n')}

Generated at: ${new Date().toISOString()}
    `.trim();
  },
};