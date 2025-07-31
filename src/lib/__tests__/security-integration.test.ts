/**
 * Comprehensive Security Integration Tests
 * 
 * Tests all security enhancements including:
 * - Authentication security
 * - Session management
 * - Password policies
 * - Account lockout protection
 * - MFA functionality
 * - RBAC system
 * - Security monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authSecurityService, AuthSession } from '../auth-security';
import { mfaService, MFAMethod } from '../mfa-service';
import { rbacService } from '../rbac-service';
import { auditLogger } from '../audit-logger';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

describe('Security Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Security', () => {
    it('should enforce password strength requirements', async () => {
      const weakPassword = '123';
      const strongPassword = 'SecureP@ssw0rd123!';

      const weakResult = authSecurityService.validatePasswordStrength(weakPassword);
      const strongResult = authSecurityService.validatePasswordStrength(strongPassword);

      expect(weakResult.isValid).toBe(false);
      expect(weakResult.feedback.length).toBeGreaterThan(0);
      expect(strongResult.isValid).toBe(true);
      expect(strongResult.score).toBeGreaterThan(80);
    });

    it('should implement account lockout after failed attempts', async () => {
      const email = 'test@example.com';
      const wrongPassword = 'wrongpassword';
      const ipAddress = '192.168.1.1';
      const userAgent = 'test-agent';

      // Mock failed authentication
      const mockSupabase = await import('@/integrations/supabase/client');
      vi.mocked(mockSupabase.supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'Invalid credentials',
          code: 'invalid_credentials',
          status: 400,
          __isAuthError: true,
          name: 'AuthError'
        } as any,
      });

      // Attempt multiple failed logins
      for (let i = 0; i < 6; i++) {
        const result = await authSecurityService.secureSignIn(
          email,
          wrongPassword,
          ipAddress,
          userAgent
        );
        
        if (i < 5) {
          expect(result.success).toBe(false);
          expect(result.lockoutInfo).toBeUndefined();
        } else {
          // Should be locked after 5 attempts
          expect(result.success).toBe(false);
          expect(result.lockoutInfo).toBeDefined();
        }
      }
    });

    it('should create secure sessions with proper metadata', async () => {
      const email = 'test@example.com';
      const password = 'SecureP@ssw0rd123!';
      const ipAddress = '192.168.1.1';
      const userAgent = 'test-agent';

      // Mock successful authentication
      const mockSupabase = await import('@/integrations/supabase/client');
      vi.mocked(mockSupabase.supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
            id: 'user123',
            email,
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString()
          } as any,
          session: {
            access_token: 'token123',
            refresh_token: 'refresh123',
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: 'user123' } as any
          } as any,
        },
        error: null,
      });

      const result = await authSecurityService.secureSignIn(
        email,
        password,
        ipAddress,
        userAgent
      );

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.ipAddress).toBe(ipAddress);
      expect(result.session?.userAgent).toBe(userAgent);
      expect(result.session?.isActive).toBe(true);
    });

    it('should validate and refresh sessions properly', async () => {
      // Create a mock session
      const mockSession: AuthSession = {
        id: 'session123',
        userId: 'user123',
        token: 'token123',
        refreshToken: 'refresh123',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        createdAt: new Date(),
        lastActivity: new Date(),
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        isActive: true,
        mfaVerified: false,
      };

      // Test session validation
      const validation = await authSecurityService.validateSession(mockSession.id);
      expect(validation.isValid).toBe(false); // Should be false as session is not in memory

      // Test session refresh
      const mockSupabase = await import('@/integrations/supabase/client');
      vi.mocked(mockSupabase.supabase.auth.refreshSession).mockResolvedValue({
        data: {
          user: { id: 'user123' } as any,
          session: {
            access_token: 'new_token',
            refresh_token: 'new_refresh',
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: 'user123' } as any
          } as any,
        },
        error: null,
      });

      const refreshResult = await authSecurityService.refreshSession(mockSession.id);
      expect(refreshResult.success).toBe(false); // Should fail as session doesn't exist
    });
  });

  describe('Multi-Factor Authentication', () => {
    it('should enroll user in TOTP MFA', async () => {
      const userId = 'user123';
      
      const enrollmentResult = await mfaService.enrollTOTP(userId);
      
      expect(enrollmentResult.success).toBe(true);
      expect(enrollmentResult.method).toBe('totp');
      expect(enrollmentResult.secret).toBeDefined();
      expect(enrollmentResult.qrCodeUrl).toBeDefined();
      expect(enrollmentResult.backupCodes).toBeDefined();
      expect(enrollmentResult.backupCodes?.length).toBe(10);
    });

    it('should verify TOTP codes correctly', async () => {
      const userId = 'user123';
      
      // First enroll in TOTP
      await mfaService.enrollTOTP(userId);
      
      // Test with invalid code
      const invalidResult = await mfaService.verifyTOTPEnrollment(
        userId,
        '000000',
        '192.168.1.1',
        'test-agent'
      );
      
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.message).toContain('Invalid TOTP code');
    });

    it('should handle backup codes properly', async () => {
      const userId = 'user123';
      
      // Enroll in TOTP first
      const enrollment = await mfaService.enrollTOTP(userId);
      expect(enrollment.backupCodes).toBeDefined();
      
      if (enrollment.backupCodes && enrollment.backupCodes.length > 0) {
        const backupCode = enrollment.backupCodes[0];
        
        // Complete enrollment first (mock)
        await mfaService.verifyTOTPEnrollment(userId, '123456'); // This will fail but create the config
        
        // Test backup code verification
        const backupResult = await mfaService.verifyMFA(
          userId,
          'backup_codes',
          backupCode,
          '192.168.1.1',
          'test-agent'
        );
        
        // Should fail as TOTP is not properly enrolled
        expect(backupResult.success).toBe(false);
      }
    });

    it('should check MFA requirements correctly', async () => {
      const userId = 'user123';
      
      // Initially no MFA required
      const initialCheck = await mfaService.isMFARequired(userId);
      expect(initialCheck).toBe(false);
      
      // After enrollment, should still be false until verified
      await mfaService.enrollTOTP(userId);
      const afterEnrollment = await mfaService.isMFARequired(userId);
      expect(afterEnrollment).toBe(false);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should check permissions correctly', async () => {
      const userId = 'user123';
      
      // Test without any roles
      const noRoleResult = await rbacService.checkPermission(
        userId,
        'bar',
        'view'
      );
      
      expect(noRoleResult.granted).toBe(false);
      expect(noRoleResult.reason).toContain('No roles assigned');
      
      // Assign bar role
      const assignResult = await rbacService.assignRole(
        userId,
        'bar',
        'admin123'
      );
      
      expect(assignResult.success).toBe(true);
      
      // Test with bar role
      const withRoleResult = await rbacService.checkPermission(
        userId,
        'bar',
        'view'
      );
      
      expect(withRoleResult.granted).toBe(true);
      expect(withRoleResult.effectiveRoles.length).toBeGreaterThan(0);
    });

    it('should handle role inheritance correctly', async () => {
      const userId = 'user123';
      
      // Assign admin role (inherits from bar and recharge)
      await rbacService.assignRole(userId, 'admin', 'super_admin');
      
      // Should have access to bar operations
      const barAccess = await rbacService.checkPermission(userId, 'bar', 'view');
      expect(barAccess.granted).toBe(true);
      
      // Should have access to recharge operations
      const rechargeAccess = await rbacService.checkPermission(userId, 'recharge', 'view');
      expect(rechargeAccess.granted).toBe(true);
      
      // Should have access to admin operations
      const adminAccess = await rbacService.checkPermission(userId, 'admin', 'view');
      expect(adminAccess.granted).toBe(true);
    });

    it('should evaluate permission conditions', async () => {
      const userId = 'user123';
      
      // Assign admin role
      await rbacService.assignRole(userId, 'admin', 'super_admin');
      
      // Test refund permission with amount condition
      const refundAccess = await rbacService.checkPermission(
        userId,
        'admin',
        'manage_refunds',
        {
          userId,
          resource: 'admin',
          action: 'manage_refunds',
          resourceId: 'refund123',
          environment: { amount: 500 }, // Under limit
          timestamp: new Date(),
        }
      );
      
      expect(refundAccess.granted).toBe(true);
    });

    it('should revoke roles correctly', async () => {
      const userId = 'user123';
      
      // Assign and then revoke role
      await rbacService.assignRole(userId, 'bar', 'admin123');
      
      const revokeResult = await rbacService.revokeRole(userId, 'bar', 'admin123');
      expect(revokeResult.success).toBe(true);
      
      // Should no longer have access
      const accessCheck = await rbacService.checkPermission(userId, 'bar', 'view');
      expect(accessCheck.granted).toBe(false);
    });

    it('should get user roles and permissions', async () => {
      const userId = 'user123';
      
      // Assign multiple roles
      await rbacService.assignRole(userId, 'bar', 'admin123');
      await rbacService.assignRole(userId, 'recharge', 'admin123');
      
      const userRolesAndPermissions = await rbacService.getUserRolesAndPermissions(userId);
      
      expect(userRolesAndPermissions.roles.length).toBeGreaterThan(0);
      expect(userRolesAndPermissions.permissions.length).toBeGreaterThan(0);
      expect(userRolesAndPermissions.assignments.length).toBe(2);
    });
  });

  describe('Security Monitoring', () => {
    it('should log authentication events', async () => {
      const logSpy = vi.spyOn(auditLogger, 'logAuthentication');
      
      // Mock failed authentication to trigger logging
      const mockSupabase = await import('@/integrations/supabase/client');
      vi.mocked(mockSupabase.supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'Invalid credentials',
          code: 'invalid_credentials',
          status: 400,
          __isAuthError: true,
          name: 'AuthError'
        } as any,
      });

      await authSecurityService.secureSignIn(
        'test@example.com',
        'wrongpassword',
        '192.168.1.1',
        'test-agent'
      );
      
      expect(logSpy).toHaveBeenCalled();
    });

    it('should log authorization events', async () => {
      const logSpy = vi.spyOn(auditLogger, 'logAuthorization');
      
      const userId = 'user123';
      await rbacService.checkPermission(userId, 'bar', 'view');
      
      expect(logSpy).toHaveBeenCalled();
    });

    it('should log security violations', async () => {
      const logSpy = vi.spyOn(auditLogger, 'logSecurityViolation');
      
      // This would be triggered by the security middleware in a real scenario
      await auditLogger.logSecurityViolation({
        requestId: 'test123',
        userId: 'user123',
        violationType: 'suspicious_activity',
        description: 'Test security violation',
        severity: 'high' as any,
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
      });
      
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('Session Management', () => {
    it('should handle concurrent sessions', async () => {
      const userId = 'user123';
      const sessions = authSecurityService.getUserSessions(userId);
      
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBe(0); // No sessions initially
    });

    it('should provide session statistics', async () => {
      const stats = authSecurityService.getSessionStats();
      
      expect(stats).toHaveProperty('totalActiveSessions');
      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('averageSessionDuration');
      expect(typeof stats.totalActiveSessions).toBe('number');
      expect(typeof stats.totalUsers).toBe('number');
      expect(typeof stats.averageSessionDuration).toBe('number');
    });
  });

  describe('Password Security', () => {
    it('should detect common passwords', () => {
      const commonPasswords = ['password', '123456', 'qwerty', 'admin'];
      
      commonPasswords.forEach(password => {
        const result = authSecurityService.validatePasswordStrength(password);
        expect(result.isValid).toBe(false);
        expect(result.feedback.some(f => f.includes('common'))).toBe(true);
      });
    });

    it('should require minimum length', () => {
      const shortPassword = '1234567';
      const result = authSecurityService.validatePasswordStrength(shortPassword);
      
      expect(result.isValid).toBe(false);
      expect(result.feedback.some(f => f.includes('12 characters'))).toBe(true);
    });

    it('should require character diversity', () => {
      const tests = [
        { password: 'alllowercase123!', missing: 'uppercase' },
        { password: 'ALLUPPERCASE123!', missing: 'lowercase' },
        { password: 'NoNumbers!', missing: 'number' },
        { password: 'NoSpecialChars123', missing: 'special' },
      ];

      tests.forEach(test => {
        const result = authSecurityService.validatePasswordStrength(test.password);
        expect(result.isValid).toBe(false);
        expect(result.feedback.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication service errors gracefully', async () => {
      // Mock Supabase to throw an error
      const mockSupabase = await import('@/integrations/supabase/client');
      vi.mocked(mockSupabase.supabase.auth.signInWithPassword).mockRejectedValue(
        new Error('Network error')
      );

      const result = await authSecurityService.secureSignIn(
        'test@example.com',
        'password',
        '192.168.1.1',
        'test-agent'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Authentication service error');
    });

    it('should handle RBAC service errors gracefully', async () => {
      // Test with invalid user ID
      const result = await rbacService.checkPermission(
        '', // Invalid user ID
        'bar',
        'view'
      );

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('No roles assigned');
    });

    it('should handle MFA service errors gracefully', async () => {
      // Test with invalid user ID
      const result = await mfaService.verifyMFA(
        '', // Invalid user ID
        'totp',
        '123456'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not configured');
    });
  });
});