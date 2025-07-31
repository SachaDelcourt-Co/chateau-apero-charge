import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Credential Exposure Security Tests
 * 
 * These tests verify that no hardcoded credentials are present in the codebase
 * and that environment variables are properly configured for security.
 */

describe('Credential Exposure Security Tests', () => {
  const VULNERABLE_PATTERNS = {
    // Specific vulnerable credentials from security audit
    SUPABASE_URL: /https:\/\/dqghjrpeoyqvkvoivfnz\.supabase\.co/g,
    SUPABASE_ANON_KEY: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0\.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y/g,
    
    // General credential patterns
    HARDCODED_CREDENTIALS: [
      /sk_live_[a-zA-Z0-9]+/g,
      /sk_test_[a-zA-Z0-9]+/g,
      /rk_live_[a-zA-Z0-9]+/g,
      /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, // JWT tokens
      /AKIA[0-9A-Z]{16}/g, // AWS Access Keys
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

  const SOURCE_DIRECTORIES = [
    'src',
    'tests',
    'load-tests',
  ];

  const CONFIG_FILES = [
    'vite.config.ts',
    'vite.config.js',
    'package.json',
    'tsconfig.json',
  ];

  /**
   * Helper function to recursively get all files in a directory
   */
  function getAllFiles(dir: string, extensions: string[] = ['.ts', '.tsx', '.js', '.jsx']): string[] {
    const files: string[] = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }

    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...getAllFiles(fullPath, extensions));
      } else if (extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Helper function to scan file content for patterns
   */
  function scanFileForPatterns(filePath: string, patterns: RegExp[]): { file: string; matches: string[] } {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const matches: string[] = [];
      
      for (const pattern of patterns) {
        const found = content.match(pattern);
        if (found) {
          matches.push(...found);
        }
      }
      
      return { file: filePath, matches };
    } catch (error) {
      return { file: filePath, matches: [] };
    }
  }

  describe('Hardcoded Credential Detection', () => {
    it('should not contain vulnerable Supabase credentials from security audit', () => {
      const allFiles = [
        ...SOURCE_DIRECTORIES.flatMap(dir => getAllFiles(dir)),
        ...CONFIG_FILES.filter(file => fs.existsSync(file))
      ];

      const vulnerableFiles: string[] = [];

      for (const file of allFiles) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          
          if (VULNERABLE_PATTERNS.SUPABASE_URL.test(content)) {
            vulnerableFiles.push(`${file}: Contains vulnerable Supabase URL`);
          }
          
          if (VULNERABLE_PATTERNS.SUPABASE_ANON_KEY.test(content)) {
            vulnerableFiles.push(`${file}: Contains vulnerable Supabase anon key`);
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }

      expect(vulnerableFiles).toEqual([]);
    });

    it('should not contain hardcoded API keys or secrets', () => {
      const allFiles = SOURCE_DIRECTORIES.flatMap(dir => getAllFiles(dir));
      const suspiciousFiles: Array<{ file: string; matches: string[] }> = [];

      for (const file of allFiles) {
        const result = scanFileForPatterns(file, VULNERABLE_PATTERNS.HARDCODED_CREDENTIALS);
        if (result.matches.length > 0) {
          // Filter out false positives (test data, examples, etc.)
          const realMatches = result.matches.filter(match => 
            !match.includes('example') && 
            !match.includes('test') && 
            !match.includes('placeholder') &&
            !match.includes('mock') &&
            !file.includes('__tests__') &&
            !file.includes('.test.') &&
            !file.includes('.spec.')
          );
          
          if (realMatches.length > 0) {
            suspiciousFiles.push({ file, matches: realMatches });
          }
        }
      }

      expect(suspiciousFiles).toEqual([]);
    });

    it('should not contain placeholder values in production code', () => {
      const sourceFiles = getAllFiles('src');
      const placeholderFiles: Array<{ file: string; matches: string[] }> = [];

      for (const file of sourceFiles) {
        const result = scanFileForPatterns(file, VULNERABLE_PATTERNS.PLACEHOLDER_PATTERNS);
        if (result.matches.length > 0) {
          placeholderFiles.push(result);
        }
      }

      expect(placeholderFiles).toEqual([]);
    });
  });

  describe('Environment Variable Security', () => {
    it('should use environment variables for Supabase configuration', () => {
      const supabaseClientPath = 'src/integrations/supabase/client.ts';
      
      expect(fs.existsSync(supabaseClientPath)).toBe(true);
      
      const content = fs.readFileSync(supabaseClientPath, 'utf8');
      
      // Should use environment variables
      expect(content).toContain('import.meta.env.VITE_SUPABASE_URL');
      expect(content).toContain('import.meta.env.VITE_SUPABASE_ANON_KEY');
      
      // Should have error handling for missing env vars
      expect(content).toContain('throw new Error');
      expect(content).toMatch(/Missing required environment variables/i);
    });

    it('should have proper .gitignore configuration', () => {
      const gitignorePath = '.gitignore';
      
      expect(fs.existsSync(gitignorePath)).toBe(true);
      
      const content = fs.readFileSync(gitignorePath, 'utf8');
      
      // Should ignore sensitive files
      expect(content).toContain('.env.local');
      expect(content).toContain('dist/');
      expect(content).toContain('build/');
      
      // Should not ignore example files
      expect(content).not.toContain('.env.example');
      expect(content).not.toContain('.env.production.example');
    });

    it('should have environment example files without real credentials', () => {
      const exampleFiles = ['.env.example', '.env.production.example'];
      
      for (const file of exampleFiles) {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8');
          
          // Should not contain real credentials
          expect(content).not.toMatch(VULNERABLE_PATTERNS.SUPABASE_URL);
          expect(content).not.toMatch(VULNERABLE_PATTERNS.SUPABASE_ANON_KEY);
          
          // Should contain placeholder patterns
          const hasPlaceholders = VULNERABLE_PATTERNS.PLACEHOLDER_PATTERNS.some(pattern => 
            pattern.test(content)
          );
          expect(hasPlaceholders).toBe(true);
        }
      }
    });
  });

  describe('Load Testing Scripts Security', () => {
    it('should not contain hardcoded credentials in load testing scripts', () => {
      const loadTestFiles = [
        'load-tests/bar-operations.js',
        'load-tests/nfc-operations.js',
        'load-tests/mixed-operations.js',
        'load-tests/cleanup-test-data.js',
        'load-tests/card-recharges.js'
      ];

      const vulnerableFiles: string[] = [];

      for (const file of loadTestFiles) {
        if (fs.existsSync(file)) {
          try {
            const content = fs.readFileSync(file, 'utf8');
            
            if (VULNERABLE_PATTERNS.SUPABASE_URL.test(content)) {
              vulnerableFiles.push(`${file}: Contains hardcoded Supabase URL`);
            }
            
            if (VULNERABLE_PATTERNS.SUPABASE_ANON_KEY.test(content)) {
              vulnerableFiles.push(`${file}: Contains hardcoded Supabase anon key`);
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }

      expect(vulnerableFiles).toEqual([]);
    });

    it('should use environment variables in load testing scripts', () => {
      const loadTestFiles = getAllFiles('load-tests', ['.js']);
      
      for (const file of loadTestFiles) {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8');
          
          // If the file contains Supabase references, it should use env vars
          if (content.includes('supabase') || content.includes('SUPABASE')) {
            expect(content).toMatch(/process\.env\.|import\.meta\.env\./);
          }
        }
      }
    });
  });

  describe('Build Artifact Security', () => {
    it('should not expose credentials in build artifacts', () => {
      const buildDirs = ['dist', 'build'];
      const vulnerableFiles: string[] = [];

      for (const dir of buildDirs) {
        if (fs.existsSync(dir)) {
          const buildFiles = getAllFiles(dir, ['.js', '.css', '.html']);
          
          for (const file of buildFiles) {
            try {
              const content = fs.readFileSync(file, 'utf8');
              
              if (VULNERABLE_PATTERNS.SUPABASE_URL.test(content)) {
                vulnerableFiles.push(`${file}: Contains Supabase URL in build artifact`);
              }
              
              if (VULNERABLE_PATTERNS.SUPABASE_ANON_KEY.test(content)) {
                vulnerableFiles.push(`${file}: Contains Supabase anon key in build artifact`);
              }
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
      }

      expect(vulnerableFiles).toEqual([]);
    });
  });

  describe('File Permissions Security', () => {
    it('should have secure permissions on sensitive files', () => {
      const sensitiveFiles = ['.env.local', '.env.production'];
      
      for (const file of sensitiveFiles) {
        if (fs.existsSync(file)) {
          const stats = fs.statSync(file);
          const mode = stats.mode & parseInt('777', 8);
          
          // File should not be world-readable (no read permission for others)
          const worldReadable = mode & parseInt('044', 8);
          expect(worldReadable).toBe(0);
        }
      }
    });

    it('should not have sensitive files in repository', () => {
      const sensitiveFiles = [
        '.env.production',
        '.env.local',
        'private.key',
        'certificate.crt',
        'id_rsa',
        'id_dsa'
      ];

      const foundSensitiveFiles: string[] = [];

      for (const file of sensitiveFiles) {
        if (fs.existsSync(file)) {
          foundSensitiveFiles.push(file);
        }
      }

      // .env.local might exist for development, but should be in .gitignore
      if (foundSensitiveFiles.includes('.env.local')) {
        const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
        expect(gitignoreContent).toContain('.env.local');
      }

      // Other sensitive files should not exist
      const criticalFiles = foundSensitiveFiles.filter(f => f !== '.env.local');
      expect(criticalFiles).toEqual([]);
    });
  });

  describe('Security Configuration Validation', () => {
    it('should have environment validation implemented', () => {
      const envValidationPath = 'src/lib/env-validation.ts';
      
      expect(fs.existsSync(envValidationPath)).toBe(true);
      
      const content = fs.readFileSync(envValidationPath, 'utf8');
      
      // Should have validation functions
      expect(content).toContain('validateEnvironmentVariables');
      expect(content).toContain('securityLevel');
      expect(content).toContain('SECURITY_PATTERNS');
    });

    it('should have security middleware implemented', () => {
      const securityFiles = [
        'src/lib/api-security.ts',
        'src/lib/input-validation.ts',
        'src/lib/auth-security.ts'
      ];

      for (const file of securityFiles) {
        expect(fs.existsSync(file)).toBe(true);
      }
    });

    it('should have proper error handling that does not expose sensitive information', () => {
      const errorHandlerPath = 'src/lib/error-handler.ts';
      
      if (fs.existsSync(errorHandlerPath)) {
        const content = fs.readFileSync(errorHandlerPath, 'utf8');
        
        // Should not expose stack traces or sensitive data in production
        expect(content).toMatch(/userMessage|sanitize|production/i);
      }
    });
  });
});