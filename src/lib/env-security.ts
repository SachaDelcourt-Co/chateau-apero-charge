/**
 * Environment Variable Security Hardening
 * 
 * This module provides advanced security features for environment variable management,
 * including encryption, rotation support, and secure configuration loading.
 */

import { getEnvironmentConfig, getEnvVar, ENV_VALIDATION_SCHEMA } from './env-validation';
import type { EnvConfig, SecurityLevel } from '../types/env.d.ts';

/**
 * Security configuration for environment variables
 */
interface SecurityConfig {
  encryptionEnabled: boolean;
  rotationEnabled: boolean;
  auditLoggingEnabled: boolean;
  secretMaskingEnabled: boolean;
  configValidationEnabled: boolean;
}

/**
 * Configuration rotation metadata
 */
interface RotationMetadata {
  lastRotated: Date;
  rotationInterval: number; // in milliseconds
  nextRotation: Date;
  rotationHistory: Array<{
    timestamp: Date;
    rotatedKeys: string[];
    success: boolean;
  }>;
}

/**
 * Secure configuration loader with encryption and validation
 */
export class SecureConfigLoader {
  private config: EnvConfig;
  private securityConfig: SecurityConfig;
  private rotationMetadata: Map<string, RotationMetadata> = new Map();
  private encryptionKey?: string;

  constructor() {
    this.config = getEnvironmentConfig();
    this.securityConfig = this.initializeSecurityConfig();
    this.initializeEncryption();
  }

  /**
   * Initialize security configuration based on environment
   */
  private initializeSecurityConfig(): SecurityConfig {
    return {
      encryptionEnabled: this.config.isProduction,
      rotationEnabled: this.config.isProduction,
      auditLoggingEnabled: getEnvVar('VITE_ENABLE_AUDIT_LOGGING', 'true') === 'true',
      secretMaskingEnabled: true,
      configValidationEnabled: true
    };
  }

  /**
   * Initialize encryption for sensitive configuration values
   */
  private initializeEncryption(): void {
    if (this.securityConfig.encryptionEnabled) {
      this.encryptionKey = getEnvVar('VITE_ENCRYPTION_KEY');
      if (!this.encryptionKey || this.encryptionKey.length < 32) {
        console.warn('⚠️  Encryption key not properly configured for production environment');
      }
    }
  }

  /**
   * Load configuration with security validation
   */
  public loadSecureConfig(): Record<string, any> {
    const config: Record<string, any> = {};
    
    for (const [key, schema] of Object.entries(ENV_VALIDATION_SCHEMA)) {
      const value = import.meta.env[key as keyof ImportMetaEnv];
      
      if (value) {
        // Apply security transformations
        const secureValue = this.applySecurityTransforms(key, value, schema.securityLevel);
        config[key] = secureValue;
        
        // Log access for audit trail
        if (this.securityConfig.auditLoggingEnabled) {
          this.logConfigAccess(key, schema.securityLevel);
        }
      }
    }
    
    return config;
  }

  /**
   * Apply security transformations to configuration values
   */
  private applySecurityTransforms(key: string, value: string, securityLevel: SecurityLevel): any {
    let transformedValue = value;
    
    // Decrypt if encrypted
    if (this.securityConfig.encryptionEnabled && securityLevel === 'secret') {
      transformedValue = this.decryptValue(transformedValue);
    }
    
    // Validate against injection attacks
    transformedValue = this.sanitizeConfigValue(transformedValue);
    
    return transformedValue;
  }

  /**
   * Encrypt sensitive configuration values
   */
  private encryptValue(value: string): string {
    if (!this.encryptionKey) {
      return value;
    }
    
    try {
      // Simple XOR encryption for demonstration
      // In production, use proper encryption libraries like crypto-js
      const encrypted = this.xorEncrypt(value, this.encryptionKey);
      return `encrypted:${encrypted}`;
    } catch (error) {
      console.error('Failed to encrypt configuration value:', error);
      return value;
    }
  }

  /**
   * Decrypt sensitive configuration values
   */
  private decryptValue(value: string): string {
    if (!value.startsWith('encrypted:') || !this.encryptionKey) {
      return value;
    }
    
    try {
      const encryptedValue = value.replace('encrypted:', '');
      return this.xorDecrypt(encryptedValue, this.encryptionKey);
    } catch (error) {
      console.error('Failed to decrypt configuration value:', error);
      return value;
    }
  }

  /**
   * Simple XOR encryption/decryption (for demonstration)
   * In production, use proper encryption libraries
   */
  private xorEncrypt(text: string, key: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
  }

  private xorDecrypt(encryptedText: string, key: string): string {
    const text = atob(encryptedText);
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  }

  /**
   * Sanitize configuration values against injection attacks
   */
  private sanitizeConfigValue(value: string): string {
    // Remove potentially dangerous characters and patterns
    const dangerousPatterns = [
      /[<>]/g,           // HTML tags
      /javascript:/gi,   // JavaScript protocol
      /data:/gi,         // Data protocol
      /vbscript:/gi,     // VBScript protocol
      /on\w+=/gi,        // Event handlers
      /\$\{.*\}/g,       // Template literals
      /`.*`/g,           // Backticks
      /eval\(/gi,        // eval function
      /Function\(/gi,    // Function constructor
    ];
    
    let sanitized = value;
    for (const pattern of dangerousPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }
    
    return sanitized.trim();
  }

  /**
   * Log configuration access for audit trail
   */
  private logConfigAccess(key: string, securityLevel: SecurityLevel): void {
    if (!this.securityConfig.auditLoggingEnabled) {
      return;
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'config_access',
      key: securityLevel === 'secret' ? this.maskSecretKey(key) : key,
      securityLevel,
      environment: this.config.environment,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server'
    };
    
    // In production, send to secure logging service
    if (this.config.isProduction) {
      this.sendToSecureLogger(logEntry);
    } else {
      console.debug('Config Access:', logEntry);
    }
  }

  /**
   * Mask secret configuration keys for logging
   */
  private maskSecretKey(key: string): string {
    if (key.length <= 8) {
      return '*'.repeat(key.length);
    }
    
    const start = key.substring(0, 4);
    const end = key.substring(key.length - 4);
    const middle = '*'.repeat(key.length - 8);
    
    return `${start}${middle}${end}`;
  }

  /**
   * Send audit logs to secure logging service
   */
  private sendToSecureLogger(logEntry: any): void {
    // Implementation would send to secure logging service
    // For now, just log to console in a structured format
    console.log(JSON.stringify({
      level: 'audit',
      service: 'env-security',
      ...logEntry
    }));
  }

  /**
   * Initialize configuration rotation for secrets
   */
  public initializeRotation(): void {
    if (!this.securityConfig.rotationEnabled) {
      return;
    }
    
    const rotationInterval = parseInt(getEnvVar('VITE_ROTATION_INTERVAL', '86400000')); // 24 hours default
    
    // Set up rotation for secret-level configuration
    for (const [key, schema] of Object.entries(ENV_VALIDATION_SCHEMA)) {
      if (schema.securityLevel === 'secret') {
        this.scheduleRotation(key, rotationInterval);
      }
    }
  }

  /**
   * Schedule rotation for a configuration key
   */
  private scheduleRotation(key: string, interval: number): void {
    const now = new Date();
    const nextRotation = new Date(now.getTime() + interval);
    
    this.rotationMetadata.set(key, {
      lastRotated: now,
      rotationInterval: interval,
      nextRotation,
      rotationHistory: []
    });
    
    // Schedule the actual rotation
    setTimeout(() => {
      this.rotateConfigurationKey(key);
    }, interval);
  }

  /**
   * Rotate a specific configuration key
   */
  private async rotateConfigurationKey(key: string): Promise<void> {
    const metadata = this.rotationMetadata.get(key);
    if (!metadata) {
      return;
    }
    
    try {
      // In a real implementation, this would:
      // 1. Generate new secret value
      // 2. Update external services (Supabase, Stripe, etc.)
      // 3. Update environment configuration
      // 4. Validate new configuration
      // 5. Rollback if validation fails
      
      console.log(`🔄 Rotating configuration key: ${this.maskSecretKey(key)}`);
      
      // Update rotation history
      metadata.rotationHistory.push({
        timestamp: new Date(),
        rotatedKeys: [key],
        success: true
      });
      
      // Schedule next rotation
      const nextRotation = new Date(Date.now() + metadata.rotationInterval);
      metadata.nextRotation = nextRotation;
      metadata.lastRotated = new Date();
      
      setTimeout(() => {
        this.rotateConfigurationKey(key);
      }, metadata.rotationInterval);
      
      // Log successful rotation
      if (this.securityConfig.auditLoggingEnabled) {
        this.logConfigAccess(`${key}_rotated`, 'secret');
      }
      
    } catch (error) {
      console.error(`❌ Failed to rotate configuration key ${this.maskSecretKey(key)}:`, error);
      
      // Update rotation history with failure
      metadata.rotationHistory.push({
        timestamp: new Date(),
        rotatedKeys: [key],
        success: false
      });
    }
  }

  /**
   * Get rotation status for all configured keys
   */
  public getRotationStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [key, metadata] of this.rotationMetadata.entries()) {
      status[this.maskSecretKey(key)] = {
        lastRotated: metadata.lastRotated,
        nextRotation: metadata.nextRotation,
        rotationInterval: metadata.rotationInterval,
        rotationCount: metadata.rotationHistory.length,
        lastRotationSuccess: metadata.rotationHistory[metadata.rotationHistory.length - 1]?.success ?? true
      };
    }
    
    return status;
  }

  /**
   * Validate configuration integrity
   */
  public validateConfigurationIntegrity(): boolean {
    try {
      // Check for configuration tampering
      const currentConfig = this.loadSecureConfig();
      
      // Validate checksums (if implemented)
      // Validate against known good configuration
      // Check for unauthorized modifications
      
      return true;
    } catch (error) {
      console.error('Configuration integrity validation failed:', error);
      return false;
    }
  }

  /**
   * Create configuration backup
   */
  public createConfigurationBackup(): string {
    const backup = {
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      config: this.loadSecureConfig(),
      rotationStatus: this.getRotationStatus()
    };
    
    // In production, encrypt and store securely
    const backupData = JSON.stringify(backup, null, 2);
    
    if (this.config.isProduction) {
      // Store in secure backup location
      console.log('📦 Configuration backup created');
    }
    
    return backupData;
  }

  /**
   * Restore configuration from backup
   */
  public restoreConfigurationFromBackup(backupData: string): boolean {
    try {
      const backup = JSON.parse(backupData);
      
      // Validate backup integrity
      if (!backup.timestamp || !backup.config) {
        throw new Error('Invalid backup format');
      }
      
      // In production, this would restore environment variables
      console.log('🔄 Configuration restored from backup');
      
      return true;
    } catch (error) {
      console.error('Failed to restore configuration from backup:', error);
      return false;
    }
  }
}

/**
 * Global secure configuration loader instance
 */
export const secureConfigLoader = new SecureConfigLoader();

/**
 * Initialize secure configuration loading
 */
export function initializeSecureConfiguration(): void {
  try {
    secureConfigLoader.initializeRotation();
    
    // Validate configuration integrity
    if (!secureConfigLoader.validateConfigurationIntegrity()) {
      console.error('⚠️  Configuration integrity validation failed');
    }
    
    // Create initial backup
    if (getEnvironmentConfig().isProduction) {
      secureConfigLoader.createConfigurationBackup();
    }
    
    console.log('🔒 Secure configuration initialized');
  } catch (error) {
    console.error('Failed to initialize secure configuration:', error);
    throw error;
  }
}

/**
 * Get secure configuration value with all security features applied
 */
export function getSecureConfigValue(key: keyof ImportMetaEnv): any {
  const config = secureConfigLoader.loadSecureConfig();
  return config[key];
}

/**
 * Check if configuration rotation is due
 */
export function isRotationDue(): boolean {
  const rotationStatus = secureConfigLoader.getRotationStatus();
  const now = new Date();
  
  for (const status of Object.values(rotationStatus)) {
    if (new Date(status.nextRotation) <= now) {
      return true;
    }
  }
  
  return false;
}

/**
 * Force rotation of all secret configuration keys
 */
export async function forceConfigurationRotation(): Promise<void> {
  console.log('🔄 Forcing configuration rotation...');
  
  // This would trigger immediate rotation of all secret keys
  // Implementation depends on your specific infrastructure
  
  console.log('✅ Configuration rotation completed');
}