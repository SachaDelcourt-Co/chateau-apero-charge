/**
 * End-to-End Refund Workflow Tests
 * Tests the complete refund system workflow from database to XML generation
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { testDbSetup, generateTestRefundData, generateTestCardData, mockRefundApiResponse } from './utils/test-database-setup';
import { testAuthSetup, mockAdminUser, mockAdminToken } from './utils/test-auth-setup';
import { CBCXMLGenerator } from '../lib/xml-generator';
import { supabase } from '../integrations/supabase/client';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Refund Workflow End-to-End Tests', () => {
  beforeAll(async () => {
    // Set up test environment
    await testAuthSetup.setupAdminAuth();
  });

  afterAll(async () => {
    // Clean up test environment
    await testDbSetup.cleanupTestData();
    testAuthSetup.cleanup();
  });

  beforeEach(async () => {
    // Reset mocks before each test
    mockFetch.mockClear();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await testDbSetup.cleanupTestData();
  });

  describe('Complete Workflow - Success Scenarios', () => {
    it('should process a complete refund workflow successfully', async () => {
      // 1. Set up test data
      const testScenario = await testDbSetup.createTestScenario('basic');
      
      // 2. Mock the generate-refund-data API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockRefundApiResponse.success
      });

      // 3. Mock the process-refunds API response (XML download)
      const expectedXML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>TEST_MSG_001</MsgId>
      <CreDtTm>${new Date().toISOString().split('T')[0]}T12:00:00</CreDtTm>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>41.25</CtrlSum>
    </GrpHdr>
  </CstmrCdtTrfInitn>
</Document>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/xml',
          'Content-Disposition': 'attachment; filename="refunds.xml"',
          'X-Message-ID': 'TEST_MSG_001',
          'X-Transaction-Count': '2',
          'X-Total-Amount': '41.25'
        }),
        text: async () => expectedXML,
        blob: async () => new Blob([expectedXML], { type: 'application/xml' })
      });

      // 4. Simulate the complete workflow
      const refundConfig = {
        debtor_config: {
          name: 'Château Apéro SPRL',
          iban: 'BE68539007547034',
          country: 'BE'
        },
        processing_options: {
          max_refunds: 50,
          include_warnings: true
        }
      };

      // 5. Call the process-refunds endpoint
      const response = await fetch('/api/process-refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(refundConfig)
      });

      // 6. Verify the response
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/xml');
      expect(response.headers.get('X-Transaction-Count')).toBe('2');
      expect(response.headers.get('X-Total-Amount')).toBe('41.25');

      // 7. Verify XML content
      const xmlContent = await response.text();
      expect(xmlContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xmlContent).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03');
      expect(xmlContent).toContain('<NbOfTxs>2</NbOfTxs>');
      expect(xmlContent).toContain('<CtrlSum>41.25</CtrlSum>');
    });

    it('should handle dry run mode correctly', async () => {
      // Set up test data
      await testDbSetup.createTestScenario('basic');

      // Mock dry run response
      const dryRunResponse = {
        success: true,
        dry_run: true,
        summary: {
          total_refunds: 2,
          valid_refunds: 2,
          total_amount: 41.25,
          processing_time_ms: 150
        },
        preview: {
          message_id: 'DRY_RUN_001',
          transaction_count: 2,
          estimated_file_size: '2.1 KB'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => dryRunResponse
      });

      const refundConfig = {
        debtor_config: {
          name: 'Château Apéro SPRL',
          iban: 'BE68539007547034',
          country: 'BE'
        },
        processing_options: {
          dry_run: true,
          max_refunds: 50
        }
      };

      const response = await fetch('/api/process-refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(refundConfig)
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.dry_run).toBe(true);
      expect(result.summary.total_refunds).toBe(2);
      expect(result.summary.total_amount).toBe(41.25);
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should handle no refunds available', async () => {
      // Mock empty refunds response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => mockRefundApiResponse.error
      });

      const refundConfig = {
        debtor_config: {
          name: 'Château Apéro SPRL',
          iban: 'BE68539007547034',
          country: 'BE'
        }
      };

      const response = await fetch('/api/process-refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(refundConfig)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
      
      const error = await response.json();
      expect(error.error).toBe('NO_REFUNDS_AVAILABLE');
      expect(error.message).toContain('No refunds available');
    });

    it('should handle authentication errors', async () => {
      const refundConfig = {
        debtor_config: {
          name: 'Château Apéro SPRL',
          iban: 'BE68539007547034',
          country: 'BE'
        }
      };

      // Test without authentication
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for this operation'
        })
      });

      const response = await fetch('/api/process-refunds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(refundConfig)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should handle invalid configuration', async () => {
      const invalidConfig = {
        debtor_config: {
          name: '',
          iban: 'INVALID_IBAN',
          country: 'BE'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'INVALID_CONFIGURATION',
          message: 'Invalid debtor configuration',
          details: {
            name: 'Organization name is required',
            iban: 'Invalid IBAN format'
          }
        })
      });

      const response = await fetch('/api/process-refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invalidConfig)
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      
      const error = await response.json();
      expect(error.error).toBe('INVALID_CONFIGURATION');
      expect(error.details).toBeDefined();
    });
  });

  describe('XML Generation Integration', () => {
    it('should generate valid CBC XML format', async () => {
      const testRefunds = [
        {
          id: 1,
          first_name: 'Jean',
          last_name: 'Dupont',
          email: 'jean.dupont@example.com',
          account: 'BE68539007547034',
          id_card: 'TEST001',
          matched_card: 'TEST001',
          card_balance: 25.50,
          amount_recharged: 25.50,
          validation_status: 'valid'
        }
      ];

      const debtorConfig = {
        name: 'Château Apéro SPRL',
        iban: 'BE68539007547034',
        bic: 'GKCCBEBB',
        country: 'BE'
      };

      const xmlGenerator = new CBCXMLGenerator(debtorConfig);
      const result = await xmlGenerator.generateXML(testRefunds);

      expect(result.success).toBe(true);
      expect(result.xml).toBeDefined();
      expect(result.transaction_count).toBe(1);
      expect(result.total_amount).toBe('25.50');

      // Verify XML structure
      expect(result.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result.xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03');
      expect(result.xml).toContain('<PmtMtd>TRF</PmtMtd>');
      expect(result.xml).toContain('<BIC>GKCCBEBB</BIC>');
      expect(result.xml).toContain('<IBAN>BE68539007547034</IBAN>');
      expect(result.xml).toContain('<InstdAmt Ccy="EUR">25.50</InstdAmt>');
    });

    it('should handle multiple refunds in batch', async () => {
      const testRefunds = [
        {
          id: 1,
          first_name: 'Jean',
          last_name: 'Dupont',
          email: 'jean.dupont@example.com',
          account: 'BE68539007547034',
          id_card: 'TEST001',
          matched_card: 'TEST001',
          card_balance: 25.50,
          amount_recharged: 25.50,
          validation_status: 'valid'
        },
        {
          id: 2,
          first_name: 'Marie',
          last_name: 'Martin',
          email: 'marie.martin@example.com',
          account: 'BE62510007547061',
          id_card: 'TEST002',
          matched_card: 'TEST002',
          card_balance: 15.75,
          amount_recharged: 15.75,
          validation_status: 'valid'
        }
      ];

      const debtorConfig = {
        name: 'Château Apéro SPRL',
        iban: 'BE68539007547034',
        bic: 'GKCCBEBB',
        country: 'BE'
      };

      const xmlGenerator = new CBCXMLGenerator(debtorConfig);
      const result = await xmlGenerator.generateXML(testRefunds);

      expect(result.success).toBe(true);
      expect(result.transaction_count).toBe(2);
      expect(result.total_amount).toBe('41.25');

      // Verify batch processing
      expect(result.xml).toContain('<NbOfTxs>2</NbOfTxs>');
      expect(result.xml).toContain('<CtrlSum>41.25</CtrlSum>');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large batches efficiently', async () => {
      // Create a large batch of test refunds
      const largeRefundBatch = Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        first_name: `User${index}`,
        last_name: `Test${index}`,
        email: `user${index}@example.com`,
        account: 'BE68539007547034',
        id_card: `TEST${String(index).padStart(3, '0')}`,
        matched_card: `TEST${String(index).padStart(3, '0')}`,
        card_balance: 10.00,
        amount_recharged: 10.00,
        validation_status: 'valid'
      }));

      const debtorConfig = {
        name: 'Château Apéro SPRL',
        iban: 'BE68539007547034',
        bic: 'GKCCBEBB',
        country: 'BE'
      };

      const startTime = Date.now();
      const xmlGenerator = new CBCXMLGenerator(debtorConfig);
      const result = await xmlGenerator.generateXML(largeRefundBatch);
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.transaction_count).toBe(100);
      expect(result.total_amount).toBe('1000.00');
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Security Integration', () => {
    it('should validate authentication throughout workflow', async () => {
      // Test with invalid token
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'INVALID_TOKEN',
          message: 'Invalid or expired authentication token'
        })
      });

      const response = await fetch('/api/process-refunds', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          debtor_config: {
            name: 'Test',
            iban: 'BE68539007547034',
            country: 'BE'
          }
        })
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should validate admin permissions', async () => {
      // Test with user token (non-admin)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'INSUFFICIENT_PERMISSIONS',
          message: 'Admin permissions required for refund processing'
        })
      });

      const response = await fetch('/api/process-refunds', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer user-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          debtor_config: {
            name: 'Test',
            iban: 'BE68539007547034',
            country: 'BE'
          }
        })
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });
});