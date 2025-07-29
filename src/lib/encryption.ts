/**
 * Data Encryption and Protection System for Financial Data
 * 
 * Comprehensive encryption system designed for protecting sensitive financial
 * data both at rest and in transit, with key management, data masking,
 * and secure storage capabilities.
 * 
 * Features:
 * - AES-256-GCM encryption for data at rest
 * - Field-level encryption for sensitive data
 * - Key rotation and management
 * - Data masking for logs and non-production environments
 * - Secure key derivation and storage
 * - Encryption metadata tracking
 * - Performance-optimized encryption/decryption
 * - Compliance with financial data protection standards
 */

import { SecurityConfig } from '../config/security';
import { auditLogger, AuditResult } from './audit-logger';
import crypto from 'crypto';

// Encryption interfaces
export interface EncryptionResult {
  success: boolean;
  encryptedData?: string;
  metadata?: EncryptionMetadata;
  error?: string;
}

export interface DecryptionResult {
  success: boolean;
  decryptedData?: any;
  error?: string;
}

export interface EncryptionMetadata {
  algorithm: string;
  keyId: string;
  iv: string;
  authTag: string;
  timestamp: string;
  version: number;
}

export interface EncryptionKey {
  id: string;
  key: Buffer;
  algorithm: string;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  purpose: 'data' | 'key' | 'backup';
}

// Key management interface
interface KeyManager {
  generateKey(purpose: 'data' | 'key' | 'backup'): Promise<EncryptionKey>;
  getActiveKey(purpose: 'data' | 'key' | 'backup'): Promise<EncryptionKey | null>;
  getKey(keyId: string): Promise<EncryptionKey | null>;
  rotateKeys(): Promise<void>;
  deactivateKey(keyId: string): Promise<void>;
}

/**
 * Simple in-memory key manager (replace with secure key management service in production)
 */
class InMemoryKeyManager implements KeyManager {
  private keys: Map<string, EncryptionKey> = new Map();
  private activeKeys: Map<string, string> = new Map(); // purpose -> keyId

  async generateKey(purpose: 'data' | 'key' | 'backup'): Promise<EncryptionKey> {
    const keyId = `key_${purpose}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const key = crypto.randomBytes(32); // 256-bit key
    const algorithm = SecurityConfig.encryption.dataAtRest.algorithm;
    
    const encryptionKey: EncryptionKey = {
      id: keyId,
      key,
      algorithm,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SecurityConfig.encryption.dataAtRest.keyRotationDays * 24 * 60 * 60 * 1000),
      isActive: true,
      purpose,
    };

    this.keys.set(keyId, encryptionKey);
    this.activeKeys.set(purpose, keyId);

    return encryptionKey;
  }

  async getActiveKey(purpose: 'data' | 'key' | 'backup'): Promise<EncryptionKey | null> {
    const keyId = this.activeKeys.get(purpose);
    if (!keyId) return null;
    
    const key = this.keys.get(keyId);
    if (!key || !key.isActive) return null;
    
    // Check if key is expired
    if (key.expiresAt && key.expiresAt < new Date()) {
      key.isActive = false;
      return null;
    }
    
    return key;
  }

  async getKey(keyId: string): Promise<EncryptionKey | null> {
    return this.keys.get(keyId) || null;
  }

  async rotateKeys(): Promise<void> {
    // Generate new keys for all purposes
    for (const purpose of ['data', 'key', 'backup'] as const) {
      const oldKeyId = this.activeKeys.get(purpose);
      if (oldKeyId) {
        const oldKey = this.keys.get(oldKeyId);
        if (oldKey) {
          oldKey.isActive = false;
        }
      }
      
      await this.generateKey(purpose);
    }
  }

  async deactivateKey(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.isActive = false;
    }
  }
}

/**
 * Data Encryption Service
 */
export class DataEncryptionService {
  private keyManager: KeyManager;
  private requestId: string;

  constructor(keyManager?: KeyManager, requestId?: string) {
    this.keyManager = keyManager || new InMemoryKeyManager();
    this.requestId = requestId || crypto.randomUUID();
    
    // Initialize with default keys if none exist
    this.initializeKeys().catch(console.error);
  }

  /**
   * Encrypt sensitive data
   */
  async encryptData(data: any, fieldName?: string): Promise<EncryptionResult> {
    try {
      const startTime = Date.now();
      
      // Get active encryption key
      const encryptionKey = await this.keyManager.getActiveKey('data');
      if (!encryptionKey) {
        throw new Error('No active encryption key available');
      }

      // Convert data to string if needed
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      
      // Generate random IV
      const iv = crypto.randomBytes(12); // 96-bit IV for GCM
      
      // Create cipher
      const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey.key, iv);
      
      // Encrypt data
      let encrypted = cipher.update(dataString, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      // Create metadata
      const metadata: EncryptionMetadata = {
        algorithm: encryptionKey.algorithm,
        keyId: encryptionKey.id,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        timestamp: new Date().toISOString(),
        version: 1,
      };

      // Log encryption event
      await auditLogger.logDataAccess({
        requestId: this.requestId,
        userId: 'system',
        action: 'encrypt_data',
        resource: 'encryption_service',
        dataType: 'refund_data',
        result: AuditResult.SUCCESS,
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        encryptedData: encrypted,
        metadata,
      };

    } catch (error) {
      await auditLogger.logError({
        requestId: this.requestId,
        action: 'encrypt_data',
        resource: 'encryption_service',
        error,
        metadata: { fieldName },
      });

      return {
        success: false,
        error: 'Encryption failed',
      };
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decryptData(encryptedData: string, metadata: EncryptionMetadata): Promise<DecryptionResult> {
    try {
      const startTime = Date.now();
      
      // Get decryption key
      const decryptionKey = await this.keyManager.getKey(metadata.keyId);
      if (!decryptionKey) {
        throw new Error('Decryption key not found');
      }

      // Parse metadata
      const iv = Buffer.from(metadata.iv, 'base64');
      const authTag = Buffer.from(metadata.authTag, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipheriv('aes-256-gcm', decryptionKey.key, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt data
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Try to parse as JSON, fallback to string
      let decryptedData: any;
      try {
        decryptedData = JSON.parse(decrypted);
      } catch {
        decryptedData = decrypted;
      }

      // Log decryption event
      await auditLogger.logDataAccess({
        requestId: this.requestId,
        userId: 'system',
        action: 'decrypt_data',
        resource: 'encryption_service',
        dataType: 'refund_data',
        result: AuditResult.SUCCESS,
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        decryptedData,
      };

    } catch (error) {
      await auditLogger.logError({
        requestId: this.requestId,
        action: 'decrypt_data',
        resource: 'encryption_service',
        error,
      });

      return {
        success: false,
        error: 'Decryption failed',
      };
    }
  }

  /**
   * Encrypt multiple fields in an object
   */
  async encryptFields(data: any, fieldsToEncrypt: string[]): Promise<{
    success: boolean;
    encryptedData?: any;
    encryptionMetadata?: Record<string, EncryptionMetadata>;
    error?: string;
  }> {
    try {
      const encryptedData = { ...data };
      const encryptionMetadata: Record<string, EncryptionMetadata> = {};

      for (const field of fieldsToEncrypt) {
        if (data[field] !== undefined && data[field] !== null) {
          const encryptionResult = await this.encryptData(data[field], field);
          
          if (!encryptionResult.success) {
            throw new Error(`Failed to encrypt field: ${field}`);
          }

          encryptedData[field] = encryptionResult.encryptedData;
          if (encryptionResult.metadata) {
            encryptionMetadata[field] = encryptionResult.metadata;
          }
        }
      }

      return {
        success: true,
        encryptedData,
        encryptionMetadata,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Decrypt multiple fields in an object
   */
  async decryptFields(
    encryptedData: any,
    encryptionMetadata: Record<string, EncryptionMetadata>,
    fieldsToDecrypt: string[]
  ): Promise<{
    success: boolean;
    decryptedData?: any;
    error?: string;
  }> {
    try {
      const decryptedData = { ...encryptedData };

      for (const field of fieldsToDecrypt) {
        if (encryptedData[field] !== undefined && encryptionMetadata[field]) {
          const decryptionResult = await this.decryptData(
            encryptedData[field],
            encryptionMetadata[field]
          );
          
          if (!decryptionResult.success) {
            throw new Error(`Failed to decrypt field: ${field}`);
          }

          decryptedData[field] = decryptionResult.decryptedData;
        }
      }

      return {
        success: true,
        decryptedData,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Initialize encryption keys
   */
  private async initializeKeys(): Promise<void> {
    try {
      // Check if we have active keys, if not generate them
      const dataKey = await this.keyManager.getActiveKey('data');
      if (!dataKey) {
        await this.keyManager.generateKey('data');
      }

      const keyKey = await this.keyManager.getActiveKey('key');
      if (!keyKey) {
        await this.keyManager.generateKey('key');
      }

      const backupKey = await this.keyManager.getActiveKey('backup');
      if (!backupKey) {
        await this.keyManager.generateKey('backup');
      }
    } catch (error) {
      console.error('Failed to initialize encryption keys:', error);
    }
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(): Promise<void> {
    await this.keyManager.rotateKeys();
    
    await auditLogger.logDataAccess({
      requestId: this.requestId,
      userId: 'system',
      action: 'rotate_encryption_keys',
      resource: 'encryption_service',
      dataType: 'refund_data',
      result: AuditResult.SUCCESS,
    });
  }
}

/**
 * Data Masking Service for Logs and Non-Production Environments
 */
export class DataMaskingService {
  /**
   * Mask sensitive data for logging
   */
  static maskForLogging(data: any, field: string): string {
    const maskingRules = SecurityConfig.encryption.maskingRules;
    
    if (!data || !data[field]) return '';
    
    const value = data[field];
    
    switch (field) {
      case 'account':
      case 'iban':
        return maskingRules.iban(value);
      case 'email':
        return maskingRules.email(value);
      case 'first_name':
      case 'last_name':
        return maskingRules.name(value);
      case 'amount_recharged':
      case 'card_balance':
        return maskingRules.amount(value);
      default:
        return '***';
    }
  }

  /**
   * Mask entire object for logging
   */
  static maskObjectForLogging(data: any): any {
    if (!data || typeof data !== 'object') return data;
    
    const masked = { ...data };
    const sensitiveFields = SecurityConfig.encryption.sensitiveFields;
    
    for (const field of sensitiveFields) {
      if (masked[field] !== undefined) {
        masked[field] = this.maskForLogging(data, field);
      }
    }
    
    return masked;
  }

  /**
   * Generate synthetic data for testing
   */
  static generateSyntheticData(originalData: any): any {
    const synthetic = { ...originalData };
    
    if (synthetic.first_name) {
      synthetic.first_name = 'Test';
    }
    if (synthetic.last_name) {
      synthetic.last_name = 'User';
    }
    if (synthetic.email) {
      synthetic.email = 'test@example.com';
    }
    if (synthetic.account) {
      synthetic.account = 'BE68539007547034'; // Test IBAN
    }
    if (synthetic.amount_recharged) {
      synthetic.amount_recharged = 10.00;
    }
    if (synthetic.card_balance) {
      synthetic.card_balance = 50.00;
    }
    
    return synthetic;
  }
}

/**
 * Secure Storage Service for Temporary Files
 */
export class SecureStorageService {
  private encryptionService: DataEncryptionService;
  private tempFiles: Map<string, { path: string; expiresAt: Date }> = new Map();

  constructor(encryptionService: DataEncryptionService) {
    this.encryptionService = encryptionService;
    
    // Clean up expired files every hour
    setInterval(() => this.cleanupExpiredFiles(), 60 * 60 * 1000);
  }

  /**
   * Store data securely in temporary file
   */
  async storeTemporaryData(data: any, ttlMinutes: number = 60): Promise<{
    success: boolean;
    fileId?: string;
    error?: string;
  }> {
    try {
      const fileId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      
      // Encrypt data
      const encryptionResult = await this.encryptionService.encryptData(data);
      if (!encryptionResult.success) {
        throw new Error('Failed to encrypt temporary data');
      }
      
      // In production, store to secure temporary storage
      // For now, keep in memory with expiration
      this.tempFiles.set(fileId, {
        path: JSON.stringify({
          data: encryptionResult.encryptedData,
          metadata: encryptionResult.metadata,
        }),
        expiresAt,
      });
      
      return {
        success: true,
        fileId,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Retrieve and decrypt temporary data
   */
  async retrieveTemporaryData(fileId: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const fileInfo = this.tempFiles.get(fileId);
      if (!fileInfo) {
        throw new Error('Temporary file not found');
      }
      
      if (fileInfo.expiresAt < new Date()) {
        this.tempFiles.delete(fileId);
        throw new Error('Temporary file has expired');
      }
      
      const storedData = JSON.parse(fileInfo.path);
      const decryptionResult = await this.encryptionService.decryptData(
        storedData.data,
        storedData.metadata
      );
      
      if (!decryptionResult.success) {
        throw new Error('Failed to decrypt temporary data');
      }
      
      return {
        success: true,
        data: decryptionResult.decryptedData,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete temporary data
   */
  async deleteTemporaryData(fileId: string): Promise<void> {
    this.tempFiles.delete(fileId);
  }

  /**
   * Clean up expired files
   */
  private cleanupExpiredFiles(): void {
    const now = new Date();
    for (const [fileId, fileInfo] of this.tempFiles.entries()) {
      if (fileInfo.expiresAt < now) {
        this.tempFiles.delete(fileId);
      }
    }
  }
}

// Export singleton instances
export const dataEncryptionService = new DataEncryptionService();
export const secureStorageService = new SecureStorageService(dataEncryptionService);

// Export utility functions
export const EncryptionUtils = {
  /**
   * Generate secure random string
   */
  generateSecureRandom: (length: number = 32): string => {
    return crypto.randomBytes(length).toString('hex');
  },

  /**
   * Hash sensitive data for comparison
   */
  hashData: (data: string, salt?: string): string => {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512');
    return `${actualSalt}:${hash.toString('hex')}`;
  },

  /**
   * Verify hashed data
   */
  verifyHash: (data: string, hash: string): boolean => {
    const [salt, originalHash] = hash.split(':');
    const verifyHash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
    return originalHash === verifyHash.toString('hex');
  },

  /**
   * Generate encryption key from password
   */
  deriveKeyFromPassword: (password: string, salt: string): Buffer => {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  },
};