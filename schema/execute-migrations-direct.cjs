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

async function createTablesDirectly() {
  console.log('🚀 Creating tables directly using Supabase client...\n');
  
  try {
    // Create idempotency_keys table
    console.log('📄 Creating idempotency_keys table...');
    const { error: idempotencyError } = await supabase.rpc('create_idempotency_keys_table');
    
    if (idempotencyError && !idempotencyError.message.includes('already exists')) {
      console.log('⚠️  Standard RPC not available, trying alternative approach...');
      
      // Alternative: Create a simple test to see if tables exist
      const { data: testData, error: testError } = await supabase
        .from('idempotency_keys')
        .select('*')
        .limit(1);
      
      if (testError && testError.message.includes('does not exist')) {
        console.log('❌ Tables need to be created. Please run migrations manually.');
        console.log('\n📋 Manual migration steps:');
        console.log('1. Connect to your Supabase database using psql or the SQL editor');
        console.log('2. Execute the contents of schema/07_add_core_tables.sql');
        console.log('3. Execute the contents of schema/08_alter_existing_tables.sql');
        console.log('4. Execute the contents of schema/09_create_stored_procedures.sql');
        console.log('\nOr use the Supabase dashboard SQL editor to run these files.');
        return false;
      } else {
        console.log('✅ Tables already exist or were created successfully');
        return true;
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error during table creation:', error.message);
    return false;
  }
}

async function verifyMigrations() {
  console.log('\n🔍 Verifying migration status...');
  
  const tables = [
    { name: 'idempotency_keys', description: 'Idempotency keys table' },
    { name: 'app_transaction_log', description: 'Application transaction log table' },
    { name: 'nfc_scan_log', description: 'NFC scan log table' }
  ];
  
  let allTablesExist = true;
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table.name)
        .select('*')
        .limit(1);
      
      if (error) {
        if (error.message.includes('does not exist')) {
          console.log(`❌ ${table.description} - NOT FOUND`);
          allTablesExist = false;
        } else {
          console.log(`⚠️  ${table.description} - Error: ${error.message}`);
        }
      } else {
        console.log(`✅ ${table.description} - EXISTS`);
      }
    } catch (error) {
      console.log(`❌ ${table.description} - Error: ${error.message}`);
      allTablesExist = false;
    }
  }
  
  // Check for new columns in existing tables
  console.log('\n🔍 Checking for new columns in existing tables...');
  
  try {
    // Check recharges table for new columns
    const { data: rechargeData, error: rechargeError } = await supabase
      .from('recharges')
      .select('staff_id, checkpoint_id, client_request_id')
      .limit(1);
    
    if (!rechargeError) {
      console.log('✅ recharges table - New columns exist');
    } else {
      console.log('❌ recharges table - New columns missing');
      allTablesExist = false;
    }
  } catch (error) {
    console.log('❌ recharges table - Error checking columns');
    allTablesExist = false;
  }
  
  try {
    // Check bar_orders table for new columns
    const { data: orderData, error: orderError } = await supabase
      .from('bar_orders')
      .select('client_request_id')
      .limit(1);
    
    if (!orderError) {
      console.log('✅ bar_orders table - New columns exist');
    } else {
      console.log('❌ bar_orders table - New columns missing');
      allTablesExist = false;
    }
  } catch (error) {
    console.log('❌ bar_orders table - Error checking columns');
    allTablesExist = false;
  }
  
  return allTablesExist;
}

async function main() {
  console.log('🔧 Database Migration Status Checker\n');
  
  const migrationsComplete = await verifyMigrations();
  
  if (!migrationsComplete) {
    console.log('\n📋 MIGRATION REQUIRED');
    console.log('The following SQL files need to be executed manually:');
    console.log('');
    console.log('1. schema/07_add_core_tables.sql');
    console.log('2. schema/08_alter_existing_tables.sql');
    console.log('3. schema/09_create_stored_procedures.sql');
    console.log('');
    console.log('💡 You can execute these using:');
    console.log('   - Supabase Dashboard SQL Editor');
    console.log('   - psql command line tool');
    console.log('   - Any PostgreSQL client');
    console.log('');
    console.log('🔗 Supabase Dashboard: https://supabase.com/dashboard/project/[your-project-id]/sql');
    
    process.exit(1);
  } else {
    console.log('\n🎉 All migrations appear to be complete!');
    console.log('✅ Database schema is up to date.');
  }
}

main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});