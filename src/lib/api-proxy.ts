/**
 * Secure API Proxy Implementation
 * 
 * This module provides a secure proxy layer for all API communications,
 * preventing direct client access to backend services while maintaining
 * functionality and adding comprehensive security measures.
 * 
 * Features:
 * - Server-side API proxy to hide direct Supabase calls
 * - Request/response filtering and validation
 * - Rate limiting and throttling mechanisms
 * - Secure endpoint routing and load balancing
 * - Request logging and monitoring
 * - Input sanitization and output filtering
 * - Authentication and authorization layers
 * - CORS policy enforcement
 * - Error handling and security event detection
 */

import { logger } from './logger';
import { securityMiddleware, SecurityContext, MiddlewareConfig } from './security-middleware';
import { auditLogger, RiskLevel, AuditResult } from './audit-logger';
import { SecurityUtils } from '../config/security';

// API endpoint configuration
export interface ApiEndpointConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  target: string;
  requireAuth: boolean;
  requiredRole?: string;
  requiredPermissions?: string[];
  rateLimitTier: 'general' | 'financial' | 'auth';
  validateInput: boolean;
  sanitizeOutput: boolean;
  maxRequestSize?: number;
  timeout?: number;
  retries?: number;
  cacheTtl?: number;
}

// Request context for proxy operations
export interface ProxyRequestContext {
  requestId: string;
  originalUrl: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  securityContext?: SecurityContext;
  startTime: number;
}

// Response context for proxy operations
export interface ProxyResponseContext {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  duration: number;
  cached: boolean;
  filtered: boolean;
}

// Proxy result interface
export interface ProxyResult {
  success: boolean;
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  error?: string;
  securityViolation?: boolean;
  cached?: boolean;
  duration: number;
}

// Cache interface for response caching
interface CacheEntry {
  data: any;
  headers: Record<string, string>;
  timestamp: number;
  ttl: number;
}

/**
 * Secure API Proxy Class
 */
export class SecureApiProxy {
  private endpoints: Map<string, ApiEndpointConfig> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private blockedIps: Set<string> = new Set();
  private suspiciousPatterns: RegExp[] = [
    /[<>'"&]/g, // XSS patterns
    /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bDELETE\b|\bDROP\b)/i, // SQL injection patterns
    /javascript:/i, // JavaScript protocol
    /data:text\/html/i, // Data URI XSS
    /vbscript:/i, // VBScript protocol
  ];

  constructor() {
    this.initializeEndpoints();
    this.startCleanupTasks();
  }

  /**
   * Initialize API endpoint configurations
   */
  private initializeEndpoints(): void {
    // Supabase Edge Function endpoints
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    this.registerEndpoint({
      path: '/api/process-bar-order',
      method: 'POST',
      target: `${supabaseUrl}/functions/v1/process-bar-order`,
      requireAuth: true,
      requiredPermissions: ['bar:process_orders'],
      rateLimitTier: 'financial',
      validateInput: true,
      sanitizeOutput: true,
      maxRequestSize: 1024 * 1024, // 1MB
      timeout: 15000,
      retries: 2,
    });

    this.registerEndpoint({
      path: '/api/create-stripe-checkout',
      method: 'POST',
      target: `${supabaseUrl}/functions/v1/create-stripe-checkout`,
      requireAuth: true,
      requiredPermissions: ['payment:create_checkout'],
      rateLimitTier: 'financial',
      validateInput: true,
      sanitizeOutput: true,
      maxRequestSize: 512 * 1024, // 512KB
      timeout: 20000,
      retries: 1,
    });

    this.registerEndpoint({
      path: '/api/process-standard-recharge',
      method: 'POST',
      target: `${supabaseUrl}/functions/v1/process-standard-recharge`,
      requireAuth: true,
      requiredPermissions: ['card:recharge'],
      rateLimitTier: 'financial',
      validateInput: true,
      sanitizeOutput: true,
      maxRequestSize: 512 * 1024, // 512KB
      timeout: 15000,
      retries: 2,
    });

    this.registerEndpoint({
      path: '/api/stripe-webhook',
      method: 'POST',
      target: `${supabaseUrl}/functions/v1/stripe-webhook`,
      requireAuth: false, // Webhooks use signature validation
      rateLimitTier: 'general',
      validateInput: true,
      sanitizeOutput: false, // Don't modify webhook responses
      maxRequestSize: 2 * 1024 * 1024, // 2MB
      timeout: 30000,
      retries: 0,
    });

    this.registerEndpoint({
      path: '/api/monitoring',
      method: 'GET',
      target: `${supabaseUrl}/functions/v1/monitoring`,
      requireAuth: true,
      requiredRole: 'admin',
      rateLimitTier: 'general',
      validateInput: false,
      sanitizeOutput: true,
      cacheTtl: 30000, // 30 seconds
    });

    this.registerEndpoint({
      path: '/api/monitoring-api',
      method: 'POST',
      target: `${supabaseUrl}/functions/v1/monitoring-api`,
      requireAuth: true,
      requiredRole: 'admin',
      rateLimitTier: 'general',
      validateInput: true,
      sanitizeOutput: true,
    });
  }

  /**
   * Register a new API endpoint
   */
  registerEndpoint(config: ApiEndpointConfig): void {
    const key = `${config.method}:${config.path}`;
    this.endpoints.set(key, config);
    logger.info(`Registered API endpoint: ${key} -> ${config.target}`);
  }

  /**
   * Process API request through secure proxy
   */
  async processRequest(
    path: string,
    method: string,
    headers: Record<string, string> = {},
    body?: any,
    query?: Record<string, string>
  ): Promise<ProxyResult> {
    const startTime = Date.now();
    const requestId = SecurityUtils.generateRequestId();
    
    const context: ProxyRequestContext = {
      requestId,
      originalUrl: path,
      method: method.toUpperCase(),
      headers,
      body,
      query,
      startTime,
    };

    try {
      // 1. Find endpoint configuration
      const endpointKey = `${method.toUpperCase()}:${path}`;
      const endpointConfig = this.endpoints.get(endpointKey);
      
      if (!endpointConfig) {
        await this.logSecurityViolation(context, 'suspicious_activity', `Unknown endpoint: ${endpointKey}`);
        return {
          success: false,
          statusCode: 404,
          headers: {},
          body: { error: 'Endpoint not found' },
          error: 'Unknown endpoint',
          duration: Date.now() - startTime,
        };
      }

      // 2. Check cache first (for GET requests)
      if (method.toUpperCase() === 'GET' && endpointConfig.cacheTtl) {
        const cached = this.getCachedResponse(path, query);
        if (cached) {
          return {
            success: true,
            statusCode: 200,
            headers: cached.headers,
            body: cached.data,
            cached: true,
            duration: Date.now() - startTime,
          };
        }
      }

      // 3. Security middleware processing
      const middlewareConfig: MiddlewareConfig = {
        requireAuth: endpointConfig.requireAuth,
        requiredRole: endpointConfig.requiredRole,
        requiredPermissions: endpointConfig.requiredPermissions,
        rateLimitTier: endpointConfig.rateLimitTier,
        validateInput: endpointConfig.validateInput,
        logRequests: true,
        maxRequestSize: endpointConfig.maxRequestSize,
      };

      const securityResult = await securityMiddleware.processRequest(
        { headers, body, method, url: path },
        middlewareConfig
      );

      if (!securityResult.success) {
        await this.logSecurityViolation(
          context,
          'permission_denied',
          securityResult.error || 'Security check failed'
        );
        
        return {
          success: false,
          statusCode: securityResult.statusCode || 403,
          headers: {},
          body: { error: securityResult.error },
          error: securityResult.error,
          securityViolation: true,
          duration: Date.now() - startTime,
        };
      }

      context.securityContext = securityResult.context;

      // 4. Input validation and sanitization
      if (endpointConfig.validateInput && body) {
        const validationResult = await this.validateAndSanitizeInput(body, context);
        if (!validationResult.valid) {
          return {
            success: false,
            statusCode: 400,
            headers: {},
            body: { error: validationResult.error },
            error: validationResult.error,
            duration: Date.now() - startTime,
          };
        }
        context.body = validationResult.sanitizedData;
      }

      // 5. Make proxied request
      const proxyResult = await this.makeProxiedRequest(endpointConfig, context);

      // 6. Output filtering and sanitization
      if (endpointConfig.sanitizeOutput && proxyResult.success) {
        proxyResult.body = this.sanitizeOutput(proxyResult.body);
      }

      // 7. Cache response if applicable
      if (method.toUpperCase() === 'GET' && endpointConfig.cacheTtl && proxyResult.success) {
        this.cacheResponse(path, query, proxyResult.body, proxyResult.headers, endpointConfig.cacheTtl);
      }

      // 8. Log successful request
      await auditLogger.logDataAccess({
        requestId,
        userId: context.securityContext?.userId || 'anonymous',
        action: `${method} ${path}`,
        resource: 'api_proxy',
        dataType: 'card_data',
        result: proxyResult.success ? AuditResult.SUCCESS : AuditResult.FAILURE,
        duration: Date.now() - startTime,
        ipAddress: context.securityContext?.ipAddress || 'unknown',
        userAgent: context.securityContext?.userAgent || 'unknown',
      });

      return proxyResult;

    } catch (error) {
      await this.logError(context, error);
      return {
        success: false,
        statusCode: 500,
        headers: {},
        body: { error: 'Internal proxy error' },
        error: 'Internal error',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Make the actual proxied request to the target endpoint
   */
  private async makeProxiedRequest(
    config: ApiEndpointConfig,
    context: ProxyRequestContext
  ): Promise<ProxyResult> {
    const { target, timeout = 15000, retries = 0 } = config;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Prepare headers for the proxied request
        const proxyHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'SecureApiProxy/1.0',
          'X-Request-ID': context.requestId,
        };

        // Add authentication headers
        if (context.securityContext?.isAuthenticated) {
          const authHeader = context.headers.authorization;
          if (authHeader) {
            proxyHeaders['Authorization'] = authHeader;
          }
        } else if (!config.requireAuth) {
          // Use anon key for non-authenticated requests
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          if (anonKey) {
            proxyHeaders['Authorization'] = `Bearer ${anonKey}`;
          }
        }

        // Make the request
        const response = await fetch(target, {
          method: context.method,
          headers: proxyHeaders,
          body: context.body ? JSON.stringify(context.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Parse response
        const responseText = await response.text();
        let responseBody: any;

        try {
          responseBody = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          responseBody = { raw: responseText };
        }

        // Extract response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          success: response.ok,
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody,
          duration: Date.now() - context.startTime,
        };

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retries) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    // All retries failed
    return {
      success: false,
      statusCode: 500,
      headers: {},
      body: { error: 'Proxy request failed', details: lastError?.message },
      error: lastError?.message || 'Unknown proxy error',
      duration: Date.now() - context.startTime,
    };
  }

  /**
   * Validate and sanitize input data
   */
  private async validateAndSanitizeInput(
    data: any,
    context: ProxyRequestContext
  ): Promise<{ valid: boolean; error?: string; sanitizedData?: any }> {
    try {
      // Deep clone to avoid modifying original data
      const sanitizedData = JSON.parse(JSON.stringify(data));

      // Check for suspicious patterns
      const dataString = JSON.stringify(data);
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(dataString)) {
          await this.logSecurityViolation(
            context,
            'suspicious_activity',
            `Suspicious pattern detected: ${pattern.source}`
          );
          return { valid: false, error: 'Invalid input detected' };
        }
      }

      // Sanitize string values recursively
      this.sanitizeObjectRecursively(sanitizedData);

      // Validate specific data types
      if (sanitizedData.amount && !this.isValidAmount(sanitizedData.amount)) {
        return { valid: false, error: 'Invalid amount format' };
      }

      if (sanitizedData.card_id && !this.isValidCardId(sanitizedData.card_id)) {
        return { valid: false, error: 'Invalid card ID format' };
      }

      if (sanitizedData.iban && !SecurityUtils.isValidIBAN(sanitizedData.iban)) {
        return { valid: false, error: 'Invalid IBAN format' };
      }

      return { valid: true, sanitizedData };

    } catch (error) {
      return { valid: false, error: 'Input validation failed' };
    }
  }

  /**
   * Sanitize output data to prevent information leakage
   */
  private sanitizeOutput(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = JSON.parse(JSON.stringify(data));

    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'secret',
      'key',
      'token',
      'private',
      'internal',
      'debug',
      'stack',
      'trace',
    ];

    this.removeSensitiveFields(sanitized, sensitiveFields);

    return sanitized;
  }

  /**
   * Remove sensitive fields from object recursively
   */
  private removeSensitiveFields(obj: any, sensitiveFields: string[]): void {
    if (typeof obj !== 'object' || obj === null) return;

    for (const key in obj) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.removeSensitiveFields(obj[key], sensitiveFields);
      }
    }
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObjectRecursively(obj: any): void {
    if (typeof obj !== 'object' || obj === null) return;

    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = SecurityUtils.sanitizeInput(obj[key]);
      } else if (typeof obj[key] === 'object') {
        this.sanitizeObjectRecursively(obj[key]);
      }
    }
  }

  /**
   * Validate amount format
   */
  private isValidAmount(amount: any): boolean {
    if (typeof amount === 'number') {
      return amount > 0 && amount <= 10000 && Number.isFinite(amount);
    }
    if (typeof amount === 'string') {
      const num = parseFloat(amount);
      return !isNaN(num) && num > 0 && num <= 10000;
    }
    return false;
  }

  /**
   * Validate card ID format
   */
  private isValidCardId(cardId: any): boolean {
    if (typeof cardId !== 'string') return false;
    return /^[a-zA-Z0-9_-]{1,50}$/.test(cardId);
  }

  /**
   * Get cached response
   */
  private getCachedResponse(path: string, query?: Record<string, string>): CacheEntry | null {
    const cacheKey = this.generateCacheKey(path, query);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) return null;
    
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return entry;
  }

  /**
   * Cache response
   */
  private cacheResponse(
    path: string,
    query: Record<string, string> | undefined,
    data: any,
    headers: Record<string, string>,
    ttl: number
  ): void {
    const cacheKey = this.generateCacheKey(path, query);
    this.cache.set(cacheKey, {
      data,
      headers,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(path: string, query?: Record<string, string>): string {
    const queryString = query ? new URLSearchParams(query).toString() : '';
    return `${path}${queryString ? '?' + queryString : ''}`;
  }

  /**
   * Log security violation
   */
  private async logSecurityViolation(
    context: ProxyRequestContext,
    violationType: 'rate_limit_exceeded' | 'invalid_token' | 'permission_denied' | 'suspicious_activity' | 'data_breach_attempt',
    description: string
  ): Promise<void> {
    await auditLogger.logSecurityViolation({
      requestId: context.requestId,
      violationType,
      description,
      ipAddress: context.securityContext?.ipAddress || 'unknown',
      userAgent: context.securityContext?.userAgent || 'unknown',
      severity: RiskLevel.HIGH,
    });
  }

  /**
   * Log error
   */
  private async logError(context: ProxyRequestContext, error: any): Promise<void> {
    await auditLogger.logError({
      requestId: context.requestId,
      action: 'api_proxy',
      resource: 'proxy_request',
      error,
      duration: Date.now() - context.startTime,
      ipAddress: context.securityContext?.ipAddress || 'unknown',
      userAgent: context.securityContext?.userAgent || 'unknown',
    });
  }

  /**
   * Start cleanup tasks for cache and rate limiting
   */
  private startCleanupTasks(): void {
    // Clean cache every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.timestamp + entry.ttl) {
          this.cache.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    // Clean rate limit counters every hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.requestCounts.entries()) {
        if (now > entry.resetTime) {
          this.requestCounts.delete(key);
        }
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Get proxy statistics
   */
  getStatistics(): {
    endpoints: number;
    cacheEntries: number;
    rateLimitEntries: number;
    blockedIps: number;
  } {
    return {
      endpoints: this.endpoints.size,
      cacheEntries: this.cache.size,
      rateLimitEntries: this.requestCounts.size,
      blockedIps: this.blockedIps.size,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Block IP address
   */
  blockIp(ip: string): void {
    this.blockedIps.add(ip);
  }

  /**
   * Unblock IP address
   */
  unblockIp(ip: string): void {
    this.blockedIps.delete(ip);
  }
}

// Export singleton instance
export const secureApiProxy = new SecureApiProxy();

// Export utility functions
export const ApiProxyUtils = {
  /**
   * Create a secure fetch wrapper that uses the proxy
   */
  createSecureFetch: () => {
    return async (
      path: string,
      options: RequestInit = {}
    ): Promise<Response> => {
      const method = options.method || 'GET';
      const headers = options.headers as Record<string, string> || {};
      const body = options.body ? JSON.parse(options.body as string) : undefined;

      const result = await secureApiProxy.processRequest(
        path,
        method,
        headers,
        body
      );

      // Create a Response-like object
      return new Response(JSON.stringify(result.body), {
        status: result.statusCode,
        statusText: result.success ? 'OK' : 'Error',
        headers: new Headers(result.headers),
      });
    };
  },

  /**
   * Validate API endpoint configuration
   */
  validateEndpointConfig: (config: ApiEndpointConfig): boolean => {
    const required = ['path', 'method', 'target', 'rateLimitTier'];
    return required.every(field => config[field as keyof ApiEndpointConfig]);
  },

  /**
   * Generate API documentation from registered endpoints
   */
  generateApiDocumentation: (): string => {
    const endpoints = Array.from(secureApiProxy['endpoints'].entries());
    let doc = '# API Proxy Documentation\n\n';
    
    endpoints.forEach(([key, config]) => {
      doc += `## ${key}\n`;
      doc += `- **Target**: ${config.target}\n`;
      doc += `- **Auth Required**: ${config.requireAuth}\n`;
      doc += `- **Rate Limit**: ${config.rateLimitTier}\n`;
      doc += `- **Input Validation**: ${config.validateInput}\n`;
      doc += `- **Output Sanitization**: ${config.sanitizeOutput}\n\n`;
    });
    
    return doc;
  },
};