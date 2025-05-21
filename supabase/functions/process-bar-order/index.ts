import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BarOrderRequest {
  card_id: string;
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    name: string;
  }>;
  total_amount: number;
  point_of_sale?: number;
}

interface BarOrderResponse {
  success: boolean;
  order_id?: number;
  previous_balance?: number;
  new_balance?: number;
  error?: string;
  details?: any;
}

serve(async (req) => {
  // Initialize logging with request ID for traceability
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Bar order processing started`);
  
  try {
    // Enhanced error handling for JSON parsing
    let requestBody;
    try {
      // Log the request content type for debugging
      console.log(`[${requestId}] Request content-type: ${req.headers.get('content-type')}`);
      
      // Read request body as text first for debugging
      const bodyText = await req.text();
      
      // If body is empty, log it and throw an error
      if (!bodyText || bodyText.trim() === '') {
        console.error(`[${requestId}] Empty request body received`);
        throw new Error('Empty request body');
      }
      
      // Log the raw body for debugging
      console.log(`[${requestId}] Raw request body: ${bodyText.substring(0, 200)}${bodyText.length > 200 ? '...' : ''}`);
      
      // Parse the body text as JSON
      try {
        requestBody = JSON.parse(bodyText);
      } catch (jsonError) {
        console.error(`[${requestId}] JSON parse error: ${jsonError.message}`);
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
    const { card_id, items, total_amount, point_of_sale = 1 } = requestBody as BarOrderRequest;
    
    console.log(`[${requestId}] Processing order for card ${card_id} with ${items?.length || 0} items, total: ${total_amount}€`);
    
    // Create Supabase client with service role for full access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );
    
    // Validate inputs
    if (!card_id || !items || items.length === 0 || total_amount <= 0) {
      console.error(`[${requestId}] Input validation failed:`, { card_id, itemCount: items?.length, total_amount });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid input parameters' 
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Call RPC for transaction safety
    const { data, error } = await supabaseAdmin.rpc('create_bar_order_transaction', {
      p_card_id: card_id.trim(),
      p_total_amount: total_amount,
      p_status: 'completed',
      p_point_of_sale: point_of_sale,
      p_items: items
    });
    
    if (error) {
      console.error(`[${requestId}] Database error:`, error);
      
      // Parse error message for user-friendly responses
      let userMessage = 'An error occurred while processing your order';
      if (error.message.includes('Insufficient funds')) {
        userMessage = 'Insufficient funds on card';
      } else if (error.message.includes('Card not found')) {
        userMessage = 'Card not found';
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: userMessage,
          details: error.message
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log(`[${requestId}] Order processed successfully:`, data);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: data.order_id,
        previous_balance: data.previous_balance,
        new_balance: data.new_balance
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (e) {
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