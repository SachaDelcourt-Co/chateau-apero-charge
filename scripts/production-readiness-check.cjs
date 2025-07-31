#!/usr/bin/env node

/**
 * Production Readiness Check Script
 * 
 * This script performs comprehensive checks to ensure the application
 * is ready for production deployment with proper security configurations.
 * 
 * Key Areas:
 * 1. Environment Configuration Validation
 * 2. Security Headers and Policies
 * 3. Build Configuration Security
 * 4. Database Security Settings
 * 5. API Security Configuration
 * 6. Monitoring and Logging Setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Production security requirements
const PRODUCTION_REQUIREMENTS = {
  REQUIRED_ENV_VARS: [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_ENVIRONMENT',
  ],
  
  SECURITY_ENV_VARS: [
    'VITE_ENABLE_STRICT_CSP',
    'VITE_ENABLE_HSTS',
    'VITE_SESSION_SECURE',
    'VITE_SESSION_SAME_SITE',
  ],
  
  FORBIDDEN_IN_PRODUCTION: [
    'VITE_ENABLE_DEBUG',
    'VITE_MOCK_API',
    'VITE_ENABLE_DEVTOOLS',
    'VITE_HOT_RELOAD',
  ],
  
  REQUIRED_SECURITY_HEADERS: [
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ],
  
  REQUIRED_FILES: [
    '.env.production.example',
    'src/lib/env-validation.ts',
    'src/lib/env-security.ts',
    'src/integrations/supabase/client.ts',
  ],
  
  SECURITY_CONFIGURATIONS: {
    CSP_DIRECTIVES: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self'",
    ],
    
    HSTS_MIN_AGE: 31536000, // 1 year
    
    SESSION_CONFIG: {
      secure: true,
      sameSite: 'strict',
      httpOnly: true,
    }
  }
};

class ProductionReadinessChecker {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warningCount: 0,
      critical: 0,
      errors: [],
      warnings: [],
      criticalIssues: [],
      recommendations: []
    };
    this.environment = 'production';
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  logHeader(message) {
    this.log('\n' + '='.repeat(60), 'cyan');
    this.log(`  ${message}`, 'bright');
    this.log('='.repeat(60), 'cyan');
  }

  logSuccess(message) {
    this.log(`✅ ${message}`, 'green');
    this.results.passed++;
  }

  logError(message) {
    this.log(`❌ ${message}`, 'red');
    this.results.failed++;
    this.results.errors.push(message);
  }

  logCritical(message) {
    this.log(`🚨 CRITICAL: ${message}`, 'red');
    this.results.critical++;
    this.results.criticalIssues.push(message);
  }

  logWarning(message) {
    this.log(`⚠️  ${message}`, 'yellow');
    this.results.warningCount++;
    this.results.warnings.push(message);
  }

  logInfo(message) {
    this.log(`ℹ️  ${message}`, 'blue');
  }

  /**
   * Main production readiness check
   */
  async checkProductionReadiness() {
    this.log('🚀 Production Readiness Check - Château Apéro Charge', 'bright');
    this.log('Verifying production deployment readiness and security configuration...', 'cyan');

    try {
      // 1. Environment Configuration
      await this.checkEnvironmentConfiguration();
      
      // 2. Security Configuration
      await this.checkSecurityConfiguration();
      
      // 3. Build Configuration
      await this.checkBuildConfiguration();
      
      // 4. Database Security
      await this.checkDatabaseSecurity();
      
      // 5. API Security
      await this.checkApiSecurity();
      
      // 6. Monitoring and Logging
      await this.checkMonitoringSetup();
      
      // 7. File Security
      await this.checkFileSecurity();
      
      // 8. Network Security
      await this.checkNetworkSecurity();
      
      // 9. Generate final report
      this.generateProductionReport();
      
      return this.results.critical === 0 && this.results.failed === 0;
      
    } catch (error) {
      this.logCritical(`Production readiness check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check environment configuration for production
   */
  async checkEnvironmentConfiguration() {
    this.logHeader('1. Environment Configuration');
    
    // Check for production environment file
    const prodEnvFile = '.env.production';
    const prodExampleFile = '.env.production.example';
    
    if (!fs.existsSync(prodExampleFile)) {
      this.logError('Missing .env.production.example file');
    } else {
      this.logSuccess('.env.production.example file exists');
    }
    
    // Load environment variables
    const envVars = this.loadEnvironmentVariables();
    
    // Check required environment variables
    for (const envVar of PRODUCTION_REQUIREMENTS.REQUIRED_ENV_VARS) {
      if (!envVars[envVar]) {
        this.logCritical(`Missing required environment variable: ${envVar}`);
      } else {
        this.logSuccess(`Required environment variable present: ${envVar}`);
      }
    }
    
    // Check security environment variables
    for (const envVar of PRODUCTION_REQUIREMENTS.SECURITY_ENV_VARS) {
      const value = envVars[envVar];
      if (!value) {
        this.logWarning(`Security environment variable not set: ${envVar}`);
      } else if (value.toLowerCase() === 'true') {
        this.logSuccess(`Security feature enabled: ${envVar}`);
      } else {
        this.logWarning(`Security feature disabled: ${envVar}`);
      }
    }
    
    // Check forbidden variables in production
    for (const envVar of PRODUCTION_REQUIREMENTS.FORBIDDEN_IN_PRODUCTION) {
      const value = envVars[envVar];
      if (value && value.toLowerCase() === 'true') {
        this.logCritical(`Development feature enabled in production: ${envVar}`);
      } else {
        this.logSuccess(`Development feature properly disabled: ${envVar}`);
      }
    }
    
    // Validate environment values
    this.validateEnvironmentValues(envVars);
  }

  /**
   * Load environment variables from various sources
   */
  loadEnvironmentVariables() {
    const envVars = { ...process.env };
    
    // Try to load from .env.production if it exists
    const prodEnvFile = '.env.production';
    if (fs.existsSync(prodEnvFile)) {
      const content = fs.readFileSync(prodEnvFile, 'utf8');
      const prodVars = this.parseEnvFile(content);
      Object.assign(envVars, prodVars);
    }
    
    // Load from .env.local for current validation
    const localEnvFile = '.env.local';
    if (fs.existsSync(localEnvFile)) {
      const content = fs.readFileSync(localEnvFile, 'utf8');
      const localVars = this.parseEnvFile(content);
      Object.assign(envVars, localVars);
    }
    
    return envVars;
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
   * Validate environment variable values
   */
  validateEnvironmentValues(envVars) {
    this.logInfo('Validating environment variable values...');
    
    // Check Supabase URL format
    const supabaseUrl = envVars.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      if (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')) {
        this.logCritical('Supabase URL points to localhost in production');
      } else if (!supabaseUrl.startsWith('https://')) {
        this.logCritical('Supabase URL must use HTTPS in production');
      } else if (!supabaseUrl.includes('.supabase.co')) {
        this.logWarning('Supabase URL format may be incorrect');
      } else {
        this.logSuccess('Supabase URL format is valid for production');
      }
    }
    
    // Check environment setting
    const environment = envVars.VITE_ENVIRONMENT || envVars.NODE_ENV;
    if (environment !== 'production') {
      this.logCritical(`Environment should be 'production', got: ${environment}`);
    } else {
      this.logSuccess('Environment correctly set to production');
    }
    
    // Check debug mode
    const debugMode = envVars.VITE_ENABLE_DEBUG;
    if (debugMode && debugMode.toLowerCase() === 'true') {
      this.logCritical('Debug mode is enabled in production');
    } else {
      this.logSuccess('Debug mode is properly disabled');
    }
  }

  /**
   * Check security configuration
   */
  async checkSecurityConfiguration() {
    this.logHeader('2. Security Configuration');
    
    // Check security files exist
    const securityFiles = [
      'src/lib/env-security.ts',
      'src/lib/auth-security.ts',
      'src/lib/api-security.ts',
      'src/lib/input-validation.ts',
      'src/config/security.ts'
    ];
    
    for (const file of securityFiles) {
      if (fs.existsSync(file)) {
        this.logSuccess(`Security file exists: ${file}`);
      } else {
        this.logWarning(`Security file missing: ${file}`);
      }
    }
    
    // Check security configuration content
    await this.validateSecurityConfigurations();
    
    // Check for security headers configuration
    await this.checkSecurityHeaders();
  }

  /**
   * Validate security configurations
   */
  async validateSecurityConfigurations() {
    this.logInfo('Validating security configurations...');
    
    // Check Content Security Policy
    const securityConfigPath = 'src/config/security.ts';
    if (fs.existsSync(securityConfigPath)) {
      const content = fs.readFileSync(securityConfigPath, 'utf8');
      
      if (content.includes('Content-Security-Policy')) {
        this.logSuccess('Content Security Policy configuration found');
      } else {
        this.logWarning('Content Security Policy configuration missing');
      }
      
      if (content.includes('X-Frame-Options')) {
        this.logSuccess('X-Frame-Options configuration found');
      } else {
        this.logWarning('X-Frame-Options configuration missing');
      }
    }
    
    // Check environment validation
    const envValidationPath = 'src/lib/env-validation.ts';
    if (fs.existsSync(envValidationPath)) {
      const content = fs.readFileSync(envValidationPath, 'utf8');
      
      if (content.includes('validateEnvironmentVariables')) {
        this.logSuccess('Environment validation function found');
      } else {
        this.logWarning('Environment validation function missing');
      }
      
      if (content.includes('securityLevel')) {
        this.logSuccess('Security level validation found');
      } else {
        this.logWarning('Security level validation missing');
      }
    }
  }

  /**
   * Check security headers configuration
   */
  async checkSecurityHeaders() {
    this.logInfo('Checking security headers configuration...');
    
    // Check Vite configuration for security headers
    const viteConfigFiles = ['vite.config.ts', 'vite.config.js'];
    let viteConfigFound = false;
    
    for (const configFile of viteConfigFiles) {
      if (fs.existsSync(configFile)) {
        viteConfigFound = true;
        const content = fs.readFileSync(configFile, 'utf8');
        
        if (content.includes('headers')) {
          this.logSuccess(`Security headers configuration found in ${configFile}`);
        } else {
          this.logWarning(`No security headers configuration in ${configFile}`);
        }
        
        // Check for specific security headers
        const requiredHeaders = [
          'X-Frame-Options',
          'X-Content-Type-Options',
          'Referrer-Policy'
        ];
        
        for (const header of requiredHeaders) {
          if (content.includes(header)) {
            this.logSuccess(`${header} header configured`);
          } else {
            this.logWarning(`${header} header not configured`);
          }
        }
        break;
      }
    }
    
    if (!viteConfigFound) {
      this.logWarning('No Vite configuration file found');
    }
  }

  /**
   * Check build configuration
   */
  async checkBuildConfiguration() {
    this.logHeader('3. Build Configuration');
    
    // Check package.json for production build script
    if (fs.existsSync('package.json')) {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      if (packageJson.scripts && packageJson.scripts.build) {
        this.logSuccess('Production build script exists');
      } else {
        this.logError('Production build script missing');
      }
      
      // Check for security-related dependencies
      const securityDeps = [
        '@supabase/supabase-js',
        'helmet',
        'cors'
      ];
      
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      for (const dep of securityDeps) {
        if (allDeps[dep]) {
          this.logSuccess(`Security dependency found: ${dep}`);
        } else {
          this.logInfo(`Optional security dependency not found: ${dep}`);
        }
      }
    } else {
      this.logError('package.json file missing');
    }
    
    // Test production build
    await this.testProductionBuild();
  }

  /**
   * Test production build
   */
  async testProductionBuild() {
    this.logInfo('Testing production build...');
    
    try {
      // Run production build
      execSync('npm run build', { stdio: 'pipe' });
      this.logSuccess('Production build completed successfully');
      
      // Check build output
      const buildDirs = ['dist', 'build'];
      let buildFound = false;
      
      for (const dir of buildDirs) {
        if (fs.existsSync(dir)) {
          buildFound = true;
          const files = fs.readdirSync(dir);
          
          if (files.length > 0) {
            this.logSuccess(`Build artifacts created in ${dir}`);
          } else {
            this.logError(`Build directory ${dir} is empty`);
          }
          
          // Check for source maps in production
          const sourceMaps = files.filter(f => f.endsWith('.map'));
          if (sourceMaps.length > 0) {
            this.logWarning(`Source maps found in production build: ${sourceMaps.length} files`);
            this.results.recommendations.push('Consider disabling source maps in production for security');
          } else {
            this.logSuccess('No source maps in production build');
          }
          break;
        }
      }
      
      if (!buildFound) {
        this.logError('No build output directory found');
      }
      
    } catch (error) {
      this.logError(`Production build failed: ${error.message}`);
    }
  }

  /**
   * Check database security
   */
  async checkDatabaseSecurity() {
    this.logHeader('4. Database Security');
    
    // Check Supabase client configuration
    const supabaseClientPath = 'src/integrations/supabase/client.ts';
    if (fs.existsSync(supabaseClientPath)) {
      const content = fs.readFileSync(supabaseClientPath, 'utf8');
      
      if (content.includes('import.meta.env')) {
        this.logSuccess('Supabase client uses environment variables');
      } else {
        this.logCritical('Supabase client may contain hardcoded credentials');
      }
      
      if (content.includes('throw new Error')) {
        this.logSuccess('Supabase client has error handling for missing credentials');
      } else {
        this.logWarning('Supabase client should validate environment variables');
      }
    } else {
      this.logError('Supabase client file not found');
    }
    
    // Check for Row Level Security policies
    this.logInfo('Database security recommendations:');
    this.results.recommendations.push('Ensure Row Level Security (RLS) is enabled on all Supabase tables');
    this.results.recommendations.push('Review and test all RLS policies before production deployment');
    this.results.recommendations.push('Configure database connection limits and timeouts');
    this.results.recommendations.push('Enable database audit logging for production');
  }

  /**
   * Check API security
   */
  async checkApiSecurity() {
    this.logHeader('5. API Security');
    
    const apiSecurityFiles = [
      'src/lib/api-security.ts',
      'src/lib/secure-api-router.ts',
      'src/lib/api-monitoring.ts',
      'src/lib/error-handler.ts'
    ];
    
    for (const file of apiSecurityFiles) {
      if (fs.existsSync(file)) {
        this.logSuccess(`API security file exists: ${file}`);
      } else {
        this.logWarning(`API security file missing: ${file}`);
      }
    }
    
    // Check for CORS configuration
    const viteConfigPath = 'vite.config.ts';
    if (fs.existsSync(viteConfigPath)) {
      const content = fs.readFileSync(viteConfigPath, 'utf8');
      
      if (content.includes('cors')) {
        this.logSuccess('CORS configuration found');
      } else {
        this.logWarning('CORS configuration not found in Vite config');
      }
    }
    
    // API security recommendations
    this.results.recommendations.push('Implement rate limiting on all API endpoints');
    this.results.recommendations.push('Add request validation and sanitization');
    this.results.recommendations.push('Configure proper CORS policies for production domain');
    this.results.recommendations.push('Implement API authentication and authorization');
  }

  /**
   * Check monitoring and logging setup
   */
  async checkMonitoringSetup() {
    this.logHeader('6. Monitoring and Logging');
    
    const monitoringFiles = [
      'src/lib/logger.ts',
      'src/lib/audit-logger.ts',
      'src/lib/monitoring/index.ts',
      'src/lib/api-monitoring.ts'
    ];
    
    for (const file of monitoringFiles) {
      if (fs.existsSync(file)) {
        this.logSuccess(`Monitoring file exists: ${file}`);
      } else {
        this.logWarning(`Monitoring file missing: ${file}`);
      }
    }
    
    // Check logging configuration
    const loggerPath = 'src/lib/logger.ts';
    if (fs.existsSync(loggerPath)) {
      const content = fs.readFileSync(loggerPath, 'utf8');
      
      if (content.includes('level') || content.includes('LOG_LEVEL')) {
        this.logSuccess('Log level configuration found');
      } else {
        this.logWarning('Log level configuration missing');
      }
      
      if (content.includes('audit') || content.includes('security')) {
        this.logSuccess('Security logging configuration found');
      } else {
        this.logWarning('Security logging configuration missing');
      }
    }
    
    // Monitoring recommendations
    this.results.recommendations.push('Set up error tracking and monitoring service');
    this.results.recommendations.push('Configure log aggregation and analysis');
    this.results.recommendations.push('Implement security event monitoring and alerting');
    this.results.recommendations.push('Set up performance monitoring and metrics');
  }

  /**
   * Check file security
   */
  async checkFileSecurity() {
    this.logHeader('7. File Security');
    
    // Check .gitignore configuration
    if (fs.existsSync('.gitignore')) {
      const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
      
      const sensitivePatterns = [
        '.env.local',
        '.env.production',
        'dist/',
        'build/',
        'node_modules/',
        '*.log'
      ];
      
      for (const pattern of sensitivePatterns) {
        if (gitignoreContent.includes(pattern)) {
          this.logSuccess(`${pattern} is properly ignored`);
        } else {
          this.logWarning(`${pattern} should be added to .gitignore`);
        }
      }
    } else {
      this.logError('.gitignore file missing');
    }
    
    // Check for sensitive files in repository
    const sensitiveFiles = [
      '.env.production',
      '.env.local',
      'private.key',
      'certificate.crt',
      'id_rsa',
      'id_dsa'
    ];
    
    for (const file of sensitiveFiles) {
      if (fs.existsSync(file)) {
        this.logCritical(`Sensitive file found in repository: ${file}`);
      }
    }
    
    this.logSuccess('No sensitive files found in repository');
  }

  /**
   * Check network security
   */
  async checkNetworkSecurity() {
    this.logHeader('8. Network Security');
    
    // Check for HTTPS enforcement
    const envVars = this.loadEnvironmentVariables();
    
    if (envVars.VITE_ENABLE_HSTS === 'true') {
      this.logSuccess('HSTS (HTTP Strict Transport Security) enabled');
    } else {
      this.logWarning('HSTS should be enabled in production');
    }
    
    if (envVars.VITE_ENABLE_STRICT_CSP === 'true') {
      this.logSuccess('Strict Content Security Policy enabled');
    } else {
      this.logWarning('Strict CSP should be enabled in production');
    }
    
    // Network security recommendations
    this.results.recommendations.push('Ensure all external communications use HTTPS');
    this.results.recommendations.push('Configure proper SSL/TLS certificates');
    this.results.recommendations.push('Implement proper firewall rules');
    this.results.recommendations.push('Use CDN with DDoS protection');
  }

  /**
   * Generate production readiness report
   */
  generateProductionReport() {
    this.logHeader('Production Readiness Report');
    
    const totalChecks = this.results.passed + this.results.failed + this.results.warningCount;
    const criticalIssues = this.results.critical;
    const readinessScore = totalChecks > 0 ? 
      ((this.results.passed / totalChecks) * 100).toFixed(1) : 0;
    
    this.log(`\n📊 PRODUCTION READINESS SUMMARY`, 'bright');
    this.log(`Total Checks: ${totalChecks}`);
    this.log(`Passed: ${this.results.passed}`, 'green');
    this.log(`Failed: ${this.results.failed}`, this.results.failed > 0 ? 'red' : 'green');
    this.log(`Warnings: ${this.results.warningCount}`, this.results.warningCount > 0 ? 'yellow' : 'green');
    this.log(`Critical Issues: ${criticalIssues}`, criticalIssues > 0 ? 'red' : 'green');
    this.log(`Readiness Score: ${readinessScore}%`, 
      readinessScore >= 90 ? 'green' : (readinessScore >= 70 ? 'yellow' : 'red'));
    
    // Determine production readiness
    const isProductionReady = criticalIssues === 0 && this.results.failed === 0;
    
    if (isProductionReady) {
      this.log(`\n🚀 PRODUCTION READY!`, 'green');
      this.log(`Application is ready for production deployment.`, 'green');
    } else {
      this.log(`\n🚨 NOT PRODUCTION READY!`, 'red');
      this.log(`Critical issues must be resolved before deployment:`, 'red');
      
      if (criticalIssues > 0) {
        this.log(`\nCRITICAL ISSUES (${criticalIssues}):`, 'red');
        this.results.criticalIssues.forEach(issue => this.log(`  • ${issue}`, 'red'));
      }
      
      if (this.results.failed > 0) {
        this.log(`\nFAILED CHECKS (${this.results.failed}):`, 'red');
        this.results.errors.forEach(error => this.log(`  • ${error}`, 'red'));
      }
    }
    
    if (this.results.warningCount > 0) {
      this.log(`\n⚠️  WARNINGS (${this.results.warningCount}):`, 'yellow');
      this.results.warnings.forEach(warning => this.log(`  • ${warning}`, 'yellow'));
    }
    
    if (this.results.recommendations.length > 0) {
      this.log(`\n💡 RECOMMENDATIONS (${this.results.recommendations.length}):`, 'blue');
      this.results.recommendations.forEach(rec => this.log(`  • ${rec}`, 'blue'));
    }
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      summary: {
        totalChecks,
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.warningCount,
        critical: this.results.critical,
        readinessScore: parseFloat(readinessScore),
        isProductionReady
      },
      status: isProductionReady ? 'READY' : 'NOT_READY',
      criticalIssues: this.results.criticalIssues,
      errors: this.results.errors,
      warnings: this.results.warningCount,
      recommendations: this.results.recommendations,
      nextSteps: isProductionReady ? [
        'Deploy to staging environment for final testing',
        'Run load tests and security scans',
        'Configure monitoring and alerting',
        'Prepare rollback procedures',
        'Schedule production deployment'
      ] : [
        'Resolve all critical issues',
        'Fix failed checks',
        'Address security warnings',
        'Re-run production readiness check',
        'Conduct security review'
      ]
    };
    
    const reportPath = 'production-readiness-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`\n📄 Detailed report saved to: ${reportPath}`, 'blue');
  }
}

// CLI execution
if (require.main === module) {
  const checker = new ProductionReadinessChecker();
  
  checker.checkProductionReadiness().then(ready => {
    process.exit(ready ? 0 : 1);
  }).catch(error => {
    console.error(`${colors.red}❌ Production readiness check failed: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = ProductionReadinessChecker;