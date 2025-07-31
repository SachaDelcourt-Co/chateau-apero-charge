#!/usr/bin/env node

/**
 * Environment Variable Health Check Script
 * 
 * This script performs comprehensive validation and security checks
 * on environment variables for development and deployment.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Environment validation schema (mirrored from TypeScript)
const ENV_VALIDATION_SCHEMA = {
  // Core Configuration
  VITE_SUPABASE_URL: {
    required: true,
    category: 'core',
    securityLevel: 'internal',
    description: 'Supabase project URL',
    validator: (value) => /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/.test(value) || value.startsWith('http://localhost')
  },
  VITE_SUPABASE_ANON_KEY: {
    required: true,
    category: 'core',
    securityLevel: 'secret',
    description: 'Supabase anonymous key (JWT token)',
    validator: (value) => value.startsWith('eyJ') && value.length > 100
  },
  NODE_ENV: {
    required: false,
    category: 'core',
    securityLevel: 'public',
    description: 'Node.js environment',
    defaultValue: 'development',
    validator: (value) => ['development', 'production', 'test'].includes(value)
  },
  VITE_ENVIRONMENT: {
    required: false,
    category: 'core',
    securityLevel: 'public',
    description: 'Application environment',
    defaultValue: 'development',
    validator: (value) => ['development', 'staging', 'production'].includes(value)
  },
  VITE_ENABLE_DEBUG: {
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Enable debug mode',
    defaultValue: 'false',
    validator: (value) => ['true', 'false'].includes(value.toLowerCase())
  },
  VITE_API_BASE_URL: {
    required: false,
    category: 'core',
    securityLevel: 'internal',
    description: 'Base URL for API requests',
    validator: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }
  },
  VITE_ENABLE_STRICT_CSP: {
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Enable strict Content Security Policy',
    defaultValue: 'true',
    validator: (value) => ['true', 'false'].includes(value.toLowerCase())
  },
  VITE_ENABLE_HSTS: {
    required: false,
    category: 'security',
    securityLevel: 'internal',
    description: 'Enable HTTP Strict Transport Security',
    defaultValue: 'true',
    validator: (value) => ['true', 'false'].includes(value.toLowerCase())
  }
};

// Security patterns for validation
const SECURITY_PATTERNS = {
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
  SECRET_PATTERNS: [
    /sk_live_/i,
    /sk_test_/i,
    /rk_live_/i,
    /password/i,
    /secret/i,
    /private.*key/i,
    /api.*key/i
  ],
  WEAK_PATTERNS: [
    /^(password|123456|admin|test)$/i,
    /^.{1,7}$/,
    /^[a-z]+$/,
    /^[0-9]+$/
  ]
};

class EnvironmentHealthChecker {
  constructor() {
    this.results = {
      isValid: true,
      errors: [],
      warnings: [],
      missingRequired: [],
      invalidValues: [],
      securityIssues: [],
      recommendations: []
    };
    this.envFiles = [];
    this.loadedEnvVars = {};
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck() {
    console.log(`${colors.cyan}${colors.bright}🔍 Environment Variable Health Check${colors.reset}\n`);
    
    try {
      // Discover environment files
      this.discoverEnvironmentFiles();
      
      // Load environment variables
      this.loadEnvironmentVariables();
      
      // Validate environment variables
      this.validateEnvironmentVariables();
      
      // Check security issues
      this.checkSecurityIssues();
      
      // Environment-specific checks
      this.performEnvironmentSpecificChecks();
      
      // Generate recommendations
      this.generateRecommendations();
      
      // Display results
      this.displayResults();
      
      // Return exit code
      return this.results.isValid ? 0 : 1;
      
    } catch (error) {
      console.error(`${colors.red}❌ Health check failed: ${error.message}${colors.reset}`);
      return 1;
    }
  }

  /**
   * Discover all environment files in the project
   */
  discoverEnvironmentFiles() {
    const possibleEnvFiles = [
      '.env',
      '.env.local',
      '.env.development',
      '.env.development.local',
      '.env.staging',
      '.env.staging.local',
      '.env.production',
      '.env.production.local',
      '.env.example',
      '.env.production.example'
    ];

    for (const file of possibleEnvFiles) {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        this.envFiles.push({
          name: file,
          path: filePath,
          exists: true,
          size: fs.statSync(filePath).size
        });
      } else {
        this.envFiles.push({
          name: file,
          path: filePath,
          exists: false
        });
      }
    }

    console.log(`${colors.blue}📁 Discovered environment files:${colors.reset}`);
    this.envFiles.forEach(file => {
      const status = file.exists ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      const size = file.exists ? ` (${file.size} bytes)` : '';
      console.log(`  ${status} ${file.name}${size}`);
    });
    console.log();
  }

  /**
   * Load environment variables from files
   */
  loadEnvironmentVariables() {
    // Load from process.env (already loaded by Node.js)
    this.loadedEnvVars = { ...process.env };

    // Load from .env files manually for validation
    const envFilesToLoad = this.envFiles.filter(f => f.exists && !f.name.includes('example'));
    
    for (const file of envFilesToLoad) {
      try {
        const content = fs.readFileSync(file.path, 'utf8');
        const vars = this.parseEnvFile(content);
        Object.assign(this.loadedEnvVars, vars);
      } catch (error) {
        this.results.warnings.push(`Failed to load ${file.name}: ${error.message}`);
      }
    }

    console.log(`${colors.blue}📊 Loaded ${Object.keys(this.loadedEnvVars).length} environment variables${colors.reset}\n`);
  }

  /**
   * Parse environment file content
   */
  parseEnvFile(content) {
    const vars = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          let value = valueParts.join('=');
          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          vars[key.trim()] = value;
        }
      }
    }

    return vars;
  }

  /**
   * Validate environment variables against schema
   */
  validateEnvironmentVariables() {
    console.log(`${colors.blue}🔍 Validating environment variables...${colors.reset}`);

    for (const [key, config] of Object.entries(ENV_VALIDATION_SCHEMA)) {
      const value = this.loadedEnvVars[key];

      // Check required variables
      if (config.required && (!value || value.trim() === '')) {
        this.results.missingRequired.push(key);
        this.results.errors.push(`Missing required environment variable: ${key}`);
        continue;
      }

      // Skip validation if optional and not provided
      if (!config.required && (!value || value.trim() === '')) {
        continue;
      }

      // Validate value format
      if (value && config.validator && !config.validator(value)) {
        this.results.invalidValues.push(key);
        this.results.errors.push(`Invalid value for ${key}: ${config.description}`);
      }
    }

    console.log(`  ${colors.green}✓${colors.reset} Schema validation completed\n`);
  }

  /**
   * Check for security issues
   */
  checkSecurityIssues() {
    console.log(`${colors.blue}🔒 Checking security issues...${colors.reset}`);

    for (const [key, value] of Object.entries(this.loadedEnvVars)) {
      if (!value || typeof value !== 'string') continue;

      const config = ENV_VALIDATION_SCHEMA[key];
      const securityIssues = this.validateSecurity(key, value, config);
      
      if (securityIssues.length > 0) {
        this.results.securityIssues.push(...securityIssues);
        this.results.warnings.push(...securityIssues);
      }
    }

    console.log(`  ${colors.green}✓${colors.reset} Security validation completed\n`);
  }

  /**
   * Validate security aspects of environment variables
   */
  validateSecurity(key, value, config) {
    const issues = [];

    // Check for placeholder values
    for (const pattern of SECURITY_PATTERNS.PLACEHOLDER_PATTERNS) {
      if (pattern.test(value)) {
        issues.push(`${key} contains placeholder value that should be replaced`);
        break;
      }
    }

    // Check for exposed secrets in non-secret variables
    if (config && config.securityLevel !== 'secret') {
      for (const pattern of SECURITY_PATTERNS.SECRET_PATTERNS) {
        if (pattern.test(value)) {
          issues.push(`${key} may contain sensitive information`);
          break;
        }
      }
    }

    // Check for weak values in security-critical variables
    if (config && (config.category === 'security' || config.securityLevel === 'secret')) {
      for (const pattern of SECURITY_PATTERNS.WEAK_PATTERNS) {
        if (pattern.test(value)) {
          issues.push(`${key} has weak or insecure value`);
          break;
        }
      }
    }

    // Production-specific security checks
    const isProduction = this.loadedEnvVars.NODE_ENV === 'production' || 
                        this.loadedEnvVars.VITE_ENVIRONMENT === 'production';
    
    if (isProduction) {
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
   * Perform environment-specific checks
   */
  performEnvironmentSpecificChecks() {
    console.log(`${colors.blue}🌍 Performing environment-specific checks...${colors.reset}`);

    const environment = this.loadedEnvVars.VITE_ENVIRONMENT || this.loadedEnvVars.NODE_ENV || 'development';
    const isProduction = environment === 'production';

    if (isProduction) {
      // Production-specific validations
      if (this.loadedEnvVars.VITE_ENABLE_STRICT_CSP !== 'true') {
        this.results.warnings.push('Strict CSP should be enabled in production');
      }

      if (this.loadedEnvVars.VITE_ENABLE_HSTS !== 'true') {
        this.results.warnings.push('HSTS should be enabled in production');
      }

      if (this.loadedEnvVars.VITE_LOG_LEVEL === 'debug') {
        this.results.warnings.push('Log level should not be debug in production');
      }

      // Check for development-only variables in production
      const devOnlyVars = ['VITE_MOCK_API', 'VITE_ENABLE_DEVTOOLS', 'VITE_HOT_RELOAD'];
      for (const varName of devOnlyVars) {
        if (this.loadedEnvVars[varName] === 'true') {
          this.results.warnings.push(`${varName} should be disabled in production`);
        }
      }
    }

    console.log(`  ${colors.green}✓${colors.reset} Environment-specific checks completed\n`);
  }

  /**
   * Generate recommendations for improvement
   */
  generateRecommendations() {
    console.log(`${colors.blue}💡 Generating recommendations...${colors.reset}`);

    // Check for missing example files
    const exampleFiles = this.envFiles.filter(f => f.name.includes('example'));
    if (exampleFiles.length === 0) {
      this.results.recommendations.push('Create .env.example file with placeholder values');
    }

    // Check for missing production example
    const prodExample = this.envFiles.find(f => f.name === '.env.production.example');
    if (!prodExample || !prodExample.exists) {
      this.results.recommendations.push('Create .env.production.example with production-ready placeholders');
    }

    // Check for .env.local in version control (should be in .gitignore)
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      if (!gitignoreContent.includes('.env.local')) {
        this.results.recommendations.push('Add .env.local to .gitignore to prevent committing secrets');
      }
    }

    // Check for weak encryption keys
    const encryptionKey = this.loadedEnvVars.VITE_ENCRYPTION_KEY;
    if (encryptionKey && encryptionKey.length < 32) {
      this.results.recommendations.push('Use a stronger encryption key (minimum 32 characters)');
    }

    // Check for missing security headers
    const securityHeaders = [
      'VITE_CONTENT_SECURITY_POLICY',
      'VITE_REFERRER_POLICY',
      'VITE_X_FRAME_OPTIONS'
    ];
    
    for (const header of securityHeaders) {
      if (!this.loadedEnvVars[header]) {
        this.results.recommendations.push(`Consider setting ${header} for enhanced security`);
      }
    }

    console.log(`  ${colors.green}✓${colors.reset} Recommendations generated\n`);
  }

  /**
   * Display comprehensive results
   */
  displayResults() {
    console.log(`${colors.cyan}${colors.bright}📋 Health Check Results${colors.reset}\n`);

    // Summary
    const totalIssues = this.results.errors.length + this.results.warnings.length;
    const statusColor = totalIssues === 0 ? colors.green : (this.results.errors.length > 0 ? colors.red : colors.yellow);
    const statusIcon = totalIssues === 0 ? '✅' : (this.results.errors.length > 0 ? '❌' : '⚠️');
    
    console.log(`${statusColor}${statusIcon} Overall Status: ${totalIssues === 0 ? 'HEALTHY' : (this.results.errors.length > 0 ? 'CRITICAL ISSUES' : 'WARNINGS')}${colors.reset}\n`);

    // Errors
    if (this.results.errors.length > 0) {
      console.log(`${colors.red}${colors.bright}❌ Errors (${this.results.errors.length}):${colors.reset}`);
      this.results.errors.forEach(error => {
        console.log(`  ${colors.red}•${colors.reset} ${error}`);
      });
      console.log();
    }

    // Warnings
    if (this.results.warnings.length > 0) {
      console.log(`${colors.yellow}${colors.bright}⚠️  Warnings (${this.results.warnings.length}):${colors.reset}`);
      this.results.warnings.forEach(warning => {
        console.log(`  ${colors.yellow}•${colors.reset} ${warning}`);
      });
      console.log();
    }

    // Recommendations
    if (this.results.recommendations.length > 0) {
      console.log(`${colors.blue}${colors.bright}💡 Recommendations (${this.results.recommendations.length}):${colors.reset}`);
      this.results.recommendations.forEach(rec => {
        console.log(`  ${colors.blue}•${colors.reset} ${rec}`);
      });
      console.log();
    }

    // Statistics
    console.log(`${colors.cyan}${colors.bright}📊 Statistics:${colors.reset}`);
    console.log(`  Environment files found: ${this.envFiles.filter(f => f.exists).length}/${this.envFiles.length}`);
    console.log(`  Environment variables loaded: ${Object.keys(this.loadedEnvVars).length}`);
    console.log(`  Required variables missing: ${this.results.missingRequired.length}`);
    console.log(`  Invalid values: ${this.results.invalidValues.length}`);
    console.log(`  Security issues: ${this.results.securityIssues.length}`);
    console.log();

    // Set overall validity
    this.results.isValid = this.results.errors.length === 0;

    // Final message
    if (this.results.isValid) {
      console.log(`${colors.green}${colors.bright}🎉 Environment configuration is healthy!${colors.reset}`);
    } else {
      console.log(`${colors.red}${colors.bright}🚨 Environment configuration needs attention!${colors.reset}`);
      console.log(`${colors.white}Please fix the errors above before proceeding.${colors.reset}`);
    }
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      environment: this.loadedEnvVars.VITE_ENVIRONMENT || this.loadedEnvVars.NODE_ENV || 'development',
      summary: {
        isValid: this.results.isValid,
        totalIssues: this.results.errors.length + this.results.warnings.length,
        errors: this.results.errors.length,
        warnings: this.results.warnings.length,
        recommendations: this.results.recommendations.length
      },
      files: this.envFiles,
      variables: {
        total: Object.keys(this.loadedEnvVars).length,
        required: Object.values(ENV_VALIDATION_SCHEMA).filter(c => c.required).length,
        missing: this.results.missingRequired,
        invalid: this.results.invalidValues
      },
      security: {
        issues: this.results.securityIssues,
        level: this.results.securityIssues.length === 0 ? 'secure' : 'at-risk'
      },
      details: this.results
    };

    return JSON.stringify(report, null, 2);
  }
}

// CLI execution
if (require.main === module) {
  const checker = new EnvironmentHealthChecker();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const generateReport = args.includes('--report');
  const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1];

  checker.runHealthCheck().then(exitCode => {
    // Generate report if requested
    if (generateReport) {
      const report = checker.generateReport();
      
      if (outputFile) {
        fs.writeFileSync(outputFile, report);
        console.log(`\n${colors.blue}📄 Report saved to: ${outputFile}${colors.reset}`);
      } else {
        console.log(`\n${colors.blue}📄 Detailed Report:${colors.reset}`);
        console.log(report);
      }
    }

    process.exit(exitCode);
  }).catch(error => {
    console.error(`${colors.red}❌ Unexpected error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = EnvironmentHealthChecker;