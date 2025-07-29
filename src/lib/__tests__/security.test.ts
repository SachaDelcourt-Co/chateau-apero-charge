/**
 * Comprehensive Security Tests for Financial Data Processing
 * 
 * Test suite covering all security measures implemented in the refund system
 * including authentication, authorization, data validation, encryption,
 * audit logging, and security middleware functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecurityConfig, SecurityUtils } from '../../config/security';
import { DataValidator, ValidationErrorCode } from '../data-validator';
import { SecurityMiddleware, SecurityMiddlewareUtils } from '../security-middleware';
import { DataEncryptionService, DataMaskingService, EncryptionUtils } from '../encryption';
import { AuditLogger, InMemoryLogStorage, AuditCategory, AuditResult } from '../audit-logger';
import { SecureErrorHandler, ErrorCodes, ErrorCategory } from '../secure-error-handler';

// Mock data for testing
const mockRefundData = {
  id: 1,
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  account: 'BE68539007547034',
  amount_recharged: 25.50,
  id_card: 'CARD123456',
  card_balance: 50.00,
};

const mockDebtorConfig = {
  name: 'Test Organization',
  iban: 'BE68539007547034',
  bic: 'GKCCBEBB',
  country: 'BE',
  address_line1: '123 Test Street',
  organization_id: 'ORG123',
};

const mockRequest = {
  headers: {
    'authorization': 'Bearer test-token',
    'user-agent': 'Test Agent',
    'x-forwarded-for': '192.168.1.1',
    'content-type': 'application/json',
  },
  method: 'POST',
  url: '/api/refunds',
  body: { debtor_config: mockDebtorConfig },
};

describe('Security Configuration', () => {
  it('should have proper security configuration structure', () => {
    expect(SecurityConfig).toBeDefined();
    expect(SecurityConfig.auth).toBeDefined();
    expect(SecurityConfig.rateLimiting).toBeDefined();
    expect(SecurityConfig.validation).toBeDefined();
    expect(SecurityConfig.encryption).toBeDefined();
    expect(SecurityConfig.headers).toBeDefined();
    expect(SecurityConfig.audit).toBeDefined();
    expect(SecurityConfig.monitoring).toBeDefined();
    expect(SecurityConfig.compliance).toBeDefined();
  });

  it('should have appropriate rate limiting configuration', () => {
    expect(SecurityConfig.rateLimiting.financial.maxRequests).toBeLessThanOrEqual(10);
    expect(SecurityConfig.rateLimiting.financial.windowMs).toBeGreaterThanOrEqual(60000);
  });

  it('should have strong encryption settings', () => {
    expect(SecurityConfig.encryption.dataAtRest.algorithm).toBe('aes-256-gcm');
    expect(SecurityConfig.encryption.dataAtRest.keyRotationDays).toBeLessThanOrEqual(90);
  });

  it('should have proper financial validation limits', () => {
    expect(SecurityConfig.validation.financial.minAmount).toBeGreaterThan(0);
    expect(SecurityConfig.validation.financial.maxAmount).toBeLessThan(1000000);
    expect(SecurityConfig.validation.financial.currency).toBe('EUR');
  });
});

describe('Security Utils', () => {
  it('should validate amounts correctly', () => {
    expect(SecurityUtils.isValidAmount(10.50)).toBe(true);
    expect(SecurityUtils.isValidAmount(0)).toBe(false);
    expect(SecurityUtils.isValidAmount(-5)).toBe(false);
    expect(SecurityUtils.isValidAmount(1000000)).toBe(false);
  });

  it('should validate IBAN format', () => {
    expect(SecurityUtils.isValidIBAN('BE68539007547034')).toBe(true);
    expect(SecurityUtils.isValidIBAN('BE68 5390 0754 7034')).toBe(true);
    expect(SecurityUtils.isValidIBAN('FR1420041010050500013M02606')).toBe(false);
    expect(SecurityUtils.isValidIBAN('INVALID')).toBe(false);
  });

  it('should sanitize input properly', () => {
    const maliciousInput = '<script>alert("xss")</script>Test';
    const sanitized = SecurityUtils.sanitizeInput(maliciousInput);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('Test');
  });

  it('should mask sensitive data for logging', () => {
    const data = { account: 'BE68539007547034' };
    const masked = SecurityUtils.maskSensitiveData(data, 'account');
    expect(masked).not.toBe('BE68539007547034');
    expect(masked).toContain('BE68');
    expect(masked).toContain('7034');
  });

  it('should generate secure request IDs', () => {
    const id1 = SecurityUtils.generateRequestId();
    const id2 = SecurityUtils.generateRequestId();
    expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^req_\d+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });
});

describe('Data Validator', () => {
  let validator: DataValidator;

  beforeEach(() => {
    validator = new DataValidator('test-request-id');
  });

  describe('Refund Data Validation', () => {
    it('should validate correct refund data', async () => {
      const result = await validator.validateSingleRefund(mockRefundData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedData).toBeDefined();
    });

    it('should reject missing required fields', async () => {
      const invalidData = { ...mockRefundData };
      delete invalidData.first_name;
      
      const result = await validator.validateSingleRefund(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ValidationErrorCode.REQUIRED_FIELD_MISSING);
    });

    it('should reject invalid IBAN', async () => {
      const invalidData = { ...mockRefundData, account: 'INVALID_IBAN' };
      
      const result = await validator.validateSingleRefund(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ValidationErrorCode.INVALID_IBAN)).toBe(true);
    });

    it('should reject invalid amounts', async () => {
      const invalidData = { ...mockRefundData, amount_recharged: -10 };
      
      const result = await validator.validateSingleRefund(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ValidationErrorCode.INVALID_AMOUNT)).toBe(true);
    });

    it('should reject invalid email format', async () => {
      const invalidData = { ...mockRefundData, email: 'invalid-email' };
      
      const result = await validator.validateSingleRefund(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ValidationErrorCode.INVALID_EMAIL)).toBe(true);
    });

    it('should handle batch validation with limits', async () => {
      const largeRefundArray = Array(1001).fill(mockRefundData);
      
      const result = await validator.validateRefundData(largeRefundArray);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ValidationErrorCode.VALUE_OUT_OF_RANGE)).toBe(true);
    });
  });

  describe('Debtor Configuration Validation', () => {
    it('should validate correct debtor config', async () => {
      const result = await validator.validateDebtorConfig(mockDebtorConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required fields', async () => {
      const invalidConfig = { ...mockDebtorConfig };
      delete invalidConfig.name;
      
      const result = await validator.validateDebtorConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ValidationErrorCode.REQUIRED_FIELD_MISSING)).toBe(true);
    });

    it('should reject invalid country codes', async () => {
      const invalidConfig = { ...mockDebtorConfig, country: 'INVALID' };
      
      const result = await validator.validateDebtorConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === ValidationErrorCode.INVALID_FORMAT)).toBe(true);
    });
  });
});

describe('Security Middleware', () => {
  let middleware: SecurityMiddleware;

  beforeEach(() => {
    middleware = new SecurityMiddleware();
  });

  it('should process valid authenticated request', async () => {
    const config = SecurityMiddlewareUtils.createRefundEndpointConfig();
    const result = await middleware.processRequest(mockRequest, config);
    
    expect(result.success).toBe(true);
    expect(result.context).toBeDefined();
    expect(result.context?.requestId).toBeDefined();
  });

  it('should reject unauthenticated requests when auth required', async () => {
    const unauthRequest = { ...mockRequest };
    delete unauthRequest.headers.authorization;
    
    const config = SecurityMiddlewareUtils.createRefundEndpointConfig();
    const result = await middleware.processRequest(unauthRequest, config);
    
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it('should generate proper security headers', () => {
    const headers = middleware.generateSecurityHeaders();
    
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(headers['Content-Security-Policy']).toBeDefined();
  });

  it('should validate CORS requests', () => {
    const corsRequest = {
      headers: { origin: 'http://localhost:3000' }
    };
    
    const result = middleware.validateCorsRequest(corsRequest);
    expect(result.allowed).toBe(true);
    expect(result.headers).toBeDefined();
  });

  it('should reject oversized requests', async () => {
    const largeRequest = {
      ...mockRequest,
      headers: {
        ...mockRequest.headers,
        'content-length': '100000000' // 100MB
      }
    };
    
    const config = { maxRequestSize: 10 * 1024 * 1024 }; // 10MB
    const result = await middleware.processRequest(largeRequest, config);
    
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(413);
  });
});

describe('Data Encryption', () => {
  let encryptionService: DataEncryptionService;

  beforeEach(() => {
    encryptionService = new DataEncryptionService();
  });

  it('should encrypt and decrypt data successfully', async () => {
    const testData = 'sensitive financial data';
    
    const encryptResult = await encryptionService.encryptData(testData);
    expect(encryptResult.success).toBe(true);
    expect(encryptResult.encryptedData).toBeDefined();
    expect(encryptResult.metadata).toBeDefined();
    
    const decryptResult = await encryptionService.decryptData(
      encryptResult.encryptedData!,
      encryptResult.metadata!
    );
    expect(decryptResult.success).toBe(true);
    expect(decryptResult.decryptedData).toBe(testData);
  });

  it('should encrypt multiple fields in object', async () => {
    const testObject = {
      name: 'John Doe',
      account: 'BE68539007547034',
      amount: 100.50,
      public_field: 'not encrypted'
    };
    
    const fieldsToEncrypt = ['name', 'account', 'amount'];
    const result = await encryptionService.encryptFields(testObject, fieldsToEncrypt);
    
    expect(result.success).toBe(true);
    expect(result.encryptedData).toBeDefined();
    expect(result.encryptionMetadata).toBeDefined();
    expect(result.encryptedData.public_field).toBe('not encrypted');
    expect(result.encryptedData.name).not.toBe('John Doe');
  });

  it('should handle encryption failures gracefully', async () => {
    // Test with invalid key scenario
    const encryptionService = new DataEncryptionService();
    
    // Mock a failure scenario by creating a service with no keys
    const mockKeyManager = {
      getActiveKey: vi.fn().mockResolvedValue(null),
      getKey: vi.fn().mockResolvedValue(null),
      generateKey: vi.fn(),
      rotateKeys: vi.fn(),
      deactivateKey: vi.fn(),
    };
    const encryptionServiceWithFailure = new DataEncryptionService(mockKeyManager);
    
    const result = await encryptionServiceWithFailure.encryptData('test');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('Data Masking', () => {
  it('should mask IBAN correctly', () => {
    const data = { account: 'BE68539007547034' };
    const masked = DataMaskingService.maskForLogging(data, 'account');
    
    expect(masked).toContain('BE68');
    expect(masked).toContain('7034');
    expect(masked).toContain('****');
    expect(masked).not.toBe('BE68539007547034');
  });

  it('should mask email addresses', () => {
    const data = { email: 'john.doe@example.com' };
    const masked = DataMaskingService.maskForLogging(data, 'email');
    
    expect(masked).toContain('@example.com');
    expect(masked).toContain('jo***');
    expect(masked).not.toBe('john.doe@example.com');
  });

  it('should mask entire objects', () => {
    const sensitiveObject = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      account: 'BE68539007547034',
      amount_recharged: 100.50,
      public_field: 'visible'
    };
    
    const masked = DataMaskingService.maskObjectForLogging(sensitiveObject);
    
    expect(masked.public_field).toBe('visible');
    expect(masked.first_name).not.toBe('John');
    expect(masked.email).not.toBe('john@example.com');
    expect(masked.account).not.toBe('BE68539007547034');
  });

  it('should generate synthetic test data', () => {
    const originalData = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      account: 'BE68539007547034',
      amount_recharged: 100.50,
    };
    
    const synthetic = DataMaskingService.generateSyntheticData(originalData);
    
    expect(synthetic.first_name).toBe('Test');
    expect(synthetic.last_name).toBe('User');
    expect(synthetic.email).toBe('test@example.com');
    expect(synthetic.account).toBe('BE68539007547034'); // Test IBAN
    expect(synthetic.amount_recharged).toBe(10.00);
  });
});

describe('Audit Logging', () => {
  let auditLogger: AuditLogger;
  let storage: InMemoryLogStorage;

  beforeEach(() => {
    storage = new InMemoryLogStorage();
    auditLogger = new AuditLogger(storage);
  });

  it('should log financial transactions', async () => {
    await auditLogger.logFinancialTransaction({
      requestId: 'test-request',
      userId: 'user123',
      action: 'process_refund',
      transactionData: {
        amount: 100.50,
        currency: 'EUR',
        recipientIban: 'BE68539007547034',
        transactionId: 'txn123',
      },
      result: AuditResult.SUCCESS,
      ipAddress: '192.168.1.1',
    });

    const logs = await storage.query({ category: AuditCategory.FINANCIAL_TRANSACTION });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('process_refund');
    expect(logs[0].result).toBe(AuditResult.SUCCESS);
  });

  it('should log authentication events', async () => {
    await auditLogger.logAuthentication({
      requestId: 'test-request',
      userId: 'user123',
      action: 'login',
      result: AuditResult.SUCCESS,
      ipAddress: '192.168.1.1',
    });

    const logs = await storage.query({ category: AuditCategory.AUTHENTICATION });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('login');
  });

  it('should log security violations', async () => {
    await auditLogger.logSecurityViolation({
      requestId: 'test-request',
      violationType: 'rate_limit_exceeded',
      description: 'Too many requests',
      ipAddress: '192.168.1.1',
      severity: 'medium' as any,
    });

    const logs = await storage.query({ category: AuditCategory.SECURITY_VIOLATION });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('rate_limit_exceeded');
  });

  it('should track metrics correctly', async () => {
    await auditLogger.logFinancialTransaction({
      requestId: 'test-request-1',
      userId: 'user123',
      action: 'process_refund',
      transactionData: { amount: 50, currency: 'EUR' },
      result: AuditResult.SUCCESS,
    });

    await auditLogger.logFinancialTransaction({
      requestId: 'test-request-2',
      userId: 'user123',
      action: 'process_refund',
      transactionData: { amount: 75, currency: 'EUR' },
      result: AuditResult.FAILURE,
    });

    const metrics = auditLogger.getMetrics();
    expect(metrics.totalLogs).toBe(2);
    expect(metrics.logsByResult[AuditResult.SUCCESS]).toBe(1);
    expect(metrics.logsByResult[AuditResult.FAILURE]).toBe(1);
  });
});

describe('Secure Error Handler', () => {
  let errorHandler: SecureErrorHandler;

  beforeEach(() => {
    errorHandler = new SecureErrorHandler();
  });

  it('should handle validation errors', async () => {
    const validationError = new Error('Validation failed');
    validationError.name = 'ValidationError';
    
    const context = {
      requestId: 'test-request',
      userId: 'user123',
      ipAddress: '192.168.1.1',
    };

    const result = await errorHandler.handleError(validationError, context);
    
    expect(result.code).toBe(ErrorCodes.VALIDATION_REQUIRED_FIELD);
    expect(result.category).toBe(ErrorCategory.VALIDATION);
    expect(result.statusCode).toBe(400);
    expect(result.userMessage).toBeDefined();
  });

  it('should handle authentication errors', async () => {
    const authError = new Error('Invalid token');
    const context = {
      requestId: 'test-request',
      ipAddress: '192.168.1.1',
    };

    const result = await errorHandler.handleAuthenticationError(authError, context);
    
    expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
    expect(result.statusCode).toBe(401);
  });

  it('should sanitize error messages in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const sensitiveError = new Error('Database connection failed: password=secret123');
    const context = { requestId: 'test-request' };

    const result = await errorHandler.handleError(sensitiveError, context);
    
    expect(result.message).not.toContain('secret123');
    expect(result.userMessage).toBe('Service temporarily unavailable. Please try again later.');

    process.env.NODE_ENV = originalEnv;
  });

  it('should create proper error responses', async () => {
    const error = new Error('Test error');
    const context = { requestId: 'test-request' };
    
    const secureError = await errorHandler.handleError(error, context);
    const response = errorHandler.createErrorResponse(secureError);
    
    expect(response.success).toBe(false);
    expect(response.error.id).toBeDefined();
    expect(response.error.code).toBeDefined();
    expect(response.error.message).toBeDefined();
    expect(response.error.timestamp).toBeDefined();
    expect(response.error.requestId).toBe('test-request');
  });

  it('should handle financial errors with high priority', async () => {
    const financialError = new Error('Transaction failed');
    const context = { requestId: 'test-request', userId: 'user123' };
    
    const result = await errorHandler.handleFinancialError(financialError, context);
    
    expect(result.category).toBe(ErrorCategory.BUSINESS_LOGIC);
    expect(result.severity).toBe('high');
  });
});

describe('Encryption Utils', () => {
  it('should generate secure random strings', () => {
    const random1 = EncryptionUtils.generateSecureRandom(32);
    const random2 = EncryptionUtils.generateSecureRandom(32);
    
    expect(random1).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(random2).toHaveLength(64);
    expect(random1).not.toBe(random2);
    expect(random1).toMatch(/^[a-f0-9]+$/);
  });

  it('should hash and verify data correctly', () => {
    const testData = 'sensitive-password';
    const hash = EncryptionUtils.hashData(testData);
    
    expect(hash).toContain(':');
    expect(EncryptionUtils.verifyHash(testData, hash)).toBe(true);
    expect(EncryptionUtils.verifyHash('wrong-password', hash)).toBe(false);
  });

  it('should derive keys from passwords', () => {
    const password = 'test-password';
    const salt = 'test-salt';
    
    const key1 = EncryptionUtils.deriveKeyFromPassword(password, salt);
    const key2 = EncryptionUtils.deriveKeyFromPassword(password, salt);
    const key3 = EncryptionUtils.deriveKeyFromPassword(password, 'different-salt');
    
    expect(key1).toEqual(key2);
    expect(key1).not.toEqual(key3);
    expect(key1).toHaveLength(32); // 256 bits
  });
});

describe('Integration Tests', () => {
  it('should handle complete refund processing workflow securely', async () => {
    const validator = new DataValidator('integration-test');
    const middleware = new SecurityMiddleware();
    const encryptionService = new DataEncryptionService();
    const auditLogger = new AuditLogger(new InMemoryLogStorage());

    // 1. Validate request data
    const validationResult = await validator.validateSingleRefund(mockRefundData);
    expect(validationResult.isValid).toBe(true);

    // 2. Process through security middleware
    const middlewareResult = await middleware.processRequest(
      mockRequest,
      SecurityMiddlewareUtils.createRefundEndpointConfig()
    );
    expect(middlewareResult.success).toBe(true);

    // 3. Encrypt sensitive data
    const encryptionResult = await encryptionService.encryptFields(
      mockRefundData,
      ['first_name', 'last_name', 'email', 'account']
    );
    expect(encryptionResult.success).toBe(true);

    // 4. Log the transaction
    await auditLogger.logFinancialTransaction({
      requestId: middlewareResult.context!.requestId,
      userId: middlewareResult.context!.userId || 'anonymous',
      action: 'process_refund',
      transactionData: {
        amount: mockRefundData.amount_recharged,
        currency: 'EUR',
        recipientIban: mockRefundData.account,
      },
      result: AuditResult.SUCCESS,
      ipAddress: middlewareResult.context!.ipAddress,
    });

    // Verify audit log was created
    const storage = (auditLogger as any).storage;
    const logs = await storage.query({});
    expect(logs).toHaveLength(1);
  });

  it('should handle security violations across all components', async () => {
    const errorHandler = new SecureErrorHandler();
    const auditLogger = new AuditLogger(new InMemoryLogStorage());

    // Simulate a security violation
    const maliciousRequest = {
      ...mockRequest,
      headers: {
        ...mockRequest.headers,
        'user-agent': '<script>alert("xss")</script>',
      },
      body: {
        debtor_config: {
          ...mockDebtorConfig,
          name: '<script>alert("xss")</script>Malicious Org',
        },
      },
    };

    const middleware = new SecurityMiddleware();
    const result = await middleware.processRequest(
      maliciousRequest,
      SecurityMiddlewareUtils.createRefundEndpointConfig()
    );

    // Should still process but sanitize the input
    expect(result.success).toBe(true);
    expect(result.context?.userAgent).not.toContain('<script>');
  });
});

describe('Performance and Load Tests', () => {
  it('should handle multiple concurrent encryption operations', async () => {
    const encryptionService = new DataEncryptionService();
    const testData = Array(100).fill('test data');
    
    const startTime = Date.now();
    const promises = testData.map(data => encryptionService.encryptData(data));
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    expect(results.every(r => r.success)).toBe(true);
    expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
  });

  it('should handle large validation batches efficiently', async () => {
    const validator = new DataValidator('performance-test');
    const largeRefundArray = Array(100).fill(mockRefundData);
    
    const startTime = Date.now();
    const result = await validator.validateRefundData(largeRefundArray);
    const endTime = Date.now();
    
    expect(result.isValid).toBe(true);
    expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
  });
});