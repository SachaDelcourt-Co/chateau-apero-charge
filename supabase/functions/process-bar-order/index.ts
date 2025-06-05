import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BarOrderRequest {
  card_id: string;
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    name: string;
    is_deposit?: boolean;
    is_return?: boolean;
  }>;
  total_amount: number;
  client_request_id: string; // Added for idempotency
  point_of_sale?: string; // Changed to string, e.g., "BAR_KIOSK_1"
}

// The response will now be more directly derived from the stored procedure's output.
// This interface might be simplified or removed depending on SP's direct passthrough.
interface SpResponse {
  status: 'SUCCESS' | 'ERROR' | 'IDEMPOTENCY_SUCCESS' | 'IDEMPOTENCY_CONFLICT';
  message: string;
  order_id?: string | number; // SP might return string or number
  new_balance?: number;
  error_code?: string; // e.g., 'CARD_NOT_FOUND', 'INSUFFICIENT_FUNDS'
  details?: any;
}


serve(async (req) => {
  // Initialize logging with request ID for traceability
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Bar order processing started`);
  console.log(`[${requestId}] Request method: ${req.method}`);
  console.log(`[${requestId}] Request URL: ${req.url}`);
  
  // Log all request headers for debugging
  const headers = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
    console.log(`[${requestId}] Header: ${key}: ${value}`);
  });
  
  try {
    // Enhanced error handling for JSON parsing
    let requestBody;
    try {
      // Log the request content type for debugging
      console.log(`[${requestId}] Request content-type: ${req.headers.get('content-type')}`);
      
      // Log request headers for debugging
      console.log(`[${requestId}] Request headers:`);
      req.headers.forEach((value, key) => {
        console.log(`[${requestId}] - ${key}: ${value}`);
      });

      // Read request body as text first for debugging
      const bodyText = await req.text();
      
      // If body is empty, log it and throw an error
      if (!bodyText || bodyText.trim() === '') {
        console.error(`[${requestId}] Empty request body received`);
        throw new Error('Empty request body');
      }
      
      // Check body length and content
      // console.log(`[${requestId}] Raw request body length: ${bodyText.length}`);
      // console.log(`[${requestId}] Raw request body starts with: ${bodyText.substring(0, 50)}...`);
      // console.log(`[${requestId}] Raw request body ends with: ...${bodyText.substring(bodyText.length - 50)}`);
      
      // Log the raw body for debugging
      console.log(`[${requestId}] Raw request body (length ${bodyText.length}): ${bodyText.substring(0, 300)}${bodyText.length > 300 ? '...' : ''}`);
      
      // Parse the body text as JSON
      try {
        requestBody = JSON.parse(bodyText);
        console.log(`[${requestId}] Successfully parsed JSON with ${Object.keys(requestBody).length} top-level keys`);
        
        // Log the parsed body structure
        if (requestBody.items) {
          console.log(`[${requestId}] Request contains ${requestBody.items.length} items`);
        }
        if (requestBody.card_id) {
          console.log(`[${requestId}] Request for card: ${requestBody.card_id}`);
        }
        if (requestBody.total_amount !== undefined) {
          console.log(`[${requestId}] Request total amount: ${requestBody.total_amount}`);
        }
      } catch (jsonError) {
        console.error(`[${requestId}] JSON parse error: ${jsonError.message}`);
        console.error(`[${requestId}] Invalid JSON content: ${bodyText}`);
        throw new Error(`Invalid JSON: ${jsonError.message}`);
      }
    } catch (bodyError) {
      console.error(`[${requestId}] Body processing error: ${bodyError.message}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid request body format',
          details: bodyError.message
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Extract request data with validation
    const { card_id, items, total_amount, client_request_id, point_of_sale = "BAR_DEFAULT_POS" } = requestBody as BarOrderRequest;
    
    console.log(`[${requestId}] Processing order for card ${card_id}, client_request_id: ${client_request_id}, total: ${total_amount}€, POS: ${point_of_sale}`);
    console.log(`[${requestId}] Items: ${JSON.stringify(items)}`);
    
    // Create Supabase client with service role for full access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );
    
    // Validate inputs
    if (!card_id || !items || items.length === 0 || total_amount <= 0 || !client_request_id) {
      console.error(`[${requestId}] Input validation failed:`, { card_id, itemCount: items?.length, total_amount, client_request_id });
      return new Response(
        JSON.stringify({
          status: 'ERROR',
          error_code: 'INVALID_INPUT',
          message: 'Invalid input parameters. card_id, items, total_amount, and client_request_id are required.'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    try {
      console.log(`[${requestId}] Calling sp_process_bar_order with card_id: ${card_id}, client_request_id: ${client_request_id}, total_amount: ${total_amount}, point_of_sale: ${point_of_sale}`);
      const { data: spResult, error: spError } = await supabaseAdmin.rpc(
        'sp_process_bar_order',
        {
          card_id_in: card_id,
          items_in: items, // Supabase client handles JSONB conversion
          total_amount_in: total_amount,
          client_request_id_in: client_request_id,
          point_of_sale_in: point_of_sale,
        }
      );

      if (spError) {
        console.error(`[${requestId}] Error calling stored procedure sp_process_bar_order:`, spError);
        // This could be a database connection error, or SP does not exist, etc.
        return new Response(
          JSON.stringify({
            status: 'ERROR',
            error_code: 'DB_PROCEDURE_ERROR',
            message: 'Failed to execute payment processing.',
            details: spError.message,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      console.log(`[${requestId}] Stored procedure sp_process_bar_order returned:`, spResult);
      const result = spResult as SpResponse; // Cast to our expected SP response structure

      // Handle response based on SP output
      switch (result.status) {
        case 'SUCCESS':
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        case 'IDEMPOTENCY_SUCCESS': // Already processed, return original success
           console.log(`[${requestId}] Idempotency key ${client_request_id} indicated prior success.`);
           return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
            status: 200, // Or 201 if that's how original success was reported
          });
        case 'ERROR':
          switch (result.error_code) {
            case 'CARD_NOT_FOUND':
            case 'CARD_INACTIVE':
              return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' },
                status: 404, // Not Found
              });
            case 'INSUFFICIENT_FUNDS':
              return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' },
                status: 402, // Payment Required (or 400 Bad Request as per original)
              });
            case 'IDEMPOTENCY_CONFLICT_PROCESSING': // Order is currently being processed by another request
              return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' },
                status: 409, // Conflict
              });
            default: // Other business logic errors from SP
              return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' },
                status: 400, // Bad Request for general SP-side validation errors
              });
          }
        default:
          // Should not happen if SP is well-behaved
          console.error(`[${requestId}] Unexpected status from SP: ${result.status}`);
          return new Response(
            JSON.stringify({
              status: 'ERROR',
              error_code: 'UNEXPECTED_SP_RESPONSE',
              message: 'Received an unexpected response from the payment processor.',
              details: result,
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 500 }
          );
      }
    } catch (e) {
      // This catch block is for unexpected errors in the Edge Function itself,
      // not for errors returned by the SP (which are handled above).
      console.error(`[${requestId}] Unexpected error in Edge Function:`, e);
      return new Response(
        JSON.stringify({
          status: 'ERROR',
          error_code: 'EDGE_FUNCTION_ERROR',
          message: 'An unexpected server error occurred.',
          details: e.message,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 500 }
      );
    }
  } catch (e) {
    // This outer catch is for errors like JSON parsing before SP call attempt
    console.error(`[${requestId}] Unexpected error:`, e);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Server error processing order',
        details: e.message 
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}) 