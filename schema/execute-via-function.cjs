#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('Error: SUPABASE_URL environment variable is required');
  process.exit(1);
}
if (!supabaseAnonKey) {
  console.error('Error: SUPABASE_ANON_KEY environment variable is required');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function executeSQL(sql) {
  try {
    // Try to use the Edge Function approach
    const { data, error } = await supabase.functions.invoke('execute-sql', {
      body: { sql }
    });
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function executeMigrations() {
  console.log('🚀 Attempting to execute migrations via Supabase Edge Functions...\n');
  
  // First, let's try to create the tables one by one using individual statements
  const createStatements = [
    // Create idempotency_keys table
    `CREATE TABLE IF NOT EXISTS public.idempotency_keys (
      request_id TEXT PRIMARY KEY,
      source_function TEXT NOT NULL,
      status TEXT NOT NULL,
      response_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    
    // Create app_transaction_log table
    `CREATE TABLE IF NOT EXISTS public.app_transaction_log (
      log_id BIGSERIAL PRIMARY KEY,
      transaction_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      correlation_id UUID,
      card_id TEXT,
      transaction_type TEXT NOT NULL,
      status TEXT NOT NULL,
      amount_involved DECIMAL(10, 2) NOT NULL,
      previous_balance_on_card DECIMAL(10, 2),
      new_balance_on_card DECIMAL(10, 2),
      details JSONB,
      edge_function_name TEXT,
      edge_function_request_id TEXT,
      client_request_id TEXT,
      staff_id TEXT,
      point_of_sale_id TEXT,
      "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
    
    // Create nfc_scan_log table
    `CREATE TABLE IF NOT EXISTS public.nfc_scan_log (
      scan_log_id BIGSERIAL PRIMARY KEY,
      card_id_scanned TEXT,
      raw_data_if_any TEXT,
      scan_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
      scan_status TEXT NOT NULL,
      scan_location_context TEXT,
      device_identifier TEXT,
      user_agent_performing_scan TEXT,
      session_id TEXT
    );`,
    
    // Add columns to recharges table
    `ALTER TABLE public.recharges 
     ADD COLUMN IF NOT EXISTS staff_id TEXT,
     ADD COLUMN IF NOT EXISTS checkpoint_id TEXT,
     ADD COLUMN IF NOT EXISTS client_request_id TEXT;`,
    
    // Add column to bar_orders table
    `ALTER TABLE public.bar_orders 
     ADD COLUMN IF NOT EXISTS client_request_id TEXT;`
  ];
  
  console.log('⚠️  Direct SQL execution via Supabase client is not supported for DDL statements.');
  console.log('📋 Please execute the following SQL statements manually:\n');
  
  createStatements.forEach((sql, index) => {
    console.log(`-- Statement ${index + 1}:`);
    console.log(sql);
    console.log('');
  });
  
  console.log('💡 You can execute these using:');
  console.log('   1. Supabase Dashboard SQL Editor');
  console.log('   2. psql command line (if you have the connection string)');
  console.log('   3. Any PostgreSQL client');
  console.log('');
  console.log('🔗 Supabase Dashboard: https://supabase.com/dashboard/project/dqghjrpeoyqvkvoivfnz/sql');
  console.log('');
  console.log('📄 Or execute the complete migration files:');
  console.log('   - schema/07_add_core_tables.sql');
  console.log('   - schema/08_alter_existing_tables.sql');
  console.log('   - schema/09_create_stored_procedures.sql');
}

executeMigrations().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});