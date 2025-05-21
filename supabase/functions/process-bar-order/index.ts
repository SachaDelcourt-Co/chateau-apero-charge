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
    const { card_id, items, total_amount, point_of_sale = 1 } = requestBody as BarOrderRequest;
    
    console.log(`[${requestId}] Processing order for card ${card_id} with ${items?.length || 0} items, total: ${total_amount}€`);
    console.log(`[${requestId}] Items: ${JSON.stringify(items)}`);
    
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
    
    // First, query the current card balance to verify it exists and has enough funds
    console.log(`[${requestId}] Fetching card balance for card ID: ${card_id}`);
    const { data: cardData, error: cardError } = await supabaseAdmin
      .from('table_cards')
      .select('id, amount')
      .eq('id', card_id)
      .maybeSingle();

    if (cardError) {
      console.error(`[${requestId}] Error fetching card data:`, cardError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Error fetching card data',
          details: cardError.message
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!cardData) {
      console.error(`[${requestId}] Card not found: ${card_id}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Card not found'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`[${requestId}] Card found: ${cardData.id}, current balance: ${cardData.amount}`);
    
    // Parse balance as number for comparison
    const currentBalance = parseFloat(cardData.amount);
    if (isNaN(currentBalance)) {
      console.error(`[${requestId}] Invalid card balance: ${cardData.amount}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid card balance format'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if the card has enough funds
    if (currentBalance < total_amount) {
      console.error(`[${requestId}] Insufficient funds: ${currentBalance} < ${total_amount}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Insufficient funds on card',
          previous_balance: currentBalance,
          details: `Card has ${currentBalance}€ but order costs ${total_amount}€`
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Begin database transaction manually instead of using stored procedure
    console.log(`[${requestId}] Starting transaction`);

    try {
      // 1. Create the order record
      console.log(`[${requestId}] Creating order record`);
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('bar_orders')
        .insert({
          card_id: card_id,
          total_amount: total_amount,
          status: 'completed',
          point_of_sale: point_of_sale
        })
        .select()
        .single();

      if (orderError) {
        throw new Error(`Error creating order: ${orderError.message}`);
      }

      console.log(`[${requestId}] Order created with ID: ${orderData.id}`);

      // 2. Create order items
      const orderItems = [];
      for (const item of items) {
        orderItems.push({
          order_id: orderData.id,
          product_name: item.name,
          price: item.unit_price,
          quantity: item.quantity,
          is_deposit: item.is_deposit || false,
          is_return: item.is_return || false
        });
      }

      console.log(`[${requestId}] Creating ${orderItems.length} order items`);
      const { error: itemsError } = await supabaseAdmin
        .from('bar_order_items')
        .insert(orderItems);

      if (itemsError) {
        throw new Error(`Error creating order items: ${itemsError.message}`);
      }

      // 3. Update card balance
      const newBalance = (currentBalance - total_amount).toFixed(2);
      console.log(`[${requestId}] Updating card balance from ${currentBalance} to ${newBalance}`);
      
      const { error: updateError } = await supabaseAdmin
        .from('table_cards')
        .update({ 
          amount: newBalance 
        })
        .eq('id', card_id);

      if (updateError) {
        throw new Error(`Error updating card balance: ${updateError.message}`);
      }

      // 4. Return success result
      console.log(`[${requestId}] Transaction successful, returning response`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          order_id: orderData.id,
          previous_balance: currentBalance,
          new_balance: parseFloat(newBalance)
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );

    } catch (txError) {
      // If any part of the transaction fails, log and return the error
      console.error(`[${requestId}] Transaction error:`, txError);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: txError.message || 'Transaction failed',
          details: txError
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
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