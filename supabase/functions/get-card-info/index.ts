import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface CardInfoResponse {
  success: boolean;
  card?: {
    id: string;
    amount: string;
    description?: string | null;
  };
  error?: string;
}

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200, 
      headers: corsHeaders 
    });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Method not allowed. Use GET request.' 
      } as CardInfoResponse),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Server configuration error'
        } as CardInfoResponse),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Supabase admin client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Extract cardId from query parameters
    const url = new URL(req.url);
    const cardId = url.searchParams.get('cardId');

    if (!cardId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing cardId parameter'
        } as CardInfoResponse),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate cardId format (basic validation)
    if (typeof cardId !== 'string' || cardId.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid cardId format'
        } as CardInfoResponse),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Fetching card info for cardId: ${cardId}`);

    // Fetch card information from table_cards
    const { data: cardData, error: fetchError } = await supabase
      .from('table_cards')
      .select('id, amount')
      .eq('id', cardId.trim())
      .maybeSingle();

    if (fetchError) {
      console.error('Database error:', fetchError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Database error occurred'
        } as CardInfoResponse),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Card not found
    if (!cardData) {
      console.log(`Card not found: ${cardId}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Card not found'
        } as CardInfoResponse),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Return card information
    console.log(`Card found: ${cardId}, amount: ${cardData.amount}`);
    return new Response(
      JSON.stringify({
        success: true,
        card: {
          id: cardData.id,
          amount: cardData.amount?.toString() || '0.00',
          description: null  // Set to null since column doesn't exist
        }
      } as CardInfoResponse),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      } as CardInfoResponse),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}); 