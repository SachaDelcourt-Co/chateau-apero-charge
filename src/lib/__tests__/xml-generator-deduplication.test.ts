/**
 * Test file for XML Generator Deduplication
 * 
 * This test validates that the CBCXMLGenerator correctly identifies and removes
 * duplicate refunds based on IBAN, amount, and card ID.
 */

import { CBCXMLGenerator, ValidatedRefundRecord, DebtorConfiguration } from '../xml-generator';

describe('CBCXMLGenerator Deduplication', () => {
  const mockDebtorConfig: DebtorConfiguration = {
    name: 'Test Organization',
    iban: 'BE68539007547034',
    bic: 'GKCCBEBB',
    country: 'BE',
    organization_id: 'BE1022.001.995',
    organization_issuer: 'KBO-BCE'
  };

  const generator = new CBCXMLGenerator(mockDebtorConfig);

  describe('Duplicate Detection and Removal', () => {
    it('should remove exact duplicates (same IBAN, amount, and card)', async () => {
      const refundsWithDuplicates: ValidatedRefundRecord[] = [
        {
          id: 1,
          created_at: '2025-08-15T07:00:00Z',
          first_name: 'John',
          last_name: 'Doe',
          account: 'BE18001778394865',
          email: 'john@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD001',
          amount_recharged: 28.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        {
          id: 2,
          created_at: '2025-08-15T07:05:00Z',
          first_name: 'John',
          last_name: 'Doe',
          account: 'BE18001778394865', // Same IBAN
          email: 'john@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD001', // Same card
          amount_recharged: 28.00, // Same amount
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        {
          id: 3,
          created_at: '2025-08-15T07:10:00Z',
          first_name: 'Jane',
          last_name: 'Smith',
          account: 'BE98363205490193',
          email: 'jane@example.com',
          id_card: '789012',
          card_balance: 0,
          matched_card: 'CARD002',
          amount_recharged: 15.50,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        }
      ];

      const result = await generator.generateXML(refundsWithDuplicates);

      expect(result.success).toBe(true);
      expect(result.transaction_count).toBe(2); // Should be 2, not 3
      expect(result.total_amount).toBe(43.50); // 28.00 + 15.50
      expect(result.warnings).toContain('1 duplicate transfer(s) removed (same IBAN, amount, and card ID)');
    });

    it('should handle case variations in IBAN', async () => {
      const refundsWithIBANVariations: ValidatedRefundRecord[] = [
        {
          id: 1,
          created_at: '2025-08-15T07:00:00Z',
          first_name: 'Test',
          last_name: 'User',
          account: 'be18001778394865', // lowercase
          email: 'test@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD001',
          amount_recharged: 10.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        {
          id: 2,
          created_at: '2025-08-15T07:05:00Z',
          first_name: 'Test',
          last_name: 'User',
          account: 'BE18001778394865', // uppercase
          email: 'test@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD001',
          amount_recharged: 10.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        }
      ];

      const result = await generator.generateXML(refundsWithIBANVariations);

      expect(result.success).toBe(true);
      expect(result.transaction_count).toBe(1); // Should detect as duplicate
      expect(result.total_amount).toBe(10.00);
      expect(result.warnings).toContain('1 duplicate transfer(s) removed (same IBAN, amount, and card ID)');
    });

    it('should NOT remove transactions with same IBAN but different amounts', async () => {
      const refundsDifferentAmounts: ValidatedRefundRecord[] = [
        {
          id: 1,
          created_at: '2025-08-15T07:00:00Z',
          first_name: 'John',
          last_name: 'Doe',
          account: 'BE18001778394865',
          email: 'john@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD001',
          amount_recharged: 28.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        {
          id: 2,
          created_at: '2025-08-15T07:05:00Z',
          first_name: 'John',
          last_name: 'Doe',
          account: 'BE18001778394865', // Same IBAN
          email: 'john@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD001', // Same card
          amount_recharged: 15.00, // Different amount
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        }
      ];

      const result = await generator.generateXML(refundsDifferentAmounts);

      expect(result.success).toBe(true);
      expect(result.transaction_count).toBe(2); // Should keep both
      expect(result.total_amount).toBe(43.00); // 28.00 + 15.00
      expect(result.warnings).not.toContain('duplicate transfer(s) removed');
    });

    it('should NOT remove transactions with same IBAN and amount but different cards', async () => {
      const refundsDifferentCards: ValidatedRefundRecord[] = [
        {
          id: 1,
          created_at: '2025-08-15T07:00:00Z',
          first_name: 'John',
          last_name: 'Doe',
          account: 'BE18001778394865',
          email: 'john@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD001',
          amount_recharged: 28.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        {
          id: 2,
          created_at: '2025-08-15T07:05:00Z',
          first_name: 'John',
          last_name: 'Doe',
          account: 'BE18001778394865', // Same IBAN
          email: 'john@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD002', // Different card
          amount_recharged: 28.00, // Same amount
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        }
      ];

      const result = await generator.generateXML(refundsDifferentCards);

      expect(result.success).toBe(true);
      expect(result.transaction_count).toBe(2); // Should keep both
      expect(result.total_amount).toBe(56.00); // 28.00 + 28.00
      expect(result.warnings).not.toContain('duplicate transfer(s) removed');
    });

    it('should handle multiple sets of duplicates', async () => {
      const refundsMultipleDuplicates: ValidatedRefundRecord[] = [
        // First duplicate pair
        {
          id: 1,
          created_at: '2025-08-15T07:00:00Z',
          first_name: 'Alice',
          last_name: 'Johnson',
          account: 'BE18001778394865',
          email: 'alice@example.com',
          id_card: '111111',
          card_balance: 0,
          matched_card: 'CARD001',
          amount_recharged: 20.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        {
          id: 2,
          created_at: '2025-08-15T07:05:00Z',
          first_name: 'Alice',
          last_name: 'Johnson',
          account: 'BE18001778394865',
          email: 'alice@example.com',
          id_card: '111111',
          card_balance: 0,
          matched_card: 'CARD001',
          amount_recharged: 20.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        // Second duplicate pair
        {
          id: 3,
          created_at: '2025-08-15T07:10:00Z',
          first_name: 'Bob',
          last_name: 'Williams',
          account: 'BE98363205490193',
          email: 'bob@example.com',
          id_card: '222222',
          card_balance: 0,
          matched_card: 'CARD002',
          amount_recharged: 30.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        {
          id: 4,
          created_at: '2025-08-15T07:15:00Z',
          first_name: 'Bob',
          last_name: 'Williams',
          account: 'BE98363205490193',
          email: 'bob@example.com',
          id_card: '222222',
          card_balance: 0,
          matched_card: 'CARD002',
          amount_recharged: 30.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        },
        // Unique transaction
        {
          id: 5,
          created_at: '2025-08-15T07:20:00Z',
          first_name: 'Charlie',
          last_name: 'Brown',
          account: 'BE86000450240250',
          email: 'charlie@example.com',
          id_card: '333333',
          card_balance: 0,
          matched_card: 'CARD003',
          amount_recharged: 25.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        }
      ];

      const result = await generator.generateXML(refundsMultipleDuplicates);

      expect(result.success).toBe(true);
      expect(result.transaction_count).toBe(3); // Should be 3, not 5
      expect(result.total_amount).toBe(75.00); // 20.00 + 30.00 + 25.00
      expect(result.warnings).toContain('2 duplicate transfer(s) removed (same IBAN, amount, and card ID)');
    });
  });

  describe('IBAN Normalization', () => {
    it('should normalize IBANs to uppercase', async () => {
      const refundWithLowercaseIBAN: ValidatedRefundRecord[] = [
        {
          id: 1,
          created_at: '2025-08-15T07:00:00Z',
          first_name: 'Test',
          last_name: 'User',
          account: 'be18 0017 7839 4865', // lowercase with spaces
          email: 'test@example.com',
          id_card: '123456',
          card_balance: 0,
          matched_card: 'CARD001',
          amount_recharged: 10.00,
          card_exists: true,
          validation_status: 'valid',
          validation_notes: []
        }
      ];

      const result = await generator.generateXML(refundWithLowercaseIBAN);

      expect(result.success).toBe(true);
      expect(result.xml_content).toContain('BE18001778394865'); // Should be normalized
    });
  });
});