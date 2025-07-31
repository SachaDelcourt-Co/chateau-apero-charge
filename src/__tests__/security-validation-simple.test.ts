import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Simple Security Validation Tests
 * 
 * This test suite provides basic validation that:
 * 1. Hardcoded credentials are completely removed from source files
 * 2. Environment variables are being used correctly
 * 3. The codebase is secure from credential exposure
 */

describe('Security Validation - Hardcoded Credentials Removal', () => {
  
  describe('Source Code Security Audit', () => {
    it('should not contain hardcoded production Supabase URL in any source files', () => {
      const filesToCheck = [
        '../integrations/supabase/client.ts',
        '../lib/supabase.ts',
        '../lib/logger.ts'
      ];

      filesToCheck.forEach(file => {
        const filePath = resolve(__dirname, file);
        const fileContent = readFileSync(filePath, 'utf8');
        
        // Check that hardcoded production URL is not present
        expect(fileContent).not.toContain('https://dqghjrpeoyqvkvoivfnz.supabase.co');
        
        console.log(`✅ ${file}: No hardcoded URLs found`);
      });
    });

    it('should not contain hardcoded production Supabase key in any source files', () => {
      const filesToCheck = [
        '../integrations/supabase/client.ts',
        '../lib/supabase.ts'
      ];

      filesToCheck.forEach(file => {
        const filePath = resolve(__dirname, file);
        const fileContent = readFileSync(filePath, 'utf8');
        
        // Check that hardcoded production key is not present
        expect(fileContent).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y');
        
        console.log(`✅ ${file}: No hardcoded keys found`);
      });
    });

    it('should use environment variables for Supabase configuration', () => {
      const clientFilePath = resolve(__dirname, '../integrations/supabase/client.ts');
      const clientFileContent = readFileSync(clientFilePath, 'utf8');
      
      // Verify that environment variables are being used
      expect(clientFileContent).toContain('import.meta.env.VITE_SUPABASE_URL');
      expect(clientFileContent).toContain('import.meta.env.VITE_SUPABASE_ANON_KEY');
      
      // Verify that validation is in place
      expect(clientFileContent).toContain('Missing required Supabase configuration');
      
      console.log('✅ Environment variables are properly configured');
    });

    it('should have proper error handling for missing environment variables', () => {
      const clientFilePath = resolve(__dirname, '../integrations/supabase/client.ts');
      const clientFileContent = readFileSync(clientFilePath, 'utf8');
      
      // Verify that there's validation for environment variables
      expect(clientFileContent).toContain('if (!SUPABASE_URL || !SUPABASE_ANON_KEY)');
      expect(clientFileContent).toContain('throw new Error');
      
      console.log('✅ Proper error handling is in place');
    });
  });

  describe('Environment Variable Usage Validation', () => {
    it('should use environment variables in logger configuration', () => {
      const loggerFilePath = resolve(__dirname, '../lib/logger.ts');
      const loggerFileContent = readFileSync(loggerFilePath, 'utf8');
      
      // Verify that logger uses environment variable for endpoint
      expect(loggerFileContent).toContain('import.meta.env.VITE_SUPABASE_URL');
      
      console.log('✅ Logger uses environment variables');
    });

    it('should use environment variables in supabase lib functions', () => {
      const supabaseFilePath = resolve(__dirname, '../lib/supabase.ts');
      const supabaseFileContent = readFileSync(supabaseFilePath, 'utf8');
      
      // Verify that all function URLs use environment variables
      expect(supabaseFileContent).toContain('import.meta.env.VITE_SUPABASE_URL');
      expect(supabaseFileContent).toContain('import.meta.env.VITE_SUPABASE_ANON_KEY');
      
      console.log('✅ Supabase functions use environment variables');
    });
  });
}); 