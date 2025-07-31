/**
 * Multi-Factor Authentication (MFA) Service
 * 
 * Provides comprehensive MFA functionality including:
 * - TOTP (Time-based One-Time Password) support
 * - SMS-based verification
 * - Email-based verification
 * - Backup codes generation and validation
 * - MFA enrollment and management
 * - Recovery mechanisms
 */

import { supabase } from "@/integrations/supabase/client";
import { auditLogger, AuditResult } from './audit-logger';
import { SecurityConfig } from '../config/security';

// MFA method types
export type MFAMethod = 'totp' | 'sms' | 'email' | 'backup_codes';

// MFA configuration interface
export interface MFAConfig {
  userId: string;
  method: MFAMethod;
  isEnabled: boolean;
  secret?: string; // For TOTP
  phoneNumber?: string; // For SMS
  email?: string; // For email
  backupCodes?: string[]; // Backup codes
  createdAt: Date;
  lastUsed?: Date;
  failedAttempts: number;
}

// MFA verification result
export interface MFAVerificationResult {
  success: boolean;
  method: MFAMethod;
  message: string;
  remainingAttempts?: number;
  backupCodesRemaining?: number;
}

// MFA enrollment result
export interface MFAEnrollmentResult {
  success: boolean;
  method: MFAMethod;
  secret?: string; // For TOTP setup
  qrCodeUrl?: string; // For TOTP QR code
  backupCodes?: string[]; // Generated backup codes
  message: string;
}

/**
 * Multi-Factor Authentication Service
 */
export class MFAService {
  private static instance: MFAService;
  private userMFAConfigs = new Map<string, MFAConfig[]>();

  private constructor() {}

  public static getInstance(): MFAService {
    if (!MFAService.instance) {
      MFAService.instance = new MFAService();
    }
    return MFAService.instance;
  }

  /**
   * Check if MFA is required for user
   */
  async isMFARequired(userId: string): Promise<boolean> {
    try {
      const configs = await this.getUserMFAConfigs(userId);
      return configs.some(config => config.isEnabled);
    } catch (error) {
      console.error('Error checking MFA requirement:', error);
      return false;
    }
  }

  /**
   * Get user's MFA configurations
   */
  async getUserMFAConfigs(userId: string): Promise<MFAConfig[]> {
    // In production, this would fetch from database
    // For now, return from memory or default empty array
    return this.userMFAConfigs.get(userId) || [];
  }

  /**
   * Enroll user in TOTP MFA
   */
  async enrollTOTP(userId: string): Promise<MFAEnrollmentResult> {
    const requestId = this.generateRequestId();
    
    try {
      // Generate TOTP secret
      const secret = this.generateTOTPSecret();
      
      // Generate QR code URL for easy setup
      const qrCodeUrl = this.generateTOTPQRCode(userId, secret);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      
      // Store MFA configuration (in production, save to database)
      const config: MFAConfig = {
        userId,
        method: 'totp',
        isEnabled: false, // Will be enabled after verification
        secret,
        backupCodes,
        createdAt: new Date(),
        failedAttempts: 0,
      };
      
      const userConfigs = this.userMFAConfigs.get(userId) || [];
      userConfigs.push(config);
      this.userMFAConfigs.set(userId, userConfigs);

      await auditLogger.logAuthentication({
        requestId,
        userId,
        action: 'login',
        result: AuditResult.SUCCESS,
        metadata: { method: 'totp' },
      });

      return {
        success: true,
        method: 'totp',
        secret,
        qrCodeUrl,
        backupCodes,
        message: 'TOTP enrollment initiated. Please verify with your authenticator app.',
      };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        userId,
        action: 'totp_enrollment',
        resource: 'mfa_service',
        error,
      });

      return {
        success: false,
        method: 'totp',
        message: 'Failed to enroll in TOTP MFA',
      };
    }
  }

  /**
   * Verify TOTP code and complete enrollment
   */
  async verifyTOTPEnrollment(
    userId: string, 
    code: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<MFAVerificationResult> {
    const requestId = this.generateRequestId();
    
    try {
      const configs = await this.getUserMFAConfigs(userId);
      const totpConfig = configs.find(c => c.method === 'totp' && !c.isEnabled);
      
      if (!totpConfig || !totpConfig.secret) {
        return {
          success: false,
          method: 'totp',
          message: 'No pending TOTP enrollment found',
        };
      }

      // Verify TOTP code
      const isValid = this.verifyTOTPCode(totpConfig.secret, code);
      
      if (!isValid) {
        totpConfig.failedAttempts++;
        
        await auditLogger.logAuthentication({
          requestId,
          userId,
          action: 'login',
          result: AuditResult.FAILURE,
          ipAddress,
          userAgent,
          metadata: { 
            method: 'totp',
            failedAttempts: totpConfig.failedAttempts 
          },
        });

        return {
          success: false,
          method: 'totp',
          message: 'Invalid TOTP code',
          remainingAttempts: Math.max(0, 3 - totpConfig.failedAttempts),
        };
      }

      // Enable TOTP MFA
      totpConfig.isEnabled = true;
      totpConfig.lastUsed = new Date();
      totpConfig.failedAttempts = 0;

      await auditLogger.logAuthentication({
        requestId,
        userId,
        action: 'login',
        result: AuditResult.SUCCESS,
        ipAddress,
        userAgent,
        metadata: { method: 'totp' },
      });

      return {
        success: true,
        method: 'totp',
        message: 'TOTP MFA successfully enabled',
        backupCodesRemaining: totpConfig.backupCodes?.length || 0,
      };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        userId,
        action: 'totp_verification',
        resource: 'mfa_service',
        error,
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        method: 'totp',
        message: 'TOTP verification failed',
      };
    }
  }

  /**
   * Verify MFA code during login
   */
  async verifyMFA(
    userId: string,
    method: MFAMethod,
    code: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<MFAVerificationResult> {
    const requestId = this.generateRequestId();
    
    try {
      const configs = await this.getUserMFAConfigs(userId);
      const config = configs.find(c => c.method === method && c.isEnabled);
      
      if (!config) {
        return {
          success: false,
          method,
          message: `${method.toUpperCase()} MFA not configured`,
        };
      }

      let isValid = false;

      switch (method) {
        case 'totp':
          isValid = config.secret ? this.verifyTOTPCode(config.secret, code) : false;
          break;
        case 'backup_codes':
          isValid = this.verifyBackupCode(config, code);
          break;
        case 'sms':
        case 'email':
          // These would integrate with external services
          isValid = await this.verifyExternalCode(method, config, code);
          break;
      }

      if (!isValid) {
        config.failedAttempts++;
        
        await auditLogger.logAuthentication({
          requestId,
          userId,
          action: 'login',
          result: AuditResult.FAILURE,
          ipAddress,
          userAgent,
          metadata: { 
            method,
            failedAttempts: config.failedAttempts 
          },
        });

        return {
          success: false,
          method,
          message: `Invalid ${method.toUpperCase()} code`,
          remainingAttempts: Math.max(0, 3 - config.failedAttempts),
        };
      }

      // Successful verification
      config.lastUsed = new Date();
      config.failedAttempts = 0;

      await auditLogger.logAuthentication({
        requestId,
        userId,
        action: 'login',
        result: AuditResult.SUCCESS,
        ipAddress,
        userAgent,
        metadata: { method },
      });

      return {
        success: true,
        method,
        message: 'MFA verification successful',
        backupCodesRemaining: method === 'backup_codes' 
          ? config.backupCodes?.length || 0 
          : undefined,
      };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        userId,
        action: 'mfa_verification',
        resource: 'mfa_service',
        error,
        ipAddress,
        userAgent,
      });

      return {
        success: false,
        method,
        message: 'MFA verification failed',
      };
    }
  }

  /**
   * Disable MFA for user
   */
  async disableMFA(
    userId: string,
    method: MFAMethod,
    verificationCode: string
  ): Promise<{ success: boolean; message: string }> {
    const requestId = this.generateRequestId();
    
    try {
      // Verify current MFA before disabling
      const verification = await this.verifyMFA(userId, method, verificationCode);
      
      if (!verification.success) {
        return {
          success: false,
          message: 'MFA verification required to disable',
        };
      }

      const configs = await this.getUserMFAConfigs(userId);
      const configIndex = configs.findIndex(c => c.method === method);
      
      if (configIndex === -1) {
        return {
          success: false,
          message: 'MFA method not found',
        };
      }

      // Remove the MFA configuration
      configs.splice(configIndex, 1);
      this.userMFAConfigs.set(userId, configs);

      await auditLogger.logAuthentication({
        requestId,
        userId,
        action: 'password_change',
        result: AuditResult.SUCCESS,
        metadata: { method },
      });

      return {
        success: true,
        message: `${method.toUpperCase()} MFA disabled successfully`,
      };

    } catch (error) {
      await auditLogger.logError({
        requestId,
        userId,
        action: 'mfa_disable',
        resource: 'mfa_service',
        error,
      });

      return {
        success: false,
        message: 'Failed to disable MFA',
      };
    }
  }

  /**
   * Generate new backup codes
   */
  async generateNewBackupCodes(userId: string): Promise<{
    success: boolean;
    backupCodes?: string[];
    message: string;
  }> {
    try {
      const configs = await this.getUserMFAConfigs(userId);
      const totpConfig = configs.find(c => c.method === 'totp' && c.isEnabled);
      
      if (!totpConfig) {
        return {
          success: false,
          message: 'TOTP MFA must be enabled to generate backup codes',
        };
      }

      const newBackupCodes = this.generateBackupCodes();
      totpConfig.backupCodes = newBackupCodes;

      await auditLogger.logAuthentication({
        requestId: this.generateRequestId(),
        userId,
        action: 'password_change',
        result: AuditResult.SUCCESS,
        metadata: { codesCount: newBackupCodes.length },
      });

      return {
        success: true,
        backupCodes: newBackupCodes,
        message: 'New backup codes generated successfully',
      };

    } catch (error) {
      return {
        success: false,
        message: 'Failed to generate backup codes',
      };
    }
  }

  /**
   * Generate TOTP secret
   */
  private generateTOTPSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  /**
   * Generate TOTP QR code URL
   */
  private generateTOTPQRCode(userId: string, secret: string): string {
    const issuer = 'Chateau Apero';
    const label = `${issuer}:${userId}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
  }

  /**
   * Verify TOTP code
   */
  private verifyTOTPCode(secret: string, code: string): boolean {
    // This is a simplified TOTP verification
    // In production, use a proper TOTP library like 'otplib'
    const timeStep = Math.floor(Date.now() / 30000);
    
    // Check current time step and previous/next for clock drift
    for (let i = -1; i <= 1; i++) {
      const expectedCode = this.generateTOTPCode(secret, timeStep + i);
      if (expectedCode === code) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Generate TOTP code for given time step
   */
  private generateTOTPCode(secret: string, timeStep: number): string {
    // Simplified TOTP generation - use proper crypto library in production
    const hash = this.simpleHash(secret + timeStep.toString());
    const code = (hash % 1000000).toString().padStart(6, '0');
    return code;
  }

  /**
   * Simple hash function (replace with proper HMAC-SHA1 in production)
   */
  private simpleHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Verify backup code
   */
  private verifyBackupCode(config: MFAConfig, code: string): boolean {
    if (!config.backupCodes) return false;
    
    const index = config.backupCodes.indexOf(code.toUpperCase());
    if (index !== -1) {
      // Remove used backup code
      config.backupCodes.splice(index, 1);
      return true;
    }
    
    return false;
  }

  /**
   * Verify external code (SMS/Email)
   */
  private async verifyExternalCode(
    method: 'sms' | 'email',
    config: MFAConfig,
    code: string
  ): Promise<boolean> {
    // This would integrate with SMS/Email service providers
    // For now, return a mock verification
    console.log(`Verifying ${method} code: ${code}`);
    return code === '123456'; // Mock verification
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `mfa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get MFA status for user
   */
  async getMFAStatus(userId: string): Promise<{
    isEnabled: boolean;
    methods: MFAMethod[];
    backupCodesRemaining: number;
  }> {
    const configs = await this.getUserMFAConfigs(userId);
    const enabledConfigs = configs.filter(c => c.isEnabled);
    
    const backupCodesRemaining = enabledConfigs
      .find(c => c.method === 'totp')?.backupCodes?.length || 0;

    return {
      isEnabled: enabledConfigs.length > 0,
      methods: enabledConfigs.map(c => c.method),
      backupCodesRemaining,
    };
  }
}

// Export singleton instance
export const mfaService = MFAService.getInstance();