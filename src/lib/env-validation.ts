/**
 * Advanced Environment Variable Validation System
 *
 * This module provides comprehensive validation, security checks, and management
 * for environment variables with enhanced security features.
 */

import type {
  EnvVarConfig,
  EnvValidationResult,
  EnvConfig,
  EnvironmentCategory,
  SecurityLevel
} from '../types/env.d.ts';

/**
 * Environment Variable Validation Schema
 * Defines validation rules, security levels, and requirements for each environment variable
 */
const ENV_VALIDATION_SCHEMA: Record<string, EnvVarConfig> = {
  // Core Supabase Configuration (REQUIRED)
  VITE_SUPABASE_URL: {
    key: 'VITE_SUPABASE_URL',
    required: true,
    category: 'core',
    securityLevel: 'internal',
    description: 'Supabase project URL',
    validator: (value: string) => {
      const urlPattern = /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/;
      return urlPattern.test(value) || value.startsWith('http://localhost');
    }
  },
  VITE_SUPABASE_ANON_KEY: {
    key: 'VITE_SUPABASE_ANON_KEY',
    required: true,
    category: 'core',
    securityLevel: 'secret',
    description: 'Supabase anonymous key (JWT token)',
    validator: (value: string) => {
      // JWT tokens start with 'eyJ' and have minimum length
      return value.startsWith('eyJ') && value.length > 100;
    }
  },

  // Environment Configuration
  NODE_ENV: {
    key: 'NODE_ENV',
    required: false,
    category: 'core',
    securityLevel: 'public',
    description: 'Node.js environment',
    defaultValue: 'development',
    validator: (value: string) => ['development', 'production', 'test'].includes(value)
  },
  VITE_ENVIRONMENT: {
    key: 'VITE_ENVIRONMENT',
    required: false,
    category: 'core',
    securityLevel: 'public',
    description: 'Application environment',
    defaultValue: 'development',
    validator: (value: string) => ['development', 'staging', 'production'].includes(value)
  },

  // Security Configuration
  VITE_ENABLE_DEBUG: {
    key: 'VITE_ENABLE_DEBUG',
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Enable debug mode',
    defaultValue: 'false',
    validator: (value: string) => ['true', 'false'].includes(value.toLowerCase())
  },
  VITE_API_BASE_URL: {
    key: 'VITE_API_BASE_URL',
    required: false,
    category: 'core',
    securityLevel: 'internal',
    description: 'Base URL for API requests',
    validator: (value: string) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }
  },
  VITE_ENABLE_STRICT_CSP: {
    key: 'VITE_ENABLE_STRICT_CSP',
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Enable strict Content Security Policy',
    defaultValue: 'true',
    validator: (value: string) => ['true', 'false'].includes(value.toLowerCase())
  },
  VITE_ENABLE_HSTS: {
    key: 'VITE_ENABLE_HSTS',
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Enable HTTP Strict Transport Security',
    defaultValue: 'true',
    validator: (value: string) => ['true', 'false'].includes(value.toLowerCase())
  },

  // Application Configuration
  VITE_APP_NAME: {
    key: 'VITE_APP_NAME',
    required: false,
    category: 'core',
    securityLevel: 'public',
    description: 'Application name',
    defaultValue: 'Château Apéro Refund System'
  },
  VITE_APP_VERSION: {
    key: 'VITE_APP_VERSION',
    required: false,
    category: 'core',
    securityLevel: 'public',
    description: 'Application version',
    defaultValue: '1.0.0',
    validator: (value: string) => /^\d+\.\d+\.\d+/.test(value)
  },

  // Rate Limiting Configuration
  VITE_MAX_REFUNDS_PER_BATCH: {
    key: 'VITE_MAX_REFUNDS_PER_BATCH',
    required: false,
    category: 'performance',
    securityLevel: 'internal',
    description: 'Maximum refunds per batch operation',
    defaultValue: '1000',
    validator: (value: string) => !isNaN(Number(value)) && Number(value) > 0
  },
  VITE_MAX_DAILY_REFUND_AMOUNT: {
    key: 'VITE_MAX_DAILY_REFUND_AMOUNT',
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Maximum daily refund amount',
    defaultValue: '100000',
    validator: (value: string) => !isNaN(Number(value)) && Number(value) > 0
  },

  // Monitoring and Logging
  VITE_ENABLE_AUDIT_LOGGING: {
    key: 'VITE_ENABLE_AUDIT_LOGGING',
    required: false,
    category: 'monitoring',
    securityLevel: 'internal',
    description: 'Enable audit logging',
    defaultValue: 'true',
    validator: (value: string) => ['true', 'false'].includes(value.toLowerCase())
  },
  VITE_LOG_LEVEL: {
    key: 'VITE_LOG_LEVEL',
    required: false,
    category: 'monitoring',
    securityLevel: 'internal',
    description: 'Logging level',
    defaultValue: 'info',
    validator: (value: string) => ['debug', 'info', 'warn', 'error'].includes(value.toLowerCase())
  },

  // Database Configuration
  VITE_DB_MAX_CONNECTIONS: {
    key: 'VITE_DB_MAX_CONNECTIONS',
    required: false,
    category: 'database',
    securityLevel: 'internal',
    description: 'Maximum database connections',
    defaultValue: '20',
    validator: (value: string) => !isNaN(Number(value)) && Number(value) > 0 && Number(value) <= 100
  },
  VITE_DB_CONNECTION_TIMEOUT: {
    key: 'VITE_DB_CONNECTION_TIMEOUT',
    required: false,
    category: 'database',
    securityLevel: 'internal',
    description: 'Database connection timeout (ms)',
    defaultValue: '30000',
    validator: (value: string) => !isNaN(Number(value)) && Number(value) > 0
  },

  // Session Configuration
  VITE_SESSION_TIMEOUT: {
    key: 'VITE_SESSION_TIMEOUT',
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Session timeout (ms)',
    defaultValue: '3600000',
    validator: (value: string) => !isNaN(Number(value)) && Number(value) > 0
  },
  VITE_SESSION_SECURE: {
    key: 'VITE_SESSION_SECURE',
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Secure session cookies',
    defaultValue: 'true',
    validator: (value: string) => ['true', 'false'].includes(value.toLowerCase())
  },
  VITE_SESSION_SAME_SITE: {
    key: 'VITE_SESSION_SAME_SITE',
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'SameSite cookie attribute',
    defaultValue: 'strict',
    validator: (value: string) => ['strict', 'lax', 'none'].includes(value.toLowerCase())
  }
};

/**
 * Security validation patterns for detecting potential security issues
 */
const SECURITY_PATTERNS = {
  // Placeholder values that should not be in production
  PLACEHOLDER_PATTERNS: [
    /your_.*_here/i,
    /replace_.*_with/i,
    /example\.com/i,
    /localhost/i,
    /127\.0\.0\.1/i,
    /test_key/i,
    /demo_/i,
    /sample_/i
  ],
  
  // Patterns that might indicate exposed secrets
  SECRET_PATTERNS: [
    /sk_live_/i,    // Stripe live secret key
    /sk_test_/i,    // Stripe test secret key
    /rk_live_/i,    // Stripe restricted key
    /password/i,
    /secret/i,
    /private.*key/i,
    /api.*key/i
  ],
  
  // Weak or insecure values
  WEAK_PATTERNS: [
    /^(password|123456|admin|test)$/i,
    /^.{1,7}$/,     // Too short
    /^[a-z]+$/,     // Only lowercase
    /^[0-9]+$/      // Only numbers
  ]
};

/**
 * Validates all environment variables according to the schema
 */
export function validateEnvironmentVariables(): EnvValidationResult {
  const result: EnvValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    missingRequired: [],
    invalidValues: [],
    securityIssues: []
  };

  // Validate each environment variable in the schema
  for (const [key, config] of Object.entries(ENV_VALIDATION_SCHEMA)) {
    const value = import.meta.env[key as keyof ImportMetaEnv];
    
    // Check required variables
    if (config.required && (!value || value.trim() === '')) {
      result.missingRequired.push(key);
      result.errors.push(`Missing required environment variable: ${key}`);
      continue;
    }
    
    // Skip validation if optional and not provided
    if (!config.required && (!value || value.trim() === '')) {
      continue;
    }
    
    // Validate value format
    if (value && config.validator && !config.validator(value)) {
      result.invalidValues.push(key);
      result.errors.push(`Invalid value for ${key}: ${config.description}`);
    }
    
    // Security validation
    if (value) {
      const securityIssues = validateSecurity(key, value, config);
      result.securityIssues.push(...securityIssues);
      
      if (securityIssues.length > 0) {
        result.warnings.push(...securityIssues);
      }
    }
  }
  
  // Environment-specific validation
  const envSpecificIssues = validateEnvironmentSpecific();
  result.warnings.push(...envSpecificIssues);
  
  // Set overall validity
  result.isValid = result.errors.length === 0 && result.securityIssues.length === 0;
  
  return result;
}

/**
 * Validates security aspects of environment variables
 */
function validateSecurity(key: string, value: string, config: EnvVarConfig): string[] {
  const issues: string[] = [];
  
  // Check for placeholder values
  for (const pattern of SECURITY_PATTERNS.PLACEHOLDER_PATTERNS) {
    if (pattern.test(value)) {
      issues.push(`${key} contains placeholder value that should be replaced`);
      break;
    }
  }
  
  // Check for exposed secrets in non-secret variables
  if (config.securityLevel !== 'secret') {
    for (const pattern of SECURITY_PATTERNS.SECRET_PATTERNS) {
      if (pattern.test(value)) {
        issues.push(`${key} may contain sensitive information`);
        break;
      }
    }
  }
  
  // Check for weak values in security-critical variables
  if (config.category === 'security' || config.securityLevel === 'secret') {
    for (const pattern of SECURITY_PATTERNS.WEAK_PATTERNS) {
      if (pattern.test(value)) {
        issues.push(`${key} has weak or insecure value`);
        break;
      }
    }
  }
  
  // Production-specific security checks
  if (isProduction()) {
    if (key === 'VITE_ENABLE_DEBUG' && value.toLowerCase() === 'true') {
      issues.push('Debug mode should be disabled in production');
    }
    
    if (key.includes('URL') && value.includes('localhost')) {
      issues.push(`${key} should not use localhost in production`);
    }
  }
  
  return issues;
}

/**
 * Validates environment-specific requirements
 */
function validateEnvironmentSpecific(): string[] {
  const warnings: string[] = [];
  const env = getEnvironmentConfig();
  
  if (env.isProduction) {
    // Production-specific validations
    if (!getEnvVar('VITE_ENABLE_STRICT_CSP', 'true') || getEnvVar('VITE_ENABLE_STRICT_CSP') !== 'true') {
      warnings.push('Strict CSP should be enabled in production');
    }
    
    if (!getEnvVar('VITE_ENABLE_HSTS', 'true') || getEnvVar('VITE_ENABLE_HSTS') !== 'true') {
      warnings.push('HSTS should be enabled in production');
    }
    
    if (getEnvVar('VITE_LOG_LEVEL', 'info') === 'debug') {
      warnings.push('Log level should not be debug in production');
    }
  }
  
  return warnings;
}

/**
 * Gets environment configuration with computed values
 */
export function getEnvironmentConfig(): EnvConfig {
  const environment = (import.meta.env.VITE_ENVIRONMENT || import.meta.env.NODE_ENV || 'development') as 'development' | 'staging' | 'production';
  
  return {
    environment,
    isProduction: environment === 'production' || import.meta.env.PROD,
    isDevelopment: environment === 'development' || import.meta.env.DEV,
    isStaging: environment === 'staging',
    debugEnabled: getEnvVar('VITE_ENABLE_DEBUG', 'false').toLowerCase() === 'true',
    securityEnabled: environment === 'production'
  };
}

/**
 * Gets a validated environment variable value with type safety
 */
export function getEnvVar<T = string>(
  key: keyof ImportMetaEnv,
  defaultValue?: string,
  transformer?: (value: string) => T
): T {
  const config = ENV_VALIDATION_SCHEMA[key];
  const value = import.meta.env[key] || config?.defaultValue || defaultValue;
  
  if (!value) {
    if (config?.required) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return defaultValue as T;
  }
  
  // Validate if validator exists
  if (config?.validator && !config.validator(value)) {
    throw new Error(`Invalid value for environment variable ${key}: ${config.description}`);
  }
  
  // Transform value if transformer provided
  if (transformer) {
    return transformer(value);
  }
  
  return value as T;
}

/**
 * Gets environment variable as boolean
 */
export function getEnvVarAsBoolean(key: keyof ImportMetaEnv, defaultValue: boolean = false): boolean {
  return getEnvVar(key, defaultValue.toString(), (value) => value.toLowerCase() === 'true');
}

/**
 * Gets environment variable as number
 */
export function getEnvVarAsNumber(key: keyof ImportMetaEnv, defaultValue?: number): number {
  return getEnvVar(key, defaultValue?.toString(), (value) => {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Environment variable ${key} must be a valid number`);
    }
    return num;
  });
}

/**
 * Gets environment variable as array
 */
export function getEnvVarAsArray(key: keyof ImportMetaEnv, separator: string = ',', defaultValue: string[] = []): string[] {
  return getEnvVar(key, defaultValue.join(separator), (value) =>
    value.split(separator).map(item => item.trim()).filter(Boolean)
  );
}

/**
 * Checks if we're in development mode
 */
export function isDevelopment(): boolean {
  return getEnvironmentConfig().isDevelopment;
}

/**
 * Checks if we're in production mode
 */
export function isProduction(): boolean {
  return getEnvironmentConfig().isProduction;
}

/**
 * Checks if we're in staging mode
 */
export function isStaging(): boolean {
  return getEnvironmentConfig().isStaging;
}

/**
 * Checks if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return getEnvironmentConfig().debugEnabled;
}

/**
 * Validates environment and throws detailed error if invalid
 */
export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironmentVariables();
  
  if (!result.isValid) {
    let errorMessage = '🚨 ENVIRONMENT CONFIGURATION ERROR 🚨\n\n';
    
    if (result.missingRequired.length > 0) {
      errorMessage += `Missing required environment variables:\n`;
      result.missingRequired.forEach(varName => {
        const config = ENV_VALIDATION_SCHEMA[varName];
        errorMessage += `  ❌ ${varName} - ${config?.description || 'No description'}\n`;
      });
      errorMessage += '\n';
    }
    
    if (result.invalidValues.length > 0) {
      errorMessage += `Invalid environment variable values:\n`;
      result.invalidValues.forEach(varName => {
        const config = ENV_VALIDATION_SCHEMA[varName];
        errorMessage += `  ⚠️  ${varName} - ${config?.description || 'Invalid format'}\n`;
      });
      errorMessage += '\n';
    }
    
    if (result.securityIssues.length > 0) {
      errorMessage += `Security issues detected:\n`;
      result.securityIssues.forEach(issue => {
        errorMessage += `  🔒 ${issue}\n`;
      });
      errorMessage += '\n';
    }
    
    errorMessage += `To fix these issues:\n`;
    errorMessage += `1. Create or update your .env.local file\n`;
    errorMessage += `2. Set the required environment variables with valid values\n`;
    errorMessage += `3. Review security warnings and update values as needed\n`;
    errorMessage += `4. Restart the development server\n\n`;
    errorMessage += `⚠️  NEVER commit actual credentials to version control!\n`;
    errorMessage += `⚠️  Use placeholder values in .env.example only!\n`;
    errorMessage += `⚠️  Ensure production values meet security requirements!\n`;

    throw new Error(errorMessage);
  }
  
  // Log warnings if any
  if (result.warnings.length > 0) {
    console.warn('🔔 Environment Configuration Warnings:');
    result.warnings.forEach(warning => {
      console.warn(`  ⚠️  ${warning}`);
    });
  }
}

/**
 * Gets environment variables by category
 */
export function getEnvVarsByCategory(category: EnvironmentCategory): Record<string, string> {
  const vars: Record<string, string> = {};
  
  for (const [key, config] of Object.entries(ENV_VALIDATION_SCHEMA)) {
    if (config.category === category) {
      const value = import.meta.env[key as keyof ImportMetaEnv];
      if (value) {
        vars[key] = value;
      }
    }
  }
  
  return vars;
}

/**
 * Gets environment variables by security level
 */
export function getEnvVarsBySecurityLevel(level: SecurityLevel): Record<string, string> {
  const vars: Record<string, string> = {};
  
  for (const [key, config] of Object.entries(ENV_VALIDATION_SCHEMA)) {
    if (config.securityLevel === level) {
      const value = import.meta.env[key as keyof ImportMetaEnv];
      if (value) {
        // Mask secret values
        vars[key] = level === 'secret' ? maskSecretValue(value) : value;
      }
    }
  }
  
  return vars;
}

/**
 * Masks secret values for logging/debugging
 */
function maskSecretValue(value: string): string {
  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }
  
  const start = value.substring(0, 4);
  const end = value.substring(value.length - 4);
  const middle = '*'.repeat(value.length - 8);
  
  return `${start}${middle}${end}`;
}

/**
 * Exports the validation schema for external use
 */
export { ENV_VALIDATION_SCHEMA };