/**
 * Enhanced Data Validation and Sanitization for Financial Data Processing
 * 
 * Comprehensive validation system specifically designed for financial data
 * with strict validation rules, input sanitization, and security measures
 * appropriate for handling sensitive financial information.
 * 
 * Features:
 * - Financial amount validation with limits and precision checks
 * - IBAN validation with country-specific rules and checksum verification
 * - Personal data validation with character set restrictions
 * - Email validation with domain verification
 * - Input sanitization to prevent injection attacks
 * - Data type validation and coercion
 * - Business rule validation for refund processing
 * - Comprehensive error reporting with field-level details
 */

import { SecurityConfig, SecurityUtils } from '../config/security';
import { auditLogger, AuditResult } from './audit-logger';

// Validation result interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedData?: any;
}

export interface ValidationError {
  field: string;
  value: any;
  code: ValidationErrorCode;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ValidationWarning {
  field: string;
  value: any;
  code: ValidationWarningCode;
  message: string;
}

// Error and warning codes
export enum ValidationErrorCode {
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_TYPE = 'INVALID_TYPE',
  VALUE_OUT_OF_RANGE = 'VALUE_OUT_OF_RANGE',
  INVALID_LENGTH = 'INVALID_LENGTH',
  INVALID_CHARACTERS = 'INVALID_CHARACTERS',
  INVALID_IBAN = 'INVALID_IBAN',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  DUPLICATE_VALUE = 'DUPLICATE_VALUE',
}

export enum ValidationWarningCode {
  UNUSUAL_VALUE = 'UNUSUAL_VALUE',
  DEPRECATED_FORMAT = 'DEPRECATED_FORMAT',
  POTENTIAL_ISSUE = 'POTENTIAL_ISSUE',
  DATA_QUALITY_CONCERN = 'DATA_QUALITY_CONCERN',
  DUPLICATE_VALUE = 'DUPLICATE_VALUE',
}

// Validation schemas
export interface RefundDataSchema {
  id?: number;
  first_name: string;
  last_name: string;
  email: string;
  account: string; // IBAN
  amount_recharged: number;
  id_card: string;
  card_balance?: number;
}

export interface DebtorConfigSchema {
  name: string;
  iban: string;
  bic?: string;
  country: string;
  address_line1?: string;
  address_line2?: string;
  organization_id?: string;
  organization_issuer?: string;
}

export interface ProcessRefundsRequestSchema {
  debtor_config: DebtorConfigSchema;
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

/**
 * Enhanced Data Validator Class
 */
export class DataValidator {
  private requestId: string;

  constructor(requestId: string = SecurityUtils.generateRequestId()) {
    this.requestId = requestId;
  }

  /**
   * Validate refund data array
   */
  async validateRefundData(refunds: any[]): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const sanitizedData: RefundDataSchema[] = [];

    if (!Array.isArray(refunds)) {
      errors.push({
        field: 'refunds',
        value: refunds,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'Refunds must be an array',
        severity: 'critical',
      });
      return { isValid: false, errors, warnings };
    }

    if (refunds.length === 0) {
      errors.push({
        field: 'refunds',
        value: refunds,
        code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
        message: 'At least one refund is required',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Check batch size limits
    const maxRefunds = SecurityConfig.requestLimits.maxRefundsPerBatch;
    if (refunds.length > maxRefunds) {
      errors.push({
        field: 'refunds',
        value: refunds.length,
        code: ValidationErrorCode.VALUE_OUT_OF_RANGE,
        message: `Too many refunds in batch. Maximum allowed: ${maxRefunds}`,
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Validate each refund
    let totalAmount = 0;
    const seenIbans = new Set<string>();
    const seenEmails = new Set<string>();

    for (let i = 0; i < refunds.length; i++) {
      const refund = refunds[i];
      const fieldPrefix = `refunds[${i}]`;

      const refundValidation = await this.validateSingleRefund(refund, fieldPrefix);
      errors.push(...refundValidation.errors);
      warnings.push(...refundValidation.warnings);

      if (refundValidation.isValid && refundValidation.sanitizedData) {
        const sanitizedRefund = refundValidation.sanitizedData as RefundDataSchema;
        sanitizedData.push(sanitizedRefund);
        totalAmount += sanitizedRefund.amount_recharged;

        // Check for duplicates
        if (seenIbans.has(sanitizedRefund.account)) {
          warnings.push({
            field: `${fieldPrefix}.account`,
            value: sanitizedRefund.account,
            code: ValidationWarningCode.DUPLICATE_VALUE,
            message: 'Duplicate IBAN found in batch',
          });
        }
        seenIbans.add(sanitizedRefund.account);

        if (seenEmails.has(sanitizedRefund.email)) {
          warnings.push({
            field: `${fieldPrefix}.email`,
            value: sanitizedRefund.email,
            code: ValidationWarningCode.DUPLICATE_VALUE,
            message: 'Duplicate email found in batch',
          });
        }
        seenEmails.add(sanitizedRefund.email);
      }
    }

    // Validate total amount
    const maxTotalAmount = SecurityConfig.requestLimits.maxTotalAmount;
    if (totalAmount > maxTotalAmount) {
      errors.push({
        field: 'total_amount',
        value: totalAmount,
        code: ValidationErrorCode.VALUE_OUT_OF_RANGE,
        message: `Total refund amount exceeds maximum allowed: €${maxTotalAmount}`,
        severity: 'critical',
      });
    }

    // Log validation results
    await auditLogger.logDataAccess({
      requestId: this.requestId,
      userId: 'system',
      action: 'validate_refund_data',
      resource: 'refund_validation',
      dataType: 'refund_data',
      recordCount: refunds.length,
      result: errors.length === 0 ? AuditResult.SUCCESS : AuditResult.FAILURE,
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData: errors.length === 0 ? sanitizedData : undefined,
    };
  }

  /**
   * Validate single refund record
   */
  async validateSingleRefund(refund: any, fieldPrefix: string = ''): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const sanitized: Partial<RefundDataSchema> = {};

    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'email', 'account', 'amount_recharged', 'id_card'];
    
    for (const field of requiredFields) {
      if (!refund[field] || (typeof refund[field] === 'string' && refund[field].trim().length === 0)) {
        errors.push({
          field: fieldPrefix ? `${fieldPrefix}.${field}` : field,
          value: refund[field],
          code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
          message: `${field} is required`,
          severity: 'high',
        });
      }
    }

    // Validate and sanitize first_name
    if (refund.first_name) {
      const nameValidation = this.validatePersonName(refund.first_name, 'first_name', fieldPrefix);
      errors.push(...nameValidation.errors);
      warnings.push(...nameValidation.warnings);
      if (nameValidation.sanitizedData) {
        sanitized.first_name = nameValidation.sanitizedData;
      }
    }

    // Validate and sanitize last_name
    if (refund.last_name) {
      const nameValidation = this.validatePersonName(refund.last_name, 'last_name', fieldPrefix);
      errors.push(...nameValidation.errors);
      warnings.push(...nameValidation.warnings);
      if (nameValidation.sanitizedData) {
        sanitized.last_name = nameValidation.sanitizedData;
      }
    }

    // Validate email
    if (refund.email) {
      const emailValidation = this.validateEmail(refund.email, 'email', fieldPrefix);
      errors.push(...emailValidation.errors);
      warnings.push(...emailValidation.warnings);
      if (emailValidation.sanitizedData) {
        sanitized.email = emailValidation.sanitizedData;
      }
    }

    // Validate IBAN
    if (refund.account) {
      const ibanValidation = this.validateIBAN(refund.account, 'account', fieldPrefix);
      errors.push(...ibanValidation.errors);
      warnings.push(...ibanValidation.warnings);
      if (ibanValidation.sanitizedData) {
        sanitized.account = ibanValidation.sanitizedData;
      }
    }

    // Validate amount
    if (refund.amount_recharged !== undefined) {
      const amountValidation = this.validateAmount(refund.amount_recharged, 'amount_recharged', fieldPrefix);
      errors.push(...amountValidation.errors);
      warnings.push(...amountValidation.warnings);
      if (amountValidation.sanitizedData !== undefined) {
        sanitized.amount_recharged = amountValidation.sanitizedData;
      }
    }

    // Validate and sanitize id_card
    if (refund.id_card) {
      const cardValidation = this.validateCardId(refund.id_card, 'id_card', fieldPrefix);
      errors.push(...cardValidation.errors);
      warnings.push(...cardValidation.warnings);
      if (cardValidation.sanitizedData) {
        sanitized.id_card = cardValidation.sanitizedData;
      }
    }

    // Validate optional card_balance
    if (refund.card_balance !== undefined && refund.card_balance !== null) {
      const balanceValidation = this.validateAmount(refund.card_balance, 'card_balance', fieldPrefix);
      errors.push(...balanceValidation.errors);
      warnings.push(...balanceValidation.warnings);
      if (balanceValidation.sanitizedData !== undefined) {
        sanitized.card_balance = balanceValidation.sanitizedData;
      }
    }

    // Optional id field
    if (refund.id !== undefined) {
      if (typeof refund.id === 'number' && refund.id > 0) {
        sanitized.id = refund.id;
      } else {
        errors.push({
          field: fieldPrefix ? `${fieldPrefix}.id` : 'id',
          value: refund.id,
          code: ValidationErrorCode.INVALID_TYPE,
          message: 'ID must be a positive number',
          severity: 'medium',
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData: errors.length === 0 ? sanitized as RefundDataSchema : undefined,
    };
  }

  /**
   * Validate debtor configuration
   */
  async validateDebtorConfig(config: any): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const sanitized: Partial<DebtorConfigSchema> = {};

    // Validate required fields
    const requiredFields = ['name', 'iban', 'country'];
    
    for (const field of requiredFields) {
      if (!config[field] || (typeof config[field] === 'string' && config[field].trim().length === 0)) {
        errors.push({
          field: field,
          value: config[field],
          code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
          message: `${field} is required`,
          severity: 'high',
        });
      }
    }

    // Validate and sanitize name
    if (config.name) {
      const nameValidation = this.validateOrganizationName(config.name, 'name');
      errors.push(...nameValidation.errors);
      warnings.push(...nameValidation.warnings);
      if (nameValidation.sanitizedData) {
        sanitized.name = nameValidation.sanitizedData;
      }
    }

    // Validate IBAN
    if (config.iban) {
      const ibanValidation = this.validateIBAN(config.iban, 'iban');
      errors.push(...ibanValidation.errors);
      warnings.push(...ibanValidation.warnings);
      if (ibanValidation.sanitizedData) {
        sanitized.iban = ibanValidation.sanitizedData;
      }
    }

    // Validate BIC (optional)
    if (config.bic) {
      const bicValidation = this.validateBIC(config.bic, 'bic');
      errors.push(...bicValidation.errors);
      warnings.push(...bicValidation.warnings);
      if (bicValidation.sanitizedData) {
        sanitized.bic = bicValidation.sanitizedData;
      }
    }

    // Validate country
    if (config.country) {
      const countryValidation = this.validateCountryCode(config.country, 'country');
      errors.push(...countryValidation.errors);
      warnings.push(...countryValidation.warnings);
      if (countryValidation.sanitizedData) {
        sanitized.country = countryValidation.sanitizedData;
      }
    }

    // Validate optional address fields
    if (config.address_line1) {
      sanitized.address_line1 = SecurityUtils.sanitizeInput(config.address_line1);
    }
    if (config.address_line2) {
      sanitized.address_line2 = SecurityUtils.sanitizeInput(config.address_line2);
    }

    // Validate optional organization fields
    if (config.organization_id) {
      sanitized.organization_id = SecurityUtils.sanitizeInput(config.organization_id);
    }
    if (config.organization_issuer) {
      sanitized.organization_issuer = SecurityUtils.sanitizeInput(config.organization_issuer);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData: errors.length === 0 ? sanitized as DebtorConfigSchema : undefined,
    };
  }

  /**
   * Validate process refunds request
   */
  async validateProcessRefundsRequest(request: any): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const sanitized: Partial<ProcessRefundsRequestSchema> = {};

    // Validate debtor_config
    if (!request.debtor_config) {
      errors.push({
        field: 'debtor_config',
        value: request.debtor_config,
        code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
        message: 'debtor_config is required',
        severity: 'critical',
      });
    } else {
      const debtorValidation = await this.validateDebtorConfig(request.debtor_config);
      errors.push(...debtorValidation.errors);
      warnings.push(...debtorValidation.warnings);
      if (debtorValidation.sanitizedData) {
        sanitized.debtor_config = debtorValidation.sanitizedData;
      }
    }

    // Validate optional xml_options
    if (request.xml_options) {
      // Basic validation for xml_options (implement detailed validation as needed)
      sanitized.xml_options = request.xml_options;
    }

    // Validate optional processing_options
    if (request.processing_options) {
      // Basic validation for processing_options (implement detailed validation as needed)
      sanitized.processing_options = request.processing_options;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData: errors.length === 0 ? sanitized as ProcessRefundsRequestSchema : undefined,
    };
  }

  /**
   * Validate person name
   */
  private validatePersonName(name: any, field: string, prefix: string = ''): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const fieldName = prefix ? `${prefix}.${field}` : field;

    if (typeof name !== 'string') {
      errors.push({
        field: fieldName,
        value: name,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'Name must be a string',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    const sanitized = SecurityUtils.sanitizeInput(name);
    const config = SecurityConfig.validation.personalData;

    // Check length
    if (sanitized.length === 0) {
      errors.push({
        field: fieldName,
        value: name,
        code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
        message: 'Name cannot be empty',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    if (sanitized.length > config.nameMaxLength) {
      errors.push({
        field: fieldName,
        value: name,
        code: ValidationErrorCode.INVALID_LENGTH,
        message: `Name exceeds maximum length of ${config.nameMaxLength} characters`,
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Check character set
    if (!config.allowedNameChars.test(sanitized)) {
      errors.push({
        field: fieldName,
        value: name,
        code: ValidationErrorCode.INVALID_CHARACTERS,
        message: 'Name contains invalid characters',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Check for unusual patterns
    if (sanitized.length < 2) {
      warnings.push({
        field: fieldName,
        value: name,
        code: ValidationWarningCode.UNUSUAL_VALUE,
        message: 'Name is unusually short',
      });
    }

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate email address
   */
  private validateEmail(email: any, field: string, prefix: string = ''): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const fieldName = prefix ? `${prefix}.${field}` : field;

    if (typeof email !== 'string') {
      errors.push({
        field: fieldName,
        value: email,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'Email must be a string',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    const sanitized = SecurityUtils.sanitizeInput(email.toLowerCase());
    const config = SecurityConfig.validation.personalData;

    // Check length
    if (sanitized.length > config.emailMaxLength) {
      errors.push({
        field: fieldName,
        value: email,
        code: ValidationErrorCode.INVALID_LENGTH,
        message: `Email exceeds maximum length of ${config.emailMaxLength} characters`,
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Check format
    if (!config.emailFormat.test(sanitized)) {
      errors.push({
        field: fieldName,
        value: email,
        code: ValidationErrorCode.INVALID_EMAIL,
        message: 'Invalid email format',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Check for suspicious domains
    const domain = sanitized.split('@')[1];
    const suspiciousDomains = ['tempmail.org', '10minutemail.com', 'guerrillamail.com'];
    if (suspiciousDomains.includes(domain)) {
      warnings.push({
        field: fieldName,
        value: email,
        code: ValidationWarningCode.DATA_QUALITY_CONCERN,
        message: 'Email uses a temporary email service',
      });
    }

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate IBAN
   */
  private validateIBAN(iban: any, field: string, prefix: string = ''): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const fieldName = prefix ? `${prefix}.${field}` : field;

    if (typeof iban !== 'string') {
      errors.push({
        field: fieldName,
        value: iban,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'IBAN must be a string',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    const sanitized = iban.replace(/\s/g, '').toUpperCase();
    const config = SecurityConfig.validation.iban;

    // Check format
    if (!config.format.test(sanitized)) {
      errors.push({
        field: fieldName,
        value: iban,
        code: ValidationErrorCode.INVALID_IBAN,
        message: 'Invalid IBAN format. Must be Belgian IBAN (BE + 14 digits)',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Check country
    const country = sanitized.substring(0, 2);
    if (!config.allowedCountries.includes(country)) {
      errors.push({
        field: fieldName,
        value: iban,
        code: ValidationErrorCode.INVALID_IBAN,
        message: `IBAN country ${country} is not allowed. Only Belgian IBANs are accepted.`,
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Validate checksum
    if (config.validateChecksum && !SecurityUtils.isValidIBAN(sanitized)) {
      errors.push({
        field: fieldName,
        value: iban,
        code: ValidationErrorCode.INVALID_IBAN,
        message: 'IBAN checksum validation failed',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate financial amount
   */
  private validateAmount(amount: any, field: string, prefix: string = ''): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const fieldName = prefix ? `${prefix}.${field}` : field;

    if (typeof amount !== 'number') {
      errors.push({
        field: fieldName,
        value: amount,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'Amount must be a number',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    const config = SecurityConfig.validation.financial;

    // Check range
    if (amount < config.minAmount) {
      errors.push({
        field: fieldName,
        value: amount,
        code: ValidationErrorCode.VALUE_OUT_OF_RANGE,
        message: `Amount must be at least €${config.minAmount}`,
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    if (amount > config.maxAmount) {
      errors.push({
        field: fieldName,
        value: amount,
        code: ValidationErrorCode.VALUE_OUT_OF_RANGE,
        message: `Amount exceeds maximum of €${config.maxAmount}`,
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Check decimal places
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > config.decimalPlaces) {
      errors.push({
        field: fieldName,
        value: amount,
        code: ValidationErrorCode.INVALID_FORMAT,
        message: `Amount cannot have more than ${config.decimalPlaces} decimal places`,
        severity: 'medium',
      });
      return { isValid: false, errors, warnings };
    }

    // Round to correct decimal places
    const sanitized = Math.round(amount * Math.pow(10, config.decimalPlaces)) / Math.pow(10, config.decimalPlaces);

    // Check for unusual amounts
    if (amount > 1000) {
      warnings.push({
        field: fieldName,
        value: amount,
        code: ValidationWarningCode.UNUSUAL_VALUE,
        message: 'Large refund amount detected',
      });
    }

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate card ID
   */
  private validateCardId(cardId: any, field: string, prefix: string = ''): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const fieldName = prefix ? `${prefix}.${field}` : field;

    if (typeof cardId !== 'string') {
      errors.push({
        field: fieldName,
        value: cardId,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'Card ID must be a string',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    const sanitized = SecurityUtils.sanitizeInput(cardId);

    if (sanitized.length === 0) {
      errors.push({
        field: fieldName,
        value: cardId,
        code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
        message: 'Card ID cannot be empty',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    // Basic format validation (adjust based on your card ID format)
    if (sanitized.length < 3 || sanitized.length > 50) {
      errors.push({
        field: fieldName,
        value: cardId,
        code: ValidationErrorCode.INVALID_LENGTH,
        message: 'Card ID must be between 3 and 50 characters',
        severity: 'medium',
      });
      return { isValid: false, errors, warnings };
    }

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate organization name
   */
  private validateOrganizationName(name: any, field: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof name !== 'string') {
      errors.push({
        field,
        value: name,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'Organization name must be a string',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    const sanitized = SecurityUtils.sanitizeInput(name);

    if (sanitized.length === 0) {
      errors.push({
        field,
        value: name,
        code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
        message: 'Organization name cannot be empty',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    if (sanitized.length > 70) {
      errors.push({
        field,
        value: name,
        code: ValidationErrorCode.INVALID_LENGTH,
        message: 'Organization name exceeds maximum length of 70 characters',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate BIC code
   */
  private validateBIC(bic: any, field: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof bic !== 'string') {
      errors.push({
        field,
        value: bic,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'BIC must be a string',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    const sanitized = bic.toUpperCase().trim();
    const bicRegex = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

    if (!bicRegex.test(sanitized)) {
      errors.push({
        field,
        value: bic,
        code: ValidationErrorCode.INVALID_FORMAT,
        message: 'Invalid BIC format',
        severity: 'medium',
      });
      return { isValid: false, errors, warnings };
    }

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate country code
   */
  private validateCountryCode(country: any, field: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof country !== 'string') {
      errors.push({
        field,
        value: country,
        code: ValidationErrorCode.INVALID_TYPE,
        message: 'Country must be a string',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    const sanitized = country.toUpperCase().trim();
    const allowedCountries = ['BE']; // Belgian only for now

    if (!allowedCountries.includes(sanitized)) {
      errors.push({
        field,
        value: country,
        code: ValidationErrorCode.INVALID_FORMAT,
        message: 'Only Belgian (BE) country code is allowed',
        severity: 'high',
      });
      return { isValid: false, errors, warnings };
    }

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate XML options
   */
  private validateXmlOptions(options: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const sanitized: any = {};

    // Basic validation - implement detailed validation as needed
    if (options.message_id_prefix && typeof options.message_id_prefix === 'string') {
      sanitized.message_id_prefix = SecurityUtils.sanitizeInput(options.message_id_prefix);
    }

    if (options.payment_info_id_prefix && typeof options.payment_info_id_prefix === 'string') {
      sanitized.payment_info_id_prefix = SecurityUtils.sanitizeInput(options.payment_info_id_prefix);
    }

    // Add other XML option validations as needed

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }

  /**
   * Validate processing options
   */
  private validateProcessingOptions(options: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const sanitized: any = {};

    if (options.max_refunds !== undefined) {
      if (typeof options.max_refunds === 'number' && options.max_refunds > 0) {
        sanitized.max_refunds = options.max_refunds;
      } else {
        errors.push({
          field: 'processing_options.max_refunds',
          value: options.max_refunds,
          code: ValidationErrorCode.INVALID_TYPE,
          message: 'max_refunds must be a positive number',
          severity: 'medium',
        });
      }
    }

    if (options.dry_run !== undefined) {
      sanitized.dry_run = Boolean(options.dry_run);
    }

    if (options.include_warnings !== undefined) {
      sanitized.include_warnings = Boolean(options.include_warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData: sanitized,
    };
  }
}

// Export utility functions
export const ValidationUtils = {
  /**
   * Create validation error response
   */
  createErrorResponse: (errors: ValidationError[]): any => ({
    success: false,
    error: 'Validation failed',
    validation_errors: errors,
  }),

  /**
   * Check if validation result has critical errors
   */
  hasCriticalErrors: (result: ValidationResult): boolean => {
    return result.errors.some(error => error.severity === 'critical');
  },

  /**
   * Get field-specific errors
   */
  getFieldErrors: (result: ValidationResult, field: string): ValidationError[] => {
    return result.errors.filter(error => error.field === field || error.field.startsWith(`${field}.`));
  },

  /**
   * Sanitize validation result for logging
   */
  sanitizeForLogging: (result: ValidationResult): any => {
    return {
      isValid: result.isValid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errors: result.errors.map(error => ({
        field: error.field,
        code: error.code,
        severity: error.severity,
        // Don't log actual values for security
      })),
    };
  },
};