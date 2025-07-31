import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnvironmentVariables, getEnvironmentConfig, getEnvVar } from '../../src/lib/env-validation';

/**
 * Environment Validation Security Tests
 * 
 * These tests verify that environment variable validation is working correctly
 * and that security configurations are properly enforced.
 */

describe('Environment Validation Security Tests', () => {
  // Store original environment variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all mocks and reset environment
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe('Required Environment Variables', () => {
    it('should validate that required environment variables are present', () => {
      // Set required environment variables
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'https://test-project.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
            VITE_ENVIRONMENT: 'test'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.isValid).toBe(true);
      expect(result.missingRequired).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation when required environment variables are missing', () => {
      // Set empty environment
      vi.stubGlobal('import', {
        meta: {
          env: {}
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.isValid).toBe(false);
      expect(result.missingRequired).toContain('VITE_SUPABASE_URL');
      expect(result.missingRequired).toContain('VITE_SUPABASE_ANON_KEY');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate Supabase URL format', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'invalid-url',
            VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.isValid).toBe(false);
      expect(result.invalidValues).toContain('VITE_SUPABASE_URL');
    });

    it('should validate Supabase anon key format', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'https://test-project.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'invalid-key'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.isValid).toBe(false);
      expect(result.invalidValues).toContain('VITE_SUPABASE_ANON_KEY');
    });
  });

  describe('Security Pattern Detection', () => {
    it('should detect placeholder values in environment variables', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'https://your_project_here.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'your_anon_key_here'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.securityIssues.length).toBeGreaterThan(0);
      expect(result.securityIssues.some(issue => 
        issue.includes('placeholder value')
      )).toBe(true);
    });

    it('should detect localhost URLs in production environment', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'http://localhost:54321',
            VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
            VITE_ENVIRONMENT: 'production'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.securityIssues.some(issue => 
        issue.includes('localhost') && issue.includes('production')
      )).toBe(true);
    });

    it('should detect debug mode enabled in production', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'https://test-project.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
            VITE_ENVIRONMENT: 'production',
            VITE_ENABLE_DEBUG: 'true'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.securityIssues.some(issue => 
        issue.includes('Debug mode') && issue.includes('production')
      )).toBe(true);
    });
  });

  describe('Environment Configuration', () => {
    it('should correctly identify production environment', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_ENVIRONMENT: 'production',
            PROD: true
          }
        }
      });

      const config = getEnvironmentConfig();
      
      expect(config.isProduction).toBe(true);
      expect(config.isDevelopment).toBe(false);
      expect(config.environment).toBe('production');
    });

    it('should correctly identify development environment', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_ENVIRONMENT: 'development',
            DEV: true
          }
        }
      });

      const config = getEnvironmentConfig();
      
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
      expect(config.environment).toBe('development');
    });

    it('should correctly identify staging environment', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_ENVIRONMENT: 'staging'
          }
        }
      });

      const config = getEnvironmentConfig();
      
      expect(config.isStaging).toBe(true);
      expect(config.isProduction).toBe(false);
      expect(config.isDevelopment).toBe(false);
      expect(config.environment).toBe('staging');
    });
  });

  describe('Environment Variable Getters', () => {
    it('should get environment variable with default value', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_TEST_VAR: 'test-value'
          }
        }
      });

      const value = getEnvVar('VITE_TEST_VAR', 'default-value');
      expect(value).toBe('test-value');
    });

    it('should return default value when environment variable is not set', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {}
        }
      });

      const value = getEnvVar('VITE_MISSING_VAR', 'default-value');
      expect(value).toBe('default-value');
    });

    it('should throw error for required environment variable that is missing', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {}
        }
      });

      expect(() => {
        getEnvVar('VITE_SUPABASE_URL');
      }).toThrow('Required environment variable VITE_SUPABASE_URL is not set');
    });

    it('should validate environment variable value', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'invalid-url'
          }
        }
      });

      expect(() => {
        getEnvVar('VITE_SUPABASE_URL');
      }).toThrow('Invalid value for environment variable VITE_SUPABASE_URL');
    });
  });

  describe('Production Security Checks', () => {
    it('should enforce strict CSP in production', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_ENVIRONMENT: 'production',
            VITE_ENABLE_STRICT_CSP: 'false'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.warnings.some(warning => 
        warning.includes('Strict CSP') && warning.includes('production')
      )).toBe(true);
    });

    it('should enforce HSTS in production', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_ENVIRONMENT: 'production',
            VITE_ENABLE_HSTS: 'false'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.warnings.some(warning => 
        warning.includes('HSTS') && warning.includes('production')
      )).toBe(true);
    });

    it('should warn about debug log level in production', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_ENVIRONMENT: 'production',
            VITE_LOG_LEVEL: 'debug'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.warnings.some(warning => 
        warning.includes('Log level') && warning.includes('debug') && warning.includes('production')
      )).toBe(true);
    });
  });

  describe('Security Level Validation', () => {
    it('should properly categorize environment variables by security level', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'https://test-project.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
            VITE_APP_NAME: 'Test App',
            VITE_ENABLE_DEBUG: 'false'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      // Should validate without critical security issues
      expect(result.isValid).toBe(true);
      
      // Should not have security issues for properly configured variables
      const secretIssues = result.securityIssues.filter(issue => 
        issue.includes('VITE_SUPABASE_ANON_KEY')
      );
      expect(secretIssues).toEqual([]);
    });

    it('should detect weak values in security-critical variables', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'https://test-project.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'weak', // Too short and weak
            VITE_ENCRYPTION_KEY: '123456' // Weak encryption key
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      expect(result.securityIssues.some(issue => 
        issue.includes('weak') || issue.includes('insecure')
      )).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error messages for validation failures', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'invalid-url'
          }
        }
      });

      expect(() => {
        validateEnvironmentVariables();
      }).not.toThrow(); // Should not throw, but should return validation errors

      const result = validateEnvironmentVariables();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => 
        error.includes('VITE_SUPABASE_URL')
      )).toBe(true);
    });

    it('should handle missing environment gracefully', () => {
      vi.stubGlobal('import', {
        meta: {
          env: undefined
        }
      });

      expect(() => {
        validateEnvironmentVariables();
      }).not.toThrow();
    });
  });

  describe('Integration with Security Verification', () => {
    it('should integrate with security verification scripts', () => {
      // This test ensures that the environment validation can be called
      // from security verification scripts without issues
      
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'https://test-project.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
            VITE_ENVIRONMENT: 'test'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      // Should return a structured result that scripts can process
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('securityIssues');
      expect(result).toHaveProperty('missingRequired');
      expect(result).toHaveProperty('invalidValues');
    });

    it('should provide actionable recommendations', () => {
      vi.stubGlobal('import', {
        meta: {
          env: {
            VITE_SUPABASE_URL: 'http://localhost:54321',
            VITE_SUPABASE_ANON_KEY: 'your_key_here',
            VITE_ENVIRONMENT: 'production',
            VITE_ENABLE_DEBUG: 'true'
          }
        }
      });

      const result = validateEnvironmentVariables();
      
      // Should have multiple security issues that provide clear guidance
      expect(result.securityIssues.length).toBeGreaterThan(0);
      expect(result.securityIssues.every(issue => 
        typeof issue === 'string' && issue.length > 0
      )).toBe(true);
    });
  });
});