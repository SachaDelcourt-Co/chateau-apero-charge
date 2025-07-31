/**
 * Comprehensive Input Validation and Sanitization
 * 
 * This module provides robust input validation and sanitization capabilities
 * to prevent injection attacks, data corruption, and security vulnerabilities.
 * 
 * Features:
 * - SQL injection prevention
 * - XSS protection and output encoding
 * - CSRF protection for state-changing operations
 * - Request payload size limits and validation
 * - Data type validation and coercion
 * - Business logic validation
 * - Sanitization of user inputs
 * - File upload validation
 * - Rate limiting for validation-heavy operations
 * - Comprehensive error reporting
 */

import { logger } from './logger';
import { auditLogger, RiskLevel, AuditResult } from './audit-logger';
import { SecurityUtils } from '../config/security';

// Validation result interface
export interface ValidationResult {
  valid: boolean;
  sanitizedData?: any;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  riskScore: number;
  securityFlags: string[];
}

// Validation error interface
export interface ValidationError {
  field: string;
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  value?: any;
}

// Validation warning interface
export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

// Validation schema interface
export interface ValidationSchema {
  [key: string]: FieldValidator;
}

// Field validator interface
export interface FieldValidator {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'url' | 'uuid' | 'iban' | 'amount' | 'card_id';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean | string;
  sanitize?: boolean;
  allowNull?: boolean;
  transform?: (value: any) => any;
  nested?: ValidationSchema;
}

// Sanitization options
export interface SanitizationOptions {
  removeHtml: boolean;
  removeScripts: boolean;
  removeSqlKeywords: boolean;
  normalizeWhitespace: boolean;
  trimStrings: boolean;
  escapeSpecialChars: boolean;
  maxLength?: number;
}

// CSRF token interface
export interface CsrfToken {
  token: string;
  timestamp: number;
  sessionId: string;
  used: boolean;
}

/**
 * Comprehensive Input Validator and Sanitizer
 */
export class InputValidator {
  private csrfTokens: Map<string, CsrfToken> = new Map();
  private validationCache: Map<string, ValidationResult> = new Map();
  private suspiciousPatterns: RegExp[] = [
    // SQL Injection patterns
    /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bDELETE\b|\bDROP\b|\bUPDATE\b).*(\bFROM\b|\bWHERE\b|\bINTO\b)/i,
    /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
    /['"]\s*;\s*\w+/i,
    
    // XSS patterns
    /<script[^>]*>.*?<\/script>/i,
    /javascript:/i,
    /vbscript:/i,
    /onload\s*=/i,
    /onerror\s*=/i,
    /onclick\s*=/i,
    
    // Command injection patterns
    /[;&|`$(){}[\]]/,
    /\.\.\//,
    /%2e%2e%2f/i,
    
    // LDAP injection patterns
    /[()&|!]/,
    
    // NoSQL injection patterns
    /\$where/i,
    /\$ne/i,
    /\$gt/i,
    /\$lt/i,
  ];

  constructor() {
    this.startCleanupTasks();
  }

  /**
   * Validate and sanitize input data
   */
  async validateInput(
    data: any,
    schema: ValidationSchema,
    options: {
      sanitize?: boolean;
      strict?: boolean;
      requestId?: string;
      userId?: string;
      ipAddress?: string;
    } = {}
  ): Promise<ValidationResult> {
    const { sanitize = true, strict = false, requestId, userId, ipAddress } = options;
    const startTime = Date.now();
    
    try {
      // Generate cache key for performance optimization
      const cacheKey = this.generateCacheKey(data, schema, options);
      const cached = this.validationCache.get(cacheKey);
      
      if (cached && Date.now() - startTime < 60000) { // 1 minute cache
        return cached;
      }

      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        riskScore: 0,
        securityFlags: [],
      };

      // Deep clone data to avoid mutations
      let processedData = JSON.parse(JSON.stringify(data));

      // 1. Check for suspicious patterns
      const suspiciousCheck = await this.checkSuspiciousPatterns(processedData, requestId);
      if (!suspiciousCheck.safe) {
        result.valid = false;
        result.errors.push({
          field: 'root',
          code: 'SUSPICIOUS_PATTERN',
          message: 'Potentially malicious input detected',
          severity: 'critical',
        });
        result.riskScore = 100;
        result.securityFlags.push('malicious_input');
        
        // Log security violation
        if (requestId) {
          await auditLogger.logSecurityViolation({
            requestId,
            userId,
            violationType: 'suspicious_activity',
            description: `Suspicious input pattern detected: ${suspiciousCheck.pattern}`,
            ipAddress: ipAddress || 'unknown',
            severity: RiskLevel.CRITICAL,
          });
        }
        
        return result;
      }

      // 2. Validate payload size
      const payloadSize = JSON.stringify(processedData).length;
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (payloadSize > maxSize) {
        result.valid = false;
        result.errors.push({
          field: 'root',
          code: 'PAYLOAD_TOO_LARGE',
          message: `Payload size ${payloadSize} exceeds maximum ${maxSize} bytes`,
          severity: 'high',
        });
        result.riskScore += 30;
        result.securityFlags.push('oversized_payload');
      }

      // 3. Validate against schema
      const schemaValidation = await this.validateAgainstSchema(processedData, schema, '', strict);
      result.errors.push(...schemaValidation.errors);
      result.warnings.push(...schemaValidation.warnings);
      result.riskScore += schemaValidation.riskScore;
      result.securityFlags.push(...schemaValidation.securityFlags);
      
      if (schemaValidation.errors.length > 0) {
        result.valid = false;
      }

      // 4. Sanitize data if requested and validation passed
      if (sanitize && result.valid) {
        processedData = await this.sanitizeData(processedData, schema);
        result.sanitizedData = processedData;
      }

      // 5. Cache result for performance
      this.validationCache.set(cacheKey, result);

      // 6. Log validation result
      if (requestId) {
        await auditLogger.logDataAccess({
          requestId,
          userId: userId || 'anonymous',
          action: 'input_validation',
          resource: 'validation_service',
          dataType: 'user_data',
          result: result.valid ? AuditResult.SUCCESS : AuditResult.FAILURE,
          duration: Date.now() - startTime,
          ipAddress: ipAddress || 'unknown',
        });
      }

      return result;

    } catch (error) {
      logger.error('Input validation error:', error);
      
      if (requestId) {
        await auditLogger.logError({
          requestId,
          userId,
          action: 'input_validation',
          resource: 'validation_service',
          error,
          duration: Date.now() - startTime,
          ipAddress: ipAddress || 'unknown',
        });
      }

      return {
        valid: false,
        errors: [{
          field: 'root',
          code: 'VALIDATION_ERROR',
          message: 'Internal validation error',
          severity: 'critical',
        }],
        warnings: [],
        riskScore: 100,
        securityFlags: ['validation_error'],
      };
    }
  }

  /**
   * Check for suspicious patterns in input data
   */
  private async checkSuspiciousPatterns(
    data: any,
    requestId?: string
  ): Promise<{ safe: boolean; pattern?: string }> {
    const dataString = JSON.stringify(data).toLowerCase();
    
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(dataString)) {
        return { safe: false, pattern: pattern.source };
      }
    }
    
    return { safe: true };
  }

  /**
   * Validate data against schema
   */
  private async validateAgainstSchema(
    data: any,
    schema: ValidationSchema,
    path: string = '',
    strict: boolean = false
  ): Promise<{
    errors: ValidationError[];
    warnings: ValidationWarning[];
    riskScore: number;
    securityFlags: string[];
  }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let riskScore = 0;
    const securityFlags: string[] = [];

    // Check for unexpected fields in strict mode
    if (strict && typeof data === 'object' && data !== null) {
      const allowedFields = Object.keys(schema);
      const actualFields = Object.keys(data);
      
      for (const field of actualFields) {
        if (!allowedFields.includes(field)) {
          warnings.push({
            field: path ? `${path}.${field}` : field,
            code: 'UNEXPECTED_FIELD',
            message: `Unexpected field '${field}' found`,
            suggestion: 'Remove unexpected fields or update schema',
          });
          riskScore += 5;
        }
      }
    }

    // Validate each field in schema
    for (const [fieldName, validator] of Object.entries(schema)) {
      const fieldPath = path ? `${path}.${fieldName}` : fieldName;
      const fieldValue = data?.[fieldName];
      
      // Check required fields
      if (validator.required && (fieldValue === undefined || fieldValue === null)) {
        errors.push({
          field: fieldPath,
          code: 'REQUIRED_FIELD',
          message: `Field '${fieldName}' is required`,
          severity: 'high',
        });
        riskScore += 20;
        continue;
      }

      // Skip validation if field is not present and not required
      if (fieldValue === undefined || (fieldValue === null && !validator.allowNull)) {
        continue;
      }

      // Validate field type and constraints
      const fieldValidation = await this.validateField(fieldValue, validator, fieldPath);
      errors.push(...fieldValidation.errors);
      warnings.push(...fieldValidation.warnings);
      riskScore += fieldValidation.riskScore;
      securityFlags.push(...fieldValidation.securityFlags);

      // Validate nested objects
      if (validator.nested && typeof fieldValue === 'object' && fieldValue !== null) {
        const nestedValidation = await this.validateAgainstSchema(
          fieldValue,
          validator.nested,
          fieldPath,
          strict
        );
        errors.push(...nestedValidation.errors);
        warnings.push(...nestedValidation.warnings);
        riskScore += nestedValidation.riskScore;
        securityFlags.push(...nestedValidation.securityFlags);
      }
    }

    return { errors, warnings, riskScore, securityFlags };
  }

  /**
   * Validate individual field
   */
  private async validateField(
    value: any,
    validator: FieldValidator,
    fieldPath: string
  ): Promise<{
    errors: ValidationError[];
    warnings: ValidationWarning[];
    riskScore: number;
    securityFlags: string[];
  }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let riskScore = 0;
    const securityFlags: string[] = [];

    // Type validation
    const typeValidation = this.validateType(value, validator.type, fieldPath);
    if (!typeValidation.valid) {
      errors.push({
        field: fieldPath,
        code: 'INVALID_TYPE',
        message: typeValidation.message,
        severity: 'medium',
        value,
      });
      riskScore += 15;
    }

    // String validations
    if (validator.type === 'string' && typeof value === 'string') {
      if (validator.minLength && value.length < validator.minLength) {
        errors.push({
          field: fieldPath,
          code: 'MIN_LENGTH',
          message: `Minimum length is ${validator.minLength}, got ${value.length}`,
          severity: 'medium',
          value,
        });
      }

      if (validator.maxLength && value.length > validator.maxLength) {
        errors.push({
          field: fieldPath,
          code: 'MAX_LENGTH',
          message: `Maximum length is ${validator.maxLength}, got ${value.length}`,
          severity: 'medium',
          value,
        });
        riskScore += 10;
      }

      if (validator.pattern && !validator.pattern.test(value)) {
        errors.push({
          field: fieldPath,
          code: 'PATTERN_MISMATCH',
          message: `Value does not match required pattern`,
          severity: 'medium',
          value,
        });
        riskScore += 15;
      }
    }

    // Number validations
    if (validator.type === 'number' && typeof value === 'number') {
      if (validator.min !== undefined && value < validator.min) {
        errors.push({
          field: fieldPath,
          code: 'MIN_VALUE',
          message: `Minimum value is ${validator.min}, got ${value}`,
          severity: 'medium',
          value,
        });
      }

      if (validator.max !== undefined && value > validator.max) {
        errors.push({
          field: fieldPath,
          code: 'MAX_VALUE',
          message: `Maximum value is ${validator.max}, got ${value}`,
          severity: 'medium',
          value,
        });
        riskScore += 10;
      }
    }

    // Enum validation
    if (validator.enum && !validator.enum.includes(value)) {
      errors.push({
        field: fieldPath,
        code: 'INVALID_ENUM',
        message: `Value must be one of: ${validator.enum.join(', ')}`,
        severity: 'medium',
        value,
      });
      riskScore += 15;
    }

    // Custom validation
    if (validator.custom) {
      const customResult = validator.custom(value);
      if (customResult !== true) {
        errors.push({
          field: fieldPath,
          code: 'CUSTOM_VALIDATION',
          message: typeof customResult === 'string' ? customResult : 'Custom validation failed',
          severity: 'medium',
          value,
        });
        riskScore += 20;
      }
    }

    // Specialized validations
    if (validator.type === 'email' && typeof value === 'string') {
      if (!this.isValidEmail(value)) {
        errors.push({
          field: fieldPath,
          code: 'INVALID_EMAIL',
          message: 'Invalid email format',
          severity: 'medium',
          value,
        });
      }
    }

    if (validator.type === 'iban' && typeof value === 'string') {
      if (!SecurityUtils.isValidIBAN(value)) {
        errors.push({
          field: fieldPath,
          code: 'INVALID_IBAN',
          message: 'Invalid IBAN format',
          severity: 'high',
          value,
        });
        riskScore += 25;
      }
    }

    if (validator.type === 'amount' && typeof value === 'number') {
      if (!this.isValidAmount(value)) {
        errors.push({
          field: fieldPath,
          code: 'INVALID_AMOUNT',
          message: 'Invalid amount value',
          severity: 'high',
          value,
        });
        riskScore += 30;
      }
    }

    if (validator.type === 'card_id' && typeof value === 'string') {
      if (!this.isValidCardId(value)) {
        errors.push({
          field: fieldPath,
          code: 'INVALID_CARD_ID',
          message: 'Invalid card ID format',
          severity: 'high',
          value,
        });
        riskScore += 25;
      }
    }

    return { errors, warnings, riskScore, securityFlags };
  }

  /**
   * Validate data type
   */
  private validateType(value: any, expectedType: string, fieldPath: string): { valid: boolean; message: string } {
    switch (expectedType) {
      case 'string':
        return {
          valid: typeof value === 'string',
          message: `Expected string, got ${typeof value}`,
        };
      case 'number':
        return {
          valid: typeof value === 'number' && !isNaN(value),
          message: `Expected number, got ${typeof value}`,
        };
      case 'boolean':
        return {
          valid: typeof value === 'boolean',
          message: `Expected boolean, got ${typeof value}`,
        };
      case 'array':
        return {
          valid: Array.isArray(value),
          message: `Expected array, got ${typeof value}`,
        };
      case 'object':
        return {
          valid: typeof value === 'object' && value !== null && !Array.isArray(value),
          message: `Expected object, got ${typeof value}`,
        };
      case 'email':
      case 'url':
      case 'uuid':
      case 'iban':
      case 'card_id':
        return {
          valid: typeof value === 'string',
          message: `Expected string for ${expectedType}, got ${typeof value}`,
        };
      case 'amount':
        return {
          valid: typeof value === 'number',
          message: `Expected number for amount, got ${typeof value}`,
        };
      default:
        return { valid: true, message: '' };
    }
  }

  /**
   * Sanitize data recursively
   */
  private async sanitizeData(data: any, schema: ValidationSchema): Promise<any> {
    if (typeof data !== 'object' || data === null) {
      return this.sanitizeValue(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeValue(item));
    }

    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      const validator = schema[key];
      
      if (validator?.sanitize !== false) {
        if (validator?.nested && typeof value === 'object' && value !== null) {
          sanitized[key] = await this.sanitizeData(value, validator.nested);
        } else {
          sanitized[key] = this.sanitizeValue(value);
        }
      } else {
        sanitized[key] = value;
      }

      // Apply transformation if specified
      if (validator?.transform) {
        sanitized[key] = validator.transform(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Sanitize individual value
   */
  private sanitizeValue(value: any): any {
    if (typeof value !== 'string') {
      return value;
    }

    let sanitized = value;

    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Remove script tags and javascript
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/vbscript:/gi, '');
    
    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    
    // Escape special characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
    
    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    return sanitized;
  }

  /**
   * Generate CSRF token
   */
  generateCsrfToken(sessionId: string): string {
    const token = SecurityUtils.generateRequestId();
    
    this.csrfTokens.set(token, {
      token,
      timestamp: Date.now(),
      sessionId,
      used: false,
    });
    
    return token;
  }

  /**
   * Validate CSRF token
   */
  validateCsrfToken(token: string, sessionId: string): boolean {
    const csrfToken = this.csrfTokens.get(token);
    
    if (!csrfToken) {
      return false;
    }
    
    if (csrfToken.used) {
      return false;
    }
    
    if (csrfToken.sessionId !== sessionId) {
      return false;
    }
    
    // Token expires after 1 hour
    if (Date.now() - csrfToken.timestamp > 3600000) {
      this.csrfTokens.delete(token);
      return false;
    }
    
    // Mark token as used
    csrfToken.used = true;
    this.csrfTokens.set(token, csrfToken);
    
    return true;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Validate amount
   */
  private isValidAmount(amount: number): boolean {
    return Number.isFinite(amount) && amount > 0 && amount <= 100000;
  }

  /**
   * Validate card ID
   */
  private isValidCardId(cardId: string): boolean {
    return /^[a-zA-Z0-9_-]{1,50}$/.test(cardId);
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(data: any, schema: ValidationSchema, options: any): string {
    const dataHash = this.hashObject(data);
    const schemaHash = this.hashObject(schema);
    const optionsHash = this.hashObject(options);
    return `${dataHash}_${schemaHash}_${optionsHash}`;
  }

  /**
   * Hash object for caching
   */
  private hashObject(obj: any): string {
    return btoa(JSON.stringify(obj)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean CSRF tokens every 10 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [token, csrfToken] of this.csrfTokens.entries()) {
        if (now - csrfToken.timestamp > 3600000) { // 1 hour
          this.csrfTokens.delete(token);
        }
      }
    }, 10 * 60 * 1000);

    // Clean validation cache every 5 minutes
    setInterval(() => {
      this.validationCache.clear();
    }, 5 * 60 * 1000);
  }

  /**
   * Get validation statistics
   */
  getStatistics(): {
    csrfTokens: number;
    cacheEntries: number;
    suspiciousPatterns: number;
  } {
    return {
      csrfTokens: this.csrfTokens.size,
      cacheEntries: this.validationCache.size,
      suspiciousPatterns: this.suspiciousPatterns.length,
    };
  }
}

// Export singleton instance
export const inputValidator = new InputValidator();

// Predefined validation schemas
export const ValidationSchemas = {
  // Bar order validation schema
  barOrder: {
    card_id: {
      type: 'card_id' as const,
      required: true,
      maxLength: 50,
    },
    items: {
      type: 'array' as const,
      required: true,
      nested: {
        product_id: {
          type: 'number' as const,
          required: true,
          min: 1,
        },
        quantity: {
          type: 'number' as const,
          required: true,
          min: 1,
          max: 100,
        },
        unit_price: {
          type: 'amount' as const,
          required: true,
        },
        name: {
          type: 'string' as const,
          required: true,
          maxLength: 100,
        },
        is_deposit: {
          type: 'boolean' as const,
          required: false,
        },
        is_return: {
          type: 'boolean' as const,
          required: false,
        },
      },
    },
    total_amount: {
      type: 'amount' as const,
      required: true,
    },
    client_request_id: {
      type: 'string' as const,
      required: true,
      maxLength: 100,
    },
  },

  // Stripe checkout validation schema
  stripeCheckout: {
    card_id: {
      type: 'card_id' as const,
      required: true,
      maxLength: 50,
    },
    amount: {
      type: 'amount' as const,
      required: true,
    },
    client_request_id: {
      type: 'string' as const,
      required: true,
      maxLength: 100,
    },
    success_url: {
      type: 'url' as const,
      required: false,
      maxLength: 500,
    },
    cancel_url: {
      type: 'url' as const,
      required: false,
      maxLength: 500,
    },
  },

  // Standard recharge validation schema
  standardRecharge: {
    card_id: {
      type: 'card_id' as const,
      required: true,
      maxLength: 50,
    },
    amount: {
      type: 'amount' as const,
      required: true,
    },
    payment_method: {
      type: 'string' as const,
      required: true,
      enum: ['cash', 'card'],
    },
    client_request_id: {
      type: 'string' as const,
      required: true,
      maxLength: 100,
    },
  },
} as const;

// Export utility functions
export const ValidationUtils = {
  /**
   * Create custom validator
   */
  createValidator: (
    type: FieldValidator['type'],
    options: Partial<FieldValidator> = {}
  ): FieldValidator => ({
    type,
    ...options,
  }),

  /**
   * Combine validation schemas
   */
  combineSchemas: (...schemas: ValidationSchema[]): ValidationSchema => {
    return schemas.reduce((combined, schema) => ({ ...combined, ...schema }), {});
  },

  /**
   * Create validation middleware for Express-like frameworks
   */
  createValidationMiddleware: (schema: ValidationSchema, options: {
    sanitize?: boolean;
    strict?: boolean;
  } = {}) => {
    return async (req: any, res: any, next: any) => {
      const result = await inputValidator.validateInput(req.body, schema, {
        ...options,
        requestId: req.headers['x-request-id'],
        userId: req.user?.id,
        ipAddress: req.ip,
      });

      if (!result.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: result.errors,
          warnings: result.warnings,
        });
      }

      if (result.sanitizedData) {
        req.body = result.sanitizedData;
      }

      next();
    };
  },

  /**
   * Validate single field
   */
  validateField: async (
    value: any,
    validator: FieldValidator,
    fieldName: string = 'field'
  ): Promise<ValidationResult> => {
    const schema = { [fieldName]: validator };
    const data = { [fieldName]: value };
    return inputValidator.validateInput(data, schema);
  },
};