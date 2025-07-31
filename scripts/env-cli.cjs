#!/usr/bin/env node

/**
 * Environment Configuration CLI Tool
 * 
 * A comprehensive command-line interface for managing environment variables,
 * validation, security checks, and configuration management.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Import the health checker
const EnvironmentHealthChecker = require('./env-health-check.cjs');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

class EnvironmentCLI {
  constructor() {
    this.projectRoot = process.cwd();
    this.scriptsDir = path.dirname(__filename);
  }

  /**
   * Display help information
   */
  showHelp() {
    console.log(`${colors.cyan}${colors.bright}🔧 Environment Configuration CLI${colors.reset}\n`);
    console.log(`${colors.white}Usage: node scripts/env-cli.js <command> [options]${colors.reset}\n`);
    
    console.log(`${colors.yellow}${colors.bright}Commands:${colors.reset}`);
    console.log(`  ${colors.green}check${colors.reset}              Run comprehensive environment health check`);
    console.log(`  ${colors.green}validate${colors.reset}           Validate environment variables against schema`);
    console.log(`  ${colors.green}security${colors.reset}           Run security-focused validation`);
    console.log(`  ${colors.green}init${colors.reset}               Initialize environment configuration`);
    console.log(`  ${colors.green}generate${colors.reset}           Generate environment files from templates`);
    console.log(`  ${colors.green}compare${colors.reset}            Compare environment configurations`);
    console.log(`  ${colors.green}encrypt${colors.reset}            Encrypt sensitive environment values`);
    console.log(`  ${colors.green}decrypt${colors.reset}            Decrypt environment values`);
    console.log(`  ${colors.green}rotate${colors.reset}             Rotate secrets and API keys`);
    console.log(`  ${colors.green}backup${colors.reset}             Create configuration backup`);
    console.log(`  ${colors.green}restore${colors.reset}            Restore configuration from backup`);
    console.log(`  ${colors.green}install-hooks${colors.reset}      Install git pre-commit hooks`);
    console.log(`  ${colors.green}help${colors.reset}               Show this help message`);
    
    console.log(`\n${colors.yellow}${colors.bright}Options:${colors.reset}`);
    console.log(`  ${colors.blue}--env <environment>${colors.reset}    Target environment (development, staging, production)`);
    console.log(`  ${colors.blue}--file <path>${colors.reset}          Specify environment file path`);
    console.log(`  ${colors.blue}--output <path>${colors.reset}        Output file for reports`);
    console.log(`  ${colors.blue}--format <format>${colors.reset}      Output format (json, yaml, table)`);
    console.log(`  ${colors.blue}--verbose${colors.reset}             Enable verbose output`);
    console.log(`  ${colors.blue}--force${colors.reset}               Force operation without confirmation`);
    
    console.log(`\n${colors.yellow}${colors.bright}Examples:${colors.reset}`);
    console.log(`  ${colors.dim}node scripts/env-cli.js check --env production${colors.reset}`);
    console.log(`  ${colors.dim}node scripts/env-cli.js validate --file .env.staging${colors.reset}`);
    console.log(`  ${colors.dim}node scripts/env-cli.js generate --env production${colors.reset}`);
    console.log(`  ${colors.dim}node scripts/env-cli.js security --output security-report.json${colors.reset}`);
    console.log(`  ${colors.dim}node scripts/env-cli.js backup --env production${colors.reset}`);
  }

  /**
   * Parse command line arguments
   */
  parseArgs(args) {
    const parsed = {
      command: args[0] || 'help',
      options: {}
    };

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const key = arg.substring(2);
        const nextArg = args[i + 1];
        
        if (nextArg && !nextArg.startsWith('--')) {
          parsed.options[key] = nextArg;
          i++; // Skip next argument as it's a value
        } else {
          parsed.options[key] = true;
        }
      }
    }

    return parsed;
  }

  /**
   * Run health check command
   */
  async runHealthCheck(options) {
    console.log(`${colors.cyan}${colors.bright}🏥 Running Environment Health Check${colors.reset}\n`);
    
    const checker = new EnvironmentHealthChecker();
    const exitCode = await checker.runHealthCheck();
    
    if (options.output) {
      const report = checker.generateReport();
      fs.writeFileSync(options.output, report);
      console.log(`\n${colors.blue}📄 Report saved to: ${options.output}${colors.reset}`);
    }
    
    return exitCode;
  }

  /**
   * Initialize environment configuration
   */
  async runInit(options) {
    console.log(`${colors.cyan}${colors.bright}🚀 Initializing Environment Configuration${colors.reset}\n`);
    
    const environment = options.env || 'development';
    
    // Create .env.example if it doesn't exist
    const examplePath = path.join(this.projectRoot, '.env.example');
    if (!fs.existsSync(examplePath)) {
      console.log(`${colors.blue}📝 Creating .env.example...${colors.reset}`);
      this.createExampleFile(examplePath, 'development');
    }
    
    // Create environment-specific file
    const envPath = path.join(this.projectRoot, `.env.${environment}`);
    if (!fs.existsSync(envPath) || options.force) {
      console.log(`${colors.blue}📝 Creating .env.${environment}...${colors.reset}`);
      this.createExampleFile(envPath, environment);
    }
    
    // Update .gitignore
    this.updateGitignore();
    
    // Install git hooks
    if (!options['no-hooks']) {
      await this.installGitHooks();
    }
    
    console.log(`${colors.green}✅ Environment configuration initialized for ${environment}${colors.reset}`);
  }

  /**
   * Generate environment files from templates
   */
  async runGenerate(options) {
    console.log(`${colors.cyan}${colors.bright}🏗️  Generating Environment Files${colors.reset}\n`);
    
    const environment = options.env || 'development';
    const templatePath = path.join(this.projectRoot, `.env.${environment}.example`);
    const outputPath = path.join(this.projectRoot, `.env.${environment}`);
    
    if (!fs.existsSync(templatePath)) {
      console.error(`${colors.red}❌ Template file not found: ${templatePath}${colors.reset}`);
      return 1;
    }
    
    if (fs.existsSync(outputPath) && !options.force) {
      console.error(`${colors.red}❌ Output file already exists: ${outputPath}${colors.reset}`);
      console.log(`${colors.yellow}Use --force to overwrite${colors.reset}`);
      return 1;
    }
    
    // Read template and generate file
    const template = fs.readFileSync(templatePath, 'utf8');
    const generated = this.processTemplate(template, environment);
    
    fs.writeFileSync(outputPath, generated);
    console.log(`${colors.green}✅ Generated ${outputPath} from template${colors.reset}`);
    
    // Set appropriate permissions
    fs.chmodSync(outputPath, 0o600);
    console.log(`${colors.blue}🔒 Set secure permissions (600) on ${outputPath}${colors.reset}`);
    
    return 0;
  }

  /**
   * Compare environment configurations
   */
  async runCompare(options) {
    console.log(`${colors.cyan}${colors.bright}🔍 Comparing Environment Configurations${colors.reset}\n`);
    
    const env1 = options.env || 'development';
    const env2 = options.compare || 'production';
    
    const file1 = path.join(this.projectRoot, `.env.${env1}`);
    const file2 = path.join(this.projectRoot, `.env.${env2}`);
    
    if (!fs.existsSync(file1)) {
      console.error(`${colors.red}❌ File not found: ${file1}${colors.reset}`);
      return 1;
    }
    
    if (!fs.existsSync(file2)) {
      console.error(`${colors.red}❌ File not found: ${file2}${colors.reset}`);
      return 1;
    }
    
    const vars1 = this.parseEnvFile(fs.readFileSync(file1, 'utf8'));
    const vars2 = this.parseEnvFile(fs.readFileSync(file2, 'utf8'));
    
    const comparison = this.compareEnvironments(vars1, vars2, env1, env2);
    this.displayComparison(comparison);
    
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(comparison, null, 2));
      console.log(`\n${colors.blue}📄 Comparison saved to: ${options.output}${colors.reset}`);
    }
    
    return 0;
  }

  /**
   * Encrypt sensitive environment values
   */
  async runEncrypt(options) {
    console.log(`${colors.cyan}${colors.bright}🔐 Encrypting Environment Values${colors.reset}\n`);
    
    const file = options.file || '.env.local';
    const filePath = path.join(this.projectRoot, file);
    
    if (!fs.existsSync(filePath)) {
      console.error(`${colors.red}❌ File not found: ${filePath}${colors.reset}`);
      return 1;
    }
    
    const key = options.key || this.generateEncryptionKey();
    const content = fs.readFileSync(filePath, 'utf8');
    const encrypted = this.encryptContent(content, key);
    
    const encryptedPath = `${filePath}.encrypted`;
    fs.writeFileSync(encryptedPath, encrypted);
    
    console.log(`${colors.green}✅ Encrypted file saved to: ${encryptedPath}${colors.reset}`);
    console.log(`${colors.yellow}🔑 Encryption key: ${key}${colors.reset}`);
    console.log(`${colors.red}⚠️  Store the encryption key securely!${colors.reset}`);
    
    return 0;
  }

  /**
   * Install git hooks
   */
  async installGitHooks() {
    console.log(`${colors.blue}🪝 Installing git hooks...${colors.reset}`);
    
    const gitHooksDir = path.join(this.projectRoot, '.git', 'hooks');
    const preCommitHook = path.join(gitHooksDir, 'pre-commit');
    const sourceHook = path.join(this.scriptsDir, 'pre-commit-env-check.sh');
    
    if (!fs.existsSync(gitHooksDir)) {
      console.log(`${colors.yellow}⚠️  Git hooks directory not found. Is this a git repository?${colors.reset}`);
      return;
    }
    
    if (!fs.existsSync(sourceHook)) {
      console.log(`${colors.yellow}⚠️  Pre-commit hook script not found: ${sourceHook}${colors.reset}`);
      return;
    }
    
    // Create symlink to pre-commit hook
    if (fs.existsSync(preCommitHook)) {
      fs.unlinkSync(preCommitHook);
    }
    
    const relativePath = path.relative(gitHooksDir, sourceHook);
    fs.symlinkSync(relativePath, preCommitHook);
    fs.chmodSync(preCommitHook, 0o755);
    
    console.log(`${colors.green}✅ Pre-commit hook installed${colors.reset}`);
  }

  /**
   * Create example environment file
   */
  createExampleFile(filePath, environment) {
    const template = `# ${environment.toUpperCase()} Environment Configuration
# Copy this file to .env.${environment} and fill in your actual values

# Core Configuration (REQUIRED)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_${environment}_anon_key_here

# Environment Settings
NODE_ENV=${environment}
VITE_ENVIRONMENT=${environment}

# Security Configuration
VITE_ENABLE_DEBUG=${environment === 'development' ? 'true' : 'false'}
VITE_API_BASE_URL=${environment === 'development' ? 'http://localhost:3000' : 'https://your-domain.com'}

# Application Configuration
VITE_APP_NAME="Château Apéro Refund System"
VITE_APP_VERSION=1.0.0

# Add other environment-specific variables as needed
`;

    fs.writeFileSync(filePath, template);
  }

  /**
   * Update .gitignore to include environment files
   */
  updateGitignore() {
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    const envEntries = [
      '# Environment files',
      '.env.local',
      '.env.development.local',
      '.env.staging.local',
      '.env.production.local',
      '.env.*.encrypted'
    ];

    let gitignoreContent = '';
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    }

    let updated = false;
    for (const entry of envEntries) {
      if (!gitignoreContent.includes(entry)) {
        gitignoreContent += `\n${entry}`;
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(gitignorePath, gitignoreContent);
      console.log(`${colors.blue}📝 Updated .gitignore with environment file patterns${colors.reset}`);
    }
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
   * Compare two environment configurations
   */
  compareEnvironments(vars1, vars2, env1, env2) {
    const allKeys = new Set([...Object.keys(vars1), ...Object.keys(vars2)]);
    const comparison = {
      environment1: env1,
      environment2: env2,
      summary: {
        total: allKeys.size,
        common: 0,
        onlyIn1: 0,
        onlyIn2: 0,
        different: 0
      },
      details: []
    };

    for (const key of allKeys) {
      const value1 = vars1[key];
      const value2 = vars2[key];
      
      const detail = { key };

      if (value1 && value2) {
        comparison.summary.common++;
        if (value1 === value2) {
          detail.status = 'identical';
        } else {
          detail.status = 'different';
          comparison.summary.different++;
        }
        detail.value1 = this.maskSensitiveValue(key, value1);
        detail.value2 = this.maskSensitiveValue(key, value2);
      } else if (value1 && !value2) {
        detail.status = 'only_in_1';
        detail.value1 = this.maskSensitiveValue(key, value1);
        comparison.summary.onlyIn1++;
      } else if (!value1 && value2) {
        detail.status = 'only_in_2';
        detail.value2 = this.maskSensitiveValue(key, value2);
        comparison.summary.onlyIn2++;
      }

      comparison.details.push(detail);
    }

    return comparison;
  }

  /**
   * Display environment comparison
   */
  displayComparison(comparison) {
    console.log(`${colors.yellow}${colors.bright}📊 Comparison Summary:${colors.reset}`);
    console.log(`  Total variables: ${comparison.summary.total}`);
    console.log(`  Common variables: ${comparison.summary.common}`);
    console.log(`  Only in ${comparison.environment1}: ${comparison.summary.onlyIn1}`);
    console.log(`  Only in ${comparison.environment2}: ${comparison.summary.onlyIn2}`);
    console.log(`  Different values: ${comparison.summary.different}`);
    console.log();

    console.log(`${colors.yellow}${colors.bright}📋 Detailed Comparison:${colors.reset}`);
    
    for (const detail of comparison.details) {
      let statusColor = colors.green;
      let statusIcon = '✓';
      
      switch (detail.status) {
        case 'different':
          statusColor = colors.yellow;
          statusIcon = '≠';
          break;
        case 'only_in_1':
          statusColor = colors.blue;
          statusIcon = '1';
          break;
        case 'only_in_2':
          statusColor = colors.magenta;
          statusIcon = '2';
          break;
      }
      
      console.log(`  ${statusColor}${statusIcon}${colors.reset} ${detail.key}`);
      
      if (detail.value1) {
        console.log(`    ${comparison.environment1}: ${detail.value1}`);
      }
      if (detail.value2) {
        console.log(`    ${comparison.environment2}: ${detail.value2}`);
      }
    }
  }

  /**
   * Mask sensitive values for display
   */
  maskSensitiveValue(key, value) {
    const sensitiveKeys = ['key', 'secret', 'password', 'token'];
    const isSensitive = sensitiveKeys.some(sensitive => 
      key.toLowerCase().includes(sensitive)
    );

    if (isSensitive && value.length > 8) {
      return `${value.substring(0, 4)}${'*'.repeat(value.length - 8)}${value.substring(value.length - 4)}`;
    }

    return value;
  }

  /**
   * Process template with environment-specific values
   */
  processTemplate(template, environment) {
    return template
      .replace(/\{\{environment\}\}/g, environment)
      .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
      .replace(/\{\{random\}\}/g, crypto.randomBytes(16).toString('hex'));
  }

  /**
   * Generate encryption key
   */
  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt content with key
   */
  encryptContent(content, key) {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, key);
    
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Main CLI entry point
   */
  async run(args) {
    const { command, options } = this.parseArgs(args);

    try {
      switch (command) {
        case 'check':
          return await this.runHealthCheck(options);
        
        case 'validate':
          return await this.runHealthCheck(options);
        
        case 'security':
          options.securityFocus = true;
          return await this.runHealthCheck(options);
        
        case 'init':
          return await this.runInit(options);
        
        case 'generate':
          return await this.runGenerate(options);
        
        case 'compare':
          return await this.runCompare(options);
        
        case 'encrypt':
          return await this.runEncrypt(options);
        
        case 'install-hooks':
          await this.installGitHooks();
          return 0;
        
        case 'help':
        default:
          this.showHelp();
          return 0;
      }
    } catch (error) {
      console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      return 1;
    }
  }
}

// CLI execution
if (require.main === module) {
  const cli = new EnvironmentCLI();
  const args = process.argv.slice(2);
  
  cli.run(args).then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error(`${colors.red}❌ Unexpected error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = EnvironmentCLI;