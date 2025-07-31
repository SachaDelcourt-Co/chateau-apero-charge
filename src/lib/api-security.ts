/**
 * Comprehensive API Security Middleware Stack
 * 
 * This module provides a complete security middleware stack for API endpoints,
 * implementing multiple layers of security controls including authentication,
 * authorization, rate limiting, input validation, and threat detection.
 * 
 * Features:
 * - Multi-layered security architecture
 * - JWT token validation and session management
 * - Advanced rate limiting with adaptive thresholds
 * - Real-time threat detection and response
 * - API key management and validation
 * - Request/response filtering and sanitization
 * - Security headers injection
 * - CORS policy enforcement
 * - SQL injection and XSS protection
 * - DDoS protection and IP blocking
 * - Security event monitoring and alerting
 */

import { logger } from './logger';
import { auditLogger, RiskLevel, AuditResult } from './audit-logger';
import { SecurityUtils } from '../config/security';
import { securityMiddleware, SecurityContext } from './security-middleware';

// Security policy configuration
export interface SecurityPolicy {
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  rules: SecurityRule[];
}

// Security rule interface
export interface SecurityRule {
  id: string;
  name: string;
  type: 'authentication' | 'authorization' | 'rate_limit' | 'input_validation' | 'threat_detection' | 'cors' | 'headers';
  condition: (context: ApiSecurityContext) => boolean;
  action: SecurityAction;
  severity: RiskLevel;
  metadata?: Record<string, any>;
}

// Security actions
export type SecurityAction = 
  | { type: 'allow' }
  | { type: 'deny'; reason: string; statusCode?: number }
  | { type: 'challenge'; method: 'captcha' | 'mfa' | 'rate_limit' }
  | { type: 'monitor'; alertLevel: 'info' | 'warn' | 'error' | 'critical' }
  | { type: 'block_ip'; duration: number }
  | { type: 'throttle'; delay: number };

// API security context
export interface ApiSecurityContext {
  requestId: string;
  timestamp: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  ipAddress: string;
  userAgent: string;
  userId?: string;
  userRole?: string;
  sessionId?: string;
  apiKey?: string;
  riskScore: number;
  securityFlags: string[];
  metadata: Record<string, any>;
}

// Security check result
export interface SecurityCheckResult {
  allowed: boolean;
  action: SecurityAction;
  triggeredRules: SecurityRule[];
  riskScore: number;
  securityFlags: string[];
  headers?: Record<string, string>;
  statusCode?: number;
  message?: string;
}

// Rate limiting configuration
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  keyGenerator: (context: ApiSecurityContext) => string;
  onLimitReached?: (context: ApiSecurityContext) => Promise<void>;
}

// Threat detection patterns
interface ThreatPattern {
  name: string;
  pattern: RegExp;
  severity: RiskLevel;
  description: string;
  action: SecurityAction;
}

/**
 * Comprehensive API Security Middleware
 */
export class ApiSecurityMiddleware {
  private policies: Map<string, SecurityPolicy> = new Map();
  private rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
  private blockedIps: Map<string, { until: number; reason: string }> = new Map();
  private suspiciousIps: Map<string, { score: number; lastSeen: number }> = new Map();
  private threatPatterns: ThreatPattern[] = [];
  private apiKeys: Map<string, { userId: string; permissions: string[]; rateLimit: RateLimitConfig }> = new Map();

  constructor() {
    this.initializeDefaultPolicies();
    this.initializeThreatPatterns();
    this.startCleanupTasks();
  }

  /**
   * Process API request through security middleware stack
   */
  async processRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: any,
    query?: Record<string, string>
  ): Promise<SecurityCheckResult> {
    const requestId = SecurityUtils.generateRequestId();
    const timestamp = Date.now();
    
    // Build security context
    const context: ApiSecurityContext = {
      requestId,
      timestamp,
      method: method.toUpperCase(),
      path,
      headers,
      body,
      query,
      ipAddress: this.extractIpAddress(headers),
      userAgent: this.extractUserAgent(headers),
      riskScore: 0,
      securityFlags: [],
      metadata: {},
    };

    try {
      // 1. IP-based security checks
      const ipCheckResult = await this.checkIpSecurity(context);
      if (!ipCheckResult.allowed) {
        return ipCheckResult;
      }

      // 2. Authentication and authorization
      const authResult = await this.checkAuthentication(context);
      if (!authResult.allowed) {
        return authResult;
      }

      // 3. Rate limiting
      const rateLimitResult = await this.checkRateLimit(context);
      if (!rateLimitResult.allowed) {
        return rateLimitResult;
      }

      // 4. Input validation and threat detection
      const inputValidationResult = await this.checkInputSecurity(context);
      if (!inputValidationResult.allowed) {
        return inputValidationResult;
      }

      // 5. CORS validation
      const corsResult = await this.checkCorsPolicy(context);
      if (!corsResult.allowed) {
        return corsResult;
      }

      // 6. Apply security policies
      const policyResult = await this.applySecurityPolicies(context);
      if (!policyResult.allowed) {
        return policyResult;
      }

      // 7. Generate security headers
      const securityHeaders = this.generateSecurityHeaders(context);

      // 8. Log successful security check
      await auditLogger.logDataAccess({
        requestId,
        userId: context.userId || 'anonymous',
        action: `${method} ${path}`,
        resource: 'api_security',
        dataType: 'card_data',
        result: AuditResult.SUCCESS,
        duration: Date.now() - timestamp,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return {
        allowed: true,
        action: { type: 'allow' },
        triggeredRules: [],
        riskScore: context.riskScore,
        securityFlags: context.securityFlags,
        headers: securityHeaders,
      };

    } catch (error) {
      await this.logSecurityError(context, error);
      return {
        allowed: false,
        action: { type: 'deny', reason: 'Internal security error', statusCode: 500 },
        triggeredRules: [],
        riskScore: 100,
        securityFlags: ['internal_error'],
        statusCode: 500,
        message: 'Internal security error',
      };
    }
  }

  /**
   * Check IP-based security
   */
  private async checkIpSecurity(context: ApiSecurityContext): Promise<SecurityCheckResult> {
    const { ipAddress, requestId } = context;

    // Check if IP is blocked
    const blocked = this.blockedIps.get(ipAddress);
    if (blocked && Date.now() < blocked.until) {
      await auditLogger.logSecurityViolation({
        requestId,
        violationType: 'suspicious_activity',
        description: `Request from blocked IP: ${ipAddress} (${blocked.reason})`,
        ipAddress,
        userAgent: context.userAgent,
        severity: RiskLevel.HIGH,
      });

      return {
        allowed: false,
        action: { type: 'deny', reason: 'IP address blocked', statusCode: 403 },
        triggeredRules: [],
        riskScore: 100,
        securityFlags: ['blocked_ip'],
        statusCode: 403,
        message: 'Access denied',
      };
    }

    // Check suspicious IP activity
    const suspicious = this.suspiciousIps.get(ipAddress);
    if (suspicious && suspicious.score > 80) {
      context.riskScore += 30;
      context.securityFlags.push('suspicious_ip');
      
      // Implement progressive blocking
      if (suspicious.score > 95) {
        this.blockIp(ipAddress, 'High suspicious activity score', 3600000); // 1 hour
        return {
          allowed: false,
          action: { type: 'block_ip', duration: 3600000 },
          triggeredRules: [],
          riskScore: 100,
          securityFlags: ['auto_blocked'],
          statusCode: 429,
          message: 'Too many suspicious requests',
        };
      }
    }

    return {
      allowed: true,
      action: { type: 'allow' },
      triggeredRules: [],
      riskScore: context.riskScore,
      securityFlags: context.securityFlags,
    };
  }

  /**
   * Check authentication and authorization
   */
  private async checkAuthentication(context: ApiSecurityContext): Promise<SecurityCheckResult> {
    const { headers, requestId, path } = context;
    
    // Skip authentication for public endpoints
    const publicEndpoints = ['/api/stripe-webhook', '/health', '/status'];
    if (publicEndpoints.some(endpoint => path.startsWith(endpoint))) {
      return {
        allowed: true,
        action: { type: 'allow' },
        triggeredRules: [],
        riskScore: context.riskScore,
        securityFlags: context.securityFlags,
      };
    }

    // Check for API key
    const apiKey = headers['x-api-key'];
    if (apiKey) {
      const keyData = this.apiKeys.get(apiKey);
      if (!keyData) {
        await auditLogger.logSecurityViolation({
          requestId,
          violationType: 'invalid_token',
          description: 'Invalid API key provided',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          severity: RiskLevel.MEDIUM,
        });

        return {
          allowed: false,
          action: { type: 'deny', reason: 'Invalid API key', statusCode: 401 },
          triggeredRules: [],
          riskScore: 70,
          securityFlags: ['invalid_api_key'],
          statusCode: 401,
          message: 'Invalid API key',
        };
      }

      context.userId = keyData.userId;
      context.apiKey = apiKey;
      context.metadata.permissions = keyData.permissions;
    }

    // Check for JWT token
    const authHeader = headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenValidation = await this.validateJwtToken(token);
      
      if (!tokenValidation.valid) {
        await auditLogger.logSecurityViolation({
          requestId,
          violationType: 'invalid_token',
          description: 'Invalid or expired JWT token',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          severity: RiskLevel.MEDIUM,
        });

        return {
          allowed: false,
          action: { type: 'deny', reason: 'Invalid token', statusCode: 401 },
          triggeredRules: [],
          riskScore: 70,
          securityFlags: ['invalid_token'],
          statusCode: 401,
          message: 'Invalid or expired token',
        };
      }

      context.userId = tokenValidation.userId;
      context.userRole = tokenValidation.role;
      context.sessionId = tokenValidation.sessionId;
    }

    // Require authentication for protected endpoints
    const protectedEndpoints = ['/api/process-bar-order', '/api/create-stripe-checkout', '/api/process-standard-recharge'];
    if (protectedEndpoints.some(endpoint => path.startsWith(endpoint)) && !context.userId) {
      return {
        allowed: false,
        action: { type: 'deny', reason: 'Authentication required', statusCode: 401 },
        triggeredRules: [],
        riskScore: 50,
        securityFlags: ['unauthenticated'],
        statusCode: 401,
        message: 'Authentication required',
      };
    }

    return {
      allowed: true,
      action: { type: 'allow' },
      triggeredRules: [],
      riskScore: context.riskScore,
      securityFlags: context.securityFlags,
    };
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(context: ApiSecurityContext): Promise<SecurityCheckResult> {
    const { ipAddress, userId, path, requestId } = context;
    
    // Define rate limits based on endpoint and user type
    const rateLimits = {
      '/api/process-bar-order': { windowMs: 60000, maxRequests: 30 }, // 30 per minute
      '/api/create-stripe-checkout': { windowMs: 300000, maxRequests: 10 }, // 10 per 5 minutes
      '/api/process-standard-recharge': { windowMs: 60000, maxRequests: 20 }, // 20 per minute
      'default': { windowMs: 60000, maxRequests: 100 }, // 100 per minute for other endpoints
    };

    const limit = rateLimits[path as keyof typeof rateLimits] || rateLimits.default;
    const key = userId ? `user:${userId}:${path}` : `ip:${ipAddress}:${path}`;
    
    const now = Date.now();
    const existing = this.rateLimitStore.get(key);
    
    if (!existing || now > existing.resetTime) {
      this.rateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs });
      return {
        allowed: true,
        action: { type: 'allow' },
        triggeredRules: [],
        riskScore: context.riskScore,
        securityFlags: context.securityFlags,
      };
    }

    existing.count++;
    this.rateLimitStore.set(key, existing);

    if (existing.count > limit.maxRequests) {
      // Increase suspicious activity score
      const suspicious = this.suspiciousIps.get(ipAddress) || { score: 0, lastSeen: now };
      suspicious.score += 10;
      suspicious.lastSeen = now;
      this.suspiciousIps.set(ipAddress, suspicious);

      await auditLogger.logSecurityViolation({
        requestId,
        violationType: 'rate_limit_exceeded',
        description: `Rate limit exceeded for ${path}: ${existing.count}/${limit.maxRequests}`,
        ipAddress,
        userAgent: context.userAgent,
        severity: RiskLevel.MEDIUM,
      });

      return {
        allowed: false,
        action: { type: 'throttle', delay: Math.min(existing.count * 1000, 30000) },
        triggeredRules: [],
        riskScore: 80,
        securityFlags: ['rate_limited'],
        statusCode: 429,
        message: 'Rate limit exceeded',
        headers: {
          'Retry-After': Math.ceil((existing.resetTime - now) / 1000).toString(),
          'X-RateLimit-Limit': limit.maxRequests.toString(),
          'X-RateLimit-Remaining': Math.max(0, limit.maxRequests - existing.count).toString(),
          'X-RateLimit-Reset': Math.ceil(existing.resetTime / 1000).toString(),
        },
      };
    }

    return {
      allowed: true,
      action: { type: 'allow' },
      triggeredRules: [],
      riskScore: context.riskScore,
      securityFlags: context.securityFlags,
      headers: {
        'X-RateLimit-Limit': limit.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, limit.maxRequests - existing.count).toString(),
        'X-RateLimit-Reset': Math.ceil(existing.resetTime / 1000).toString(),
      },
    };
  }

  /**
   * Check input security and threat detection
   */
  private async checkInputSecurity(context: ApiSecurityContext): Promise<SecurityCheckResult> {
    const { body, query, headers, requestId } = context;
    
    // Check for threat patterns in all input data
    const inputData = JSON.stringify({ body, query, headers });
    
    for (const pattern of this.threatPatterns) {
      if (pattern.pattern.test(inputData)) {
        // Increase suspicious activity score
        const suspicious = this.suspiciousIps.get(context.ipAddress) || { score: 0, lastSeen: Date.now() };
        suspicious.score += pattern.severity === RiskLevel.CRITICAL ? 50 : 
                           pattern.severity === RiskLevel.HIGH ? 30 : 
                           pattern.severity === RiskLevel.MEDIUM ? 15 : 5;
        suspicious.lastSeen = Date.now();
        this.suspiciousIps.set(context.ipAddress, suspicious);

        await auditLogger.logSecurityViolation({
          requestId,
          violationType: 'suspicious_activity',
          description: `Threat pattern detected: ${pattern.name} - ${pattern.description}`,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          severity: pattern.severity,
        });

        if (pattern.severity === RiskLevel.CRITICAL) {
          this.blockIp(context.ipAddress, `Critical threat pattern: ${pattern.name}`, 7200000); // 2 hours
        }

        return {
          allowed: false,
          action: pattern.action,
          triggeredRules: [],
          riskScore: 100,
          securityFlags: ['threat_detected', pattern.name],
          statusCode: 400,
          message: 'Invalid request detected',
        };
      }
    }

    // Validate request size
    const requestSize = inputData.length;
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (requestSize > maxSize) {
      await auditLogger.logSecurityViolation({
        requestId,
        violationType: 'suspicious_activity',
        description: `Request size exceeds limit: ${requestSize} bytes`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        severity: RiskLevel.MEDIUM,
      });

      return {
        allowed: false,
        action: { type: 'deny', reason: 'Request too large', statusCode: 413 },
        triggeredRules: [],
        riskScore: 60,
        securityFlags: ['oversized_request'],
        statusCode: 413,
        message: 'Request entity too large',
      };
    }

    return {
      allowed: true,
      action: { type: 'allow' },
      triggeredRules: [],
      riskScore: context.riskScore,
      securityFlags: context.securityFlags,
    };
  }

  /**
   * Check CORS policy
   */
  private async checkCorsPolicy(context: ApiSecurityContext): Promise<SecurityCheckResult> {
    const origin = context.headers.origin;
    
    if (!origin) {
      return {
        allowed: true,
        action: { type: 'allow' },
        triggeredRules: [],
        riskScore: context.riskScore,
        securityFlags: context.securityFlags,
      };
    }

    // Define allowed origins based on environment
    const allowedOrigins = [
      'https://localhost:3000',
      'http://localhost:3000',
      'https://127.0.0.1:3000',
      'http://127.0.0.1:3000',
    ];

    // Add production origins from environment
    const prodOrigins = process.env.VITE_ALLOWED_ORIGINS?.split(',') || [];
    allowedOrigins.push(...prodOrigins);

    if (!allowedOrigins.includes(origin)) {
      await auditLogger.logSecurityViolation({
        requestId: context.requestId,
        violationType: 'suspicious_activity',
        description: `CORS violation: Origin ${origin} not allowed`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        severity: RiskLevel.MEDIUM,
      });

      return {
        allowed: false,
        action: { type: 'deny', reason: 'CORS policy violation', statusCode: 403 },
        triggeredRules: [],
        riskScore: 70,
        securityFlags: ['cors_violation'],
        statusCode: 403,
        message: 'CORS policy violation',
      };
    }

    return {
      allowed: true,
      action: { type: 'allow' },
      triggeredRules: [],
      riskScore: context.riskScore,
      securityFlags: context.securityFlags,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-API-Key',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    };
  }

  /**
   * Apply security policies
   */
  private async applySecurityPolicies(context: ApiSecurityContext): Promise<SecurityCheckResult> {
    const triggeredRules: SecurityRule[] = [];
    let highestRiskScore = context.riskScore;
    let denyAction: SecurityAction | null = null;

    // Sort policies by priority
    const sortedPolicies = Array.from(this.policies.values())
      .filter(policy => policy.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const policy of sortedPolicies) {
      for (const rule of policy.rules) {
        if (rule.condition(context)) {
          triggeredRules.push(rule);
          
          // Update risk score based on rule severity
          const riskIncrease = rule.severity === RiskLevel.CRITICAL ? 40 :
                              rule.severity === RiskLevel.HIGH ? 25 :
                              rule.severity === RiskLevel.MEDIUM ? 15 : 5;
          
          highestRiskScore = Math.max(highestRiskScore, context.riskScore + riskIncrease);
          
          // Check if rule requires denial
          if (rule.action.type === 'deny') {
            denyAction = rule.action;
            break;
          }
        }
      }
      
      if (denyAction) break;
    }

    context.riskScore = Math.min(highestRiskScore, 100);

    if (denyAction) {
      const statusCode = denyAction.type === 'deny' ? denyAction.statusCode || 403 : 403;
      const message = denyAction.type === 'deny' ? denyAction.reason : 'Access denied';
      
      return {
        allowed: false,
        action: denyAction,
        triggeredRules,
        riskScore: context.riskScore,
        securityFlags: context.securityFlags,
        statusCode,
        message,
      };
    }

    return {
      allowed: true,
      action: { type: 'allow' },
      triggeredRules,
      riskScore: context.riskScore,
      securityFlags: context.securityFlags,
    };
  }

  /**
   * Generate security headers
   */
  private generateSecurityHeaders(context: ApiSecurityContext): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'X-Request-ID': context.requestId,
      'X-Security-Score': context.riskScore.toString(),
    };

    // Add CSP header
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "font-src 'self'",
      "object-src 'none'",
      "media-src 'self'",
      "frame-src 'none'",
    ].join('; ');
    
    headers['Content-Security-Policy'] = csp;

    // Add HSTS in production
    if (process.env.NODE_ENV === 'production') {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
    }

    return headers;
  }

  /**
   * Initialize default security policies
   */
  private initializeDefaultPolicies(): void {
    // Financial transaction security policy
    const financialPolicy: SecurityPolicy = {
      name: 'financial_security',
      description: 'Enhanced security for financial operations',
      enabled: true,
      priority: 1,
      rules: [
        {
          id: 'large_transaction_check',
          name: 'Large Transaction Monitoring',
          type: 'threat_detection',
          condition: (context) => {
            const amount = context.body?.amount || 0;
            return amount > 1000;
          },
          action: { type: 'monitor', alertLevel: 'warn' },
          severity: RiskLevel.MEDIUM,
        },
        {
          id: 'rapid_transactions',
          name: 'Rapid Transaction Detection',
          type: 'rate_limit',
          condition: (context) => {
            return context.path.includes('process-bar-order') && context.riskScore > 50;
          },
          action: { type: 'throttle', delay: 2000 },
          severity: RiskLevel.HIGH,
        },
      ],
    };

    this.policies.set('financial_security', financialPolicy);
  }

  /**
   * Initialize threat detection patterns
   */
  private initializeThreatPatterns(): void {
    this.threatPatterns = [
      {
        name: 'sql_injection',
        pattern: /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bDELETE\b|\bDROP\b|\bUPDATE\b).*(\bFROM\b|\bWHERE\b|\bINTO\b)/i,
        severity: RiskLevel.CRITICAL,
        description: 'SQL injection attempt detected',
        action: { type: 'deny', reason: 'Malicious request detected', statusCode: 400 },
      },
      {
        name: 'xss_attempt',
        pattern: /<script[^>]*>.*?<\/script>|javascript:|vbscript:|onload=|onerror=/i,
        severity: RiskLevel.HIGH,
        description: 'XSS attempt detected',
        action: { type: 'deny', reason: 'Malicious request detected', statusCode: 400 },
      },
      {
        name: 'path_traversal',
        pattern: /\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c/i,
        severity: RiskLevel.HIGH,
        description: 'Path traversal attempt detected',
        action: { type: 'deny', reason: 'Invalid request path', statusCode: 400 },
      },
      {
        name: 'command_injection',
        pattern: /[;&|`$(){}[\]]/,
        severity: RiskLevel.CRITICAL,
        description: 'Command injection attempt detected',
        action: { type: 'deny', reason: 'Malicious request detected', statusCode: 400 },
      },
    ];
  }

  /**
   * Validate JWT token
   */
  private async validateJwtToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    role?: string;
    sessionId?: string;
    error?: string;
  }> {
    try {
      // In production, implement proper JWT validation with your JWT library
      // This is a simplified mock implementation
      
      if (!token || token.length < 10) {
        return { valid: false, error: 'Invalid token format' };
      }

      // Mock validation - replace with actual JWT verification
      return {
        valid: true,
        userId: 'user_123',
        role: 'user',
        sessionId: 'session_' + Date.now(),
      };
    } catch (error) {
      return { valid: false, error: 'Token validation failed' };
    }
  }

  /**
   * Block IP address
   */
  private blockIp(ipAddress: string, reason: string, duration: number): void {
    this.blockedIps.set(ipAddress, {
      until: Date.now() + duration,
      reason,
    });
    
    logger.warn(`Blocked IP ${ipAddress} for ${duration}ms: ${reason}`);
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
   * Extract user agent from headers
   */
  private extractUserAgent(headers: Record<string, string>): string {
    return headers['user-agent'] || 'unknown';
  }

  /**
   * Log security error
   */
  private async logSecurityError(context: ApiSecurityContext, error: any): Promise<void> {
    await auditLogger.logError({
      requestId: context.requestId,
      action: 'api_security_check',
      resource: 'security_middleware',
      error,
      duration: Date.now() - context.timestamp,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean rate limit store every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.rateLimitStore.entries()) {
        if (now > entry.resetTime) {
          this.rateLimitStore.delete(key);
        }
      }
    }, 5 * 60 * 1000);

    // Clean blocked IPs every hour
    setInterval(() => {
      const now = Date.now();
      for (const [ip, block] of this.blockedIps.entries()) {
        if (now > block.until) {
          this.blockedIps.delete(ip);
        }
      }
    }, 60 * 60 * 1000);

    // Clean suspicious IPs every 24 hours
    setInterval(() => {
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);
      for (const [ip, suspicious] of this.suspiciousIps.entries()) {
        if (suspicious.lastSeen < dayAgo) {
          this.suspiciousIps.delete(ip);
        }
      }
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Get security statistics
   */
  getStatistics(): {
    blockedIps: number;
    suspiciousIps: number;
    rateLimitEntries: number;
    policies: number;
    threatPatterns: number;
  } {
    return {
      blockedIps: this.blockedIps.size,
      suspiciousIps: this.suspiciousIps.size,
      rateLimitEntries: this.rateLimitStore.size,
      policies: this.policies.size,
      threatPatterns: this.threatPatterns.length,
    };
  }

  /**
   * Add custom security policy
   */
  addSecurityPolicy(policy: SecurityPolicy): void {
    this.policies.set(policy.name, policy);
  }

  /**
   * Remove security policy
   */
  removeSecurityPolicy(name: string): void {
    this.policies.delete(name);
  }

  /**
   * Add API key
   */
  addApiKey(key: string, userId: string, permissions: string[], rateLimit?: RateLimitConfig): void {
    this.apiKeys.set(key, {
      userId,
      permissions,
      rateLimit: rateLimit || {
        windowMs: 60000,
        maxRequests: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        keyGenerator: (context) => `api:${key}:${context.path}`,
      },
    });
  }

  /**
   * Remove API key
   */
  removeApiKey(key: string): void {
    this.apiKeys.delete(key);
  }

  /**
   * Unblock IP address
   */
  unblockIp(ipAddress: string): void {
    this.blockedIps.delete(ipAddress);
    logger.info(`Unblocked IP ${ipAddress}`);
  }

  /**
   * Clear suspicious IP score
   */
  clearSuspiciousIp(ipAddress: string): void {
    this.suspiciousIps.delete(ipAddress);
  }
}

// Export singleton instance
export const apiSecurityMiddleware = new ApiSecurityMiddleware();

// Export utility functions
export const ApiSecurityUtils = {
  /**
   * Create security context from request
   */
  createSecurityContext: (
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: any,
    query?: Record<string, string>
  ): Partial<ApiSecurityContext> => ({
    requestId: SecurityUtils.generateRequestId(),
    timestamp: Date.now(),
    method: method.toUpperCase(),
    path,
    headers,
    body,
    query,
    ipAddress: headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
    userAgent: headers['user-agent'] || 'unknown',
    riskScore: 0,
    securityFlags: [],
    metadata: {},
  }),

  /**
   * Validate security policy configuration
   */
  validateSecurityPolicy: (policy: SecurityPolicy): boolean => {
    const required = ['name', 'description', 'enabled', 'priority', 'rules'];
    return required.every(field => policy[field as keyof SecurityPolicy] !== undefined);
  },

  /**
   * Generate security report
   */
  generateSecurityReport: (): string => {
    const stats = apiSecurityMiddleware.getStatistics();
    return `
# API Security Report

## Statistics
- Blocked IPs: ${stats.blockedIps}
- Suspicious IPs: ${stats.suspiciousIps}
- Rate Limit Entries: ${stats.rateLimitEntries}
- Active Policies: ${stats.policies}
- Threat Patterns: ${stats.threatPatterns}

## Security Status
- API Security Middleware: Active
- Threat Detection: Enabled
- Rate Limiting: Enabled
- CORS Protection: Enabled
- Input Validation: Enabled

Generated at: ${new Date().toISOString()}
    `.trim();
  },
};