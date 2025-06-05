import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Interface for the log entry sent from the client
interface LogEntry {
  level: string;
  message: string; // For generic logs, or a summary for structured logs
  args: any[];
  timestamp: string;
  log_type?: 'generic' | 'nfc_scan' | 'app_transaction';
  payload?: any; // Structured data for nfc_scan or app_transaction
}

// Interface for NFC Scan Log specific data
interface NfcScanLogData {
  card_id_scanned?: string; // Can be null if scan failed before reading ID
  raw_data_if_any?: string;
  scan_timestamp: string; // ISO string
  scan_status: 'success' | 'failure' | 'aborted' | 'pending';
  scan_location_context?: string; // e.g., "Bar Order", "Checkpoint Recharge"
  device_identifier?: string; // e.g., a stable ID for the device performing scan
  user_agent_performing_scan: string; // Browser's User Agent
  error_message?: string; // If scan_status is 'failure'
  error_details?: any;
}

// Interface for Application Transaction Log specific data
interface AppTransactionLogData {
  transaction_id?: string; // Primary key of the transaction if available
  correlation_id?: string; // To link related operations
  card_id?: string;
  transaction_type: string; // e.g., "BAR_ORDER_PAYMENT", "CARD_RECHARGE", "REFUND"
  status: 'initiated' | 'pending' | 'success' | 'failure' | 'cancelled';
  amount_involved?: number;
  currency?: string; // e.g., "EUR"
  payment_method?: string; // e.g., "CARD", "CASH"
  operator_id?: string; // User ID of the operator/cashier
  details?: any; // JSONB for additional structured details
  error_message?: string;
  error_details?: any; // Added from previous diff
}

// Interface for DB structure of app_logs
interface DbAppLog {
  level: string;
  message: string;
  args: any[];
  client_timestamp: string;
  server_timestamp: string;
  user_agent: string;
  route: string;
  app_version: string;
  environment: string;
  user_id?: string | null;
  batch_id: string;
  request_id: string;
}

// Interface for DB structure of nfc_scan_log
interface DbNfcScanLog {
  card_id_scanned?: string;
  raw_data_if_any?: string;
  scan_timestamp: string;
  scan_status: 'success' | 'failure' | 'aborted' | 'pending';
  scan_location_context?: string;
  device_identifier?: string;
  user_agent_performing_scan: string;
  error_message?: string;
  error_details?: any;
  client_app_version: string;
  client_route: string;
  client_user_id?: string | null;
  client_batch_id: string;
  edge_function_request_id: string;
}

// Interface for DB structure of app_transaction_log
interface DbAppTransactionLog {
  transaction_id?: string;
  correlation_id?: string;
  card_id?: string;
  transaction_type: string;
  status: 'initiated' | 'pending' | 'success' | 'failure' | 'cancelled';
  amount_involved?: number;
  currency?: string;
  payment_method?: string;
  operator_id?: string;
  details?: any;
  error_message?: string;
  log_timestamp: string;
  server_received_timestamp: string;
  client_app_version: string;
  client_route: string;
  client_user_id?: string | null;
  client_batch_id: string;
  edge_function_request_id: string;
}

// Define the Database interface for Supabase client
interface Database {
  public: {
    Tables: {
      app_logs: {
        Row: DbAppLog;
        Insert: DbAppLog;
        Update: Partial<DbAppLog>;
      };
      nfc_scan_log: {
        Row: DbNfcScanLog;
        Insert: DbNfcScanLog;
        Update: Partial<DbNfcScanLog>;
      };
      app_transaction_log: {
        Row: DbAppTransactionLog;
        Insert: DbAppTransactionLog;
        Update: Partial<DbAppTransactionLog>;
      };
      // Add other tables here if they are accessed directly by this function
    };
    Views: {
      // Define views here if accessed
    };
    Functions: {
      // Define Rpc functions here if called
      // Example for a hypothetical get_tables function if it were still used:
      // get_tables: {
      //   Args: Record<string, never>;
      //   Returns: { table_name: string }[];
      // };
    };
  };
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
    userId?: string; // User ID from the app's auth context
  };
  batchId: string;
}

serve(async (req: Request) => {
  // Generate request ID for traceability
  const requestId = crypto.randomUUID();
  
  // Check preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
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
        'Access-Control-Allow-Origin': '*'
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
          'Access-Control-Allow-Origin': '*'
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
          'Access-Control-Allow-Origin': '*'
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
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Create Supabase client with service role for database access
    const supabaseAdmin = createClient<Database>( // Specify the Database type
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Process the logs
    const { logs, metadata, batchId } = logRequest;
    
    // Log to Deno console for debugging/monitoring
    console.log(`[${requestId}] Processing ${logs.length} logs from batch ${batchId}`);
    console.log(`[${requestId}] Client metadata: ${JSON.stringify(metadata)}`);

    const genericLogsToInsert: DbAppLog[] = [];
    const nfcScanLogsToInsert: DbNfcScanLog[] = [];
    const appTransactionLogsToInsert: DbAppTransactionLog[] = [];

    const serverTimestamp = new Date().toISOString();

    for (const log of logs) {
      const logType = log.log_type || 'generic'; // Default to generic for backward compatibility

      switch (logType) {
        case 'nfc_scan':
          if (log.payload) {
            const nfcData = log.payload as NfcScanLogData;
            nfcScanLogsToInsert.push({
              card_id_scanned: nfcData.card_id_scanned,
              raw_data_if_any: nfcData.raw_data_if_any,
              scan_timestamp: nfcData.scan_timestamp || log.timestamp, // Fallback to log entry timestamp
              scan_status: nfcData.scan_status,
              scan_location_context: nfcData.scan_location_context,
              device_identifier: nfcData.device_identifier,
              user_agent_performing_scan: nfcData.user_agent_performing_scan || metadata.userAgent,
              error_message: nfcData.error_message,
              error_details: nfcData.error_details,
              // Common metadata
              client_app_version: metadata.appVersion,
              client_route: metadata.route,
              client_user_id: metadata.userId || null,
              client_batch_id: batchId,
              edge_function_request_id: requestId,
            });
          } else {
            console.warn(`[${requestId}] NFC scan log entry missing payload: ${log.message}`);
          }
          break;
        case 'app_transaction':
          if (log.payload) {
            const transactionData = log.payload as AppTransactionLogData;
            appTransactionLogsToInsert.push({
              transaction_id: transactionData.transaction_id,
              correlation_id: transactionData.correlation_id,
              card_id: transactionData.card_id,
              transaction_type: transactionData.transaction_type,
              status: transactionData.status,
              amount_involved: transactionData.amount_involved,
              currency: transactionData.currency,
              payment_method: transactionData.payment_method,
              operator_id: transactionData.operator_id || metadata.userId, // Fallback to metadata.userId
              details: transactionData.details,
              error_message: transactionData.error_message,
              // Common metadata
              log_timestamp: log.timestamp, // Original client log timestamp
              server_received_timestamp: serverTimestamp,
              client_app_version: metadata.appVersion,
              client_route: metadata.route,
              client_user_id: metadata.userId || null, // User initiating the log, might differ from operator_id
              client_batch_id: batchId,
              edge_function_request_id: requestId,
            });
          } else {
            console.warn(`[${requestId}] App transaction log entry missing payload: ${log.message}`);
          }
          break;
        case 'generic':
        default:
          genericLogsToInsert.push({
            level: log.level,
            message: log.message,
            args: log.args,
            client_timestamp: log.timestamp,
            server_timestamp: serverTimestamp,
            user_agent: metadata.userAgent,
            route: metadata.route,
            app_version: metadata.appVersion,
            environment: metadata.environment,
            user_id: metadata.userId || null,
            batch_id: batchId,
            request_id: requestId,
          });
          break;
      }
    }

    // Log sample of parsed data
    if (genericLogsToInsert.length > 0) console.log(`[${requestId}] Sample generic log: ${JSON.stringify(genericLogsToInsert[0])}`);
    if (nfcScanLogsToInsert.length > 0) console.log(`[${requestId}] Sample NFC scan log: ${JSON.stringify(nfcScanLogsToInsert[0])}`);
    if (appTransactionLogsToInsert.length > 0) console.log(`[${requestId}] Sample App transaction log: ${JSON.stringify(appTransactionLogsToInsert[0])}`);


    const insertionPromises = [];
    let genericLogsCount = 0;
    let nfcScanLogsCount = 0;
    let appTransactionLogsCount = 0;

    if (genericLogsToInsert.length > 0) {
      insertionPromises.push(
        supabaseAdmin.from('app_logs').insert(genericLogsToInsert as any) // Cast to any
          .then(({ error }) => {
            if (error) {
              console.error(`[${requestId}] Failed to insert generic logs: ${error.message}`);
              genericLogsCount = 0;
            } else {
              genericLogsCount = genericLogsToInsert.length;
              console.log(`[${requestId}] Successfully stored ${genericLogsCount} generic logs`);
            }
            return { type: 'generic', status: error ? 'failed' : 'success', error, count: genericLogsCount };
          })
      );
    }

    if (nfcScanLogsToInsert.length > 0) {
      insertionPromises.push(
        supabaseAdmin.from('nfc_scan_log').insert(nfcScanLogsToInsert as any) // Cast to any
          .then(({ error }) => {
            if (error) {
              console.error(`[${requestId}] Failed to insert NFC scan logs: ${error.message}`);
              nfcScanLogsCount = 0;
            } else {
              nfcScanLogsCount = nfcScanLogsToInsert.length;
              console.log(`[${requestId}] Successfully stored ${nfcScanLogsCount} NFC scan logs`);
            }
            return { type: 'nfc_scan', status: error ? 'failed' : 'success', error, count: nfcScanLogsCount };
          })
      );
    }

    if (appTransactionLogsToInsert.length > 0) {
      insertionPromises.push(
        supabaseAdmin.from('app_transaction_log').insert(appTransactionLogsToInsert as any) // Cast to any
          .then(({ error }) => {
            if (error) {
              console.error(`[${requestId}] Failed to insert app transaction logs: ${error.message}`);
              appTransactionLogsCount = 0;
            } else {
              appTransactionLogsCount = appTransactionLogsToInsert.length;
              console.log(`[${requestId}] Successfully stored ${appTransactionLogsCount} app transaction logs`);
            }
            return { type: 'app_transaction', status: error ? 'failed' : 'success', error, count: appTransactionLogsCount };
          })
      );
    }

    const results = await Promise.allSettled(insertionPromises);
    
    const processedCounts = {
        totalAttempted: logs.length,
        generic: { attempted: genericLogsToInsert.length, succeeded: 0 },
        nfc_scan: { attempted: nfcScanLogsToInsert.length, succeeded: 0 },
        app_transaction: { attempted: appTransactionLogsToInsert.length, succeeded: 0 },
    };
    const errors: any[] = [];

    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            const val = result.value as { type: string; status: string; error?: any; count: number };
            if (val.status === 'success') {
                if (val.type === 'generic') processedCounts.generic.succeeded = val.count;
                else if (val.type === 'nfc_scan') processedCounts.nfc_scan.succeeded = val.count;
                else if (val.type === 'app_transaction') processedCounts.app_transaction.succeeded = val.count;
            } else if (val.error) {
                errors.push({ type: val.type, message: val.error.message, details: val.error.details });
            }
        } else if (result.status === 'rejected') {
            console.error(`[${requestId}] Critical error during batch insertion: ${result.reason}`);
            errors.push({ type: 'batch_error', message: result.reason.message || 'Unknown batch error' });
        }
    });

    // Return success response
    return new Response(JSON.stringify({
      status: errors.length === 0 ? 'success' : 'partial_success',
      message: `Processed logs. Generic: ${processedCounts.generic.succeeded}/${processedCounts.generic.attempted}, NFC: ${processedCounts.nfc_scan.succeeded}/${processedCounts.nfc_scan.attempted}, Transactions: ${processedCounts.app_transaction.succeeded}/${processedCounts.app_transaction.attempted}.`,
      processedCounts,
      errors,
      requestId,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
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
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}) 