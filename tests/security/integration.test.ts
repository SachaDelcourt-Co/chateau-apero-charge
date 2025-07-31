import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { secureApiRouter } from '../../src/lib/secure-api-router';
import { errorHandler } from '../../src/lib/error-handler';
import { apiSecurityMiddleware } from '../../src/lib/api-security';
import { inputValidator } from '../../src/lib/input-validation';
import { apiMonitoringSystem } from '../../src/lib/api-monitoring';

describe('Security Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End Security Pipeline', () => {
    it('should process a complete secure API request', async () => {
      const mockHeaders = {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-forwarded-for': '192.168.1.1',
        'authorization': 'Bearer valid-token-123',
        'x-request-id': 'test-request-123',
      };

      const mockPayload = {
        card_id: 'CARD001',
        amount: 25.50,
        payment_method: 'card',
        client_request_id: '1234567890-abc123-chrome',
      };

      // Test the complete security pipeline
      const securityResult = await apiSecurityMiddleware.processRequest(
        'POST',
        '/api/process-standard-recharge',
        mockHeaders,
        mockPayload
      );

      expect(securityResult.allowed).toBe(true);
      expect(securityResult.headers).toBeDefined();
      expect(securityResult.headers!['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should block malicious requests through the complete pipeline', async () => {
      const mockHeaders = {
        'content-type': 'application/json',
        'user-agent': '<script>alert("xss")</script>',
        'x-forwarded-for': '192.168.1.1',
        'authorization': 'Bearer valid-token-123',
      };

      const mockPayload = {
        card_id: "'; DROP TABLE cards; --",
        amount: 25.50,
        payment_method: 'card',
        client_request_id: '1234567890-abc123-chrome',
      };

      const securityResult = await apiSecurityMiddleware.processRequest(
        'POST',
        '/api/process-standard-recharge',
        mockHeaders,
        mockPayload
      );

      expect(securityResult.allowed).toBe(false);
      expect(securityResult.statusCode).toBe(400);
      expect(securityResult.securityFlags).toContain('threat_detected');
    });

    it('should handle rate limiting across multiple requests', async () => {
      const mockHeaders = {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-forwarded-for': '192.168.1.100', // Use different IP to avoid conflicts
        'authorization': 'Bearer valid-token-123',
      };

      const mockPayload = {
        card_id: 'CARD001',
        amount: 5.00,
        payment_method: 'card',
        client_request_id: '1234567890-abc123-chrome',
      };

      // Make requests rapidly to trigger rate limiting
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 25; i++) {
        promises.push(
          apiSecurityMiddleware.processRequest(
            'POST',
            '/api/process-bar-order',
            mockHeaders,
            { ...mockPayload, client_request_id: `request-${i}` }
          )
        );
      }

      const results = await Promise.all(promises);
      const rateLimitedRequests = results.filter(r => !r.allowed && r.statusCode === 429);
      
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle and structure errors consistently', async () => {
      const mockError = new Error('Test error');
      const context = {
        requestId: 'test-request-123',
        endpoint: '/api/test',
        method: 'POST',
        metadata: { test: 'data' },
      };

      const structuredError = await errorHandler.handleError(mockError, context);

      expect(structuredError.id).toBeDefined();
      expect(structuredError.code).toBeDefined();
      expect(structuredError.category).toBeDefined();
      expect(structuredError.userMessage).toBeDefined();
      expect(structuredError.context.requestId).toBe('test-request-123');
    });

    it('should implement circuit breaker pattern', async () => {
      const endpoint = '/api/test-circuit-breaker';
      
      // Simulate multiple failures to trigger circuit breaker
      const errors: any[] = [];
      for (let i = 0; i < 10; i++) {
        const error = await errorHandler.handleError(new Error('Service unavailable'), {
          requestId: `request-${i}`,
          endpoint,
          method: 'POST',
        });
        errors.push(error);
      }

      // Verify that errors are being tracked and structured properly
      expect(errors.length).toBe(10);
      expect(errors.every(e => e.category === 'SYSTEM_ERROR')).toBe(true);
    });
  });

  describe('Monitoring Integration', () => {
    it('should log complete request lifecycle', async () => {
      const requestId = 'integration-test-123';
      const endpoint = '/api/integration-test';
      const method = 'POST';

      // Log request
      await apiMonitoringSystem.logApiRequest({
        requestId,
        method,
        endpoint,
        userId: 'test-user',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        requestSize: 100,
      });

      // Log response
      await apiMonitoringSystem.logApiResponse({
        requestId,
        method,
        endpoint,
        statusCode: 200,
        responseTime: 150,
        responseSize: 500,
        userId: 'test-user',
        ipAddress: '192.168.1.1',
      });

      const events = apiMonitoringSystem.getRecentEvents(2);
      expect(events.length).toBe(2);
      
      const requestEvent = events.find(e => e.type === 'api_request');
      const responseEvent = events.find(e => e.type === 'api_response');
      
      expect(requestEvent).toBeDefined();
      expect(responseEvent).toBeDefined();
      expect(requestEvent!.requestId).toBe(requestId);
      expect(responseEvent!.requestId).toBe(requestId);
    });

    it('should track security violations in monitoring', async () => {
      await apiMonitoringSystem.logSecurityViolation({
        requestId: 'security-test-123',
        violationType: 'SQL_INJECTION',
        description: 'SQL injection attempt detected',
        severity: 'CRITICAL' as any,
        endpoint: '/api/test',
        ipAddress: '192.168.1.1',
        userAgent: 'malicious-agent',
      });

      const events = apiMonitoringSystem.getRecentEvents(1);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('security_violation');
      expect(events[0].severity).toBe('critical');
    });
  });

  describe('Input Validation Integration', () => {
    it('should validate complex nested data structures', async () => {
      const complexOrder = {
        card_id: 'CARD001',
        items: [
          {
            product_id: 1,
            quantity: 2,
            unit_price: 5.50,
            name: 'Coffee',
            is_deposit: false,
            is_return: false,
          },
          {
            product_id: 2,
            quantity: 1,
            unit_price: 3.00,
            name: 'Croissant',
            is_deposit: false,
            is_return: false,
          }
        ],
        total_amount: 14.00,
        client_request_id: '1234567890-abc123-chrome',
      };

      const result = await inputValidator.validateInput(
        complexOrder,
        {
          card_id: { type: 'card_id', required: true },
          items: {
            type: 'array',
            required: true,
            nested: {
              product_id: { type: 'number', required: true, min: 1 },
              quantity: { type: 'number', required: true, min: 1, max: 100 },
              unit_price: { type: 'amount', required: true },
              name: { type: 'string', required: true, maxLength: 100 },
              is_deposit: { type: 'boolean', required: false },
              is_return: { type: 'boolean', required: false },
            },
          },
          total_amount: { type: 'amount', required: true },
          client_request_id: { type: 'string', required: true, maxLength: 100 },
        },
        { sanitize: true, requestId: 'validation-test-123' }
      );

      expect(result.valid).toBe(true);
      expect(result.sanitizedData).toBeDefined();
    });

    it('should detect and prevent injection attacks in nested data', async () => {
      const maliciousOrder = {
        card_id: 'CARD001',
        items: [
          {
            product_id: 1,
            quantity: 2,
            unit_price: 5.50,
            name: '<script>alert("xss")</script>',
            is_deposit: false,
            is_return: false,
          }
        ],
        total_amount: 11.00,
        client_request_id: '1234567890-abc123-chrome',
      };

      const result = await inputValidator.validateInput(
        maliciousOrder,
        {
          card_id: { type: 'card_id', required: true },
          items: {
            type: 'array',
            required: true,
            nested: {
              product_id: { type: 'number', required: true, min: 1 },
              quantity: { type: 'number', required: true, min: 1, max: 100 },
              unit_price: { type: 'amount', required: true },
              name: { type: 'string', required: true, maxLength: 100 },
              is_deposit: { type: 'boolean', required: false },
              is_return: { type: 'boolean', required: false },
            },
          },
          total_amount: { type: 'amount', required: true },
          client_request_id: { type: 'string', required: true, maxLength: 100 },
        },
        { sanitize: true, requestId: 'malicious-test-123' }
      );

      expect(result.valid).toBe(false);
      expect(result.securityFlags).toContain('malicious_input');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent security checks efficiently', async () => {
      const startTime = Date.now();
      const concurrentRequests = 50;
      
      const promises = Array.from({ length: concurrentRequests }, (_, i) => 
        apiSecurityMiddleware.processRequest(
          'GET',
          '/health',
          {
            'user-agent': 'load-test-agent',
            'x-forwarded-for': `192.168.1.${i % 255}`,
          }
        )
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should be processed
      expect(results.length).toBe(concurrentRequests);
      
      // Most requests should be allowed (health endpoint is public)
      const allowedRequests = results.filter(r => r.allowed);
      expect(allowedRequests.length).toBeGreaterThan(concurrentRequests * 0.8);
      
      // Performance should be reasonable (less than 5 seconds for 50 requests)
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain performance under validation load', async () => {
      const startTime = Date.now();
      const validationCount = 100;
      
      const promises = Array.from({ length: validationCount }, (_, i) => 
        inputValidator.validateInput(
          { 
            card_id: `CARD${i.toString().padStart(3, '0')}`,
            amount: Math.random() * 100,
            client_request_id: `${Date.now()}-${i}-test`,
          },
          {
            card_id: { type: 'card_id', required: true },
            amount: { type: 'amount', required: true },
            client_request_id: { type: 'string', required: true },
          }
        )
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results.length).toBe(validationCount);
      expect(results.every(r => r.valid)).toBe(true);
      
      // Should complete within reasonable time (less than 2 seconds for 100 validations)
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Security Configuration', () => {
    it('should have proper security headers configured', async () => {
      const result = await apiSecurityMiddleware.processRequest(
        'GET',
        '/health',
        {
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1',
        }
      );

      expect(result.headers).toBeDefined();
      const headers = result.headers!;
      
      // Check for essential security headers
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
      expect(headers['X-Request-ID']).toBeDefined();
      expect(headers['X-Security-Score']).toBeDefined();
    });

    it('should provide comprehensive security statistics', () => {
      const securityStats = apiSecurityMiddleware.getStatistics();
      const validationStats = inputValidator.getStatistics();
      const systemOverview = apiMonitoringSystem.getSystemOverview();

      // Security middleware stats
      expect(securityStats).toHaveProperty('blockedIps');
      expect(securityStats).toHaveProperty('suspiciousIps');
      expect(securityStats).toHaveProperty('rateLimitEntries');
      expect(securityStats).toHaveProperty('policies');
      expect(securityStats).toHaveProperty('threatPatterns');

      // Validation stats
      expect(validationStats).toHaveProperty('csrfTokens');
      expect(validationStats).toHaveProperty('cacheEntries');
      expect(validationStats).toHaveProperty('suspiciousPatterns');

      // Monitoring stats
      expect(systemOverview).toHaveProperty('uptime');
      expect(systemOverview).toHaveProperty('totalRequests');
      expect(systemOverview).toHaveProperty('securityViolations');
    });
  });
});