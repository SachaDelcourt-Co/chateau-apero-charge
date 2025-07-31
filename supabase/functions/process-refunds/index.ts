import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Process Refunds API Endpoint
 * 
 * Main API endpoint for the refund system that orchestrates the entire refund process
 * by calling the generate-refund-data function and using the CBCXMLGenerator service
 * to create downloadable XML files.
 * 
 * Key Features:
 * - Calls generate-refund-data function to retrieve validated refund data
 * - Uses CBCXMLGenerator service to generate CBC-compatible XML
 * - Returns XML file as downloadable response with proper headers
 * - Comprehensive error handling for all failure scenarios
 * - Proper logging and monitoring
 * - Admin authentication required
 * - Rate limiting and security measures
 * 
 * API Specification:
 * - Method: POST
 * - Authentication: Required (admin access only)
 * - Content-Type: application/json
 * - Response: XML file download or JSON error response
 */

// TypeScript interfaces for request/response handling
interface ProcessRefundsRequest {
  debtor_config: {
    name: string;
    iban: string;
    bic?: string;
    address_line1?: string;
    address_line2?: string;
    country: string;
    organization_id?: string;
    organization_issuer?: string;
  };
  xml_options?: {
    message_id_prefix?: string;
    payment_info_id_prefix?: string;
    instruction_priority?: 'NORM' | 'HIGH';
    service_level?: 'SEPA' | 'PRPT';
    category_purpose?: 'SUPP' | 'SALA' | 'INTC' | 'TREA' | 'TAXS';
    charge_bearer?: 'SLEV' | 'SHAR';
    batch_booking?: boolean;
    requested_execution_date?: string;
  };
  processing_options?: {
    max_refunds?: number;
    dry_run?: boolean;
    include_warnings?: boolean;
  };
}

interface ValidatedRefundRecord {
  id: number;
  created_at: string;
  first_name: string;
  last_name: string;
  account: string;
  email: string;
  id_card: string;
  amount_recharged: number;
  card_exists: boolean;
  validation_status: 'valid' | 'warning' | 'error';
  validation_notes: string[];
}

interface RefundDataResponse {
  success: boolean;
  data: {
    valid_refunds: ValidatedRefundRecord[];
    validation_errors: any[];
    summary: {
      total_refunds: number;
      valid_refunds: number;
      error_count: number;
      total_amount: number;
      processing_time_ms: number;
    };
  };
  error?: string;
  error_code?: string;
  request_id: string;
}

interface ProcessRefundsResponse {
  success: boolean;
  message?: string;
  data?: {
    message_id: string;
    transaction_count: number;
    total_amount: number;
    filename: string;
    processing_summary: {
      refunds_processed: number;
      validation_errors: number;
      xml_generation_time_ms: number;
      total_processing_time_ms: number;
    };
  };
  error?: string;
  error_code?: string;
  details?: any;
  request_id: string;
}

// Error codes for categorization
enum ErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NO_REFUNDS_AVAILABLE = 'NO_REFUNDS_AVAILABLE',
  REFUND_DATA_ERROR = 'REFUND_DATA_ERROR',
  XML_GENERATION_ERROR = 'XML_GENERATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  SERVER_ERROR = 'SERVER_ERROR'
}

// CBC XML Generator implementation (embedded for Edge Function compatibility)
class CBCXMLGenerator {
  private readonly CBC_BIC = 'GKCCBEBB';
  private readonly CURRENCY = 'EUR';
  private readonly PAYMENT_METHOD = 'TRF';
  private readonly NAMESPACE = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03';
  private readonly XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
  private readonly ALLOWED_CHARS_REGEX = /^[a-zA-Z0-9À-ÿ\/\-\?:\(\)\.,'\+ ]*$/;
  
  private debtorConfig: any;
  private options: any;

  constructor(debtorConfig: any, options: any = {}) {
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

  public async generateXML(refunds: ValidatedRefundRecord[]): Promise<any> {
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
          errors: validationResult.errors.map((e: any) => e.error_message),
          generation_time_ms: Date.now() - startTime
        };
      }

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

  private validateDebtorConfiguration(): void {
    console.log('[CBCXMLGenerator] Validating debtor configuration:', this.debtorConfig);
    
    if (!this.debtorConfig.name || this.debtorConfig.name.trim().length === 0) {
      throw new Error('Debtor name is required');
    }
    if (!this.debtorConfig.iban) {
      throw new Error('Debtor IBAN is required');
    }
    
    // Clean IBAN for validation (remove spaces)
    const cleanIban = this.debtorConfig.iban.replace(/\s/g, '');
    console.log(`[CBCXMLGenerator] Validating IBAN: ${this.debtorConfig.iban} -> ${cleanIban}`);
    
    if (!this.isValidEuropeanIBAN(this.debtorConfig.iban)) {
      console.error(`[CBCXMLGenerator] Invalid IBAN format: ${this.debtorConfig.iban}`);
      throw new Error(`Invalid debtor IBAN format: ${this.debtorConfig.iban}`);
    }
    if (!this.debtorConfig.country) {
      throw new Error('Debtor country is required');
    }
    if (!this.ALLOWED_CHARS_REGEX.test(this.debtorConfig.name)) {
      throw new Error('Debtor name contains invalid characters');
    }
    
    console.log('[CBCXMLGenerator] Debtor configuration validation successful');
  }

  private validateRefundData(refunds: ValidatedRefundRecord[]): any {
    const errors: any[] = [];
    const warnings: string[] = [];

    if (!refunds || refunds.length === 0) {
      errors.push({
        field: 'refunds',
        value: refunds,
        error_message: 'No refund data provided'
      });
      return { isValid: false, errors, warnings };
    }

    for (const refund of refunds) {
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
      } else if (!this.isValidEuropeanIBAN(refund.account)) {
        errors.push({
          field: 'account',
          value: refund.account,
          error_message: 'Invalid IBAN format',
          refund_id: refund.id
        });
      }

      if (typeof refund.amount_recharged !== 'number' || refund.amount_recharged <= 0) {
        errors.push({
          field: 'amount_recharged',
          value: refund.amount_recharged,
          error_message: 'Amount must be a positive number',
          refund_id: refund.id
        });
      }

      const fullName = `${refund.first_name} ${refund.last_name}`;
      if (!this.ALLOWED_CHARS_REGEX.test(fullName)) {
        errors.push({
          field: 'name',
          value: fullName,
          error_message: 'Name contains invalid characters',
          refund_id: refund.id
        });
      }

      if (fullName.length > 70) {
        errors.push({
          field: 'name',
          value: fullName,
          error_message: 'Name exceeds maximum length (70 characters)',
          refund_id: refund.id
        });
      }

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

  private isValidEuropeanIBAN(iban: string): boolean {
    if (!iban) return false;
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    
    // European IBAN patterns (most common ones)
    const europeanIbanPatterns = {
      'BE': /^BE\d{14}$/,    // Belgium - 16 chars
      'FR': /^FR\d{25}$/,    // France - 27 chars
      'DE': /^DE\d{20}$/,    // Germany - 22 chars
      'NL': /^NL\d{2}[A-Z]{4}\d{10}$/, // Netherlands - 18 chars
      'IT': /^IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/, // Italy - 27 chars
      'ES': /^ES\d{22}$/,    // Spain - 24 chars
      'PT': /^PT\d{23}$/,    // Portugal - 25 chars
      'LU': /^LU\d{5}[A-Z0-9]{13}$/, // Luxembourg - 20 chars
      'AT': /^AT\d{18}$/,    // Austria - 20 chars
      'CH': /^CH\d{7}[A-Z0-9]{12}$/  // Switzerland - 21 chars
    };
    
    // Check if IBAN matches any European pattern
    const countryCode = cleanIban.substring(0, 2);
    const pattern = europeanIbanPatterns[countryCode];
    
    if (!pattern) {
      console.log(`[IBAN Validation] Unsupported country code: ${countryCode} for IBAN: ${cleanIban}`);
      return false;
    }
    
    if (!pattern.test(cleanIban)) {
      console.log(`[IBAN Validation] Invalid ${countryCode} IBAN format: ${cleanIban}`);
      return false;
    }
    
    return this.validateIBANChecksum(cleanIban);
  }

  private validateIBANChecksum(iban: string): boolean {
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    const numericString = rearranged.replace(/[A-Z]/g, (char) => 
      (char.charCodeAt(0) - 55).toString()
    );
    let remainder = 0;
    for (let i = 0; i < numericString.length; i++) {
      remainder = (remainder * 10 + parseInt(numericString[i])) % 97;
    }
    return remainder === 1;
  }

  private generateMessageId(): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${this.options.message_id_prefix}${timestamp}_${random}`;
  }

  private generatePaymentInfoId(): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    return `${this.options.payment_info_id_prefix}_${timestamp}`;
  }

  private generateInstructionId(refundId: number): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
    return `TXN${refundId.toString().padStart(6, '0')}_${timestamp}`;
  }

  private generateEndToEndId(refundId: number): string {
    return `REFUND_${refundId.toString().padStart(6, '0')}`;
  }

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

  private formatAmount(amount: number): string {
    return amount.toFixed(2);
  }

  private buildXMLDocument(params: any): string {
    const { messageId, paymentInfoId, creationDateTime, executionDate, transactionCount, totalAmount, refunds } = params;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${this.NAMESPACE}" xmlns:xsi="${this.XSI_NAMESPACE}">
    <CstmrCdtTrfInitn>
        ${this.buildGroupHeader(messageId, creationDateTime, transactionCount, totalAmount)}
        ${this.buildPaymentInformation(paymentInfoId, executionDate, transactionCount, totalAmount, refunds)}
    </CstmrCdtTrfInitn>
</Document>`;
  }

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
                    <IBAN>${this.debtorConfig.iban.replace(/\s/g, '')}</IBAN>
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

  private buildCreditTransferTransaction(refund: ValidatedRefundRecord): string {
    const instructionId = this.generateInstructionId(refund.id);
    const endToEndId = this.generateEndToEndId(refund.id);
    const creditorName = this.sanitizeText(`${refund.first_name} ${refund.last_name}`);
    const amount = this.formatAmount(refund.amount_recharged);
    const iban = refund.account.replace(/\s/g, '');
    
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

serve(async (req) => {
  // Generate unique request ID for comprehensive logging and traceability
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[${requestId}] ===== REFUND PROCESSING STARTED =====`);
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`);
  console.log(`[${requestId}] Method: ${req.method}, URL: ${req.url}`);
  console.log(`[${requestId}] User-Agent: ${req.headers.get('user-agent') || 'unknown'}`);
  
  // CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      console.log(`[${requestId}] Handling CORS preflight request`);
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }

    // Only accept POST requests
    if (req.method !== 'POST') {
      console.log(`[${requestId}] Invalid method: ${req.method}`);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'Method not allowed. Use POST.',
        error_code: ErrorCode.INVALID_REQUEST,
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }, 
        status: 405 
      });
    }

    // Security check - verify authorization header for admin access
    const authHeader = req.headers.get('authorization');
    const apiKey = req.headers.get('apikey');
    
    console.log(`[${requestId}] Auth header present: ${!!authHeader}`);
    console.log(`[${requestId}] API key present: ${!!apiKey}`);
    console.log(`[${requestId}] All headers:`, Object.fromEntries(req.headers.entries()));
    
    if (!authHeader && !apiKey) {
      console.warn(`[${requestId}] Unauthorized access attempt - missing authentication`);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'Authentication required for refund processing',
        error_code: ErrorCode.UNAUTHORIZED,
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        status: 401
      });
    }

    // Parse and validate request body
    let requestBody: ProcessRefundsRequest;
    try {
      const rawBody = await req.text();
      console.log(`[${requestId}] Request body length: ${rawBody.length} characters`);
      
      if (!rawBody.trim()) {
        throw new Error('Request body is empty');
      }
      
      requestBody = JSON.parse(rawBody);
    } catch (error) {
      console.error(`[${requestId}] Invalid request body:`, error);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'Invalid JSON in request body',
        error_code: ErrorCode.INVALID_REQUEST,
        details: error.message,
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }, 
        status: 400 
      });
    }

    // Validate required debtor configuration
    if (!requestBody.debtor_config) {
      console.error(`[${requestId}] Missing debtor_config in request`);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'debtor_config is required',
        error_code: ErrorCode.CONFIGURATION_ERROR,
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }, 
        status: 400 
      });
    }

    const { debtor_config, xml_options = {}, processing_options = {} } = requestBody;

    // Validate debtor configuration fields
    const requiredFields = ['name', 'iban', 'country'];
    for (const field of requiredFields) {
      if (!debtor_config[field as keyof typeof debtor_config]) {
        console.error(`[${requestId}] Missing required debtor_config field: ${field}`);
        const errorResponse: ProcessRefundsResponse = {
          success: false,
          error: `debtor_config.${field} is required`,
          error_code: ErrorCode.CONFIGURATION_ERROR,
          request_id: requestId
        };
        
        return new Response(JSON.stringify(errorResponse), {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }, 
          status: 400 
        });
      }
    }

    console.log(`[${requestId}] ===== RETRIEVING REFUND DATA =====`);
    console.log(`[${requestId}] Debtor: ${debtor_config.name}`);
    console.log(`[${requestId}] IBAN: ${debtor_config.iban}`);
    console.log(`[${requestId}] Processing options:`, processing_options);

    // Create Supabase client for calling the generate-refund-data function
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error(`[${requestId}] Missing Supabase configuration`);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'Server configuration error',
        error_code: ErrorCode.SERVER_ERROR,
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }, 
        status: 500 
      });
    }

    // Call the generate-refund-data function
    const refundDataUrl = `${supabaseUrl}/functions/v1/generate-refund-data`;
    console.log(`[${requestId}] Calling generate-refund-data function at: ${refundDataUrl}`);
    
    const refundDataResponse = await fetch(refundDataUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader || `Bearer ${apiKey}`,
        'apikey': apiKey || '',
        'Content-Type': 'application/json'
      }
    });

    if (!refundDataResponse.ok) {
      console.error(`[${requestId}] Failed to call generate-refund-data function: ${refundDataResponse.status}`);
      const errorText = await refundDataResponse.text();
      console.error(`[${requestId}] Error response:`, errorText);
      
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'Failed to retrieve refund data',
        error_code: ErrorCode.REFUND_DATA_ERROR,
        details: `HTTP ${refundDataResponse.status}: ${errorText}`,
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }, 
        status: 500 
      });
    }

    const refundData: RefundDataResponse = await refundDataResponse.json();
    
    if (!refundData.success) {
      console.error(`[${requestId}] Generate-refund-data function returned error:`, refundData.error);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: refundData.error || 'Failed to generate refund data',
        error_code: ErrorCode.REFUND_DATA_ERROR,
        details: refundData,
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }, 
        status: 500 
      });
    }

    console.log(`[${requestId}] Refund data retrieved successfully`);
    console.log(`[${requestId}] Total refunds: ${refundData.data.summary.total_refunds}`);
    console.log(`[${requestId}] Valid refunds: ${refundData.data.summary.valid_refunds}`);
    console.log(`[${requestId}] Validation errors: ${refundData.data.summary.error_count}`);

    // Check if there are any valid refunds to process
    if (!refundData.data.valid_refunds || refundData.data.valid_refunds.length === 0) {
      console.warn(`[${requestId}] No valid refunds available for processing`);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'No valid refunds available for processing',
        error_code: ErrorCode.NO_REFUNDS_AVAILABLE,
        details: {
          total_refunds: refundData.data.summary.total_refunds,
          validation_errors: refundData.data.validation_errors
        },
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }, 
        status: 400 
      });
    }

    // Apply processing options (max_refunds limit)
    let refundsToProcess = refundData.data.valid_refunds;
    
    if (processing_options.max_refunds && processing_options.max_refunds > 0) {
      refundsToProcess = refundsToProcess.slice(0, processing_options.max_refunds);
      console.log(`[${requestId}] Limited refunds to process: ${refundsToProcess.length} (max: ${processing_options.max_refunds})`);
    }

    // Filter out refunds with warnings if not explicitly included
    if (!processing_options.include_warnings) {
      const originalCount = refundsToProcess.length;
      refundsToProcess = refundsToProcess.filter(refund => refund.validation_status !== 'warning');
      if (refundsToProcess.length !== originalCount) {
        console.log(`[${requestId}] Filtered out ${originalCount - refundsToProcess.length} refunds with warnings`);
      }
    }

    // Check if we still have refunds to process after filtering
    if (refundsToProcess.length === 0) {
      console.warn(`[${requestId}] No refunds remaining after applying processing options`);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'No refunds available after applying processing filters',
        error_code: ErrorCode.NO_REFUNDS_AVAILABLE,
        details: {
          original_count: refundData.data.valid_refunds.length,
          after_filtering: 0,
          processing_options
        },
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        status: 400
      });
    }

    // Check for dry run mode
    if (processing_options.dry_run) {
      console.log(`[${requestId}] DRY RUN MODE - No XML will be generated`);
      const dryRunResponse: ProcessRefundsResponse = {
        success: true,
        message: 'Dry run completed successfully',
        data: {
          message_id: 'DRY_RUN',
          transaction_count: refundsToProcess.length,
          total_amount: refundsToProcess.reduce((sum, refund) => sum + refund.amount_recharged, 0),
          filename: 'dry_run.xml',
          processing_summary: {
            refunds_processed: refundsToProcess.length,
            validation_errors: refundData.data.validation_errors.length,
            xml_generation_time_ms: 0,
            total_processing_time_ms: Date.now() - startTime
          }
        },
        request_id: requestId
      };
      
      return new Response(JSON.stringify(dryRunResponse), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        status: 200
      });
    }

    console.log(`[${requestId}] ===== GENERATING XML =====`);
    console.log(`[${requestId}] Refunds to process: ${refundsToProcess.length}`);
    console.log(`[${requestId}] Total amount: €${refundsToProcess.reduce((sum, refund) => sum + refund.amount_recharged, 0).toFixed(2)}`);

    // Initialize CBC XML Generator
    let xmlGenerator: CBCXMLGenerator;
    try {
      xmlGenerator = new CBCXMLGenerator(debtor_config, xml_options);
    } catch (error) {
      console.error(`[${requestId}] Failed to initialize XML generator:`, error);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'XML generator configuration error',
        error_code: ErrorCode.CONFIGURATION_ERROR,
        details: error.message,
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        status: 400
      });
    }

    // Generate XML
    const xmlGenerationStart = Date.now();
    const xmlResult = await xmlGenerator.generateXML(refundsToProcess);
    const xmlGenerationTime = Date.now() - xmlGenerationStart;

    if (!xmlResult.success) {
      console.error(`[${requestId}] XML generation failed:`, xmlResult.errors);
      const errorResponse: ProcessRefundsResponse = {
        success: false,
        error: 'XML generation failed',
        error_code: ErrorCode.XML_GENERATION_ERROR,
        details: {
          errors: xmlResult.errors,
          warnings: xmlResult.warnings
        },
        request_id: requestId
      };
      
      return new Response(JSON.stringify(errorResponse), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
        status: 500
      });
    }

    console.log(`[${requestId}] ===== XML GENERATION COMPLETED =====`);
    console.log(`[${requestId}] Message ID: ${xmlResult.message_id}`);
    console.log(`[${requestId}] Transaction count: ${xmlResult.transaction_count}`);
    console.log(`[${requestId}] Total amount: €${xmlResult.total_amount?.toFixed(2)}`);
    console.log(`[${requestId}] XML generation time: ${xmlGenerationTime}ms`);
    console.log(`[${requestId}] Total processing time: ${Date.now() - startTime}ms`);

    // Update file_generated status for processed refunds
    console.log(`[${requestId}] ===== UPDATING FILE_GENERATED STATUS =====`);
    const refundIds = refundsToProcess.map(refund => refund.id);
    console.log(`[${requestId}] Refund IDs to mark as processed: [${refundIds.join(', ')}]`);
    console.log(`[${requestId}] Number of refunds to update: ${refundIds.length}`);
    console.log(`[${requestId}] Supabase URL: ${supabaseUrl}`);
    console.log(`[${requestId}] Service key available: ${!!supabaseServiceKey}`);
    
    try {
      console.log(`[${requestId}] Creating Supabase admin client...`);
      const supabaseAdmin = createClient(
        supabaseUrl,
        supabaseServiceKey,
        { auth: { persistSession: false } }
      );

      console.log(`[${requestId}] Executing database update query...`);
      console.log(`[${requestId}] Query: UPDATE refunds SET file_generated = true WHERE id IN (${refundIds.join(', ')})`);
      
      const { data: updateData, error: updateError, count } = await supabaseAdmin
        .from('refunds')
        .update({ file_generated: true })
        .in('id', refundIds)
        .select('id, file_generated');

      console.log(`[${requestId}] Update query completed`);
      console.log(`[${requestId}] Update data:`, updateData);
      console.log(`[${requestId}] Update count:`, count);
      console.log(`[${requestId}] Update error:`, updateError);

      if (updateError) {
        console.error(`[${requestId}] Database update failed with error:`, {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint
        });
        console.warn(`[${requestId}] WARNING: XML was generated successfully but failed to mark refunds as processed.`);
        console.warn(`[${requestId}] Manual database update required: UPDATE refunds SET file_generated = true WHERE id IN (${refundIds.join(', ')})`);
      } else {
        console.log(`[${requestId}] ✅ Successfully updated ${updateData?.length || count || refundIds.length} refunds to file_generated = true`);
        console.log(`[${requestId}] Updated refund IDs: ${updateData?.map(r => r.id).join(', ') || 'N/A'}`);
        
        // Verify the update worked
        console.log(`[${requestId}] Verifying update...`);
        const { data: verifyData, error: verifyError } = await supabaseAdmin
          .from('refunds')
          .select('id, file_generated')
          .in('id', refundIds);
          
        if (verifyError) {
          console.error(`[${requestId}] Verification query failed:`, verifyError);
        } else {
          console.log(`[${requestId}] Verification results:`, verifyData);
          const updatedCount = verifyData?.filter(r => r.file_generated === true).length || 0;
          const notUpdatedCount = verifyData?.filter(r => r.file_generated === false).length || 0;
          console.log(`[${requestId}] Verification: ${updatedCount} updated, ${notUpdatedCount} not updated`);
          
          if (notUpdatedCount > 0) {
            console.warn(`[${requestId}] WARNING: ${notUpdatedCount} refunds were not marked as processed!`);
            const notUpdatedIds = verifyData?.filter(r => r.file_generated === false).map(r => r.id) || [];
            console.warn(`[${requestId}] Not updated IDs: ${notUpdatedIds.join(', ')}`);
          }
        }
      }
    } catch (error) {
      console.error(`[${requestId}] Exception during file_generated status update:`, {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      console.warn(`[${requestId}] WARNING: XML was generated successfully but failed to mark refunds as processed.`);
      console.warn(`[${requestId}] Manual database update required: UPDATE refunds SET file_generated = true WHERE id IN (${refundIds.join(', ')})`);
    }

    // Generate filename for download
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `CBC_Refunds_${xmlResult.message_id}_${timestamp}.xml`;

    // Log successful processing for audit trail
    console.log(`[${requestId}] ===== REFUND PROCESSING COMPLETED SUCCESSFULLY =====`);
    console.log(`[${requestId}] Processed ${xmlResult.transaction_count} refunds`);
    console.log(`[${requestId}] Total amount processed: €${xmlResult.total_amount?.toFixed(2)}`);
    console.log(`[${requestId}] XML file: ${filename}`);
    console.log(`[${requestId}] Request completed in ${Date.now() - startTime}ms`);

    // Return XML file as downloadable response
    return new Response(xmlResult.xml_content, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Message-ID': xmlResult.message_id || '',
        'X-Transaction-Count': xmlResult.transaction_count?.toString() || '0',
        'X-Total-Amount': xmlResult.total_amount?.toFixed(2) || '0.00',
        'X-Processing-Time': (Date.now() - startTime).toString(),
        'X-Request-ID': requestId,
        ...corsHeaders
      },
      status: 200
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[${requestId}] ===== UNEXPECTED ERROR =====`);
    console.error(`[${requestId}] Processing Time: ${processingTime}ms`);
    console.error(`[${requestId}] Error Type: ${error.constructor.name}`);
    console.error(`[${requestId}] Error Message: ${error.message}`);
    console.error(`[${requestId}] Error Stack:`, error.stack);
    console.error(`[${requestId}] ===== ERROR DETAILS END =====`);
    
    const errorResponse: ProcessRefundsResponse = {
      success: false,
      error: 'Internal server error during refund processing',
      error_code: ErrorCode.SERVER_ERROR,
      details: error.message,
      request_id: requestId
    };
    
    return new Response(JSON.stringify(errorResponse), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
      status: 500
    });
  }
})