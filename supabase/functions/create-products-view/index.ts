import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to ensure products are in the database or create them
export const createProductsIfNotExist = async (supabase, products) => {
  // Rate limit handling variables
  const maxRetries = 5;
  let retryCount = 0;

  // Function to perform database operations with retry
  const performDatabaseOperationWithRetry = async (operation) => {
    while (retryCount <= maxRetries) {
      try {
        return await operation();
      } catch (error) {
        // Check if it's a rate limit error
        if (error.code === '429' || error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
          retryCount++;
          
          // If we've exhausted our retries, throw the error
          if (retryCount > maxRetries) {
            console.error(`Rate limit hit, max retries (${maxRetries}) exceeded.`);
            throw error;
          }
          
          // Calculate backoff time (exponential with jitter)
          const sleepTime = Math.min(Math.pow(2, retryCount) * 500 + Math.random() * 500, 10000);
          console.log(`Rate limit hit, retrying in ${sleepTime}ms (attempt ${retryCount}/${maxRetries})...`);
          
          // Sleep for the backoff time
          await new Promise(resolve => setTimeout(resolve, sleepTime));
        } else {
          // For non-rate-limit errors, throw immediately
          throw error;
        }
      }
    }
  };

  // Check existing products with retry
  const existingProducts = await performDatabaseOperationWithRetry(async () => {
    const { data, error } = await supabase.from('products').select('id');
    if (error) throw error;
    return data;
  });

  // Get set of existing product IDs
  const existingIds = new Set(existingProducts.map(p => p.id));

  // Filter out products that already exist
  const newProducts = products.filter(p => !existingIds.has(p.id));

  if (newProducts.length > 0) {
    console.log(`Creating ${newProducts.length} new products`);
    // Insert new products with retry
    await performDatabaseOperationWithRetry(async () => {
      const { error } = await supabase.from('products').insert(newProducts);
      if (error) throw error;
    });
  } else {
    console.log('No new products to create');
  }

  return { success: true, newProducts };
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

    // Add basic products to database with retry
    const maxRetries = 5;
    let retryCount = 0;
    let result;

    while (retryCount <= maxRetries) {
      try {
        result = await createProductsIfNotExist(supabase, ProductsList);
        break; // Exit the loop if successful
      } catch (error) {
        // Check if it's a rate limit error
        if (error.code === '429' || error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
          retryCount++;
          
          // If we've exhausted our retries, return an error
          if (retryCount > maxRetries) {
            console.error(`Rate limit hit, max retries (${maxRetries}) exceeded.`);
            return new Response(JSON.stringify({ 
              error: 'Rate limit exceeded after multiple retries' 
            }), { status: 429, headers: corsHeaders });
          }
          
          // Calculate backoff time (exponential with jitter)
          const sleepTime = Math.min(Math.pow(2, retryCount) * 500 + Math.random() * 500, 10000);
          console.log(`Rate limit hit, retrying in ${sleepTime}ms (attempt ${retryCount}/${maxRetries})...`);
          
          // Sleep for the backoff time
          await new Promise(resolve => setTimeout(resolve, sleepTime));
        } else {
          // For non-rate-limit errors, return immediately
          console.error('Error creating products:', error);
          return new Response(JSON.stringify({ 
            error: `Failed to create products: ${error.message}` 
          }), { status: 500, headers: corsHeaders });
        }
      }
    }

    return new Response(JSON.stringify(result), { 
      status: 200, 
      headers: corsHeaders 
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: `Server error: ${error.message}` 
    }), { status: 500, headers: corsHeaders });
  }
}); 