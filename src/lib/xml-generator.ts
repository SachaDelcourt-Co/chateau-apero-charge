/**
 * CBC XML Generator Service
 * 
 * Generates XML files in pain.001.001.03 format (ISO 20022 standard) for CBC bank transfers.
 * This service processes validated refund data and generates bank-compatible XML files
 * following the exact CBC specifications.
 * 
 * Key Features:
 * - Generates pain.001.001.03 format XML
 * - Handles multiple refund transactions in a single batch
 * - Validates IBAN format for Belgian accounts
 * - Implements proper XML structure with all required elements
 * - Generates unique message IDs and transaction references
 * - Comprehensive error handling and validation
 */

// TypeScript interfaces for XML generation
export interface ValidatedRefundRecord {
  id: number;
  created_at: string;
  first_name: string;
  last_name: string;
  account: string;
  email: string;
  id_card: string;
  card_balance: number;
  matched_card: string;
  amount_recharged: number;
  card_exists: boolean;
  validation_status: 'valid' | 'warning' | 'error';
  validation_notes: string[];
}

export interface DebtorConfiguration {
  name: string;
  iban: string;
  bic: string;
  address_line1?: string;
  address_line2?: string;
  country: string;
  organization_id?: string;
  organization_issuer?: string;
}

export interface XMLGenerationOptions {
  message_id_prefix?: string;
  payment_info_id_prefix?: string;
  instruction_priority?: 'NORM' | 'HIGH';
  service_level?: 'SEPA' | 'PRPT';
  category_purpose?: 'SUPP' | 'SALA' | 'INTC' | 'TREA' | 'TAXS';
  charge_bearer?: 'SLEV' | 'SHAR';
  batch_booking?: boolean;
  requested_execution_date?: string;
}

export interface XMLGenerationResult {
  success: boolean;
  xml_content?: string;
  message_id?: string;
  transaction_count?: number;
  total_amount?: number;
  errors?: string[];
  warnings?: string[];
  generation_time_ms?: number;
}

export interface XMLValidationError {
  field: string;
  value: any;
  error_message: string;
  refund_id?: number;
}

// Error types for XML generation
export enum XMLErrorType {
  INVALID_IBAN = 'INVALID_IBAN',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_CHARACTER_SET = 'INVALID_CHARACTER_SET',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  XML_GENERATION_ERROR = 'XML_GENERATION_ERROR'
}

export class CBCXMLGenerator {
  private readonly CBC_BIC = 'GKCCBEBB';
  private readonly CURRENCY = 'EUR';
  private readonly PAYMENT_METHOD = 'TRF';
  private readonly NAMESPACE = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03';
  private readonly XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
  
  // Allowed characters per CBC specifications - updated for international names
  private readonly ALLOWED_CHARS_REGEX = /^[a-zA-Z0-9À-ÿ\/\-\?:\(\)\.,'\+ ]*$/;
  
  private debtorConfig: DebtorConfiguration;
  private options: XMLGenerationOptions;

  constructor(debtorConfig: DebtorConfiguration, options: XMLGenerationOptions = {}) {
    this.debtorConfig = debtorConfig;
    this.options = {
      message_id_prefix: 'CBC',
      payment_info_id_prefix: 'PMT',
      instruction_priority: 'NORM',
      service_level: 'SEPA',
      category_purpose: 'SUPP',
      charge_bearer: 'SLEV',
      batch_booking: true,
      ...options
    };

    this.validateDebtorConfiguration();
  }

  /**
   * Generate XML for CBC bank transfers from validated refund data
   */
  public async generateXML(refunds: ValidatedRefundRecord[]): Promise<XMLGenerationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      console.log(`[CBCXMLGenerator] Starting XML generation for ${refunds.length} refunds`);

      // Validate input data
      const validationResult = this.validateRefundData(refunds);
      if (!validationResult.isValid) {
        return {
          success: false,
          errors: validationResult.errors.map(e => e.error_message),
          generation_time_ms: Date.now() - startTime
        };
      }

      // Add validation warnings
      warnings.push(...validationResult.warnings);

      // Generate unique identifiers
      const messageId = this.generateMessageId();
      const paymentInfoId = this.generatePaymentInfoId();
      const creationDateTime = new Date().toISOString();
      const executionDate = this.options.requested_execution_date || 
                           new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Calculate totals
      const totalAmount = refunds.reduce((sum, refund) => sum + refund.amount_recharged, 0);
      const transactionCount = refunds.length;

      // Generate XML content
      const xmlContent = this.buildXMLDocument({
        messageId,
        paymentInfoId,
        creationDateTime,
        executionDate,
        transactionCount,
        totalAmount,
        refunds
      });

      console.log(`[CBCXMLGenerator] XML generation completed successfully`);
      console.log(`[CBCXMLGenerator] Message ID: ${messageId}`);
      console.log(`[CBCXMLGenerator] Transactions: ${transactionCount}`);
      console.log(`[CBCXMLGenerator] Total Amount: €${totalAmount.toFixed(2)}`);

      return {
        success: true,
        xml_content: xmlContent,
        message_id: messageId,
        transaction_count: transactionCount,
        total_amount: totalAmount,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        generation_time_ms: Date.now() - startTime
      };

    } catch (error) {
      console.error('[CBCXMLGenerator] Error during XML generation:', error);
      return {
        success: false,
        errors: [`XML generation failed: ${error.message}`],
        generation_time_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Validate debtor configuration
   */
  private validateDebtorConfiguration(): void {
    if (!this.debtorConfig.name || this.debtorConfig.name.trim().length === 0) {
      throw new Error('Debtor name is required');
    }

    if (!this.debtorConfig.iban) {
      throw new Error('Debtor IBAN is required');
    }

    if (!this.isValidBelgianIBAN(this.debtorConfig.iban)) {
      throw new Error(`Invalid debtor IBAN format: ${this.debtorConfig.iban}`);
    }

    if (!this.debtorConfig.country) {
      throw new Error('Debtor country is required');
    }

    // Validate character set
    if (!this.ALLOWED_CHARS_REGEX.test(this.debtorConfig.name)) {
      throw new Error('Debtor name contains invalid characters');
    }
  }

  /**
   * Validate refund data before XML generation
   */
  private validateRefundData(refunds: ValidatedRefundRecord[]): {
    isValid: boolean;
    errors: XMLValidationError[];
    warnings: string[];
  } {
    const errors: XMLValidationError[] = [];
    const warnings: string[] = [];

    if (!refunds || refunds.length === 0) {
      errors.push({
        field: 'refunds',
        value: refunds,
        error_message: 'No refund data provided'
      });
      return { isValid: false, errors, warnings };
    }

    // Validate each refund
    for (const refund of refunds) {
      // Validate required fields
      if (!refund.first_name || refund.first_name.trim().length === 0) {
        errors.push({
          field: 'first_name',
          value: refund.first_name,
          error_message: 'First name is required',
          refund_id: refund.id
        });
      }

      if (!refund.last_name || refund.last_name.trim().length === 0) {
        errors.push({
          field: 'last_name',
          value: refund.last_name,
          error_message: 'Last name is required',
          refund_id: refund.id
        });
      }

      if (!refund.account || refund.account.trim().length === 0) {
        errors.push({
          field: 'account',
          value: refund.account,
          error_message: 'Account (IBAN) is required',
          refund_id: refund.id
        });
      } else if (!this.isValidBelgianIBAN(refund.account)) {
        errors.push({
          field: 'account',
          value: refund.account,
          error_message: 'Invalid IBAN format',
          refund_id: refund.id
        });
      }

      // Validate amount
      if (typeof refund.amount_recharged !== 'number' || refund.amount_recharged <= 0) {
        errors.push({
          field: 'amount_recharged',
          value: refund.amount_recharged,
          error_message: 'Amount must be a positive number',
          refund_id: refund.id
        });
      } else if (refund.amount_recharged > 999999999.99) {
        errors.push({
          field: 'amount_recharged',
          value: refund.amount_recharged,
          error_message: 'Amount exceeds maximum limit (999,999,999.99 EUR)',
          refund_id: refund.id
        });
      }

      // Validate character sets
      const fullName = `${refund.first_name} ${refund.last_name}`;
      if (!this.ALLOWED_CHARS_REGEX.test(fullName)) {
        errors.push({
          field: 'name',
          value: fullName,
          error_message: 'Name contains invalid characters',
          refund_id: refund.id
        });
      }

      // Check name length (CBC limit: 70 characters)
      if (fullName.length > 70) {
        errors.push({
          field: 'name',
          value: fullName,
          error_message: 'Name exceeds maximum length (70 characters)',
          refund_id: refund.id
        });
      }

      // Add warnings for validation status
      if (refund.validation_status === 'warning') {
        warnings.push(`Refund ${refund.id}: ${refund.validation_notes.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate Belgian IBAN format
   */
  private isValidBelgianIBAN(iban: string): boolean {
    if (!iban) return false;
    
    // Remove spaces and convert to uppercase
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    
    // Belgian IBAN format: BE + 2 check digits + 12 digits
    const belgianIbanRegex = /^BE\d{14}$/;
    
    if (!belgianIbanRegex.test(cleanIban)) {
      return false;
    }

    // Validate IBAN check digits using mod-97 algorithm
    return this.validateIBANChecksum(cleanIban);
  }

  /**
   * Validate IBAN checksum using mod-97 algorithm
   */
  private validateIBANChecksum(iban: string): boolean {
    // Move first 4 characters to end
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    
    // Replace letters with numbers (A=10, B=11, ..., Z=35)
    const numericString = rearranged.replace(/[A-Z]/g, (char) => 
      (char.charCodeAt(0) - 55).toString()
    );
    
    // Calculate mod 97
    let remainder = 0;
    for (let i = 0; i < numericString.length; i++) {
      remainder = (remainder * 10 + parseInt(numericString[i])) % 97;
    }
    
    return remainder === 1;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${this.options.message_id_prefix}${timestamp}_${random}`;
  }

  /**
   * Generate payment information ID
   */
  private generatePaymentInfoId(): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    return `${this.options.payment_info_id_prefix}_${timestamp}`;
  }

  /**
   * Generate transaction instruction ID
   */
  private generateInstructionId(refundId: number): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
    return `TXN${refundId.toString().padStart(6, '0')}_${timestamp}`;
  }

  /**
   * Generate end-to-end ID for transaction
   */
  private generateEndToEndId(refundId: number): string {
    return `REFUND_${refundId.toString().padStart(6, '0')}`;
  }

  /**
   * Sanitize text for XML (remove invalid characters)
   */
  private sanitizeText(text: string): string {
    if (!text) return '';
    
    // More permissive sanitization for international names
    // Allow letters (including accented), numbers, and common punctuation
    return text
      .replace(/[^\w\s\/\-\?:\(\)\.,'\+À-ÿ]/g, ' ') // Allow international characters
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim()
      .substring(0, 70); // Ensure max length for CBC compliance
  }

  /**
   * Format amount for XML (ensure proper decimal format)
   */
  private formatAmount(amount: number): string {
    return amount.toFixed(2);
  }

  /**
   * Build complete XML document
   */
  private buildXMLDocument(params: {
    messageId: string;
    paymentInfoId: string;
    creationDateTime: string;
    executionDate: string;
    transactionCount: number;
    totalAmount: number;
    refunds: ValidatedRefundRecord[];
  }): string {
    const { messageId, paymentInfoId, creationDateTime, executionDate, transactionCount, totalAmount, refunds } = params;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${this.NAMESPACE}" xmlns:xsi="${this.XSI_NAMESPACE}">
    <CstmrCdtTrfInitn>
        ${this.buildGroupHeader(messageId, creationDateTime, transactionCount, totalAmount)}
        ${this.buildPaymentInformation(paymentInfoId, executionDate, transactionCount, totalAmount, refunds)}
    </CstmrCdtTrfInitn>
</Document>`;
  }

  /**
   * Build GroupHeader section
   */
  private buildGroupHeader(messageId: string, creationDateTime: string, transactionCount: number, totalAmount: number): string {
    const orgId = this.debtorConfig.organization_id ? `
                <Id>
                    <OrgId>
                        <Othr>
                            <Id>${this.sanitizeText(this.debtorConfig.organization_id)}</Id>
                            <Issr>${this.sanitizeText(this.debtorConfig.organization_issuer || 'KBO-BCE')}</Issr>
                        </Othr>
                    </OrgId>
                </Id>` : '';

    return `        <GrpHdr>
            <MsgId>${messageId}</MsgId>
            <CreDtTm>${creationDateTime}</CreDtTm>
            <NbOfTxs>${transactionCount}</NbOfTxs>
            <CtrlSum>${this.formatAmount(totalAmount)}</CtrlSum>
            <InitgPty>
                <Nm>${this.sanitizeText(this.debtorConfig.name)}</Nm>${orgId}
            </InitgPty>
        </GrpHdr>`;
  }

  /**
   * Build PaymentInformation section
   */
  private buildPaymentInformation(paymentInfoId: string, executionDate: string, transactionCount: number, totalAmount: number, refunds: ValidatedRefundRecord[]): string {
    const debtorAddress = this.buildDebtorAddress();
    const debtorId = this.buildDebtorId();
    const transactions = refunds.map(refund => this.buildCreditTransferTransaction(refund)).join('\n            ');

    return `        <PmtInf>
            <PmtInfId>${paymentInfoId}</PmtInfId>
            <PmtMtd>${this.PAYMENT_METHOD}</PmtMtd>
            <BtchBookg>${this.options.batch_booking}</BtchBookg>
            <NbOfTxs>${transactionCount}</NbOfTxs>
            <CtrlSum>${this.formatAmount(totalAmount)}</CtrlSum>
            <PmtTpInf>
                <InstrPrty>${this.options.instruction_priority}</InstrPrty>
                <SvcLvl>
                    <Cd>${this.options.service_level}</Cd>
                </SvcLvl>
                <CtgyPurp>
                    <Cd>${this.options.category_purpose}</Cd>
                </CtgyPurp>
            </PmtTpInf>
            <ReqdExctnDt>${executionDate}</ReqdExctnDt>
            <Dbtr>
                <Nm>${this.sanitizeText(this.debtorConfig.name)}</Nm>${debtorAddress}${debtorId}
            </Dbtr>
            <DbtrAcct>
                <Id>
                    <IBAN>${this.debtorConfig.iban.replace(/\s/g, '').toUpperCase()}</IBAN>
                </Id>
                <Ccy>${this.CURRENCY}</Ccy>
            </DbtrAcct>
            <DbtrAgt>
                <FinInstnId>
                    <BIC>${this.debtorConfig.bic || this.CBC_BIC}</BIC>
                </FinInstnId>
            </DbtrAgt>
            <ChrgBr>${this.options.charge_bearer}</ChrgBr>
            ${transactions}
        </PmtInf>`;
  }

  /**
   * Build debtor address section
   */
  private buildDebtorAddress(): string {
    if (!this.debtorConfig.address_line1 && !this.debtorConfig.address_line2) {
      return '';
    }

    const addressLines = [
      this.debtorConfig.address_line1,
      this.debtorConfig.address_line2
    ].filter(line => line && line.trim().length > 0)
     .map(line => `                    <AdrLine>${this.sanitizeText(line)}</AdrLine>`)
     .join('\n');

    return `
                <PstlAdr>
                    <Ctry>${this.debtorConfig.country}</Ctry>
${addressLines}
                </PstlAdr>`;
  }

  /**
   * Build debtor ID section
   */
  private buildDebtorId(): string {
    if (!this.debtorConfig.organization_id) {
      return '';
    }

    return `
                <Id>
                    <OrgId>
                        <Othr>
                            <Id>${this.sanitizeText(this.debtorConfig.organization_id)}</Id>
                            <Issr>${this.sanitizeText(this.debtorConfig.organization_issuer || 'KBO-BCE')}</Issr>
                        </Othr>
                    </OrgId>
                </Id>`;
  }

  /**
   * Build individual credit transfer transaction
   */
  private buildCreditTransferTransaction(refund: ValidatedRefundRecord): string {
    const instructionId = this.generateInstructionId(refund.id);
    const endToEndId = this.generateEndToEndId(refund.id);
    const creditorName = this.sanitizeText(`${refund.first_name} ${refund.last_name}`);
    const amount = this.formatAmount(refund.amount_recharged);
    const iban = refund.account.replace(/\s/g, '').toUpperCase();
    
    // Standardized payment object text as required
    const remittanceInfo = "Remboursement Les Aperos du chateau";

    return `<CdtTrfTxInf>
                <PmtId>
                    <InstrId>${instructionId}</InstrId>
                    <EndToEndId>${endToEndId}</EndToEndId>
                </PmtId>
                <Amt>
                    <InstdAmt Ccy="${this.CURRENCY}">${amount}</InstdAmt>
                </Amt>
                <Cdtr>
                    <Nm>${creditorName}</Nm>
                </Cdtr>
                <CdtrAcct>
                    <Id>
                        <IBAN>${iban}</IBAN>
                    </Id>
                </CdtrAcct>
                <RmtInf>
                    <Ustrd>${this.sanitizeText(remittanceInfo)}</Ustrd>
                </RmtInf>
            </CdtTrfTxInf>`;
  }
}

// Export utility functions for external use
export const XMLGeneratorUtils = {
  /**
   * Validate Belgian IBAN format
   */
  isValidBelgianIBAN: (iban: string): boolean => {
    const generator = new CBCXMLGenerator({ name: 'test', iban: 'BE68539007547034', bic: 'GKCCBEBB', country: 'BE' });
    return (generator as any).isValidBelgianIBAN(iban);
  },

  /**
   * Sanitize text for XML
   */
  sanitizeText: (text: string): string => {
    const generator = new CBCXMLGenerator({ name: 'test', iban: 'BE68539007547034', bic: 'GKCCBEBB', country: 'BE' });
    return (generator as any).sanitizeText(text);
  },

  /**
   * Format amount for XML
   */
  formatAmount: (amount: number): string => {
    const generator = new CBCXMLGenerator({ name: 'test', iban: 'BE68539007547034', bic: 'GKCCBEBB', country: 'BE' });
    return (generator as any).formatAmount(amount);
  }
};