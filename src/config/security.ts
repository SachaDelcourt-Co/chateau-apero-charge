/**
 * Security Configuration for Financial Data Processing
 * 
 * Centralized security configuration for the refund system with production-ready
 * security policies, limits, and encryption settings appropriate for financial data.
 * 
 * Features:
 * - Authentication and authorization policies
 * - Rate limiting and request size limits
 * - Data validation rules and financial limits
 * - Encryption configuration
 * - Security headers and CORS policies
 * - Audit logging configuration
 * - Compliance settings (GDPR, PCI DSS considerations)
 */

// Environment-based configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Security Policy Configuration
export const SecurityConfig = {
  // Authentication & Authorization
  auth: {
    // JWT token configuration
    jwt: {
      algorithm: 'HS256' as const,
      expiresIn: '1h',
      refreshExpiresIn: '7d',
      issuer: 'chateau-apero-refund-system',
      audience: 'refund-api',
    },
    
    // Session configuration
    session: {
      maxAge: 60 * 60 * 1000, // 1 hour in milliseconds
      secure: isProduction, // HTTPS only in production
      httpOnly: true,
      sameSite: 'strict' as const,
    },
    
    // Role-based access control
    roles: {
      ADMIN: 'admin',
      FINANCE_MANAGER: 'finance_manager',
      AUDITOR: 'auditor',
    },
    
    // Required permissions for refund operations
    permissions: {
      PROCESS_REFUNDS: 'process_refunds',
      VIEW_REFUND_DATA: 'view_refund_data',
      GENERATE_XML: 'generate_xml',
      ACCESS_AUDIT_LOGS: 'access_audit_logs',
      MANAGE_USERS: 'manage_users',
    },
    
    // Failed authentication tracking
    failedAttempts: {
      maxAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
      resetTime: 60 * 60 * 1000, // 1 hour
    },
  },

  // Rate Limiting Configuration
  rateLimiting: {
    // General API rate limits
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
      message: 'Too many requests from this IP, please try again later.',
    },
    
    // Strict limits for financial operations
    financial: {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 10,
      message: 'Financial operation rate limit exceeded. Please contact support.',
    },
    
    // Authentication endpoint limits
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
      message: 'Too many authentication attempts. Please try again later.',
    },
  },

  // Request Size Limits
  requestLimits: {
    // General request body size
    maxBodySize: '10mb',
    
    // File upload limits
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedFileTypes: ['.xml', '.csv', '.json'],
    
    // Refund processing limits
    maxRefundsPerBatch: 1000,
    maxTotalAmount: 1000000, // €1,000,000
  },

  // Data Validation Rules
  validation: {
    // Financial data validation
    financial: {
      minAmount: 0.01, // Minimum €0.01
      maxAmount: 999999.99, // Maximum €999,999.99
      maxDailyTotal: 100000, // €100,000 per day
      currency: 'EUR',
      decimalPlaces: 2,
    },
    
    // IBAN validation
    iban: {
      allowedCountries: ['BE'], // Belgian IBANs only
      validateChecksum: true,
      format: /^BE\d{14}$/,
    },
    
    // Personal data validation
    personalData: {
      nameMaxLength: 70,
      emailMaxLength: 254,
      allowedNameChars: /^[a-zA-Z0-9\/\-\?:\(\)\.,'\+ ]*$/,
      emailFormat: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    
    // Input sanitization
    sanitization: {
      stripHtml: true,
      trimWhitespace: true,
      normalizeUnicode: true,
      maxStringLength: 1000,
    },
  },

  // Encryption Configuration
  encryption: {
    // Data at rest encryption
    dataAtRest: {
      algorithm: 'aes-256-gcm',
      keyRotationDays: 90,
      backupEncryption: true,
    },
    
    // Data in transit encryption
    dataInTransit: {
      minTlsVersion: '1.2',
      cipherSuites: [
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256',
      ],
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    },
    
    // Sensitive data fields to encrypt
    sensitiveFields: [
      'account', // IBAN
      'email',
      'first_name',
      'last_name',
      'card_balance',
      'amount_recharged',
    ],
    
    // Data masking for logs
    maskingRules: {
      iban: (value: string) => value.replace(/(.{4})(.*)(.{4})/, '$1****$3'),
      email: (value: string) => value.replace(/(.{2}).*(@.*)/, '$1***$2'),
      name: (value: string) => value.replace(/(.{1}).*(.{1})/, '$1***$2'),
      amount: (value: number) => '***.**',
    },
  },

  // Security Headers Configuration
  headers: {
    // Content Security Policy
    csp: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    
    // Security headers
    security: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    },
    
    // CORS configuration
    cors: {
      origin: isProduction 
        ? ['https://your-production-domain.com'] 
        : ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-API-Key',
        'X-Request-ID',
      ],
      credentials: true,
      maxAge: 86400, // 24 hours
    },
  },

  // Audit Logging Configuration
  audit: {
    // Events to log
    events: {
      AUTHENTICATION: 'auth',
      AUTHORIZATION: 'authz',
      REFUND_PROCESSING: 'refund_process',
      DATA_ACCESS: 'data_access',
      CONFIGURATION_CHANGE: 'config_change',
      SECURITY_VIOLATION: 'security_violation',
      ERROR: 'error',
    },
    
    // Log levels
    levels: {
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
      CRITICAL: 'critical',
    },
    
    // Log retention
    retention: {
      days: 2555, // 7 years for financial records
      archiveAfterDays: 365,
      compressionEnabled: true,
    },
    
    // Log format
    format: {
      timestamp: true,
      requestId: true,
      userId: true,
      ipAddress: true,
      userAgent: true,
      action: true,
      resource: true,
      result: true,
      duration: true,
    },
  },

  // Monitoring and Alerting
  monitoring: {
    // Security events to monitor
    alerts: {
      multipleFailedLogins: {
        threshold: 3,
        timeWindow: 300000, // 5 minutes
        severity: 'high',
      },
      
      unusualDataAccess: {
        threshold: 100,
        timeWindow: 3600000, // 1 hour
        severity: 'medium',
      },
      
      largeRefundAmount: {
        threshold: 10000, // €10,000
        severity: 'high',
      },
      
      systemErrors: {
        threshold: 10,
        timeWindow: 300000, // 5 minutes
        severity: 'critical',
      },
    },
    
    // Health check configuration
    healthCheck: {
      interval: 30000, // 30 seconds
      timeout: 5000, // 5 seconds
      retries: 3,
    },
  },

  // Compliance Configuration
  compliance: {
    // GDPR settings
    gdpr: {
      dataRetentionDays: 2555, // 7 years for financial records
      anonymizationAfterDays: 2920, // 8 years
      consentRequired: true,
      rightToErasure: true,
      dataPortability: true,
    },
    
    // PCI DSS considerations
    pciDss: {
      encryptSensitiveData: true,
      restrictDataAccess: true,
      logDataAccess: true,
      regularSecurityTesting: true,
    },
    
    // Financial regulations
    financial: {
      auditTrailRequired: true,
      transactionLogging: true,
      dataIntegrityChecks: true,
      regulatoryReporting: true,
    },
  },

  // Environment-specific overrides
  environment: {
    development: {
      // Relaxed settings for development
      rateLimiting: {
        general: { maxRequests: 1000 },
        financial: { maxRequests: 100 },
      },
      cors: {
        origin: '*', // Allow all origins in development
      },
      encryption: {
        dataAtRest: { algorithm: 'aes-128-gcm' }, // Lighter encryption
      },
    },
    
    production: {
      // Strict settings for production
      rateLimiting: {
        general: { maxRequests: 50 },
        financial: { maxRequests: 5 },
      },
      headers: {
        security: {
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        },
      },
    },
  },
};

// Helper functions for security configuration
export const SecurityUtils = {
  /**
   * Get environment-specific configuration
   */
  getConfig: () => {
    const baseConfig = SecurityConfig;
    const envOverrides = isProduction 
      ? SecurityConfig.environment.production 
      : SecurityConfig.environment.development;
    
    return {
      ...baseConfig,
      ...envOverrides,
    };
  },

  /**
   * Check if user has required permission
   */
  hasPermission: (userPermissions: string[], requiredPermission: string): boolean => {
    return userPermissions.includes(requiredPermission);
  },

  /**
   * Check if user has required role
   */
  hasRole: (userRoles: string[], requiredRole: string): boolean => {
    return userRoles.includes(requiredRole);
  },

  /**
   * Validate financial amount
   */
  isValidAmount: (amount: number): boolean => {
    const { minAmount, maxAmount } = SecurityConfig.validation.financial;
    return amount >= minAmount && amount <= maxAmount;
  },

  /**
   * Validate IBAN format
   */
  isValidIBAN: (iban: string): boolean => {
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    return SecurityConfig.validation.iban.format.test(cleanIban);
  },

  /**
   * Sanitize input string
   */
  sanitizeInput: (input: string): string => {
    if (!input) return '';
    
    let sanitized = input;
    
    if (SecurityConfig.validation.sanitization.stripHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }
    
    if (SecurityConfig.validation.sanitization.trimWhitespace) {
      sanitized = sanitized.trim();
    }
    
    if (SecurityConfig.validation.sanitization.normalizeUnicode) {
      sanitized = sanitized.normalize('NFC');
    }
    
    const maxLength = SecurityConfig.validation.sanitization.maxStringLength;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    
    return sanitized;
  },

  /**
   * Mask sensitive data for logging
   */
  maskSensitiveData: (data: any, field: string): string => {
    const maskingRules = SecurityConfig.encryption.maskingRules;
    const value = data[field];
    
    if (!value) return '';
    
    switch (field) {
      case 'account':
        return maskingRules.iban(value);
      case 'email':
        return maskingRules.email(value);
      case 'first_name':
      case 'last_name':
        return maskingRules.name(value);
      case 'amount_recharged':
      case 'card_balance':
        return maskingRules.amount(value);
      default:
        return '***';
    }
  },

  /**
   * Generate secure request ID
   */
  generateRequestId: (): string => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Check if IP is rate limited
   */
  isRateLimited: (ip: string, endpoint: string): boolean => {
    // This would integrate with a rate limiting service
    // Implementation depends on your rate limiting strategy
    return false;
  },
};

// Export types for TypeScript support
export type SecurityConfigType = typeof SecurityConfig;
export type SecurityEvent = keyof typeof SecurityConfig.audit.events;
export type SecurityLevel = keyof typeof SecurityConfig.audit.levels;
export type UserRole = keyof typeof SecurityConfig.auth.roles;
export type Permission = keyof typeof SecurityConfig.auth.permissions;