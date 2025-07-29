import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Interface for the log entry sent from the client
interface LogEntry {
  level: string;
  message: string;
  args: any[];
  timestamp: string;
}

// Interface for the log request payload
interface LogRequest {
  logs: LogEntry[];
  metadata: {
    timestamp: string;
    userAgent: string;
    route: string;
    appVersion: string;
    environment: string;
    userId?: string;
  };
  batchId: string;
}

serve(async (req: Request) => {
  // Generate request ID for traceability
  const requestId = crypto.randomUUID();
  
  // CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  
  // Check preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  // Process the request
  try {
    // Read request body as text first for debugging
    const bodyText = await req.text();
    
    // If body is empty, log it and return an error
    if (!bodyText || bodyText.trim() === '') {
      console.error(`[${requestId}] Empty request body received`);
      return new Response(JSON.stringify({
        error: 'Empty request body'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    
    // Parse the body text as JSON
    let logRequest: LogRequest;
    try {
      logRequest = JSON.parse(bodyText);
      console.log(`[${requestId}] Received log batch with ${logRequest.logs.length} entries`);
    } catch (jsonError) {
      console.error(`[${requestId}] JSON parse error: ${jsonError.message}`);
      return new Response(JSON.stringify({
        error: 'Invalid JSON format'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    
    // Basic validation
    if (!logRequest.logs || !Array.isArray(logRequest.logs) || !logRequest.metadata) {
      console.error(`[${requestId}] Invalid log format`);
      return new Response(JSON.stringify({
        error: 'Invalid log format'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    
    // Create Supabase client with service role for database access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );
    
    // Process the logs
    const { logs, metadata, batchId } = logRequest;
    
    // Log to Deno console for debugging/monitoring
    console.log(`[${requestId}] Processing ${logs.length} logs from batch ${batchId}`);
    console.log(`[${requestId}] Client metadata: ${JSON.stringify(metadata)}`);
    
    // Log the first few entries to the Deno console
    const logSample = logs.slice(0, 3).map(log => `[${log.level}] ${log.message}`);
    console.log(`[${requestId}] Sample logs: ${logSample.join(', ')}${logs.length > 3 ? ', ...' : ''}`);
    
    // Check if we have a logs table, and if not, don't try to insert
    // This allows us to deploy the function before the table exists
    let hasLogsTable = false;
    try {
      const { data: tables, error } = await supabaseAdmin.rpc('get_tables');
      if (!error && tables) {
        hasLogsTable = tables.some((table: any) => table.table_name === 'app_logs');
      }
    } catch (error) {
      console.warn(`[${requestId}] Could not check for logs table: ${error.message}`);
    }
    
    // Insert logs to the database if table exists
    if (hasLogsTable) {
      try {
        // Format logs for database insertion
        const dbLogs = logs.map(log => ({
          level: log.level,
          message: log.message,
          args: log.args,
          client_timestamp: log.timestamp,
          server_timestamp: new Date().toISOString(),
          user_agent: metadata.userAgent,
          route: metadata.route,
          app_version: metadata.appVersion,
          environment: metadata.environment,
          user_id: metadata.userId || null,
          batch_id: batchId,
          request_id: requestId
        }));
        
        // Send logs to database
        const { error } = await supabaseAdmin
          .from('app_logs')
          .insert(dbLogs);
        
        if (error) {
          console.error(`[${requestId}] Failed to insert logs: ${error.message}`);
        } else {
          console.log(`[${requestId}] Successfully stored ${dbLogs.length} logs`);
        }
      } catch (dbError) {
        console.error(`[${requestId}] Database error: ${dbError.message}`);
      }
    } else {
      console.log(`[${requestId}] Skipped database insertion - app_logs table not found`);
    }
    
    // Return success response
    return new Response(JSON.stringify({
      status: 'success',
      message: `Processed ${logs.length} logs`,
      requestId
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
    
  } catch (error) {
    console.error(`[${requestId}] Unexpected error: ${error.message}`);
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
      requestId
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}) 