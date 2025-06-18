import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Phase 2 Enhanced Bar Order Processing Edge Function
 *
 * Key Features:
 * - Atomic operations via stored procedure sp_process_bar_order
 * - Mandatory client_request_id for idempotency protection
 * - Comprehensive input validation and error handling
 * - Race condition prevention through database-level locking
 * - Detailed logging and request tracing
 */

// Enhanced interfaces with mandatory client_request_id for idempotency
interface BarOrderRequest {
  card_id: string;
  items: Array<{
    product_id?: number; // Optional for flexibility
    quantity: number;
    unit_price: number;
    name: string;
    is_deposit?: boolean;
    is_return?: boolean;
  }>;
  total_amount: number;
  client_request_id: string; // MANDATORY for idempotency protection
  point_of_sale?: number;
}

interface BarOrderResponse {
  success: boolean;
  order_id?: number;
  transaction_id?: string;
  previous_balance?: number;
  new_balance?: number;
  error?: string;
  error_code?: string;
  details?: any;
}

// Comprehensive error categorization for better user experience
enum ErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  CARD_NOT_FOUND = 'CARD_NOT_FOUND',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVER_ERROR = 'SERVER_ERROR'
}

serve(async (req) => {
  // Generate unique request ID for comprehensive logging and traceability
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log(`[${requestId}] ===== BAR ORDER PROCESSING STARTED =====`);
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

    // Only accept POST requests after handling OPTIONS
    if (req.method !== 'POST') {
      console.log(`[${requestId}] Invalid method: ${req.method}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Method not allowed',
          error_code: ErrorCode.INVALID_REQUEST
        }),
        { 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }, 
          status: 405 
        }
      );
    }

    // Parse and validate request body
    let requestBody: BarOrderRequest;
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
          { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
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
          { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
        );
    }

    // Extract and validate request parameters
    const { card_id, items, total_amount, client_request_id, point_of_sale = 1 } = requestBody;
    
    console.log(`[${requestId}] ===== REQUEST DETAILS =====`);
    console.log(`[${requestId}] Card ID: ${card_id}`);
    console.log(`[${requestId}] Client Request ID: ${client_request_id}`);
    console.log(`[${requestId}] Items Count: ${items?.length || 0}`);
    console.log(`[${requestId}] Total Amount: €${total_amount}`);
    console.log(`[${requestId}] Point of Sale: ${point_of_sale}`);

    // Validate mandatory fields
    const validationErrors: string[] = [];
    
    if (!card_id || typeof card_id !== 'string' || card_id.trim() === '') {
      validationErrors.push('card_id is required and must be a non-empty string');
    }
    
    if (!client_request_id || typeof client_request_id !== 'string' || client_request_id.trim() === '') {
      validationErrors.push('client_request_id is required and must be a non-empty string');
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      validationErrors.push('items is required and must be a non-empty array');
    }
    
    if (typeof total_amount !== 'number' || total_amount <= 0) {
      validationErrors.push('total_amount is required and must be a positive number');
    }
    
    if (typeof point_of_sale !== 'number' || point_of_sale < 1) {
      validationErrors.push('point_of_sale must be a positive integer');
    }

    // Validate items structure with enhanced checks
    if (items && Array.isArray(items)) {
      items.forEach((item, index) => {
        if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
          validationErrors.push(`Item ${index}: name is required and must be a non-empty string`);
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
          validationErrors.push(`Item ${index}: quantity must be a positive integer`);
        }
        if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
          validationErrors.push(`Item ${index}: unit_price must be a non-negative number`);
        }
        // Validate optional boolean fields
        if (item.is_deposit !== undefined && typeof item.is_deposit !== 'boolean') {
          validationErrors.push(`Item ${index}: is_deposit must be a boolean if provided`);
        }
        if (item.is_return !== undefined && typeof item.is_return !== 'boolean') {
          validationErrors.push(`Item ${index}: is_return must be a boolean if provided`);
        }
      });
      
      // Validate total amount matches item calculations
      const calculatedTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      const tolerance = 0.01; // Allow for small floating point differences
      if (Math.abs(calculatedTotal - total_amount) > tolerance) {
        validationErrors.push(`Total amount mismatch: calculated €${calculatedTotal.toFixed(2)}, provided €${total_amount.toFixed(2)}`);
      }
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
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 400 }
      );
    }

    // Create Supabase client with service role for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    console.log(`[${requestId}] ===== CALLING ATOMIC STORED PROCEDURE =====`);
    console.log(`[${requestId}] Procedure: sp_process_bar_order`);
    console.log(`[${requestId}] Parameters: card_id=${card_id}, client_request_id=${client_request_id}, total_amount=${total_amount}, point_of_sale=${point_of_sale}`);
    
    // Call the atomic stored procedure - this eliminates ALL race conditions
    // The stored procedure handles:
    // - Idempotency checking via client_request_id
    // - Card balance locking (FOR UPDATE)
    // - Atomic balance updates
    // - Transaction logging
    // - Error handling and rollback
    const { data: procedureResult, error: procedureError } = await supabaseAdmin
      .rpc('sp_process_bar_order', {
        card_id_in: card_id.trim(),
        items_in: items,
        total_amount_in: total_amount,
        client_request_id_in: client_request_id.trim(),
        point_of_sale_in: point_of_sale
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
      } else if (errorMessage.includes('insufficient funds')) {
        errorCode = ErrorCode.INSUFFICIENT_FUNDS;
        userFriendlyMessage = 'Insufficient funds on card for this transaction.';
        httpStatus = 402; // Payment Required
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
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: httpStatus }
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
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
      );
    }

    console.log(`[${requestId}] Stored procedure result:`, procedureResult);

    // The stored procedure returns a JSONB object with the result
    const result = procedureResult as BarOrderResponse;
    
    if (result.success) {
      console.log(`[${requestId}] ===== ORDER PROCESSED SUCCESSFULLY =====`);
      console.log(`[${requestId}] Order ID: ${result.order_id}`);
      console.log(`[${requestId}] Transaction ID: ${result.transaction_id}`);
      console.log(`[${requestId}] Balance Change: €${result.previous_balance} → €${result.new_balance}`);
      console.log(`[${requestId}] Amount Deducted: €${total_amount}`);
      console.log(`[${requestId}] Total Processing Time: ${processingTime}ms`);
      console.log(`[${requestId}] ===== PROCESSING COMPLETED =====`);
      
      return new Response(
        JSON.stringify({
          ...result,
          request_id: requestId,
          processing_time_ms: processingTime
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          status: 200
        }
      );
    } else {
      // Handle business logic errors returned by the stored procedure
      console.error(`[${requestId}] ===== BUSINESS LOGIC ERROR =====`);
      console.error(`[${requestId}] Error from stored procedure: ${result.error}`);
      
      let errorCode = ErrorCode.DATABASE_ERROR;
      let httpStatus = 400;
      
      if (result.error?.includes('Insufficient funds')) {
        errorCode = ErrorCode.INSUFFICIENT_FUNDS;
        httpStatus = 402; // Payment Required
      } else if (result.error?.includes('Card not found')) {
        errorCode = ErrorCode.CARD_NOT_FOUND;
        httpStatus = 404; // Not Found
      }
      
      console.log(`[${requestId}] Returning business error: ${errorCode}`);
      
      return new Response(
        JSON.stringify({
          ...result,
          error_code: errorCode,
          request_id: requestId
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: httpStatus }
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
      { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 }
    );
  }
})