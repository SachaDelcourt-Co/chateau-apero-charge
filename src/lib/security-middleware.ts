/**
 * Security Middleware for Financial Data Processing
 * 
 * Comprehensive security middleware that provides authentication, authorization,
 * rate limiting, input validation, and security headers for refund endpoints.
 * 
 * Features:
 * - JWT token validation and session management
 * - Role-based access control (RBAC)
 * - Rate limiting with different tiers
 * - Input validation and sanitization
 * - Security headers injection
 * - Request/response logging
 * - IP-based access control
 * - CORS handling
 * - Request size limits
 * - Security event monitoring
 */

import { SecurityConfig, SecurityUtils } from '../config/security';
import { auditLogger, AuditResult, RiskLevel } from './audit-logger';

// Request context interface
export interface SecurityContext {
  requestId: string;
  userId?: string;
  userRole?: string;
  userPermissions?: string[];
  ipAddress: string;
  userAgent: string;
  isAuthenticated: boolean;
  sessionId?: string;
  riskScore: number;
  metadata: Record<string, any>;
}

// Middleware configuration
export interface MiddlewareConfig {
  requireAuth?: boolean;
  requiredRole?: string;
  requiredPermissions?: string[];
  rateLimitTier?: 'general' | 'financial' | 'auth';
  validateInput?: boolean;
  logRequests?: boolean;
  checkIpWhitelist?: boolean;
  maxRequestSize?: number;
}

// Rate limiting store interface
interface RateLimitStore {
  get(key: string): Promise<{ count: number; resetTime: number } | null>;
  increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }>;
  reset(key: string): Promise<void>;
}

// Simple in-memory rate limit store
class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();

  async get(key: string): Promise<{ count: number; resetTime: number } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.resetTime) {
      this.store.delete(key);
      return null;
    }
    
    return entry;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const now = Date.now();
    const existing = await this.get(key);
    
    if (!existing) {
      const entry = { count: 1, resetTime: now + windowMs };
      this.store.set(key, entry);
      return entry;
    }
    
    existing.count++;
    this.store.set(key, existing);
    return existing;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Security Middleware Class
 */
export class SecurityMiddleware {
  private rateLimitStore: RateLimitStore;
  private ipWhitelist: Set<string>;
  private blockedIps: Set<string>;

  constructor() {
    this.rateLimitStore = new InMemoryRateLimitStore();
    this.ipWhitelist = new Set();
    this.blockedIps = new Set();
  }

  /**
   * Main security middleware function
   */
  async processRequest(
    req: any,
    config: MiddlewareConfig = {}
  ): Promise<{ success: boolean; context?: SecurityContext; error?: string; statusCode?: number }> {
    const requestId = SecurityUtils.generateRequestId();
    const startTime = Date.now();

    try {
      // Extract request information
      const ipAddress = this.extractIpAddress(req);
      const userAgent = this.extractUserAgent(req);

      // Initialize security context
      const context: SecurityContext = {
        requestId,
        ipAddress,
        userAgent,
        isAuthenticated: false,
        riskScore: 0,
        metadata: {},
      };

      // 1. IP-based security checks
      const ipCheckResult = await this.checkIpSecurity(ipAddress, requestId);
      if (!ipCheckResult.allowed) {
        return {
          success: false,
          error: ipCheckResult.reason,
          statusCode: 403,
        };
      }

      // 2. Rate limiting
      if (config.rateLimitTier) {
        const rateLimitResult = await this.checkRateLimit(ipAddress, config.rateLimitTier, requestId);
        if (!rateLimitResult.allowed) {
          await auditLogger.logSecurityViolation({
            requestId,
            violationType: 'rate_limit_exceeded',
            description: `Rate limit exceeded for tier: ${config.rateLimitTier}`,
            ipAddress,
            userAgent,
            severity: RiskLevel.MEDIUM,
          });

          return {
            success: false,
            error: rateLimitResult.message,
            statusCode: 429,
          };
        }
      }

      // 3. Request size validation
      const sizeLimit = config.maxRequestSize || this.parseSize(SecurityConfig.requestLimits.maxBodySize);
      if (req.headers['content-length'] && parseInt(req.headers['content-length'].toString()) > sizeLimit) {
        await auditLogger.logSecurityViolation({
          requestId,
          violationType: 'suspicious_activity',
          description: `Request size exceeds limit: ${req.headers['content-length']} bytes`,
          ipAddress,
          userAgent,
          severity: RiskLevel.MEDIUM,
        });

        return {
          success: false,
          error: 'Request size exceeds maximum allowed limit',
          statusCode: 413,
        };
      }

      // 4. Authentication
      if (config.requireAuth) {
        const authResult = await this.authenticateRequest(req, requestId);
        if (!authResult.success) {
          return {
            success: false,
            error: authResult.error,
            statusCode: 401,
          };
        }

        context.isAuthenticated = true;
        context.userId = authResult.userId;
        context.userRole = authResult.userRole;
        context.userPermissions = authResult.userPermissions;
        context.sessionId = authResult.sessionId;
      }

      // 5. Authorization
      if (config.requiredRole || config.requiredPermissions) {
        const authzResult = await this.authorizeRequest(context, config, requestId);
        if (!authzResult.success) {
          return {
            success: false,
            error: authzResult.error,
            statusCode: 403,
          };
        }
      }

      // 6. Input validation
      if (config.validateInput && req.body) {
        const validationResult = await this.validateInput(req.body, requestId);
        if (!validationResult.valid) {
          return {
            success: false,
            error: validationResult.error,
            statusCode: 400,
          };
        }
      }

      // 7. Calculate risk score
      context.riskScore = this.calculateRiskScore(context, req);

      // 8. Log successful request
      if (config.logRequests) {
        await auditLogger.logDataAccess({
          requestId,
          userId: context.userId || 'anonymous',
          action: `${req.method} ${req.url}`,
          resource: 'api_endpoint',
          dataType: 'refund_data',
          result: AuditResult.SUCCESS,
          duration: Date.now() - startTime,
          ipAddress,
          userAgent,
        });
      }

      return { success: true, context };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        action: 'security_middleware',
        resource: 'middleware',
        error,
        duration: Date.now() - startTime,
        ipAddress: this.extractIpAddress(req),
        userAgent: this.extractUserAgent(req),
      });

      return {
        success: false,
        error: 'Internal security error',
        statusCode: 500,
      };
    }
  }

  /**
   * Generate security headers for response
   */
  generateSecurityHeaders(): Record<string, string> {
    const config = SecurityConfig.headers;
    
    const headers: Record<string, string> = {
      ...config.security,
    };

    // Content Security Policy
    if (config.csp) {
      const cspDirectives = Object.entries(config.csp)
        .map(([directive, sources]) => `${directive.replace(/([A-Z])/g, '-$1').toLowerCase()} ${Array.isArray(sources) ? sources.join(' ') : sources}`)
        .join('; ');
      headers['Content-Security-Policy'] = cspDirectives;
    }

    // HSTS in production
    if (process.env.NODE_ENV === 'production') {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
    }

    return headers;
  }

  /**
   * Validate CORS request
   */
  validateCorsRequest(req: any): { allowed: boolean; headers?: Record<string, string> } {
    const config = SecurityConfig.headers.cors;
    const origin = req.headers.origin;

    // Check if origin is allowed
    const isOriginAllowed = Array.isArray(config.origin) 
      ? config.origin.includes(origin)
      : config.origin === '*' || config.origin === origin;

    if (!isOriginAllowed) {
      return { allowed: false };
    }

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': config.methods.join(', '),
      'Access-Control-Allow-Headers': config.allowedHeaders.join(', '),
      'Access-Control-Max-Age': config.maxAge.toString(),
    };

    if (config.credentials) {
      corsHeaders['Access-Control-Allow-Credentials'] = 'true';
    }

    return { allowed: true, headers: corsHeaders };
  }

  /**
   * Check IP-based security
   */
  private async checkIpSecurity(ipAddress: string, requestId: string): Promise<{ allowed: boolean; reason?: string }> {
    // Check if IP is blocked
    if (this.blockedIps.has(ipAddress)) {
      await auditLogger.logSecurityViolation({
        requestId,
        violationType: 'suspicious_activity',
        description: `Request from blocked IP: ${ipAddress}`,
        ipAddress,
        severity: RiskLevel.HIGH,
      });

      return { allowed: false, reason: 'IP address is blocked' };
    }

    // Check whitelist if configured
    if (this.ipWhitelist.size > 0 && !this.ipWhitelist.has(ipAddress)) {
      await auditLogger.logSecurityViolation({
        requestId,
        violationType: 'suspicious_activity',
        description: `Request from non-whitelisted IP: ${ipAddress}`,
        ipAddress,
        severity: RiskLevel.MEDIUM,
      });

      return { allowed: false, reason: 'IP address not whitelisted' };
    }

    return { allowed: true };
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(
    ipAddress: string,
    tier: 'general' | 'financial' | 'auth',
    requestId: string
  ): Promise<{ allowed: boolean; message?: string }> {
    const config = SecurityConfig.rateLimiting[tier];
    const key = `rate_limit:${tier}:${ipAddress}`;

    const result = await this.rateLimitStore.increment(key, config.windowMs);

    if (result.count > config.maxRequests) {
      return {
        allowed: false,
        message: config.message,
      };
    }

    return { allowed: true };
  }

  /**
   * Authenticate request
   */
  private async authenticateRequest(req: any, requestId: string): Promise<{
    success: boolean;
    error?: string;
    userId?: string;
    userRole?: string;
    userPermissions?: string[];
    sessionId?: string;
  }> {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];

    if (!authHeader && !apiKey) {
      await auditLogger.logAuthentication({
        requestId,
        action: 'login',
        result: AuditResult.FAILURE,
        ipAddress: this.extractIpAddress(req),
        userAgent: this.extractUserAgent(req),
        error: { message: 'Missing authentication credentials' },
      });

      return {
        success: false,
        error: 'Authentication required',
      };
    }

    try {
      // Extract token from Authorization header
      let token = '';
      if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          token = parts[1];
        } else {
          throw new Error('Invalid authorization header format');
        }
      } else if (apiKey) {
        token = apiKey;
      }

      // Validate token (simplified - in production, use proper JWT validation)
      const tokenData = await this.validateToken(token);
      if (!tokenData) {
        throw new Error('Invalid or expired token');
      }

      await auditLogger.logAuthentication({
        requestId,
        userId: tokenData.userId,
        action: 'login',
        result: AuditResult.SUCCESS,
        ipAddress: this.extractIpAddress(req),
        userAgent: this.extractUserAgent(req),
      });

      return {
        success: true,
        userId: tokenData.userId,
        userRole: tokenData.role,
        userPermissions: tokenData.permissions,
        sessionId: tokenData.sessionId,
      };

    } catch (error) {
      await auditLogger.logAuthentication({
        requestId,
        action: 'login',
        result: AuditResult.FAILURE,
        ipAddress: this.extractIpAddress(req),
        userAgent: this.extractUserAgent(req),
        error: { message: error.message },
      });

      return {
        success: false,
        error: 'Invalid authentication credentials',
      };
    }
  }

  /**
   * Authorize request
   */
  private async authorizeRequest(
    context: SecurityContext,
    config: MiddlewareConfig,
    requestId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { userId, userRole, userPermissions = [] } = context;

    // Check required role
    if (config.requiredRole && userRole !== config.requiredRole) {
      await auditLogger.logAuthorization({
        requestId,
        userId: userId!,
        action: 'role_check',
        resource: 'api_endpoint',
        requiredPermissions: [config.requiredRole],
        userPermissions: [userRole || ''],
        result: AuditResult.FAILURE,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return {
        success: false,
        error: 'Insufficient role privileges',
      };
    }

    // Check required permissions
    if (config.requiredPermissions) {
      const hasAllPermissions = config.requiredPermissions.every(permission =>
        userPermissions.includes(permission)
      );

      if (!hasAllPermissions) {
        await auditLogger.logAuthorization({
          requestId,
          userId: userId!,
          action: 'permission_check',
          resource: 'api_endpoint',
          requiredPermissions: config.requiredPermissions,
          userPermissions,
          result: AuditResult.FAILURE,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });

        return {
          success: false,
          error: 'Insufficient permissions',
        };
      }
    }

    await auditLogger.logAuthorization({
      requestId,
      userId: userId!,
      action: 'authorization_check',
      resource: 'api_endpoint',
      requiredPermissions: config.requiredPermissions || [],
      userPermissions,
      result: AuditResult.SUCCESS,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { success: true };
  }

  /**
   * Validate input data
   */
  private async validateInput(body: any, requestId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Basic input validation
      if (typeof body !== 'object' || body === null) {
        return { valid: false, error: 'Invalid request body format' };
      }

      // Validate financial data if present
      if (body.debtor_config) {
        const validation = this.validateDebtorConfig(body.debtor_config);
        if (!validation.valid) {
          return validation;
        }
      }

      // Validate amounts
      if (body.amount && !SecurityUtils.isValidAmount(body.amount)) {
        return { valid: false, error: 'Invalid amount value' };
      }

      // Validate IBAN if present
      if (body.iban && !SecurityUtils.isValidIBAN(body.iban)) {
        return { valid: false, error: 'Invalid IBAN format' };
      }

      // Sanitize string inputs
      this.sanitizeObject(body);

      return { valid: true };

    } catch (error) {
      return { valid: false, error: 'Input validation failed' };
    }
  }

  /**
   * Validate debtor configuration
   */
  private validateDebtorConfig(config: any): { valid: boolean; error?: string } {
    const required = ['name', 'iban', 'country'];
    
    for (const field of required) {
      if (!config[field] || typeof config[field] !== 'string' || config[field].trim().length === 0) {
        return { valid: false, error: `Missing or invalid ${field}` };
      }
    }

    if (!SecurityUtils.isValidIBAN(config.iban)) {
      return { valid: false, error: 'Invalid IBAN format' };
    }

    return { valid: true };
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: any): void {
    if (typeof obj !== 'object' || obj === null) return;

    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = SecurityUtils.sanitizeInput(obj[key]);
      } else if (typeof obj[key] === 'object') {
        this.sanitizeObject(obj[key]);
      }
    }
  }

  /**
   * Calculate risk score for request
   */
  private calculateRiskScore(context: SecurityContext, req: any): number {
    let score = 0;

    // Base score for unauthenticated requests
    if (!context.isAuthenticated) score += 30;

    // IP-based scoring
    if (context.ipAddress === 'unknown') score += 20;

    // User agent scoring
    if (context.userAgent === 'unknown' || context.userAgent.length < 10) score += 15;

    // Request method scoring
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') score += 10;

    // Time-based scoring (requests outside business hours)
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) score += 10;

    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Validate token (simplified implementation)
   */
  private async validateToken(token: string): Promise<{
    userId: string;
    role: string;
    permissions: string[];
    sessionId: string;
  } | null> {
    // In production, implement proper JWT validation
    // This is a simplified mock implementation
    
    if (!token || token.length < 10) {
      return null;
    }

    // Mock token validation
    return {
      userId: 'admin_user',
      role: SecurityConfig.auth.roles.ADMIN,
      permissions: Object.values(SecurityConfig.auth.permissions),
      sessionId: 'session_' + Date.now(),
    };
  }

  /**
   * Extract IP address from request
   */
  private extractIpAddress(req: any): string {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  }

  /**
   * Extract user agent from request
   */
  private extractUserAgent(req: any): string {
    return req.headers['user-agent'] || 'unknown';
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(size: string): number {
    const units: Record<string, number> = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024,
    };

    const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2] || 'b';

    return value * (units[unit] || 1);
  }

  /**
   * Add IP to whitelist
   */
  addToWhitelist(ip: string): void {
    this.ipWhitelist.add(ip);
  }

  /**
   * Remove IP from whitelist
   */
  removeFromWhitelist(ip: string): void {
    this.ipWhitelist.delete(ip);
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
export const securityMiddleware = new SecurityMiddleware();

// Export utility functions
export const SecurityMiddlewareUtils = {
  /**
   * Create middleware configuration for refund endpoints
   */
  createRefundEndpointConfig: (): MiddlewareConfig => ({
    requireAuth: true,
    requiredRole: SecurityConfig.auth.roles.ADMIN,
    requiredPermissions: [SecurityConfig.auth.permissions.PROCESS_REFUNDS],
    rateLimitTier: 'financial',
    validateInput: true,
    logRequests: true,
    maxRequestSize: 10 * 1024 * 1024, // 10MB in bytes
  }),

  /**
   * Create middleware configuration for data access endpoints
   */
  createDataAccessConfig: (): MiddlewareConfig => ({
    requireAuth: true,
    requiredPermissions: [SecurityConfig.auth.permissions.VIEW_REFUND_DATA],
    rateLimitTier: 'general',
    validateInput: false,
    logRequests: true,
  }),

  /**
   * Create middleware configuration for authentication endpoints
   */
  createAuthConfig: (): MiddlewareConfig => ({
    requireAuth: false,
    rateLimitTier: 'auth',
    validateInput: true,
    logRequests: true,
  }),
};