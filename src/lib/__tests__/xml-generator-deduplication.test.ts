/**
 * Deduplication Tests for CBC XML Generator
 * 
 * Tests the deduplication logic that:
 * 1. Removes duplicates with same id_card
 * 2. Merges refunds with different id_card but same IBAN
 */

import { CBCXMLGenerator, ValidatedRefundRecord, DebtorConfiguration } from '../xml-generator';

describe('CBCXMLGenerator Deduplication', () => {
  let generator: CBCXMLGenerator;
  let defaultDebtorConfig: DebtorConfiguration;

  beforeEach(() => {
    defaultDebtorConfig = {
      name: 'Test Organization',
      iban: 'BE68539007547034',
      bic: 'GKCCBEBB',
      country: 'BE',
      address_line1: 'Test Street 123',
      organization_id: '0123456789'
    };
    generator = new CBCXMLGenerator(defaultDebtorConfig);
  });

  it('should remove duplicates with same id_card', async () => {
    const refunds: ValidatedRefundRecord[] = [
      {
        id: 1,
        created_at: '2024-08-04T10:00:00Z',
        first_name: 'John',
        last_name: 'Doe',
        account: 'BE68539007547034',
        email: 'john@example.com',
        id_card: 'ID123456',
        card_balance: 50.0,
        matched_card: 'CARD001',
        amount_recharged: 25.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      },
      {
        id: 2,
        created_at: '2024-08-04T11:00:00Z',
        first_name: 'John',
        last_name: 'Doe',
        account: 'BE68539007547034',
        email: 'john@example.com',
        id_card: 'ID123456', // Same id_card - should be removed
        card_balance: 30.0,
        matched_card: 'CARD002',
        amount_recharged: 15.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      }
    ];

    const result = await generator.generateXML(refunds);
    
    expect(result.success).toBe(true);
    expect(result.transaction_count).toBe(1); // Should have only 1 transaction
    expect(result.total_amount).toBe(25.0); // Should use first occurrence amount
    expect(result.xml_content).toContain('25.00'); // Should contain first amount
    expect(result.xml_content).not.toContain('15.00'); // Should not contain second amount
  });

  it('should merge refunds with different id_card but same IBAN', async () => {
    const refunds: ValidatedRefundRecord[] = [
      {
        id: 1,
        created_at: '2024-08-04T10:00:00Z',
        first_name: 'John',
        last_name: 'Doe',
        account: 'BE68539007547034',
        email: 'john@example.com',
        id_card: 'ID123456',
        card_balance: 50.0,
        matched_card: 'CARD001',
        amount_recharged: 25.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      },
      {
        id: 2,
        created_at: '2024-08-04T11:00:00Z',
        first_name: 'Jane',
        last_name: 'Smith',
        account: 'BE68539007547034', // Same IBAN
        email: 'jane@example.com',
        id_card: 'ID789012', // Different id_card
        card_balance: 30.0,
        matched_card: 'CARD002',
        amount_recharged: 15.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      }
    ];

    const result = await generator.generateXML(refunds);
    
    expect(result.success).toBe(true);
    expect(result.transaction_count).toBe(1); // Should merge into 1 transaction
    expect(result.total_amount).toBe(40.0); // Should sum both amounts (25 + 15)
    expect(result.xml_content).toContain('40.00'); // Should contain merged amount
    expect(result.xml_content).toContain('remboursements regroupes'); // Should indicate merged refunds
  });

  it('should handle mixed scenarios correctly', async () => {
    const refunds: ValidatedRefundRecord[] = [
      // Duplicate id_card group (should keep only first)
      {
        id: 1,
        created_at: '2024-08-04T10:00:00Z',
        first_name: 'John',
        last_name: 'Doe',
        account: 'BE68539007547034',
        email: 'john@example.com',
        id_card: 'ID123456',
        card_balance: 50.0,
        matched_card: 'CARD001',
        amount_recharged: 25.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      },
      {
        id: 2,
        created_at: '2024-08-04T11:00:00Z',
        first_name: 'John',
        last_name: 'Doe',
        account: 'BE68539007547034',
        email: 'john@example.com',
        id_card: 'ID123456', // Duplicate - should be removed
        card_balance: 30.0,
        matched_card: 'CARD002',
        amount_recharged: 15.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      },
      // Different id_card, same IBAN (should be merged with first)
      {
        id: 3,
        created_at: '2024-08-04T12:00:00Z',
        first_name: 'Jane',
        last_name: 'Smith',
        account: 'BE68539007547034', // Same IBAN as above
        email: 'jane@example.com',
        id_card: 'ID789012',
        card_balance: 40.0,
        matched_card: 'CARD003',
        amount_recharged: 20.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      },
      // Completely different IBAN (should remain separate)
      {
        id: 4,
        created_at: '2024-08-04T13:00:00Z',
        first_name: 'Bob',
        last_name: 'Wilson',
        account: 'BE62510007547061', // Different IBAN
        email: 'bob@example.com',
        id_card: 'ID555999',
        card_balance: 60.0,
        matched_card: 'CARD004',
        amount_recharged: 30.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      }
    ];

    const result = await generator.generateXML(refunds);
    
    expect(result.success).toBe(true);
    expect(result.transaction_count).toBe(2); // Should have 2 transactions (1 merged + 1 separate)
    expect(result.total_amount).toBe(75.0); // Should sum correctly: (25 + 20) + 30 = 75
    
    // Check that merged transaction is created
    expect(result.xml_content).toContain('45.00'); // Merged amount (25 + 20)
    expect(result.xml_content).toContain('30.00'); // Separate transaction
    expect(result.xml_content).toContain('remboursements regroupes'); // Should indicate merged refunds
  });

  it('should preserve case insensitive id_card comparison', async () => {
    const refunds: ValidatedRefundRecord[] = [
      {
        id: 1,
        created_at: '2024-08-04T10:00:00Z',
        first_name: 'John',
        last_name: 'Doe',
        account: 'BE68539007547034',
        email: 'john@example.com',
        id_card: 'id123456', // lowercase
        card_balance: 50.0,
        matched_card: 'CARD001',
        amount_recharged: 25.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      },
      {
        id: 2,
        created_at: '2024-08-04T11:00:00Z',
        first_name: 'John',
        last_name: 'Doe',
        account: 'BE68539007547034',
        email: 'john@example.com',
        id_card: 'ID123456', // uppercase - should be considered duplicate
        card_balance: 30.0,
        matched_card: 'CARD002',
        amount_recharged: 15.0,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      }
    ];

    const result = await generator.generateXML(refunds);
    
    expect(result.success).toBe(true);
    expect(result.transaction_count).toBe(1); // Should remove case-insensitive duplicate
    expect(result.total_amount).toBe(25.0); // Should use first occurrence
  });
}); 