/**
 * Unit Tests for CBC XML Generator
 * 
 * Comprehensive test suite for the CBCXMLGenerator service class
 * covering all functionality including XML generation, validation,
 * error handling, and CBC specifications compliance.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  CBCXMLGenerator, 
  DebtorConfiguration, 
  ValidatedRefundRecord, 
  XMLGenerationOptions,
  XMLGeneratorUtils,
  XMLErrorType
} from '../xml-generator';

describe('CBCXMLGenerator', () => {
  let defaultDebtorConfig: DebtorConfiguration;
  let defaultOptions: XMLGenerationOptions;
  let sampleRefunds: ValidatedRefundRecord[];

  beforeEach(() => {
    defaultDebtorConfig = {
      name: 'Festival Chateau Apero ASBL',
      iban: 'BE68539007547034',
      bic: 'GKCCBEBB',
      address_line1: 'Rue de la Fete 123',
      address_line2: '5000 Namur',
      country: 'BE',
      organization_id: '0123456789',
      organization_issuer: 'KBO-BCE'
    };

    defaultOptions = {
      message_id_prefix: 'CBC',
      payment_info_id_prefix: 'PMT',
      instruction_priority: 'NORM',
      service_level: 'SEPA',
      category_purpose: 'SUPP',
      charge_bearer: 'SLEV',
      batch_booking: true
    };

    sampleRefunds = [
      {
        id: 1,
        created_at: '2025-07-28T10:00:00Z',
        first_name: 'Jean',
        last_name: 'Dupont',
        account: 'BE62510007547061',
        email: 'jean.dupont@example.com',
        id_card: 'CARD001',
        card_balance: 25.50,
        matched_card: 'CARD001',
        amount_recharged: 25.50,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      },
      {
        id: 2,
        created_at: '2025-07-28T10:05:00Z',
        first_name: 'Marie',
        last_name: 'Martin',
        account: 'BE43068999999501',
        email: 'marie.martin@example.com',
        id_card: 'CARD002',
        card_balance: 15.75,
        matched_card: 'CARD002',
        amount_recharged: 15.75,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      }
    ];
  });

  describe('Constructor and Configuration', () => {
    it('should create generator with valid configuration', () => {
      expect(() => new CBCXMLGenerator(defaultDebtorConfig, defaultOptions)).not.toThrow();
    });

    it('should throw error for missing debtor name', () => {
      const invalidConfig = { ...defaultDebtorConfig, name: '' };
      expect(() => new CBCXMLGenerator(invalidConfig)).toThrow('Debtor name is required');
    });

    it('should throw error for missing debtor IBAN', () => {
      const invalidConfig = { ...defaultDebtorConfig, iban: '' };
      expect(() => new CBCXMLGenerator(invalidConfig)).toThrow('Debtor IBAN is required');
    });

    it('should throw error for invalid debtor IBAN', () => {
      const invalidConfig = { ...defaultDebtorConfig, iban: 'INVALID_IBAN' };
      expect(() => new CBCXMLGenerator(invalidConfig)).toThrow('Invalid debtor IBAN format');
    });

    it('should throw error for missing country', () => {
      const invalidConfig = { ...defaultDebtorConfig, country: '' };
      expect(() => new CBCXMLGenerator(invalidConfig)).toThrow('Debtor country is required');
    });

    it('should throw error for invalid characters in debtor name', () => {
      const invalidConfig = { ...defaultDebtorConfig, name: 'Test@Company#Invalid' };
      expect(() => new CBCXMLGenerator(invalidConfig)).toThrow('Debtor name contains invalid characters');
    });
  });

  describe('XML Generation', () => {
    let generator: CBCXMLGenerator;

    beforeEach(() => {
      generator = new CBCXMLGenerator(defaultDebtorConfig, defaultOptions);
    });

    it('should generate valid XML for single refund', async () => {
      const singleRefund = [sampleRefunds[0]];
      const result = await generator.generateXML(singleRefund);

      expect(result.success).toBe(true);
      expect(result.xml_content).toBeDefined();
      expect(result.message_id).toBeDefined();
      expect(result.transaction_count).toBe(1);
      expect(result.total_amount).toBe(25.50);
      expect(result.generation_time_ms).toBeGreaterThan(0);
    });

    it('should generate valid XML for multiple refunds', async () => {
      const result = await generator.generateXML(sampleRefunds);

      expect(result.success).toBe(true);
      expect(result.xml_content).toBeDefined();
      expect(result.transaction_count).toBe(2);
      expect(result.total_amount).toBe(41.25);
    });

    it('should include proper XML structure', async () => {
      const result = await generator.generateXML(sampleRefunds);

      expect(result.xml_content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result.xml_content).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"');
      expect(result.xml_content).toContain('<CstmrCdtTrfInitn>');
      expect(result.xml_content).toContain('<GrpHdr>');
      expect(result.xml_content).toContain('<PmtInf>');
      expect(result.xml_content).toContain('<CdtTrfTxInf>');
    });

    it('should include CBC-specific elements', async () => {
      const result = await generator.generateXML(sampleRefunds);

      expect(result.xml_content).toContain('<BIC>GKCCBEBB</BIC>');
      expect(result.xml_content).toContain('<PmtMtd>TRF</PmtMtd>');
      expect(result.xml_content).toContain('<SvcLvl>');
      expect(result.xml_content).toContain('<Cd>SEPA</Cd>');
      expect(result.xml_content).toContain('<CtgyPurp>');
      expect(result.xml_content).toContain('<Cd>SUPP</Cd>');
      expect(result.xml_content).toContain('<ChrgBr>SLEV</ChrgBr>');
      expect(result.xml_content).toContain('Ccy="EUR"');
    });

    it('should generate unique message IDs', async () => {
      const result1 = await generator.generateXML([sampleRefunds[0]]);
      const result2 = await generator.generateXML([sampleRefunds[1]]);

      expect(result1.message_id).not.toBe(result2.message_id);
    });

    it('should handle custom execution date', async () => {
      const customOptions = { ...defaultOptions, requested_execution_date: '2025-08-01' };
      const customGenerator = new CBCXMLGenerator(defaultDebtorConfig, customOptions);
      
      const result = await customGenerator.generateXML(sampleRefunds);
      expect(result.xml_content).toContain('<ReqdExctnDt>2025-08-01</ReqdExctnDt>');
    });

    it('should handle empty refunds array', async () => {
      const result = await generator.generateXML([]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No refund data provided');
    });
  });

  describe('Data Validation', () => {
    let generator: CBCXMLGenerator;

    beforeEach(() => {
      generator = new CBCXMLGenerator(defaultDebtorConfig, defaultOptions);
    });

    it('should reject refund with missing first name', async () => {
      const invalidRefund = { ...sampleRefunds[0], first_name: '' };
      const result = await generator.generateXML([invalidRefund]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('First name is required');
    });

    it('should reject refund with missing last name', async () => {
      const invalidRefund = { ...sampleRefunds[0], last_name: '' };
      const result = await generator.generateXML([invalidRefund]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Last name is required');
    });

    it('should reject refund with invalid IBAN', async () => {
      const invalidRefund = { ...sampleRefunds[0], account: 'INVALID_IBAN' };
      const result = await generator.generateXML([invalidRefund]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid IBAN format');
    });

    it('should reject refund with invalid amount', async () => {
      const invalidRefund = { ...sampleRefunds[0], amount_recharged: -10 };
      const result = await generator.generateXML([invalidRefund]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Amount must be a positive number');
    });

    it('should reject refund with amount exceeding limit', async () => {
      const invalidRefund = { ...sampleRefunds[0], amount_recharged: 1000000000 };
      const result = await generator.generateXML([invalidRefund]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Amount exceeds maximum limit (999,999,999.99 EUR)');
    });

    it('should reject refund with name containing invalid characters', async () => {
      const invalidRefund = { ...sampleRefunds[0], first_name: 'Jean@Invalid#Name' };
      const result = await generator.generateXML([invalidRefund]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Name contains invalid characters');
    });

    it('should reject refund with name exceeding length limit', async () => {
      const longName = 'A'.repeat(71);
      const invalidRefund = { ...sampleRefunds[0], first_name: longName };
      const result = await generator.generateXML([invalidRefund]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Name exceeds maximum length (70 characters)');
    });

    it('should include warnings for refunds with validation warnings', async () => {
      const warningRefund = { 
        ...sampleRefunds[0], 
        validation_status: 'warning' as const,
        validation_notes: ['Card matched using id_card field']
      };
      const result = await generator.generateXML([warningRefund]);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('Card matched using id_card field');
    });
  });

  describe('IBAN Validation', () => {
    it('should validate correct Belgian IBANs', () => {
      const validIBANs = [
        'BE68539007547034',
        'BE62510007547061',
        'BE43068999999501',
        'BE 68 5390 0754 7034' // With spaces
      ];

      validIBANs.forEach(iban => {
        expect(XMLGeneratorUtils.isValidBelgianIBAN(iban)).toBe(true);
      });
    });

    it('should reject invalid Belgian IBANs', () => {
      const invalidIBANs = [
        'BE68539007547035', // Wrong checksum
        'FR1420041010050500013M02606', // French IBAN
        'BE685390075470', // Too short
        'BE685390075470345', // Too long
        'INVALID_IBAN',
        '',
        null,
        undefined
      ];

      invalidIBANs.forEach(iban => {
        expect(XMLGeneratorUtils.isValidBelgianIBAN(iban as any)).toBe(false);
      });
    });
  });

  describe('Text Sanitization', () => {
    it('should sanitize text with invalid characters', () => {
      const invalidText = 'Test@Company#With$Invalid%Characters';
      const sanitized = XMLGeneratorUtils.sanitizeText(invalidText);
      
      expect(sanitized).toBe('Test Company With Invalid Characters');
    });

    it('should preserve valid characters', () => {
      const validText = 'Valid Company Name-123 (Belgium) Ltd.';
      const sanitized = XMLGeneratorUtils.sanitizeText(validText);
      
      expect(sanitized).toBe(validText);
    });

    it('should handle empty and null strings', () => {
      expect(XMLGeneratorUtils.sanitizeText('')).toBe('');
      expect(XMLGeneratorUtils.sanitizeText(null as any)).toBe('');
      expect(XMLGeneratorUtils.sanitizeText(undefined as any)).toBe('');
    });

    it('should clean up multiple spaces', () => {
      const textWithSpaces = 'Text   with    multiple     spaces';
      const sanitized = XMLGeneratorUtils.sanitizeText(textWithSpaces);
      
      expect(sanitized).toBe('Text with multiple spaces');
    });
  });

  describe('Amount Formatting', () => {
    it('should format amounts with two decimal places', () => {
      expect(XMLGeneratorUtils.formatAmount(25.5)).toBe('25.50');
      expect(XMLGeneratorUtils.formatAmount(100)).toBe('100.00');
      expect(XMLGeneratorUtils.formatAmount(0.1)).toBe('0.10');
      expect(XMLGeneratorUtils.formatAmount(999999.999)).toBe('1000000.00'); // JavaScript rounds 999999.999 to 1000000
    });

    it('should handle zero and negative amounts', () => {
      expect(XMLGeneratorUtils.formatAmount(0)).toBe('0.00');
      expect(XMLGeneratorUtils.formatAmount(-25.5)).toBe('-25.50');
    });
  });

  describe('XML Structure Validation', () => {
    let generator: CBCXMLGenerator;

    beforeEach(() => {
      generator = new CBCXMLGenerator(defaultDebtorConfig, defaultOptions);
    });

    it('should generate proper GroupHeader structure', async () => {
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<GrpHdr>');
      expect(result.xml_content).toContain('<MsgId>');
      expect(result.xml_content).toContain('<CreDtTm>');
      expect(result.xml_content).toContain('<NbOfTxs>2</NbOfTxs>');
      expect(result.xml_content).toContain('<CtrlSum>41.25</CtrlSum>');
      expect(result.xml_content).toContain('<InitgPty>');
      expect(result.xml_content).toContain('<Nm>Festival Chateau Apero ASBL</Nm>');
    });

    it('should generate proper PaymentInformation structure', async () => {
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<PmtInf>');
      expect(result.xml_content).toContain('<PmtInfId>');
      expect(result.xml_content).toContain('<PmtMtd>TRF</PmtMtd>');
      expect(result.xml_content).toContain('<BtchBookg>true</BtchBookg>');
      expect(result.xml_content).toContain('<ReqdExctnDt>');
      expect(result.xml_content).toContain('<Dbtr>');
      expect(result.xml_content).toContain('<DbtrAcct>');
      expect(result.xml_content).toContain('<DbtrAgt>');
    });

    it('should generate proper CreditTransferTransactionInformation structure', async () => {
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<CdtTrfTxInf>');
      expect(result.xml_content).toContain('<PmtId>');
      expect(result.xml_content).toContain('<InstrId>');
      expect(result.xml_content).toContain('<EndToEndId>');
      expect(result.xml_content).toContain('<Amt>');
      expect(result.xml_content).toContain('<InstdAmt Ccy="EUR">');
      expect(result.xml_content).toContain('<Cdtr>');
      expect(result.xml_content).toContain('<CdtrAcct>');
      expect(result.xml_content).toContain('<RmtInf>');
    });

    it('should include organization ID when provided', async () => {
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<OrgId>');
      expect(result.xml_content).toContain('<Id>0123456789</Id>');
      expect(result.xml_content).toContain('<Issr>KBO-BCE</Issr>');
    });

    it('should include address when provided', async () => {
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<PstlAdr>');
      expect(result.xml_content).toContain('<Ctry>BE</Ctry>');
      expect(result.xml_content).toContain('<AdrLine>Rue de la Fete 123</AdrLine>');
      expect(result.xml_content).toContain('<AdrLine>5000 Namur</AdrLine>');
    });

    it('should generate proper remittance information', async () => {
      const result = await generator.generateXML([sampleRefunds[0]]);
      
      expect(result.xml_content).toContain('<RmtInf>');
      expect(result.xml_content).toContain('<Ustrd>');
      expect(result.xml_content).toContain('Remboursement carte CARD001');
      expect(result.xml_content).toContain('Montant: 25.50');
    });
  });

  describe('Error Handling', () => {
    it('should handle generator creation errors gracefully', () => {
      expect(() => {
        new CBCXMLGenerator({} as DebtorConfiguration);
      }).toThrow();
    });

    it('should return proper error structure for validation failures', async () => {
      const generator = new CBCXMLGenerator(defaultDebtorConfig);
      const invalidRefund = { ...sampleRefunds[0], first_name: '' };
      
      const result = await generator.generateXML([invalidRefund]);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.generation_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed valid and invalid refunds', async () => {
      const generator = new CBCXMLGenerator(defaultDebtorConfig);
      const mixedRefunds = [
        sampleRefunds[0], // Valid
        { ...sampleRefunds[1], account: 'INVALID' } // Invalid
      ];
      
      const result = await generator.generateXML(mixedRefunds);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Configuration Options', () => {
    it('should use custom message ID prefix', async () => {
      const customOptions = { ...defaultOptions, message_id_prefix: 'CUSTOM' };
      const generator = new CBCXMLGenerator(defaultDebtorConfig, customOptions);
      
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.message_id!.startsWith('CUSTOM')).toBe(true);
    });

    it('should use custom payment info ID prefix', async () => {
      const customOptions = { ...defaultOptions, payment_info_id_prefix: 'PAYMENT' };
      const generator = new CBCXMLGenerator(defaultDebtorConfig, customOptions);
      
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<PmtInfId>PAYMENT_');
    });

    it('should use custom instruction priority', async () => {
      const customOptions = { ...defaultOptions, instruction_priority: 'HIGH' as const };
      const generator = new CBCXMLGenerator(defaultDebtorConfig, customOptions);
      
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<InstrPrty>HIGH</InstrPrty>');
    });

    it('should use custom service level', async () => {
      const customOptions = { ...defaultOptions, service_level: 'PRPT' as const };
      const generator = new CBCXMLGenerator(defaultDebtorConfig, customOptions);
      
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<SvcLvl>');
      expect(result.xml_content).toContain('<Cd>PRPT</Cd>');
    });

    it('should use custom category purpose', async () => {
      const customOptions = { ...defaultOptions, category_purpose: 'SALA' as const };
      const generator = new CBCXMLGenerator(defaultDebtorConfig, customOptions);
      
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<CtgyPurp>');
      expect(result.xml_content).toContain('<Cd>SALA</Cd>');
    });

    it('should handle batch booking false', async () => {
      const customOptions = { ...defaultOptions, batch_booking: false };
      const generator = new CBCXMLGenerator(defaultDebtorConfig, customOptions);
      
      const result = await generator.generateXML(sampleRefunds);
      
      expect(result.xml_content).toContain('<BtchBookg>false</BtchBookg>');
    });
  });

  describe('Performance and Edge Cases', () => {
    let generator: CBCXMLGenerator;

    beforeEach(() => {
      generator = new CBCXMLGenerator(defaultDebtorConfig, defaultOptions);
    });

    it('should handle large number of refunds', async () => {
      const largeRefundSet = Array.from({ length: 100 }, (_, i) => ({
        ...sampleRefunds[0],
        id: i + 1,
        first_name: `User${i + 1}`,
        account: 'BE68539007547034'
      }));
      
      const result = await generator.generateXML(largeRefundSet);
      
      expect(result.success).toBe(true);
      expect(result.transaction_count).toBe(100);
      expect(result.generation_time_ms).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle refunds with minimal data', async () => {
      const minimalRefund: ValidatedRefundRecord = {
        id: 999,
        created_at: '2025-07-28T10:00:00Z',
        first_name: 'A',
        last_name: 'B',
        account: 'BE68539007547034',
        email: 'a@b.com',
        id_card: 'MIN',
        card_balance: 0.01,
        matched_card: 'MIN',
        amount_recharged: 0.01,
        card_exists: true,
        validation_status: 'valid',
        validation_notes: []
      };
      
      const result = await generator.generateXML([minimalRefund]);
      
      expect(result.success).toBe(true);
      expect(result.total_amount).toBe(0.01);
    });

    it('should handle refunds with maximum allowed amounts', async () => {
      const maxAmountRefund = {
        ...sampleRefunds[0],
        amount_recharged: 999999999.99
      };
      
      const result = await generator.generateXML([maxAmountRefund]);
      
      expect(result.success).toBe(true);
      expect(result.total_amount).toBe(999999999.99);
    });
  });
});