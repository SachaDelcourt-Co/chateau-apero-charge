/**
 * Shared Refund System Utilities
 * 
 * Common utilities used across the refund system for validation,
 * formatting, and data processing. These utilities are shared between
 * the frontend and Edge Functions to ensure consistency.
 */

// IBAN validation utility
export const validateBelgianIBAN = (iban: string): boolean => {
  if (!iban) return false;
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  const belgianIbanRegex = /^BE\d{14}$/;
  if (!belgianIbanRegex.test(cleanIban)) return false;
  
  // IBAN checksum validation using mod-97 algorithm
  const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);
  const numericString = rearranged.replace(/[A-Z]/g, (char) => 
    (char.charCodeAt(0) - 55).toString()
  );
  let remainder = 0;
  for (let i = 0; i < numericString.length; i++) {
    remainder = (remainder * 10 + parseInt(numericString[i])) % 97;
  }
  return remainder === 1;
};

// Text sanitization utility for XML compatibility
export const sanitizeText = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[^\w\s\/\-\?:\(\)\.,'\+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// Amount formatting utility
export const formatAmount = (amount: number): string => {
  return amount.toFixed(2);
};

// Generate unique message ID
export const generateMessageId = (prefix: string = 'CBC'): string => {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}_${random}`;
};

// Generate payment information ID
export const generatePaymentInfoId = (prefix: string = 'PMT'): string => {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${prefix}_${timestamp}`;
};

// Generate transaction instruction ID
export const generateInstructionId = (refundId: number): string => {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
  return `TXN${refundId.toString().padStart(6, '0')}_${timestamp}`;
};

// Generate end-to-end ID for transaction
export const generateEndToEndId = (refundId: number): string => {
  return `REFUND_${refundId.toString().padStart(6, '0')}`;
};

// Validate refund data structure
export interface RefundValidationError {
  field: string;
  value: any;
  error_message: string;
  refund_id?: number;
}

export interface RefundValidationResult {
  isValid: boolean;
  errors: RefundValidationError[];
  warnings: string[];
}

export const validateRefundData = (refunds: any[]): RefundValidationResult => {
  const errors: RefundValidationError[] = [];
  const warnings: string[] = [];
  const ALLOWED_CHARS_REGEX = /^[a-zA-Z0-9\/\-\?:\(\)\.,'\+ ]*$/;

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
    } else if (!validateBelgianIBAN(refund.account)) {
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
    if (!ALLOWED_CHARS_REGEX.test(fullName)) {
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
};

// Common constants
export const XML_CONSTANTS = {
  CBC_BIC: 'GKCCBEBB',
  CURRENCY: 'EUR',
  PAYMENT_METHOD: 'TRF',
  NAMESPACE: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
  XSI_NAMESPACE: 'http://www.w3.org/2001/XMLSchema-instance',
  ALLOWED_CHARS_REGEX: /^[a-zA-Z0-9\/\-\?:\(\)\.,'\+ ]*$/
};

// Default XML generation options
export const DEFAULT_XML_OPTIONS = {
  message_id_prefix: 'CBC',
  payment_info_id_prefix: 'PMT',
  instruction_priority: 'NORM' as const,
  service_level: 'SEPA' as const,
  category_purpose: 'SUPP' as const,
  charge_bearer: 'SLEV' as const,
  batch_booking: true
};