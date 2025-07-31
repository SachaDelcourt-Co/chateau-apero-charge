/**
 * Secure API Endpoint Router
 * 
 * This module provides a secure routing system for API endpoints with
 * integrated security middleware, monitoring, and error handling.
 * 
 * Features:
 * - Secure endpoint registration and routing
 * - Integrated security middleware pipeline
 * - Request/response validation and sanitization
 * - Rate limiting and throttling
 * - Monitoring and logging integration
 * - Error handling and recovery
 * - Circuit breaker pattern implementation
 * - Load balancing and failover
 * - API versioning support
 * - Health check endpoints
 */

import { secureApiProxy } from './api-proxy';
import { apiSecurityMiddleware } from './api-security';
import { inputValidator, ValidationSchemas } from './input-validation';
import { errorHandler } from './error-handler';
import { apiMonitoringSystem } from './api-monitoring';
import { logger } from './logger';
import { SecurityUtils } from '../config/security';

// Route configuration interface
export interface RouteConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
  handler: RouteHandler;
  middleware?: RouteMiddleware[];
  security?: {
    requireAuth?: boolean;
    requiredRole?: string;
    requiredPermissions?: string[];
    rateLimitTier?: 'general' | 'financial' | 'auth';
    validateInput?: boolean;
    sanitizeOutput?: boolean;
  };
  validation?: {
    body?: any;
    query?: any;
    params?: any;
  };
  cache?: {
    ttl: number;
    key?: (req: RouteRequest) => string;
  };
  timeout?: number;
  retries?: number;
}

// Route handler interface
export interface RouteHandler {
  (req: RouteRequest, res: RouteResponse): Promise<any>;
}

// Route middleware interface
export interface RouteMiddleware {
  (req: RouteRequest, res: RouteResponse, next: () => Promise<void>): Promise<void>;
}

// Route request interface
export interface RouteRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, any>;
  params: Record<string, any>;
  body: any;
  user?: {
    id: string;
    role: string;
    permissions: string[];
  };
  session?: {
    id: string;
    data: Record<string, any>;
  };
  metadata: Record<string, any>;
}

// Route response interface
export interface RouteResponse {
  status(code: number): RouteResponse;
  json(data: any): RouteResponse;
  send(data: any): RouteResponse;
  header(name: string, value: string): RouteResponse;
  cookie(name: string, value: string, options?: any): RouteResponse;
  redirect(url: string): RouteResponse;
  end(): void;
}

// Route execution result
export interface RouteExecutionResult {
  success: boolean;
  statusCode: number;
  data?: any;
  error?: any;
  duration: number;
  cached: boolean;
}

/**
 * Secure API Router
 */
export class SecureApiRouter {
  private routes: Map<string, RouteConfig> = new Map();
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private middleware: RouteMiddleware[] = [];

  constructor() {
    this.initializeDefaultRoutes();
    this.startCleanupTasks();
  }

  /**
   * Register a new route
   */
  register(config: RouteConfig): void {
    const key = `${config.method}:${config.path}`;
    this.routes.set(key, config);
    
    logger.info(`Registered secure route: ${key}`, {
      security: config.security,
      validation: !!config.validation,
      cache: !!config.cache,
    });
  }

  /**
   * Add global middleware
   */
  use(middleware: RouteMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Execute route
   */
  async execute(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: any,
    query: Record<string, any> = {},
    params: Record<string, any> = {}
  ): Promise<RouteExecutionResult> {
    const startTime = Date.now();
    const requestId = SecurityUtils.generateRequestId();
    
    try {
      // Find matching route
      const routeKey = `${method.toUpperCase()}:${path}`;
      const route = this.routes.get(routeKey);
      
      if (!route) {
        return {
          success: false,
          statusCode: 404,
          error: { message: 'Route not found', code: 'ROUTE_NOT_FOUND' },
          duration: Date.now() - startTime,
          cached: false,
        };
      }

      // Create request object
      const request: RouteRequest = {
        id: requestId,
        method: method.toUpperCase(),
        path,
        headers,
        query,
        params,
        body,
        metadata: {},
      };

      // Create response object
      let responseData: any;
      let statusCode = 200;
      let responseHeaders: Record<string, string> = {};
      
      const response: RouteResponse = {
        status: (code: number) => {
          statusCode = code;
          return response;
        },
        json: (data: any) => {
          responseData = data;
          return response;
        },
        send: (data: any) => {
          responseData = data;
          return response;
        },
        header: (name: string, value: string) => {
          responseHeaders[name] = value;
          return response;
        },
        cookie: (name: string, value: string, options?: any) => {
          // Cookie handling would be implemented here
          return response;
        },
        redirect: (url: string) => {
          statusCode = 302;
          responseHeaders['Location'] = url;
          return response;
        },
        end: () => {
          // End response
        },
      };

      // Log request
      await apiMonitoringSystem.logApiRequest({
        requestId,
        method: request.method,
        endpoint: request.path,
        userId: request.user?.id,
        ipAddress: this.extractIpAddress(headers),
        userAgent: headers['user-agent'],
        requestSize: body ? JSON.stringify(body).length : 0,
        headers,
        query,
        body,
      });

      // Check cache first
      if (route.cache && method.toUpperCase() === 'GET') {
        const cacheKey = route.cache.key ? route.cache.key(request) : `${routeKey}:${JSON.stringify(query)}`;
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
          await apiMonitoringSystem.logApiResponse({
            requestId,
            method: request.method,
            endpoint: request.path,
            statusCode: 200,
            responseTime: Date.now() - startTime,
            responseSize: JSON.stringify(cached).length,
            userId: request.user?.id,
            ipAddress: this.extractIpAddress(headers),
          });

          return {
            success: true,
            statusCode: 200,
            data: cached,
            duration: Date.now() - startTime,
            cached: true,
          };
        }
      }

      // Execute security middleware
      if (route.security) {
        const securityResult = await apiSecurityMiddleware.processRequest(
          method,
          path,
          headers,
          body,
          query
        );

        if (!securityResult.allowed) {
          await apiMonitoringSystem.logApiResponse({
            requestId,
            method: request.method,
            endpoint: request.path,
            statusCode: securityResult.statusCode || 403,
            responseTime: Date.now() - startTime,
            userId: request.user?.id,
            ipAddress: this.extractIpAddress(headers),
            error: { message: securityResult.message || 'Security check failed' },
          });

          return {
            success: false,
            statusCode: securityResult.statusCode || 403,
            error: { message: securityResult.message || 'Access denied', code: 'SECURITY_VIOLATION' },
            duration: Date.now() - startTime,
            cached: false,
          };
        }

        // Add security headers to response
        if (securityResult.headers) {
          Object.assign(responseHeaders, securityResult.headers);
        }
      }

      // Input validation
      if (route.validation) {
        if (route.validation.body && body) {
          const validationResult = await inputValidator.validateInput(
            body,
            route.validation.body,
            {
              sanitize: route.security?.validateInput !== false,
              requestId,
              userId: request.user?.id,
              ipAddress: this.extractIpAddress(headers),
            }
          );

          if (!validationResult.valid) {
            await apiMonitoringSystem.logApiResponse({
              requestId,
              method: request.method,
              endpoint: request.path,
              statusCode: 400,
              responseTime: Date.now() - startTime,
              userId: request.user?.id,
              ipAddress: this.extractIpAddress(headers),
              error: { message: 'Validation failed' },
            });

            return {
              success: false,
              statusCode: 400,
              error: {
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: validationResult.errors,
              },
              duration: Date.now() - startTime,
              cached: false,
            };
          }

          if (validationResult.sanitizedData) {
            request.body = validationResult.sanitizedData;
          }
        }

        // Validate query parameters
        if (route.validation.query && query) {
          const validationResult = await inputValidator.validateInput(
            query,
            route.validation.query,
            { sanitize: true, requestId }
          );

          if (!validationResult.valid) {
            return {
              success: false,
              statusCode: 400,
              error: {
                message: 'Query validation failed',
                code: 'QUERY_VALIDATION_ERROR',
                details: validationResult.errors,
              },
              duration: Date.now() - startTime,
              cached: false,
            };
          }

          if (validationResult.sanitizedData) {
            request.query = validationResult.sanitizedData;
          }
        }
      }

      // Execute global middleware
      for (const middleware of this.middleware) {
        await middleware(request, response, async () => {});
      }

      // Execute route-specific middleware
      if (route.middleware) {
        for (const middleware of route.middleware) {
          await middleware(request, response, async () => {});
        }
      }

      // Execute route handler with error recovery
      const executionResult = await errorHandler.executeWithRecovery(
        () => route.handler(request, response),
        {
          maxRetries: route.retries || 0,
          timeout: route.timeout || 30000,
          context: {
            requestId,
            endpoint: path,
            method,
            userId: request.user?.id,
          },
        }
      );

      if (!executionResult.success) {
        await apiMonitoringSystem.logApiResponse({
          requestId,
          method: request.method,
          endpoint: request.path,
          statusCode: 500,
          responseTime: Date.now() - startTime,
          userId: request.user?.id,
          ipAddress: this.extractIpAddress(headers),
          error: executionResult.error,
        });

        return {
          success: false,
          statusCode: 500,
          error: {
            message: 'Internal server error',
            code: 'HANDLER_ERROR',
            details: executionResult.error,
          },
          duration: Date.now() - startTime,
          cached: false,
        };
      }

      // Use handler result or response data
      const finalData = executionResult.result !== undefined ? executionResult.result : responseData;

      // Cache response if configured
      if (route.cache && method.toUpperCase() === 'GET' && statusCode === 200) {
        const cacheKey = route.cache.key ? route.cache.key(request) : `${routeKey}:${JSON.stringify(query)}`;
        this.setCache(cacheKey, finalData, route.cache.ttl);
      }

      // Log successful response
      await apiMonitoringSystem.logApiResponse({
        requestId,
        method: request.method,
        endpoint: request.path,
        statusCode,
        responseTime: Date.now() - startTime,
        responseSize: finalData ? JSON.stringify(finalData).length : 0,
        userId: request.user?.id,
        ipAddress: this.extractIpAddress(headers),
      });

      return {
        success: true,
        statusCode,
        data: finalData,
        duration: Date.now() - startTime,
        cached: false,
      };

    } catch (error) {
      const structuredError = await errorHandler.handleError(error, {
        requestId,
        endpoint: path,
        method,
        ipAddress: this.extractIpAddress(headers),
        userAgent: headers['user-agent'],
      });

      await apiMonitoringSystem.logApiResponse({
        requestId,
        method,
        endpoint: path,
        statusCode: 500,
        responseTime: Date.now() - startTime,
        ipAddress: this.extractIpAddress(headers),
        error: structuredError,
      });

      return {
        success: false,
        statusCode: 500,
        error: {
          message: structuredError.userMessage,
          code: structuredError.code,
          id: structuredError.id,
        },
        duration: Date.now() - startTime,
        cached: false,
      };
    }
  }

  /**
   * Initialize default routes
   */
  private initializeDefaultRoutes(): void {
    // Health check endpoint
    this.register({
      path: '/health',
      method: 'GET',
      handler: async (req, res) => {
        const healthStatus = apiMonitoringSystem.getHealthStatus();
        const systemOverview = apiMonitoringSystem.getSystemOverview();
        
        return {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: systemOverview.uptime,
          services: healthStatus,
          metrics: {
            totalRequests: systemOverview.totalRequests,
            totalErrors: systemOverview.totalErrors,
            averageResponseTime: systemOverview.averageResponseTime,
          },
        };
      },
      cache: { ttl: 30000 }, // 30 seconds
    });

    // API status endpoint
    this.register({
      path: '/api/status',
      method: 'GET',
      handler: async (req, res) => {
        const overview = apiMonitoringSystem.getSystemOverview();
        const errorStats = errorHandler.getErrorStatistics();
        
        return {
          status: 'operational',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          metrics: overview,
          errors: {
            total: errorStats.totalErrors,
            byCategory: errorStats.errorsByCategory,
            bySeverity: errorStats.errorsBySeverity,
          },
          security: {
            rateLimitHits: overview.rateLimitHits,
            securityViolations: overview.securityViolations,
          },
        };
      },
      security: {
        requireAuth: false,
        rateLimitTier: 'general',
      },
      cache: { ttl: 60000 }, // 1 minute
    });

    // Proxy routes for existing API endpoints
    this.registerProxyRoutes();
  }

  /**
   * Register proxy routes for existing API endpoints
   */
  private registerProxyRoutes(): void {
    // Bar order processing
    this.register({
      path: '/api/process-bar-order',
      method: 'POST',
      handler: async (req, res) => {
        return await secureApiProxy.processRequest(
          '/api/process-bar-order',
          'POST',
          req.headers,
          req.body,
          req.query
        );
      },
      security: {
        requireAuth: true,
        requiredPermissions: ['bar:process_orders'],
        rateLimitTier: 'financial',
        validateInput: true,
        sanitizeOutput: true,
      },
      validation: {
        body: ValidationSchemas.barOrder,
      },
      timeout: 30000,
      retries: 2,
    });

    // Stripe checkout creation
    this.register({
      path: '/api/create-stripe-checkout',
      method: 'POST',
      handler: async (req, res) => {
        return await secureApiProxy.processRequest(
          '/api/create-stripe-checkout',
          'POST',
          req.headers,
          req.body,
          req.query
        );
      },
      security: {
        requireAuth: true,
        requiredPermissions: ['payment:create_checkout'],
        rateLimitTier: 'financial',
        validateInput: true,
        sanitizeOutput: true,
      },
      validation: {
        body: ValidationSchemas.stripeCheckout,
      },
      timeout: 45000,
      retries: 1,
    });

    // Standard recharge processing
    this.register({
      path: '/api/process-standard-recharge',
      method: 'POST',
      handler: async (req, res) => {
        return await secureApiProxy.processRequest(
          '/api/process-standard-recharge',
          'POST',
          req.headers,
          req.body,
          req.query
        );
      },
      security: {
        requireAuth: true,
        requiredPermissions: ['card:recharge'],
        rateLimitTier: 'financial',
        validateInput: true,
        sanitizeOutput: true,
      },
      validation: {
        body: ValidationSchemas.standardRecharge,
      },
      timeout: 30000,
      retries: 2,
    });

    // Stripe webhook
    this.register({
      path: '/api/stripe-webhook',
      method: 'POST',
      handler: async (req, res) => {
        return await secureApiProxy.processRequest(
          '/api/stripe-webhook',
          'POST',
          req.headers,
          req.body,
          req.query
        );
      },
      security: {
        requireAuth: false, // Webhooks use signature validation
        rateLimitTier: 'general',
        validateInput: true,
        sanitizeOutput: false, // Don't modify webhook responses
      },
      timeout: 30000,
      retries: 0,
    });
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Set cache
   */
  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Extract IP address from headers
   */
  private extractIpAddress(headers: Record<string, string>): string {
    return headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           headers['x-real-ip'] ||
           headers['cf-connecting-ip'] ||
           'unknown';
  }

  /**
   * Start cleanup tasks
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
  }

  /**
   * Get router statistics
   */
  getStatistics(): {
    totalRoutes: number;
    cacheEntries: number;
    registeredRoutes: string[];
  } {
    return {
      totalRoutes: this.routes.size,
      cacheEntries: this.cache.size,
      registeredRoutes: Array.from(this.routes.keys()),
    };
  }
}

// Export singleton instance
export const secureApiRouter = new SecureApiRouter();

// Export utility functions
export const RouterUtils = {
  /**
   * Create route configuration
   */
  createRoute: (config: Partial<RouteConfig> & { path: string; method: RouteConfig['method']; handler: RouteHandler }): RouteConfig => ({
    security: {
      requireAuth: true,
      rateLimitTier: 'general',
      validateInput: true,
      sanitizeOutput: true,
    },
    timeout: 30000,
    retries: 0,
    ...config,
  }),

  /**
   * Create middleware function
   */
  createMiddleware: (fn: (req: RouteRequest, res: RouteResponse) => Promise<void>): RouteMiddleware => {
    return async (req, res, next) => {
      await fn(req, res);
      await next();
    };
  },

  /**
   * Create authentication middleware
   */
  createAuthMiddleware: (): RouteMiddleware => {
    return async (req, res, next) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Authentication required');
      }
      
      const token = authHeader.substring(7);
      
      // Mock token validation - replace with actual implementation
      if (token === 'valid-token') {
        req.user = {
          id: 'user_123',
          role: 'user',
          permissions: ['bar:process_orders', 'payment:create_checkout', 'card:recharge'],
        };
      } else {
        throw new Error('Invalid token');
      }
      
      await next();
    };
  },

  /**
   * Create logging middleware
   */
  createLoggingMiddleware: (): RouteMiddleware => {
    return async (req, res, next) => {
      logger.info(`API Request: ${req.method} ${req.path}`, {
        requestId: req.id,
        userId: req.user?.id,
        query: req.query,
      });
      
      await next();
    };
  },
};