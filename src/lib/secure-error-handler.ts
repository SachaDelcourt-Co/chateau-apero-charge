/**
 * Secure Error Handling System for Financial Data Processing
 * 
 * Production-ready error handling system that provides secure error responses,
 * prevents information disclosure, implements proper error logging, and
 * maintains security while providing useful debugging information.
 * 
 * Features:
 * - Sanitized error messages to prevent information disclosure
 * - Structured error codes for client handling
 * - Comprehensive error logging with security context
 * - Different error responses for development vs production
 * - Security event detection and alerting
 * - Error rate monitoring and circuit breaking
 * - Correlation ID tracking for debugging
 * - Compliance with security standards
 */

import { SecurityConfig } from '../config/security';
import { auditLogger, AuditResult, RiskLevel } from './audit-logger';
import { DataMaskingService } from './encryption';

// Error classification
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  EXTERNAL_SERVICE = 'external_service',
  DATABASE = 'database',
  NETWORK = 'network',
  SYSTEM = 'system',
  SECURITY = 'security',
  RATE_LIMIT = 'rate_limit',
  CONFIGURATION = 'configuration',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Error interfaces
export interface SecureError {
  id: string;
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: string;
  requestId?: string;
  correlationId?: string;
  statusCode: number;
  details?: Record<string, any>;
  userMessage: string;
  developerMessage?: string;
  helpUrl?: string;
  retryable: boolean;
}

export interface ErrorContext {
  requestId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  correlationId?: string;
  sessionId?: string;
  additionalContext?: Record<string, any>;
}

export interface ErrorHandlingOptions {
  sanitizeMessage?: boolean;
  logError?: boolean;
  notifyAdmins?: boolean;
  includeStackTrace?: boolean;
  maskSensitiveData?: boolean;
  generateCorrelationId?: boolean;
}

// Predefined error codes
export const ErrorCodes = {
  // Authentication errors
  AUTH_REQUIRED: 'AUTH_001',
  AUTH_INVALID_TOKEN: 'AUTH_002',
  AUTH_TOKEN_EXPIRED: 'AUTH_003',
  AUTH_INVALID_CREDENTIALS: 'AUTH_004',
  AUTH_ACCOUNT_LOCKED: 'AUTH_005',
  AUTH_SESSION_EXPIRED: 'AUTH_006',

  // Authorization errors
  AUTHZ_INSUFFICIENT_PERMISSIONS: 'AUTHZ_001',
  AUTHZ_ROLE_REQUIRED: 'AUTHZ_002',
  AUTHZ_RESOURCE_ACCESS_DENIED: 'AUTHZ_003',
  AUTHZ_OPERATION_NOT_ALLOWED: 'AUTHZ_004',

  // Validation errors
  VALIDATION_REQUIRED_FIELD: 'VAL_001',
  VALIDATION_INVALID_FORMAT: 'VAL_002',
  VALIDATION_OUT_OF_RANGE: 'VAL_003',
  VALIDATION_INVALID_TYPE: 'VAL_004',
  VALIDATION_BUSINESS_RULE: 'VAL_005',
  VALIDATION_DUPLICATE_VALUE: 'VAL_006',

  // Financial errors
  FINANCIAL_INVALID_AMOUNT: 'FIN_001',
  FINANCIAL_INVALID_IBAN: 'FIN_002',
  FINANCIAL_AMOUNT_LIMIT_EXCEEDED: 'FIN_003',
  FINANCIAL_INSUFFICIENT_FUNDS: 'FIN_004',
  FINANCIAL_TRANSACTION_FAILED: 'FIN_005',
  FINANCIAL_CURRENCY_NOT_SUPPORTED: 'FIN_006',

  // System errors
  SYSTEM_INTERNAL_ERROR: 'SYS_001',
  SYSTEM_SERVICE_UNAVAILABLE: 'SYS_002',
  SYSTEM_TIMEOUT: 'SYS_003',
  SYSTEM_CONFIGURATION_ERROR: 'SYS_004',
  SYSTEM_RESOURCE_EXHAUSTED: 'SYS_005',

  // Security errors
  SECURITY_RATE_LIMIT_EXCEEDED: 'SEC_001',
  SECURITY_SUSPICIOUS_ACTIVITY: 'SEC_002',
  SECURITY_IP_BLOCKED: 'SEC_003',
  SECURITY_REQUEST_TOO_LARGE: 'SEC_004',
  SECURITY_INVALID_REQUEST: 'SEC_005',
  SECURITY_ENCRYPTION_FAILED: 'SEC_006',

  // External service errors
  EXT_SERVICE_UNAVAILABLE: 'EXT_001',
  EXT_SERVICE_TIMEOUT: 'EXT_002',
  EXT_SERVICE_INVALID_RESPONSE: 'EXT_003',
  EXT_SERVICE_RATE_LIMITED: 'EXT_004',

  // Database errors
  DB_CONNECTION_FAILED: 'DB_001',
  DB_QUERY_FAILED: 'DB_002',
  DB_CONSTRAINT_VIOLATION: 'DB_003',
  DB_TRANSACTION_FAILED: 'DB_004',
  DB_TIMEOUT: 'DB_005',
};

/**
 * Secure Error Handler Class
 */
export class SecureErrorHandler {
  private errorCounts: Map<string, number> = new Map();
  private lastErrorTime: Map<string, number> = new Map();
  private circuitBreakers: Map<string, boolean> = new Map();

  /**
   * Handle and process errors securely
   */
  async handleError(
    error: any,
    context: ErrorContext,
    options: ErrorHandlingOptions = {}
  ): Promise<SecureError> {
    const {
      sanitizeMessage = true,
      logError = true,
      notifyAdmins = false,
      includeStackTrace = process.env.NODE_ENV === 'development',
      maskSensitiveData = true,
      generateCorrelationId = true,
    } = options;

    // Generate error ID and correlation ID
    const errorId = this.generateErrorId();
    const correlationId = generateCorrelationId ? 
      context.correlationId || this.generateCorrelationId() : 
      context.correlationId;

    // Classify error
    const classification = this.classifyError(error);
    
    // Create secure error object
    const secureError: SecureError = {
      id: errorId,
      code: classification.code,
      message: sanitizeMessage ? this.sanitizeErrorMessage(error, classification) : error.message,
      category: classification.category,
      severity: classification.severity,
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
      correlationId,
      statusCode: classification.statusCode,
      userMessage: this.generateUserMessage(classification),
      developerMessage: includeStackTrace ? error.stack : undefined,
      helpUrl: this.generateHelpUrl(classification.code),
      retryable: this.isRetryable(classification),
      details: maskSensitiveData ? 
        this.maskErrorDetails(error.details || {}) : 
        error.details,
    };

    // Log error if enabled
    if (logError) {
      await this.logError(secureError, error, context);
    }

    // Check for security violations
    if (classification.category === ErrorCategory.SECURITY) {
      await this.handleSecurityViolation(secureError, context);
    }

    // Update error metrics
    this.updateErrorMetrics(classification.code, context);

    // Notify administrators if required
    if (notifyAdmins || classification.severity === ErrorSeverity.CRITICAL) {
      await this.notifyAdministrators(secureError, context);
    }

    return secureError;
  }

  /**
   * Create standardized error response
   */
  createErrorResponse(secureError: SecureError): any {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const response: any = {
      success: false,
      error: {
        id: secureError.id,
        code: secureError.code,
        message: secureError.userMessage,
        timestamp: secureError.timestamp,
        requestId: secureError.requestId,
      },
    };

    // Add correlation ID if present
    if (secureError.correlationId) {
      response.error.correlationId = secureError.correlationId;
    }

    // Add retry information
    if (secureError.retryable) {
      response.error.retryable = true;
      response.error.retryAfter = this.calculateRetryDelay(secureError.category);
    }

    // Add help URL if available
    if (secureError.helpUrl) {
      response.error.helpUrl = secureError.helpUrl;
    }

    // Include developer information in non-production environments
    if (!isProduction) {
      response.error.developerMessage = secureError.message;
      response.error.category = secureError.category;
      response.error.severity = secureError.severity;
      
      if (secureError.developerMessage) {
        response.error.stackTrace = secureError.developerMessage;
      }
      
      if (secureError.details) {
        response.error.details = secureError.details;
      }
    }

    return response;
  }

  /**
   * Handle validation errors specifically
   */
  async handleValidationError(
    validationErrors: any[],
    context: ErrorContext
  ): Promise<SecureError> {
    const error = new Error('Validation failed');
    error.name = 'ValidationError';
    (error as any).validationErrors = validationErrors;
    (error as any).details = { validationErrors };

    return this.handleError(error, context, {
      sanitizeMessage: true,
      logError: true,
      maskSensitiveData: true,
    });
  }

  /**
   * Handle authentication errors
   */
  async handleAuthenticationError(
    authError: any,
    context: ErrorContext
  ): Promise<SecureError> {
    const error = new Error('Authentication failed');
    error.name = 'AuthenticationError';
    (error as any).authError = authError;

    // Log potential security violation
    await auditLogger.logSecurityViolation({
      requestId: context.requestId,
      userId: context.userId,
      violationType: 'invalid_token',
      description: 'Authentication failure detected',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      severity: RiskLevel.MEDIUM,
    });

    return this.handleError(error, context, {
      sanitizeMessage: true,
      logError: true,
      notifyAdmins: this.shouldNotifyForAuthError(authError),
    });
  }

  /**
   * Handle authorization errors
   */
  async handleAuthorizationError(
    authzError: any,
    context: ErrorContext
  ): Promise<SecureError> {
    const error = new Error('Authorization failed');
    error.name = 'AuthorizationError';
    (error as any).authzError = authzError;

    return this.handleError(error, context, {
      sanitizeMessage: true,
      logError: true,
    });
  }

  /**
   * Handle financial transaction errors
   */
  async handleFinancialError(
    financialError: any,
    context: ErrorContext
  ): Promise<SecureError> {
    const error = new Error('Financial transaction failed');
    error.name = 'FinancialError';
    (error as any).financialError = financialError;

    return this.handleError(error, context, {
      sanitizeMessage: true,
      logError: true,
      notifyAdmins: true, // Always notify for financial errors
      maskSensitiveData: true,
    });
  }

  /**
   * Classify error type and severity
   */
  private classifyError(error: any): {
    code: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    statusCode: number;
  } {
    // Check error name/type first
    switch (error.name) {
      case 'ValidationError':
        return {
          code: ErrorCodes.VALIDATION_REQUIRED_FIELD,
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.LOW,
          statusCode: 400,
        };

      case 'AuthenticationError':
        return {
          code: ErrorCodes.AUTH_INVALID_TOKEN,
          category: ErrorCategory.AUTHENTICATION,
          severity: ErrorSeverity.MEDIUM,
          statusCode: 401,
        };

      case 'AuthorizationError':
        return {
          code: ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
          category: ErrorCategory.AUTHORIZATION,
          severity: ErrorSeverity.MEDIUM,
          statusCode: 403,
        };

      case 'FinancialError':
        return {
          code: ErrorCodes.FINANCIAL_TRANSACTION_FAILED,
          category: ErrorCategory.BUSINESS_LOGIC,
          severity: ErrorSeverity.HIGH,
          statusCode: 400,
        };

      case 'RateLimitError':
        return {
          code: ErrorCodes.SECURITY_RATE_LIMIT_EXCEEDED,
          category: ErrorCategory.SECURITY,
          severity: ErrorSeverity.MEDIUM,
          statusCode: 429,
        };

      case 'TimeoutError':
        return {
          code: ErrorCodes.SYSTEM_TIMEOUT,
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.MEDIUM,
          statusCode: 504,
        };
    }

    // Check error message patterns
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('iban') || message.includes('invalid account')) {
      return {
        code: ErrorCodes.FINANCIAL_INVALID_IBAN,
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        statusCode: 400,
      };
    }

    if (message.includes('amount') && message.includes('invalid')) {
      return {
        code: ErrorCodes.FINANCIAL_INVALID_AMOUNT,
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        statusCode: 400,
      };
    }

    if (message.includes('database') || message.includes('connection')) {
      return {
        code: ErrorCodes.DB_CONNECTION_FAILED,
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        statusCode: 503,
      };
    }

    if (message.includes('network') || message.includes('fetch')) {
      return {
        code: ErrorCodes.EXT_SERVICE_UNAVAILABLE,
        category: ErrorCategory.EXTERNAL_SERVICE,
        severity: ErrorSeverity.MEDIUM,
        statusCode: 503,
      };
    }

    // Default classification
    return {
      code: ErrorCodes.SYSTEM_INTERNAL_ERROR,
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.HIGH,
      statusCode: 500,
    };
  }

  /**
   * Sanitize error message to prevent information disclosure
   */
  private sanitizeErrorMessage(error: any, classification: any): string {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // In production, use generic messages for security
    if (isProduction) {
      switch (classification.category) {
        case ErrorCategory.AUTHENTICATION:
          return 'Authentication failed';
        case ErrorCategory.AUTHORIZATION:
          return 'Access denied';
        case ErrorCategory.VALIDATION:
          return 'Invalid request data';
        case ErrorCategory.BUSINESS_LOGIC:
          return 'Business rule violation';
        case ErrorCategory.SECURITY:
          return 'Security policy violation';
        case ErrorCategory.SYSTEM:
        case ErrorCategory.DATABASE:
        case ErrorCategory.EXTERNAL_SERVICE:
          return 'Service temporarily unavailable';
        default:
          return 'An error occurred while processing your request';
      }
    }

    // In development, provide more detailed messages but still sanitize
    let message = error.message || 'Unknown error';
    
    // Remove sensitive information patterns
    message = message.replace(/password[=:]\s*\S+/gi, 'password=***');
    message = message.replace(/token[=:]\s*\S+/gi, 'token=***');
    message = message.replace(/key[=:]\s*\S+/gi, 'key=***');
    message = message.replace(/secret[=:]\s*\S+/gi, 'secret=***');
    message = message.replace(/BE\d{14}/g, 'BE***'); // Mask IBANs
    message = message.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '***@***.***'); // Mask emails
    
    return message;
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserMessage(classification: any): string {
    switch (classification.code) {
      case ErrorCodes.AUTH_REQUIRED:
        return 'Please log in to access this resource.';
      case ErrorCodes.AUTH_INVALID_TOKEN:
        return 'Your session has expired. Please log in again.';
      case ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS:
        return 'You do not have permission to perform this action.';
      case ErrorCodes.VALIDATION_REQUIRED_FIELD:
        return 'Please check your input and try again.';
      case ErrorCodes.FINANCIAL_INVALID_IBAN:
        return 'Please provide a valid Belgian IBAN.';
      case ErrorCodes.FINANCIAL_INVALID_AMOUNT:
        return 'Please provide a valid amount.';
      case ErrorCodes.SECURITY_RATE_LIMIT_EXCEEDED:
        return 'Too many requests. Please try again later.';
      case ErrorCodes.SYSTEM_SERVICE_UNAVAILABLE:
        return 'Service is temporarily unavailable. Please try again later.';
      default:
        return 'An error occurred. Please try again or contact support if the problem persists.';
    }
  }

  /**
   * Generate help URL for error code
   */
  private generateHelpUrl(errorCode: string): string | undefined {
    const baseUrl = 'https://docs.example.com/errors';
    
    // Map error codes to documentation URLs
    const helpUrls: Record<string, string> = {
      [ErrorCodes.AUTH_REQUIRED]: `${baseUrl}/authentication`,
      [ErrorCodes.AUTH_INVALID_TOKEN]: `${baseUrl}/authentication`,
      [ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS]: `${baseUrl}/authorization`,
      [ErrorCodes.VALIDATION_REQUIRED_FIELD]: `${baseUrl}/validation`,
      [ErrorCodes.FINANCIAL_INVALID_IBAN]: `${baseUrl}/financial-data`,
      [ErrorCodes.SECURITY_RATE_LIMIT_EXCEEDED]: `${baseUrl}/rate-limits`,
    };

    return helpUrls[errorCode];
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(classification: any): boolean {
    const retryableCategories = [
      ErrorCategory.NETWORK,
      ErrorCategory.EXTERNAL_SERVICE,
      ErrorCategory.SYSTEM,
    ];

    const retryableCodes = [
      ErrorCodes.SYSTEM_TIMEOUT,
      ErrorCodes.EXT_SERVICE_TIMEOUT,
      ErrorCodes.DB_TIMEOUT,
      ErrorCodes.SYSTEM_SERVICE_UNAVAILABLE,
    ];

    return retryableCategories.includes(classification.category) ||
           retryableCodes.includes(classification.code);
  }

  /**
   * Calculate retry delay based on error category
   */
  private calculateRetryDelay(category: ErrorCategory): number {
    switch (category) {
      case ErrorCategory.RATE_LIMIT:
        return 60; // 1 minute
      case ErrorCategory.EXTERNAL_SERVICE:
        return 30; // 30 seconds
      case ErrorCategory.NETWORK:
        return 15; // 15 seconds
      case ErrorCategory.SYSTEM:
        return 120; // 2 minutes
      default:
        return 60; // 1 minute default
    }
  }

  /**
   * Mask sensitive data in error details
   */
  private maskErrorDetails(details: Record<string, any>): Record<string, any> {
    return DataMaskingService.maskObjectForLogging(details);
  }

  /**
   * Log error with appropriate security context
   */
  private async logError(
    secureError: SecureError,
    originalError: any,
    context: ErrorContext
  ): Promise<void> {
    await auditLogger.logError({
      requestId: context.requestId,
      userId: context.userId,
      action: context.endpoint || 'unknown',
      resource: 'error_handler',
      error: {
        id: secureError.id,
        code: secureError.code,
        category: secureError.category,
        severity: secureError.severity,
        message: secureError.message,
        stack: originalError.stack,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        correlationId: secureError.correlationId,
        statusCode: secureError.statusCode,
        retryable: secureError.retryable,
      },
    });
  }

  /**
   * Handle security violations
   */
  private async handleSecurityViolation(
    secureError: SecureError,
    context: ErrorContext
  ): Promise<void> {
    let violationType: string;
    let severity: RiskLevel;

    switch (secureError.code) {
      case ErrorCodes.SECURITY_RATE_LIMIT_EXCEEDED:
        violationType = 'rate_limit_exceeded';
        severity = RiskLevel.MEDIUM;
        break;
      case ErrorCodes.SECURITY_SUSPICIOUS_ACTIVITY:
        violationType = 'suspicious_activity';
        severity = RiskLevel.HIGH;
        break;
      case ErrorCodes.SECURITY_IP_BLOCKED:
        violationType = 'suspicious_activity';
        severity = RiskLevel.HIGH;
        break;
      default:
        violationType = 'security_violation';
        severity = RiskLevel.MEDIUM;
    }

    await auditLogger.logSecurityViolation({
      requestId: context.requestId,
      userId: context.userId,
      violationType: violationType as any,
      description: secureError.message,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      severity,
      metadata: {
        errorId: secureError.id,
        errorCode: secureError.code,
      },
    });
  }

  /**
   * Update error metrics for monitoring
   */
  private updateErrorMetrics(errorCode: string, context: ErrorContext): void {
    const key = `${errorCode}:${context.ipAddress || 'unknown'}`;
    const currentCount = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, currentCount + 1);
    this.lastErrorTime.set(key, Date.now());

    // Check for error rate thresholds
    if (currentCount > 10) { // More than 10 errors from same IP/code
      this.circuitBreakers.set(key, true);
    }
  }

  /**
   * Check if we should notify administrators for auth errors
   */
  private shouldNotifyForAuthError(authError: any): boolean {
    // Notify for repeated failures or suspicious patterns
    return authError?.attempts > 3 || authError?.suspicious === true;
  }

  /**
   * Notify administrators of critical errors
   */
  private async notifyAdministrators(
    secureError: SecureError,
    context: ErrorContext
  ): Promise<void> {
    // In production, integrate with alerting system (email, Slack, PagerDuty, etc.)
    console.error(`[ADMIN ALERT] Critical error occurred:`, {
      errorId: secureError.id,
      code: secureError.code,
      severity: secureError.severity,
      requestId: context.requestId,
      userId: context.userId,
      timestamp: secureError.timestamp,
    });
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate correlation ID for error tracking
   */
  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if circuit breaker is open for error type
   */
  isCircuitBreakerOpen(errorCode: string, ipAddress: string): boolean {
    const key = `${errorCode}:${ipAddress}`;
    return this.circuitBreakers.get(key) || false;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(errorCode: string, ipAddress: string): void {
    const key = `${errorCode}:${ipAddress}`;
    this.circuitBreakers.delete(key);
    this.errorCounts.delete(key);
    this.lastErrorTime.delete(key);
  }
}

// Export singleton instance
export const secureErrorHandler = new SecureErrorHandler();

// Export utility functions
export const ErrorHandlerUtils = {
  /**
   * Create error context from request
   */
  createErrorContext: (req: any, additionalContext?: Record<string, any>): ErrorContext => ({
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
    userId: req.user?.id,
    ipAddress: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    endpoint: req.url,
    method: req.method,
    sessionId: req.session?.id,
    additionalContext,
  }),

  /**
   * Check if error is client error (4xx)
   */
  isClientError: (statusCode: number): boolean => {
    return statusCode >= 400 && statusCode < 500;
  },

  /**
   * Check if error is server error (5xx)
   */
  isServerError: (statusCode: number): boolean => {
    return statusCode >= 500 && statusCode < 600;
  },

  /**
   * Extract error message safely
   */
  extractErrorMessage: (error: any): string => {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.error?.message) return error.error.message;
    return 'Unknown error occurred';
  },
};