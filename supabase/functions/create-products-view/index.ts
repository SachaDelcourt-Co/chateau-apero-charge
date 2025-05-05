import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    // Create a Supabase client with the project's service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create a view to map bar_products to the products REST endpoint structure
    // This helps the tests to work with our data structure
    await supabase.rpc('admin_query', {
      query_text: `
        -- Create products view for compatibility with tests
        CREATE OR REPLACE VIEW products AS 
        SELECT 
          id,
          name,
          price,
          category,
          is_deposit,
          is_return,
          created_at
        FROM bar_products;
        
        -- Create table for compatibility with tests
        CREATE TABLE IF NOT EXISTS cards (
          id TEXT PRIMARY KEY,
          balance NUMERIC DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          description TEXT,
          last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
        
        -- Create RLS policies for cards
        CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON "cards"
        FOR SELECT USING (auth.role() IN ('authenticated', 'anon'));
        
        CREATE POLICY IF NOT EXISTS "Enable insert for authenticated users only" ON "cards"
        FOR INSERT TO authenticated WITH CHECK (true);
        
        CREATE POLICY IF NOT EXISTS "Enable update for authenticated users only" ON "cards"
        FOR UPDATE TO authenticated USING (true);
      `
    });

    console.log('Created compatibility views and tables');

    // Return success
    return new Response(
      JSON.stringify({ success: true, message: "API compatibility layer enabled" }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  } catch (error) {
    console.error('Error creating compatibility layer:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    );
  }
}); 