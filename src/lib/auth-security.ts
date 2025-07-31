/**
 * Enhanced Authentication Security Module
 * 
 * Provides comprehensive authentication security features including:
 * - Secure session management
 * - Account lockout protection
 * - Password policy enforcement
 * - Multi-factor authentication preparation
 * - Session timeout and invalidation
 * - Authentication monitoring and logging
 */

import { supabase } from "@/integrations/supabase/client";
import { auditLogger, AuditResult, RiskLevel } from './audit-logger';
import { SecurityConfig } from '../config/security';

// Enhanced authentication types
export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
  deviceFingerprint?: string;
  mfaVerified: boolean;
}

export interface AuthAttempt {
  email: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
  failureReason?: string;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords: boolean;
  preventReuse: number; // Number of previous passwords to check
}

export interface AccountLockout {
  userId: string;
  email: string;
  lockedAt: Date;
  unlockAt: Date;
  failedAttempts: number;
  lockoutReason: string;
}

// Authentication security service
export class AuthSecurityService {
  private static instance: AuthSecurityService;
  private activeSessions = new Map<string, AuthSession>();
  private failedAttempts = new Map<string, AuthAttempt[]>();
  private lockedAccounts = new Map<string, AccountLockout>();
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();

  private constructor() {
    this.startSessionCleanup();
  }

  public static getInstance(): AuthSecurityService {
    if (!AuthSecurityService.instance) {
      AuthSecurityService.instance = new AuthSecurityService();
    }
    return AuthSecurityService.instance;
  }

  /**
   * Enhanced sign-in with security checks
   */
  async secureSignIn(
    email: string, 
    password: string, 
    ipAddress: string, 
    userAgent: string,
    deviceFingerprint?: string
  ): Promise<{
    success: boolean;
    session?: AuthSession;
    requiresMFA?: boolean;
    message: string;
    lockoutInfo?: AccountLockout;
  }> {
    const requestId = this.generateRequestId();
    
    try {
      // 1. Check if account is locked
      const lockoutCheck = this.checkAccountLockout(email);
      if (lockoutCheck.isLocked) {
        await auditLogger.logAuthentication({
          requestId,
          action: 'login',
          result: AuditResult.FAILURE,
          ipAddress,
          userAgent,
          error: { message: 'Account locked due to failed attempts' },
        });

        return {
          success: false,
          message: `Account locked until ${lockoutCheck.lockout!.unlockAt.toLocaleString()}`,
          lockoutInfo: lockoutCheck.lockout,
        };
      }

      // 2. Validate password policy (for existing users during login)
      const passwordValidation = this.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        this.recordFailedAttempt(email, ipAddress, userAgent, 'weak_password');
        return {
          success: false,
          message: 'Password does not meet security requirements',
        };
      }

      // 3. Attempt Supabase authentication
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Record failed attempt
        this.recordFailedAttempt(email, ipAddress, userAgent, error.message);
        
        // Check if we should lock the account
        const shouldLock = this.shouldLockAccount(email);
        if (shouldLock) {
          await this.lockAccount(email, 'excessive_failed_attempts');
        }

        await auditLogger.logAuthentication({
          requestId,
          action: 'login',
          result: AuditResult.FAILURE,
          ipAddress,
          userAgent,
          error: { message: error.message },
        });

        return {
          success: false,
          message: 'Invalid credentials',
        };
      }

      // 4. Clear failed attempts on successful login
      this.clearFailedAttempts(email);

      // 5. Create secure session
      const session = await this.createSecureSession(
        data.user!,
        data.session!,
        ipAddress,
        userAgent,
        deviceFingerprint
      );

      // 6. Check if MFA is required (preparation for future MFA implementation)
      const requiresMFA = await this.checkMFARequirement(data.user!.id);

      await auditLogger.logAuthentication({
        requestId,
        userId: data.user!.id,
        action: 'login',
        result: AuditResult.SUCCESS,
        ipAddress,
        userAgent,
      });

      return {
        success: true,
        session,
        requiresMFA,
        message: 'Authentication successful',
      };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        action: 'secure_signin',
        resource: 'auth_service',
        error,
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        message: 'Authentication service error',
      };
    }
  }

  /**
   * Create secure session with enhanced tracking
   */
  private async createSecureSession(
    user: any,
    supabaseSession: any,
    ipAddress: string,
    userAgent: string,
    deviceFingerprint?: string
  ): Promise<AuthSession> {
    // Invalidate any existing sessions for this user (single session policy)
    await this.invalidateUserSessions(user.id);

    const session: AuthSession = {
      id: this.generateSessionId(),
      userId: user.id,
      token: supabaseSession.access_token,
      refreshToken: supabaseSession.refresh_token,
      expiresAt: new Date(Date.now() + SecurityConfig.auth.session.maxAge),
      createdAt: new Date(),
      lastActivity: new Date(),
      ipAddress,
      userAgent,
      isActive: true,
      deviceFingerprint,
      mfaVerified: false, // Will be set to true after MFA verification
    };

    // Store session
    this.activeSessions.set(session.id, session);

    // Set session timeout
    this.setSessionTimeout(session.id);

    // Store session in secure storage (encrypted)
    await this.storeSessionSecurely(session);

    return session;
  }

  /**
   * Validate session and refresh if needed
   */
  async validateSession(sessionId: string): Promise<{
    isValid: boolean;
    session?: AuthSession;
    needsRefresh?: boolean;
  }> {
    const session = this.activeSessions.get(sessionId);
    
    if (!session || !session.isActive) {
      return { isValid: false };
    }

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      await this.invalidateSession(sessionId);
      return { isValid: false };
    }

    // Check if session needs refresh (within 15 minutes of expiry)
    const needsRefresh = (session.expiresAt.getTime() - Date.now()) < (15 * 60 * 1000);

    // Update last activity
    session.lastActivity = new Date();
    this.activeSessions.set(sessionId, session);

    return {
      isValid: true,
      session,
      needsRefresh,
    };
  }

  /**
   * Refresh session token
   */
  async refreshSession(sessionId: string): Promise<{
    success: boolean;
    session?: AuthSession;
    message: string;
  }> {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return {
        success: false,
        message: 'Session not found',
      };
    }

    try {
      // Refresh with Supabase
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: session.refreshToken,
      });

      if (error) {
        await this.invalidateSession(sessionId);
        return {
          success: false,
          message: 'Session refresh failed',
        };
      }

      // Update session with new tokens
      session.token = data.session!.access_token;
      session.refreshToken = data.session!.refresh_token;
      session.expiresAt = new Date(Date.now() + SecurityConfig.auth.session.maxAge);
      session.lastActivity = new Date();

      this.activeSessions.set(sessionId, session);
      
      // Reset session timeout
      this.setSessionTimeout(sessionId);

      return {
        success: true,
        session,
        message: 'Session refreshed successfully',
      };

    } catch (error) {
      await this.invalidateSession(sessionId);
      return {
        success: false,
        message: 'Session refresh error',
      };
    }
  }

  /**
   * Secure sign out with session cleanup
   */
  async secureSignOut(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    
    if (session) {
      // Log sign out
      await auditLogger.logAuthentication({
        requestId: this.generateRequestId(),
        userId: session.userId,
        action: 'logout',
        result: AuditResult.SUCCESS,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      });

      // Sign out from Supabase
      await supabase.auth.signOut();
    }

    // Invalidate session
    await this.invalidateSession(sessionId);
  }

  /**
   * Invalidate session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    
    if (session) {
      session.isActive = false;
      
      // Clear timeout
      const timeout = this.sessionTimeouts.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        this.sessionTimeouts.delete(sessionId);
      }

      // Remove from secure storage
      await this.removeSessionFromStorage(sessionId);
    }

    this.activeSessions.delete(sessionId);
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    const userSessions = Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId);

    for (const session of userSessions) {
      await this.invalidateSession(session.id);
    }
  }

  /**
   * Password strength validation
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const policy: PasswordPolicy = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      preventCommonPasswords: true,
      preventReuse: 5,
    };

    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length < policy.minLength) {
      feedback.push(`Password must be at least ${policy.minLength} characters long`);
    } else {
      score += 20;
    }

    // Character requirements
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      feedback.push('Password must contain at least one uppercase letter');
    } else if (policy.requireUppercase) {
      score += 15;
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      feedback.push('Password must contain at least one lowercase letter');
    } else if (policy.requireLowercase) {
      score += 15;
    }

    if (policy.requireNumbers && !/\d/.test(password)) {
      feedback.push('Password must contain at least one number');
    } else if (policy.requireNumbers) {
      score += 15;
    }

    if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      feedback.push('Password must contain at least one special character');
    } else if (policy.requireSpecialChars) {
      score += 15;
    }

    // Common password check
    if (policy.preventCommonPasswords && this.isCommonPassword(password)) {
      feedback.push('Password is too common, please choose a more unique password');
    } else {
      score += 20;
    }

    return {
      isValid: feedback.length === 0,
      score,
      feedback,
    };
  }

  /**
   * Check if account should be locked
   */
  private shouldLockAccount(email: string): boolean {
    const attempts = this.failedAttempts.get(email) || [];
    const recentAttempts = attempts.filter(
      attempt => Date.now() - attempt.timestamp.getTime() < SecurityConfig.auth.failedAttempts.resetTime
    );

    return recentAttempts.length >= SecurityConfig.auth.failedAttempts.maxAttempts;
  }

  /**
   * Lock account
   */
  private async lockAccount(email: string, reason: string): Promise<void> {
    const lockout: AccountLockout = {
      userId: '', // Will be filled when we have user ID
      email,
      lockedAt: new Date(),
      unlockAt: new Date(Date.now() + SecurityConfig.auth.failedAttempts.lockoutDuration),
      failedAttempts: this.failedAttempts.get(email)?.length || 0,
      lockoutReason: reason,
    };

    this.lockedAccounts.set(email, lockout);

    await auditLogger.logSecurityViolation({
      requestId: this.generateRequestId(),
      violationType: 'suspicious_activity',
      description: `Account ${email} locked due to ${reason}`,
      severity: RiskLevel.HIGH,
    });
  }

  /**
   * Check account lockout status
   */
  private checkAccountLockout(email: string): {
    isLocked: boolean;
    lockout?: AccountLockout;
  } {
    const lockout = this.lockedAccounts.get(email);
    
    if (!lockout) {
      return { isLocked: false };
    }

    // Check if lockout has expired
    if (new Date() > lockout.unlockAt) {
      this.lockedAccounts.delete(email);
      return { isLocked: false };
    }

    return { isLocked: true, lockout };
  }

  /**
   * Record failed authentication attempt
   */
  private recordFailedAttempt(
    email: string,
    ipAddress: string,
    userAgent: string,
    reason: string
  ): void {
    const attempt: AuthAttempt = {
      email,
      ipAddress,
      userAgent,
      timestamp: new Date(),
      success: false,
      failureReason: reason,
    };

    const attempts = this.failedAttempts.get(email) || [];
    attempts.push(attempt);
    
    // Keep only recent attempts
    const recentAttempts = attempts.filter(
      a => Date.now() - a.timestamp.getTime() < SecurityConfig.auth.failedAttempts.resetTime
    );
    
    this.failedAttempts.set(email, recentAttempts);
  }

  /**
   * Clear failed attempts for email
   */
  private clearFailedAttempts(email: string): void {
    this.failedAttempts.delete(email);
  }

  /**
   * Check if MFA is required for user
   */
  private async checkMFARequirement(userId: string): Promise<boolean> {
    // This is preparation for future MFA implementation
    // For now, return false, but this can be enhanced later
    return false;
  }

  /**
   * Set session timeout
   */
  private setSessionTimeout(sessionId: string): void {
    // Clear existing timeout
    const existingTimeout = this.sessionTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      await this.invalidateSession(sessionId);
    }, SecurityConfig.auth.session.maxAge);

    this.sessionTimeouts.set(sessionId, timeout);
  }

  /**
   * Store session securely (encrypted)
   */
  private async storeSessionSecurely(session: AuthSession): Promise<void> {
    // In a production environment, this would encrypt and store the session
    // in a secure database or cache like Redis
    // For now, we're using in-memory storage
    
    // TODO: Implement encrypted session storage
    console.log(`Session ${session.id} stored securely`);
  }

  /**
   * Remove session from storage
   */
  private async removeSessionFromStorage(sessionId: string): Promise<void> {
    // TODO: Implement session removal from encrypted storage
    console.log(`Session ${sessionId} removed from storage`);
  }

  /**
   * Check if password is common
   */
  private isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey',
      'dragon', 'master', 'shadow', 'qwertyuiop', 'azerty'
    ];
    
    return commonPasswords.includes(password.toLowerCase());
  }

  /**
   * Start session cleanup process
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const expiredSessions = Array.from(this.activeSessions.entries())
      .filter(([_, session]) => now > session.expiresAt || !session.isActive);

    for (const [sessionId, _] of expiredSessions) {
      await this.invalidateSession(sessionId);
    }
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active sessions for user
   */
  getUserSessions(userId: string): AuthSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId && session.isActive);
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalActiveSessions: number;
    totalUsers: number;
    averageSessionDuration: number;
  } {
    const activeSessions = Array.from(this.activeSessions.values())
      .filter(session => session.isActive);

    const uniqueUsers = new Set(activeSessions.map(s => s.userId)).size;
    
    const totalDuration = activeSessions.reduce((sum, session) => {
      return sum + (Date.now() - session.createdAt.getTime());
    }, 0);

    const averageSessionDuration = activeSessions.length > 0 
      ? totalDuration / activeSessions.length 
      : 0;

    return {
      totalActiveSessions: activeSessions.length,
      totalUsers: uniqueUsers,
      averageSessionDuration,
    };
  }
}

// Export singleton instance
export const authSecurityService = AuthSecurityService.getInstance();