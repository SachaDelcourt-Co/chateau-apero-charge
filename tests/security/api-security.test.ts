import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiSecurityMiddleware } from '../../src/lib/api-security';
import { InputValidator, ValidationSchemas } from '../../src/lib/input-validation';
import { ApiMonitoringSystem } from '../../src/lib/api-monitoring';

describe('API Security Middleware', () => {
  let securityMiddleware: ApiSecurityMiddleware;

  beforeEach(() => {
    securityMiddleware = new ApiSecurityMiddleware();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Processing', () => {
    it('should process valid requests successfully', async () => {
      const result = await securityMiddleware.processRequest(
        'POST',
        '/api/test',
        {
          'content-type': 'application/json',
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1',
          'authorization': 'Bearer valid-token-123',
        },
        { test: 'data' }
      );
      
      expect(result.allowed).toBe(true);
      expect(result.action.type).toBe('allow');
      expect(result.headers).toBeDefined();
    });

    it('should reject requests without proper authentication for protected endpoints', async () => {
      const result = await securityMiddleware.processRequest(
        'POST',
        '/api/process-bar-order',
        {
          'content-type': 'application/json',
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1',
        },
        { test: 'data' }
      );
      
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.message).toContain('Authentication required');
    });

    it('should detect and block malicious requests', async () => {
      const result = await securityMiddleware.processRequest(
        'POST',
        '/api/test',
        {
          'content-type': 'application/json',
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1',
          'authorization': 'Bearer valid-token-123',
        },
        { malicious: "'; DROP TABLE users; --" }
      );
      
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.securityFlags).toContain('threat_detected');
    });

    it('should enforce rate limiting', async () => {
      const headers = {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-forwarded-for': '192.168.1.1',
        'authorization': 'Bearer valid-token-123',
      };

      // Make multiple requests to trigger rate limiting
      const promises = [];
      for (let i = 0; i < 35; i++) {
        promises.push(
          securityMiddleware.processRequest('POST', '/api/process-bar-order', headers, { test: i })
        );
      }

      const results = await Promise.all(promises);
      const blockedRequests = results.filter(r => !r.allowed && r.statusCode === 429);
      
      expect(blockedRequests.length).toBeGreaterThan(0);
    });

    it('should validate CORS origins', async () => {
      const result = await securityMiddleware.processRequest(
        'POST',
        '/api/test',
        {
          'content-type': 'application/json',
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1',
          'authorization': 'Bearer valid-token-123',
          'origin': 'https://malicious-site.com',
        },
        { test: 'data' }
      );
      
      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.securityFlags).toContain('cors_violation');
    });

    it('should add security headers to responses', async () => {
      const result = await securityMiddleware.processRequest(
        'GET',
        '/health',
        {
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1',
        }
      );
      
      expect(result.allowed).toBe(true);
      expect(result.headers).toBeDefined();
      expect(result.headers!['X-Content-Type-Options']).toBe('nosniff');
      expect(result.headers!['X-Frame-Options']).toBe('DENY');
      expect(result.headers!['X-XSS-Protection']).toBe('1; mode=block');
    });
  });

  describe('Security Statistics', () => {
    it('should provide security statistics', () => {
      const stats = securityMiddleware.getStatistics();
      
      expect(stats).toHaveProperty('blockedIps');
      expect(stats).toHaveProperty('suspiciousIps');
      expect(stats).toHaveProperty('rateLimitEntries');
      expect(stats).toHaveProperty('policies');
      expect(stats).toHaveProperty('threatPatterns');
    });
  });

  describe('IP Management', () => {
    it('should allow unblocking IP addresses', () => {
      expect(() => {
        securityMiddleware.unblockIp('192.168.1.100');
      }).not.toThrow();
    });

    it('should allow clearing suspicious IP scores', () => {
      expect(() => {
        securityMiddleware.clearSuspiciousIp('192.168.1.100');
      }).not.toThrow();
    });
  });

  describe('API Key Management', () => {
    it('should allow adding API keys', () => {
      expect(() => {
        securityMiddleware.addApiKey('test-key-123', 'user-456', ['read', 'write']);
      }).not.toThrow();
    });

    it('should allow removing API keys', () => {
      securityMiddleware.addApiKey('test-key-123', 'user-456', ['read', 'write']);
      
      expect(() => {
        securityMiddleware.removeApiKey('test-key-123');
      }).not.toThrow();
    });

    it('should validate API keys in requests', async () => {
      securityMiddleware.addApiKey('valid-api-key', 'user-123', ['read', 'write']);
      
      const result = await securityMiddleware.processRequest(
        'POST',
        '/api/process-bar-order',
        {
          'content-type': 'application/json',
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1',
          'x-api-key': 'valid-api-key',
        },
        { test: 'data' }
      );
      
      expect(result.allowed).toBe(true);
    });
  });
});

describe('Input Validation', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('SQL Injection Detection', () => {
    it('should detect SQL injection attempts', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'/*",
        "1; DELETE FROM cards WHERE 1=1",
      ];

      for (const input of maliciousInputs) {
        const result = await validator.validateInput(
          { malicious: input },
          { malicious: { type: 'string', maxLength: 100, required: true } }
        );
        expect(result.valid).toBe(false);
        expect(result.securityFlags).toContain('malicious_input');
      }
    });

    it('should allow safe SQL-like strings', async () => {
      const safeInputs = [
        "John's Restaurant",
        "Price: $19.99",
        "Email: user@domain.com",
      ];

      for (const input of safeInputs) {
        const result = await validator.validateInput(
          { safe: input },
          { safe: { type: 'string', maxLength: 100, required: true } }
        );
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('XSS Detection', () => {
    it('should detect XSS attempts', async () => {
      const xssInputs = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("xss")',
        '<iframe src="javascript:alert(1)"></iframe>',
      ];

      for (const input of xssInputs) {
        const result = await validator.validateInput(
          { xss: input },
          { xss: { type: 'string', maxLength: 100, required: true } }
        );
        expect(result.valid).toBe(false);
        expect(result.securityFlags).toContain('malicious_input');
      }
    });

    it('should sanitize data when requested', async () => {
      const htmlInput = '<p>Safe content</p><script>alert("bad")</script>';
      
      const result = await validator.validateInput(
        { content: htmlInput },
        { content: { type: 'string', maxLength: 200, required: true } },
        { sanitize: true }
      );
      
      if (result.sanitizedData) {
        expect(result.sanitizedData.content).not.toContain('<script>');
        expect(result.sanitizedData.content).toContain('Safe content');
      }
    });
  });

  describe('Data Type Validation', () => {
    it('should validate card IDs using predefined schema', async () => {
      const validCardId = 'CARD001';
      const invalidCardId = 'card with spaces';

      const validResult = await validator.validateInput(
        { card_id: validCardId },
        { card_id: ValidationSchemas.barOrder.card_id }
      );
      expect(validResult.valid).toBe(true);

      const invalidResult = await validator.validateInput(
        { card_id: invalidCardId },
        { card_id: ValidationSchemas.barOrder.card_id }
      );
      expect(invalidResult.valid).toBe(false);
    });

    it('should validate monetary amounts', async () => {
      const validAmount = 10.50;
      const invalidAmount = -5;

      const validResult = await validator.validateInput(
        { amount: validAmount },
        { amount: ValidationSchemas.standardRecharge.amount }
      );
      expect(validResult.valid).toBe(true);

      const invalidResult = await validator.validateInput(
        { amount: invalidAmount },
        { amount: ValidationSchemas.standardRecharge.amount }
      );
      expect(invalidResult.valid).toBe(false);
    });

    it('should validate complete bar order schema', async () => {
      const validOrder = {
        card_id: 'CARD001',
        items: [
          {
            product_id: 1,
            quantity: 2,
            unit_price: 5.50,
            name: 'Coffee',
            is_deposit: false,
            is_return: false,
          }
        ],
        total_amount: 11.00,
        client_request_id: '1234567890-abc123-chrome',
      };

      const result = await validator.validateInput(validOrder, ValidationSchemas.barOrder);
      expect(result.valid).toBe(true);
    });
  });

  describe('CSRF Protection', () => {
    it('should generate valid CSRF tokens', () => {
      const sessionId = 'test-session-123';
      const token = validator.generateCsrfToken(sessionId);
      
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(20);
      expect(validator.validateCsrfToken(token, sessionId)).toBe(true);
    });

    it('should reject invalid CSRF tokens', () => {
      const sessionId = 'test-session-123';
      const invalidTokens = ['', 'short', 'invalid-token-format'];

      for (const token of invalidTokens) {
        expect(validator.validateCsrfToken(token, sessionId)).toBe(false);
      }
    });

    it('should reject tokens with wrong session ID', () => {
      const sessionId1 = 'test-session-123';
      const sessionId2 = 'test-session-456';
      const token = validator.generateCsrfToken(sessionId1);
      
      expect(validator.validateCsrfToken(token, sessionId2)).toBe(false);
    });
  });

  describe('Validation Statistics', () => {
    it('should provide validation statistics', () => {
      const stats = validator.getStatistics();
      
      expect(stats).toHaveProperty('csrfTokens');
      expect(stats).toHaveProperty('cacheEntries');
      expect(stats).toHaveProperty('suspiciousPatterns');
    });
  });
});

describe('API Monitoring', () => {
  let monitor: ApiMonitoringSystem;

  beforeEach(() => {
    monitor = new ApiMonitoringSystem();
  });

  describe('Request Logging', () => {
    it('should log API requests with proper structure', async () => {
      await monitor.logApiRequest({
        requestId: 'test-request-123',
        method: 'POST',
        endpoint: '/api/test',
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        requestSize: 100,
        headers: { 'content-type': 'application/json' },
        body: { test: 'data' },
      });

      const events = monitor.getRecentEvents(1);
      expect(events.length).toBe(1);
      expect(events[0].message).toContain('API request: POST /api/test');
    });

    it('should log API responses with metrics', async () => {
      await monitor.logApiResponse({
        requestId: 'test-request-123',
        method: 'POST',
        endpoint: '/api/test',
        statusCode: 200,
        responseTime: 150,
        responseSize: 500,
        userId: 'user-123',
        ipAddress: '192.168.1.1',
      });

      const events = monitor.getRecentEvents(1);
      expect(events.length).toBe(1);
      expect(events[0].message).toContain('API response: POST /api/test - 200 (150ms)');
    });
  });

  describe('Security Event Detection', () => {
    it('should log security violations', async () => {
      await monitor.logSecurityViolation({
        requestId: 'test-request-123',
        violationType: 'RATE_LIMIT_EXCEEDED',
        description: 'Too many requests from IP',
        severity: 'HIGH' as any,
        endpoint: '/api/test',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
      });

      const events = monitor.getRecentEvents(1);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('security_violation');
      expect(events[0].severity).toBe('high');
    });

    it('should log rate limit hits', async () => {
      await monitor.logRateLimitHit({
        requestId: 'test-request-123',
        endpoint: '/api/test',
        method: 'POST',
        limit: 100,
        current: 101,
        resetTime: Date.now() + 60000,
        ipAddress: '192.168.1.1',
      });

      const events = monitor.getRecentEvents(1);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('rate_limit_hit');
    });
  });

  describe('Health Checks', () => {
    it('should perform health checks', async () => {
      const healthCheck = async () => ({
        service: 'test-service',
        status: 'healthy' as const,
        responseTime: 0,
        message: 'Service is healthy',
      });

      const result = await monitor.performHealthCheck('test-service', healthCheck);
      
      expect(result.service).toBe('test-service');
      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should handle health check failures', async () => {
      const failingHealthCheck = async () => {
        throw new Error('Service unavailable');
      };

      const result = await monitor.performHealthCheck('failing-service', failingHealthCheck);
      
      expect(result.service).toBe('failing-service');
      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('Service unavailable');
    });
  });

  describe('Metrics and Statistics', () => {
    it('should provide API metrics', async () => {
      // Log some requests to generate metrics
      await monitor.logApiRequest({
        requestId: 'test-1',
        method: 'GET',
        endpoint: '/api/test',
        ipAddress: '192.168.1.1',
      });

      await monitor.logApiResponse({
        requestId: 'test-1',
        method: 'GET',
        endpoint: '/api/test',
        statusCode: 200,
        responseTime: 100,
        ipAddress: '192.168.1.1',
      });

      const metrics = monitor.getApiMetrics('/api/test');
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].endpoint).toBe('/api/test');
      expect(metrics[0].totalRequests).toBeGreaterThan(0);
    });

    it('should provide system overview', () => {
      const overview = monitor.getSystemOverview();
      
      expect(overview).toHaveProperty('uptime');
      expect(overview).toHaveProperty('totalRequests');
      expect(overview).toHaveProperty('totalErrors');
      expect(overview).toHaveProperty('averageResponseTime');
      expect(overview).toHaveProperty('activeEndpoints');
      expect(overview).toHaveProperty('securityViolations');
    });

    it('should provide performance metrics', () => {
      const metrics = monitor.getPerformanceMetrics(10);
      expect(Array.isArray(metrics)).toBe(true);
    });
  });
});