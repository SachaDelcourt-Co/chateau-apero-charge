/// <reference types="vite/client" />

/**
 * Environment Variable Type Definitions
 *
 * This file defines TypeScript types for all environment variables used in the application.
 * It provides compile-time type safety and documentation for environment configuration.
 */

interface ImportMetaEnv {
  // Core Supabase Configuration (REQUIRED)
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  
  // Environment Configuration
  readonly NODE_ENV?: 'development' | 'production' | 'test'
  readonly VITE_ENVIRONMENT?: 'development' | 'staging' | 'production'
  
  // Security Configuration
  readonly VITE_ENABLE_DEBUG?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ENABLE_STRICT_CSP?: string
  readonly VITE_ENABLE_HSTS?: string
  readonly VITE_CONTENT_SECURITY_POLICY?: string
  readonly VITE_REFERRER_POLICY?: string
  readonly VITE_ALLOWED_ORIGINS?: string
  
  // Application Configuration
  readonly VITE_APP_NAME?: string
  readonly VITE_APP_VERSION?: string
  
  // Rate Limiting Configuration
  readonly VITE_MAX_REFUNDS_PER_BATCH?: string
  readonly VITE_MAX_DAILY_REFUND_AMOUNT?: string
  readonly VITE_API_RATE_LIMIT?: string
  readonly VITE_API_RATE_WINDOW?: string
  
  // Monitoring and Logging
  readonly VITE_ENABLE_AUDIT_LOGGING?: string
  readonly VITE_LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
  readonly VITE_ENABLE_PERFORMANCE_MONITORING?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  
  // Database Configuration
  readonly VITE_DB_MAX_CONNECTIONS?: string
  readonly VITE_DB_CONNECTION_TIMEOUT?: string
  readonly VITE_DB_POOL_SIZE?: string
  readonly VITE_DB_IDLE_TIMEOUT?: string
  
  // File Upload Configuration
  readonly VITE_MAX_FILE_SIZE?: string
  readonly VITE_ALLOWED_FILE_TYPES?: string
  readonly VITE_UPLOAD_TIMEOUT?: string
  
  // Session Configuration
  readonly VITE_SESSION_TIMEOUT?: string
  readonly VITE_SESSION_SECURE?: string
  readonly VITE_SESSION_SAME_SITE?: 'strict' | 'lax' | 'none'
  readonly VITE_SESSION_DOMAIN?: string
  
  // Backup and Recovery
  readonly VITE_ENABLE_AUTO_BACKUP?: string
  readonly VITE_BACKUP_RETENTION_DAYS?: string
  readonly VITE_BACKUP_SCHEDULE?: string
  
  // Feature Flags
  readonly VITE_ENABLE_NFC?: string
  readonly VITE_ENABLE_STRIPE?: string
  readonly VITE_ENABLE_REFUNDS?: string
  readonly VITE_ENABLE_ANALYTICS?: string
  readonly VITE_ENABLE_MAINTENANCE_MODE?: string
  
  // External Service Configuration
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string
  readonly VITE_STRIPE_TEST_MODE?: string
  readonly VITE_ANALYTICS_ID?: string
  readonly VITE_CDN_URL?: string
  
  // Development Configuration
  readonly VITE_MOCK_API?: string
  readonly VITE_ENABLE_DEVTOOLS?: string
  readonly VITE_HOT_RELOAD?: string
  
  // Security Headers and Policies
  readonly VITE_X_FRAME_OPTIONS?: string
  readonly VITE_X_CONTENT_TYPE_OPTIONS?: string
  readonly VITE_X_XSS_PROTECTION?: string
  readonly VITE_PERMISSIONS_POLICY?: string
  
  // Encryption and Secrets
  readonly VITE_ENCRYPTION_KEY?: string
  readonly VITE_JWT_SECRET?: string
  readonly VITE_API_KEY_SALT?: string
  
  // Performance Configuration
  readonly VITE_CACHE_TTL?: string
  readonly VITE_REQUEST_TIMEOUT?: string
  readonly VITE_RETRY_ATTEMPTS?: string
  readonly VITE_RETRY_DELAY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Environment Variable Categories for Validation
 */
export type EnvironmentCategory =
  | 'core'
  | 'security'
  | 'database'
  | 'monitoring'
  | 'features'
  | 'performance'
  | 'development'

/**
 * Environment Variable Security Levels
 */
export type SecurityLevel = 'public' | 'internal' | 'secret'

/**
 * Environment Variable Configuration Schema
 */
export interface EnvVarConfig {
  key: keyof ImportMetaEnv
  required: boolean
  category: EnvironmentCategory
  securityLevel: SecurityLevel
  description: string
  defaultValue?: string
  validator?: (value: string) => boolean
  transformer?: (value: string) => any
}

/**
 * Environment Validation Result
 */
export interface EnvValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  missingRequired: string[]
  invalidValues: string[]
  securityIssues: string[]
}

/**
 * Environment Configuration Context
 */
export interface EnvConfig {
  environment: 'development' | 'staging' | 'production'
  isProduction: boolean
  isDevelopment: boolean
  isStaging: boolean
  debugEnabled: boolean
  securityEnabled: boolean
}

// Validate required environment variables at compile time
declare const REQUIRED_ENV_VARS: {
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
}

// Environment variable validation schema
declare const ENV_VALIDATION_SCHEMA: Record<keyof ImportMetaEnv, EnvVarConfig>