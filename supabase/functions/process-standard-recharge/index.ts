import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Standard Recharge Processing Edge Function
 *
 * Key Features:
 * - Atomic operations via stored procedure sp_process_standard_recharge
 * - Mandatory client_request_id for idempotency protection
 * - Support for both cash and card payment methods
 * - Comprehensive input validation and error handling
 * - Race condition prevention through database-level locking
 * - Detailed logging and request tracing
 */

// Enhanced interfaces with mandatory client_request_id for idempotency
interface StandardRechargeRequest {
  card_id: string;
  amount: number;
  payment_method: 'cash' | 'card';
  client_request_id: string; // MANDATORY for idempotency protection
}

interface StandardRechargeResponse {
  success: boolean;
  transaction_id?: string;
  previous_balance?: number;
  new_balance?: number;
  recharge_amount?: number;
  payment_method?: string;
  error?: string;
  error_code?: string;
  details?: any;
}

// Comprehensive error categorization for better user experience
enum ErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  CARD_NOT_FOUND = 'CARD_NOT_FOUND',
  INVALID_PAYMENT_METHOD = 'INVALID_PAYMENT_METHOD',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVER_ERROR = 'SERVER_ERROR'
}

serve(async (req) => {
  // Generate unique request ID for comprehensive logging and traceability
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[${requestId}] ===== STANDARD RECHARGE PROCESSING STARTED =====`);
  console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`);
  console.log(`[${requestId}] Method: ${req.method}, URL: ${req.url}`);
  console.log(`[${requestId}] User-Agent: ${req.headers.get('user-agent') || 'unknown'}`);
  
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      console.log(`[${requestId}] Invalid method: ${req.method}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Method not allowed',
          error_code: ErrorCode.INVALID_REQUEST
        }),
        { 
          headers: { 'Content-Type': 'application/json' }, 
          status: 405 
        }
      );
    }

    // Parse and validate request body
    let requestBody: StandardRechargeRequest;
    try {
      const bodyText = await req.text();
      
      if (!bodyText || bodyText.trim() === '') {
        console.error(`[${requestId}] Empty request body received`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Request body is required',
            error_code: ErrorCode.INVALID_REQUEST
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      
      console.log(`[${requestId}] Request body length: ${bodyText.length} characters`);
      requestBody = JSON.parse(bodyText);
      
    } catch (parseError) {
      console.error(`[${requestId}] JSON parse error: ${parseError.message}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON format',
          error_code: ErrorCode.INVALID_REQUEST,
          details: parseError.message
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Extract and validate request parameters
    const { 
      card_id, 
      amount, 
      payment_method, 
      client_request_id
    } = requestBody;
    
    console.log(`[${requestId}] ===== REQUEST DETAILS =====`);
    console.log(`[${requestId}] Card ID: ${card_id}`);
    console.log(`[${requestId}] Client Request ID: ${client_request_id}`);
    console.log(`[${requestId}] Amount: €${amount}`);
    console.log(`[${requestId}] Payment Method: ${payment_method}`);

    // Validate mandatory fields
    const validationErrors: string[] = [];
    
    if (!card_id || typeof card_id !== 'string' || card_id.trim() === '') {
      validationErrors.push('card_id is required and must be a non-empty string');
    }
    
    if (!client_request_id || typeof client_request_id !== 'string' || client_request_id.trim() === '') {
      validationErrors.push('client_request_id is required and must be a non-empty string');
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
      validationErrors.push('amount is required and must be a positive number');
    }
    
    if (!payment_method || !['cash', 'card'].includes(payment_method)) {
      validationErrors.push('payment_method is required and must be either "cash" or "card"');
    }

    // Additional business validation
    if (amount && (amount > 1000)) {
      validationErrors.push('amount cannot exceed €1000 for standard recharges');
    }

    if (validationErrors.length > 0) {
      console.error(`[${requestId}] Input validation failed:`, validationErrors);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Input validation failed',
          error_code: ErrorCode.INVALID_REQUEST,
          details: validationErrors
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Create Supabase client with service role for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    console.log(`[${requestId}] ===== CALLING ATOMIC STORED PROCEDURE =====`);
    console.log(`[${requestId}] Procedure: sp_process_standard_recharge`);
    console.log(`[${requestId}] Parameters: card_id=${card_id}, amount=${amount}, payment_method=${payment_method}, client_request_id=${client_request_id}`);
    
    // Call the atomic stored procedure - this eliminates ALL race conditions
    // The stored procedure handles:
    // - Idempotency checking via client_request_id
    // - Card balance locking (FOR UPDATE)
    // - Atomic balance updates
    // - Transaction logging
    // - Error handling and rollback
    const { data: procedureResult, error: procedureError } = await supabaseAdmin
      .rpc('sp_process_standard_recharge', {
        card_id_in: card_id.trim(),
        amount_in: amount,
        payment_method_in: payment_method,
        client_request_id_in: client_request_id.trim()
      });

    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] ===== STORED PROCEDURE COMPLETED =====`);
    console.log(`[${requestId}] Processing Time: ${processingTime}ms`);

    if (procedureError) {
      console.error(`[${requestId}] ===== STORED PROCEDURE ERROR =====`);
      console.error(`[${requestId}] Error Message: ${procedureError.message}`);
      console.error(`[${requestId}] Error Code: ${procedureError.code || 'unknown'}`);
      console.error(`[${requestId}] Error Details:`, procedureError.details || 'none');
      
      // Enhanced error categorization for better user experience
      let errorCode = ErrorCode.DATABASE_ERROR;
      let userFriendlyMessage = 'Database error occurred';
      let httpStatus = 400;
      
      const errorMessage = procedureError.message.toLowerCase();
      
      if (errorMessage.includes('card not found')) {
        errorCode = ErrorCode.CARD_NOT_FOUND;
        userFriendlyMessage = 'Card not found. Please verify the card ID.';
        httpStatus = 404;
      } else if (errorMessage.includes('invalid payment method')) {
        errorCode = ErrorCode.INVALID_PAYMENT_METHOD;
        userFriendlyMessage = 'Invalid payment method. Must be "cash" or "card".';
        httpStatus = 400;
      } else if (errorMessage.includes('duplicate key') ||
                 errorMessage.includes('already exists') ||
                 errorMessage.includes('violates unique constraint')) {
        errorCode = ErrorCode.DUPLICATE_REQUEST;
        userFriendlyMessage = 'This request has already been processed.';
        httpStatus = 409; // Conflict
      }

      console.log(`[${requestId}] Returning error response: ${errorCode} - ${userFriendlyMessage}`);

      return new Response(
        JSON.stringify({
          success: false,
          error: userFriendlyMessage,
          error_code: errorCode,
          details: procedureError.message,
          request_id: requestId
        }),
        { headers: { 'Content-Type': 'application/json' }, status: httpStatus }
      );
    }

    if (!procedureResult) {
      console.error(`[${requestId}] No result returned from stored procedure`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No result from database operation',
          error_code: ErrorCode.DATABASE_ERROR
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`[${requestId}] Stored procedure result:`, procedureResult);

    // The stored procedure returns a JSONB object with the result
    const result = procedureResult as StandardRechargeResponse;
    
    if (result.success) {
      console.log(`[${requestId}] ===== STANDARD RECHARGE PROCESSED SUCCESSFULLY =====`);
      console.log(`[${requestId}] Transaction ID: ${result.transaction_id}`);
      console.log(`[${requestId}] Balance Change: €${result.previous_balance} → €${result.new_balance}`);
      console.log(`[${requestId}] Recharge Amount: €${amount}`);
      console.log(`[${requestId}] Payment Method: ${payment_method}`);
      console.log(`[${requestId}] Total Processing Time: ${processingTime}ms`);
      console.log(`[${requestId}] ===== PROCESSING COMPLETED =====`);
      
      return new Response(
        JSON.stringify({
          ...result,
          request_id: requestId,
          processing_time_ms: processingTime
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        }
      );
    } else {
      // Handle business logic errors returned by the stored procedure
      console.error(`[${requestId}] ===== BUSINESS LOGIC ERROR =====`);
      console.error(`[${requestId}] Error from stored procedure: ${result.error}`);
      
      let errorCode = ErrorCode.DATABASE_ERROR;
      let httpStatus = 400;
      
      if (result.error?.includes('Card not found')) {
        errorCode = ErrorCode.CARD_NOT_FOUND;
        httpStatus = 404; // Not Found
      } else if (result.error?.includes('Invalid payment method')) {
        errorCode = ErrorCode.INVALID_PAYMENT_METHOD;
        httpStatus = 400; // Bad Request
      }
      
      console.log(`[${requestId}] Returning business error: ${errorCode}`);
      
      return new Response(
        JSON.stringify({
          ...result,
          error_code: errorCode,
          request_id: requestId
        }),
        { headers: { 'Content-Type': 'application/json' }, status: httpStatus }
      );
    }
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[${requestId}] ===== UNEXPECTED ERROR =====`);
    console.error(`[${requestId}] Processing Time: ${processingTime}ms`);
    console.error(`[${requestId}] Error Type: ${error.constructor.name}`);
    console.error(`[${requestId}] Error Message: ${error.message}`);
    console.error(`[${requestId}] Error Stack:`, error.stack);
    console.error(`[${requestId}] ===== ERROR DETAILS END =====`);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        error_code: ErrorCode.SERVER_ERROR,
        details: error.message,
        request_id: requestId
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}) 