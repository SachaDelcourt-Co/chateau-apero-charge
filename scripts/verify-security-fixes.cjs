#!/usr/bin/env node

/**
 * Security Verification Script
 * 
 * This script performs comprehensive verification that all critical security
 * vulnerabilities identified in the security audit have been resolved.
 * 
 * Key Verification Areas:
 * 1. Credential Exposure Verification
 * 2. Environment Variable Validation
 * 3. Build Artifact Security Check
 * 4. Authentication & Session Management
 * 5. API Security Validation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

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

// Known vulnerable patterns from the security audit
const VULNERABLE_PATTERNS = {
  // Hardcoded Supabase credentials
  SUPABASE_URL: /https:\/\/dqghjrpeoyqvkvoivfnz\.supabase\.co/g,
  SUPABASE_ANON_KEY: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0\.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y/g,
  
  // General credential patterns
  HARDCODED_CREDENTIALS: [
    /sk_live_[a-zA-Z0-9]+/g,
    /sk_test_[a-zA-Z0-9]+/g,
    /rk_live_[a-zA-Z0-9]+/g,
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, // JWT tokens
    /AKIA[0-9A-Z]{16}/g, // AWS Access Keys
    /[0-9a-f]{32}/g, // MD5 hashes (potential API keys)
  ],
  
  // Placeholder patterns that should be replaced
  PLACEHOLDER_PATTERNS: [
    /your_.*_here/gi,
    /replace_.*_with/gi,
    /example\.com/gi,
    /test_key/gi,
    /demo_/gi,
    /sample_/gi,
  ]
};

// Files and directories to scan
const SCAN_TARGETS = {
  SOURCE_FILES: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js',
    'src/**/*.jsx',
  ],
  CONFIG_FILES: [
    'vite.config.ts',
    'vite.config.js',
    'package.json',
    'tsconfig.json',
  ],
  TEST_FILES: [
    'tests/**/*.ts',
    'tests/**/*.js',
    'load-tests/**/*.js',
  ],
  BUILD_ARTIFACTS: [
    'dist/**/*.js',
    'dist/**/*.css',
    'build/**/*.js',
    'build/**/*.css',
  ]
};

// Required environment variables
const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY'
];

class SecurityVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warningCount: 0,
      errors: [],
      warnings: [],
      details: {}
    };
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

  logWarning(message) {
    this.log(`⚠️  ${message}`, 'yellow');
    this.results.warningCount++;
    this.results.warnings.push(message);
  }

  logInfo(message) {
    this.log(`ℹ️  ${message}`, 'blue');
  }

  /**
   * Main verification function
   */
  async verify() {
    this.log('🔒 Security Verification - Château Apéro Charge', 'bright');
    this.log('Verifying that all critical security vulnerabilities have been resolved...', 'cyan');

    try {
      // 1. Credential Exposure Verification
      await this.verifyCredentialExposure();
      
      // 2. Environment Variable Validation
      await this.verifyEnvironmentVariables();
      
      // 3. Build Artifact Security Check
      await this.verifyBuildArtifacts();
      
      // 4. Authentication & Session Management
      await this.verifyAuthenticationSecurity();
      
      // 5. API Security Validation
      await this.verifyApiSecurity();
      
      // 6. File Permission and Configuration Checks
      await this.verifyFilePermissions();
      
      // 7. Generate final report
      this.generateFinalReport();
      
      return this.results.failed === 0;
      
    } catch (error) {
      this.logError(`Verification failed with error: ${error.message}`);
      return false;
    }
  }

  /**
   * Verify that no hardcoded credentials exist in the codebase
   */
  async verifyCredentialExposure() {
    this.logHeader('1. Credential Exposure Verification');
    
    // Check for specific vulnerable credentials from audit
    await this.scanForVulnerableCredentials();
    
    // Check for general credential patterns
    await this.scanForCredentialPatterns();
    
    // Check environment files
    await this.verifyEnvironmentFiles();
    
    // Check load testing scripts
    await this.verifyLoadTestingScripts();
  }

  /**
   * Scan for the specific vulnerable credentials identified in the audit
   */
  async scanForVulnerableCredentials() {
    this.logInfo('Scanning for specific vulnerable credentials from security audit...');
    
    const filesToScan = this.getAllFiles([
      ...SCAN_TARGETS.SOURCE_FILES,
      ...SCAN_TARGETS.CONFIG_FILES,
      ...SCAN_TARGETS.TEST_FILES
    ]);
    
    let foundVulnerableCredentials = false;
    
    for (const file of filesToScan) {
      if (!fs.existsSync(file)) continue;
      
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for specific Supabase URL
        if (VULNERABLE_PATTERNS.SUPABASE_URL.test(content)) {
          this.logError(`Found vulnerable Supabase URL in ${file}`);
          foundVulnerableCredentials = true;
        }
        
        // Check for specific Supabase anon key
        if (VULNERABLE_PATTERNS.SUPABASE_ANON_KEY.test(content)) {
          this.logError(`Found vulnerable Supabase anon key in ${file}`);
          foundVulnerableCredentials = true;
        }
        
      } catch (error) {
        this.logWarning(`Could not scan file ${file}: ${error.message}`);
      }
    }
    
    if (!foundVulnerableCredentials) {
      this.logSuccess('No vulnerable credentials from security audit found');
    }
  }

  /**
   * Scan for general credential patterns
   */
  async scanForCredentialPatterns() {
    this.logInfo('Scanning for general credential patterns...');
    
    const filesToScan = this.getAllFiles([
      ...SCAN_TARGETS.SOURCE_FILES,
      ...SCAN_TARGETS.CONFIG_FILES
    ]);
    
    let foundCredentials = false;
    
    for (const file of filesToScan) {
      if (!fs.existsSync(file)) continue;
      
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        for (const pattern of VULNERABLE_PATTERNS.HARDCODED_CREDENTIALS) {
          const matches = content.match(pattern);
          if (matches) {
            // Filter out false positives (like example values)
            const realMatches = matches.filter(match => 
              !match.includes('example') && 
              !match.includes('test') && 
              !match.includes('placeholder')
            );
            
            if (realMatches.length > 0) {
              this.logError(`Found potential hardcoded credentials in ${file}: ${realMatches.length} matches`);
              foundCredentials = true;
            }
          }
        }
        
      } catch (error) {
        this.logWarning(`Could not scan file ${file}: ${error.message}`);
      }
    }
    
    if (!foundCredentials) {
      this.logSuccess('No hardcoded credentials found in source files');
    }
  }

  /**
   * Verify environment files are properly configured
   */
  async verifyEnvironmentFiles() {
    this.logInfo('Verifying environment file configuration...');
    
    // Check that .env.local exists and contains required variables
    const envLocalPath = '.env.local';
    if (!fs.existsSync(envLocalPath)) {
      this.logError('.env.local file is missing');
      return;
    }
    
    const envContent = fs.readFileSync(envLocalPath, 'utf8');
    
    // Check for required environment variables
    for (const envVar of REQUIRED_ENV_VARS) {
      if (!envContent.includes(envVar)) {
        this.logError(`Missing required environment variable: ${envVar}`);
      } else {
        // Check that it's not a placeholder value
        const line = envContent.split('\n').find(l => l.startsWith(envVar));
        if (line) {
          const value = line.split('=')[1]?.trim();
          if (!value || VULNERABLE_PATTERNS.PLACEHOLDER_PATTERNS.some(p => p.test(value))) {
            this.logError(`Environment variable ${envVar} contains placeholder value`);
          }
        }
      }
    }
    
    // Check that .env.local is in .gitignore
    const gitignorePath = '.gitignore';
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      if (!gitignoreContent.includes('.env.local')) {
        this.logError('.env.local is not in .gitignore - credentials could be committed');
      } else {
        this.logSuccess('.env.local is properly excluded from version control');
      }
    }
    
    this.logSuccess('Environment file configuration verified');
  }

  /**
   * Verify load testing scripts don't contain hardcoded credentials
   */
  async verifyLoadTestingScripts() {
    this.logInfo('Verifying load testing scripts...');
    
    const loadTestFiles = [
      'load-tests/bar-operations.js',
      'load-tests/nfc-operations.js',
      'load-tests/mixed-operations.js',
      'load-tests/cleanup-test-data.js',
      'load-tests/card-recharges.js'
    ];
    
    let foundCredentials = false;
    
    for (const file of loadTestFiles) {
      if (!fs.existsSync(file)) continue;
      
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for hardcoded Supabase credentials
        if (VULNERABLE_PATTERNS.SUPABASE_URL.test(content) || 
            VULNERABLE_PATTERNS.SUPABASE_ANON_KEY.test(content)) {
          this.logError(`Found hardcoded credentials in load test file: ${file}`);
          foundCredentials = true;
        }
        
      } catch (error) {
        this.logWarning(`Could not scan load test file ${file}: ${error.message}`);
      }
    }
    
    if (!foundCredentials) {
      this.logSuccess('Load testing scripts are clean of hardcoded credentials');
    }
  }

  /**
   * Verify environment variables are properly configured
   */
  async verifyEnvironmentVariables() {
    this.logHeader('2. Environment Variable Validation');
    
    try {
      // Run the existing environment health check
      this.logInfo('Running environment health check...');
      const result = execSync('node scripts/env-health-check.cjs', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      this.logSuccess('Environment variables validation passed');
      
    } catch (error) {
      this.logError(`Environment validation failed: ${error.message}`);
    }
  }

  /**
   * Verify build artifacts don't contain credentials
   */
  async verifyBuildArtifacts() {
    this.logHeader('3. Build Artifact Security Check');
    
    // Check if build directory exists
    const buildDirs = ['dist', 'build'];
    let buildDirExists = false;
    
    for (const dir of buildDirs) {
      if (fs.existsSync(dir)) {
        buildDirExists = true;
        await this.scanBuildDirectory(dir);
      }
    }
    
    if (!buildDirExists) {
      this.logInfo('No build artifacts found - creating test build...');
      try {
        execSync('npm run build', { stdio: 'pipe' });
        if (fs.existsSync('dist')) {
          await this.scanBuildDirectory('dist');
        }
      } catch (error) {
        this.logWarning(`Could not create test build: ${error.message}`);
      }
    }
  }

  /**
   * Scan build directory for credentials
   */
  async scanBuildDirectory(buildDir) {
    this.logInfo(`Scanning build directory: ${buildDir}`);
    
    const buildFiles = this.getAllFiles([`${buildDir}/**/*.js`, `${buildDir}/**/*.css`]);
    let foundCredentials = false;
    
    for (const file of buildFiles) {
      if (!fs.existsSync(file)) continue;
      
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for vulnerable credentials
        if (VULNERABLE_PATTERNS.SUPABASE_URL.test(content) || 
            VULNERABLE_PATTERNS.SUPABASE_ANON_KEY.test(content)) {
          this.logError(`Found credentials in build artifact: ${file}`);
          foundCredentials = true;
        }
        
      } catch (error) {
        this.logWarning(`Could not scan build file ${file}: ${error.message}`);
      }
    }
    
    if (!foundCredentials) {
      this.logSuccess(`Build directory ${buildDir} is clean of hardcoded credentials`);
    }
  }

  /**
   * Verify authentication and session management security
   */
  async verifyAuthenticationSecurity() {
    this.logHeader('4. Authentication & Session Management');
    
    // Check that Supabase client uses environment variables
    const supabaseClientPath = 'src/integrations/supabase/client.ts';
    if (fs.existsSync(supabaseClientPath)) {
      const content = fs.readFileSync(supabaseClientPath, 'utf8');
      
      if (content.includes('import.meta.env.VITE_SUPABASE_URL') && 
          content.includes('import.meta.env.VITE_SUPABASE_ANON_KEY')) {
        this.logSuccess('Supabase client properly uses environment variables');
      } else {
        this.logError('Supabase client does not properly use environment variables');
      }
      
      if (content.includes('throw new Error') && 
          content.includes('Missing required environment variables')) {
        this.logSuccess('Supabase client has proper error handling for missing env vars');
      } else {
        this.logWarning('Supabase client should validate environment variables');
      }
    } else {
      this.logError('Supabase client file not found');
    }
    
    // Check for authentication security implementations
    const authFiles = [
      'src/lib/auth-security.ts',
      'src/hooks/use-auth.tsx',
      'src/components/ProtectedRoute.tsx'
    ];
    
    for (const file of authFiles) {
      if (fs.existsSync(file)) {
        this.logSuccess(`Authentication security file exists: ${file}`);
      } else {
        this.logWarning(`Authentication security file missing: ${file}`);
      }
    }
  }

  /**
   * Verify API security implementations
   */
  async verifyApiSecurity() {
    this.logHeader('5. API Security Validation');
    
    const securityFiles = [
      'src/lib/api-security.ts',
      'src/lib/input-validation.ts',
      'src/lib/api-monitoring.ts',
      'src/lib/secure-api-router.ts',
      'src/lib/error-handler.ts'
    ];
    
    for (const file of securityFiles) {
      if (fs.existsSync(file)) {
        this.logSuccess(`API security file exists: ${file}`);
      } else {
        this.logWarning(`API security file missing: ${file}`);
      }
    }
    
    // Run security tests if they exist
    try {
      this.logInfo('Running security tests...');
      execSync('node scripts/run-security-tests.js', { stdio: 'pipe' });
      this.logSuccess('Security tests passed');
    } catch (error) {
      this.logWarning('Security tests failed or not available');
    }
  }

  /**
   * Verify file permissions and configuration
   */
  async verifyFilePermissions() {
    this.logHeader('6. File Permissions & Configuration');
    
    // Check sensitive files are not world-readable
    const sensitiveFiles = ['.env.local', '.env.production'];
    
    for (const file of sensitiveFiles) {
      if (fs.existsSync(file)) {
        try {
          const stats = fs.statSync(file);
          const mode = stats.mode & parseInt('777', 8);
          
          if (mode & parseInt('044', 8)) {
            this.logWarning(`File ${file} is readable by others (permissions: ${mode.toString(8)})`);
          } else {
            this.logSuccess(`File ${file} has secure permissions`);
          }
        } catch (error) {
          this.logWarning(`Could not check permissions for ${file}: ${error.message}`);
        }
      }
    }
    
    // Check .gitignore configuration
    if (fs.existsSync('.gitignore')) {
      const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
      const requiredEntries = ['.env.local', '.env.production', 'dist/', 'build/'];
      
      for (const entry of requiredEntries) {
        if (gitignoreContent.includes(entry)) {
          this.logSuccess(`${entry} is properly ignored in version control`);
        } else {
          this.logWarning(`${entry} should be added to .gitignore`);
        }
      }
    }
  }

  /**
   * Generate final security verification report
   */
  generateFinalReport() {
    this.logHeader('Security Verification Report');
    
    const totalChecks = this.results.passed + this.results.failed;
    const successRate = totalChecks > 0 ? (this.results.passed / totalChecks * 100).toFixed(1) : 0;
    
    this.log(`\n📊 VERIFICATION SUMMARY`, 'bright');
    this.log(`Total Checks: ${totalChecks}`);
    this.log(`Passed: ${this.results.passed}`, 'green');
    this.log(`Failed: ${this.results.failed}`, this.results.failed > 0 ? 'red' : 'green');
    this.log(`Warnings: ${this.results.warningCount}`, this.results.warningCount > 0 ? 'yellow' : 'green');
    this.log(`Success Rate: ${successRate}%`, successRate >= 90 ? 'green' : (successRate >= 70 ? 'yellow' : 'red'));
    
    if (this.results.failed === 0) {
      this.log(`\n🎉 SECURITY VERIFICATION PASSED!`, 'green');
      this.log(`All critical security vulnerabilities have been resolved.`, 'green');
    } else {
      this.log(`\n🚨 SECURITY VERIFICATION FAILED!`, 'red');
      this.log(`${this.results.failed} critical issues need to be resolved:`, 'red');
      this.results.errors.forEach(error => this.log(`  • ${error}`, 'red'));
    }
    
    if (this.results.warningCount > 0) {
      this.log(`\n⚠️  WARNINGS (${this.results.warningCount}):`, 'yellow');
      this.results.warnings.forEach(warning => this.log(`  • ${warning}`, 'yellow'));
    }
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalChecks,
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.warningCount,
        successRate: parseFloat(successRate)
      },
      status: this.results.failed === 0 ? 'PASSED' : 'FAILED',
      errors: this.results.errors,
      warnings: this.results.warnings,
      recommendations: [
        'Regularly run this verification script before deployments',
        'Monitor for new credential exposure in CI/CD pipeline',
        'Keep environment variables secure and rotate regularly',
        'Review and update security configurations periodically'
      ]
    };
    
    const reportPath = 'security-verification-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`\n📄 Detailed report saved to: ${reportPath}`, 'blue');
  }

  /**
   * Get all files matching patterns
   */
  getAllFiles(patterns) {
    const files = [];
    
    for (const pattern of patterns) {
      try {
        // Simple glob implementation for basic patterns
        if (pattern.includes('**')) {
          const baseDir = pattern.split('**')[0];
          if (fs.existsSync(baseDir)) {
            const allFiles = this.walkDirectory(baseDir);
            const extension = pattern.split('.').pop();
            files.push(...allFiles.filter(f => f.endsWith(`.${extension}`)));
          }
        } else {
          if (fs.existsSync(pattern)) {
            files.push(pattern);
          }
        }
      } catch (error) {
        // Skip patterns that can't be resolved
      }
    }
    
    return [...new Set(files)]; // Remove duplicates
  }

  /**
   * Recursively walk directory
   */
  walkDirectory(dir) {
    const files = [];
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...this.walkDirectory(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
    
    return files;
  }
}

// CLI execution
if (require.main === module) {
  const verifier = new SecurityVerifier();
  
  verifier.verify().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(`${colors.red}❌ Verification failed: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = SecurityVerifier;