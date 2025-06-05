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

async function executeSqlFile(filePath) {
  console.log(`\n📄 Executing migration: ${path.basename(filePath)}`);
  
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split SQL into individual statements (basic approach)
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`  ⚡ Executing statement ${i + 1}/${statements.length}`);
        
        // Use rpc to execute raw SQL
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          console.error(`  ❌ Error in statement ${i + 1}:`, error.message);
          throw error;
        }
        
        console.log(`  ✅ Statement ${i + 1} executed successfully`);
      }
    }
    
    console.log(`✅ Migration ${path.basename(filePath)} completed successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Migration ${path.basename(filePath)} failed:`, error.message);
    return false;
  }
}

async function executeMigrations() {
  console.log('🚀 Starting database migrations...\n');
  
  // List of migration files in order
  const migrationFiles = [
    '07_add_core_tables.sql',
    '08_alter_existing_tables.sql',
    '09_create_stored_procedures.sql'
  ];
  
  let allSuccessful = true;
  
  for (const fileName of migrationFiles) {
    const filePath = path.join(__dirname, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Migration file not found: ${fileName}`);
      allSuccessful = false;
      continue;
    }
    
    const success = await executeSqlFile(filePath);
    if (!success) {
      allSuccessful = false;
      console.log('\n⚠️  Migration failed. Stopping execution to prevent data corruption.');
      break;
    }
  }
  
  if (allSuccessful) {
    console.log('\n🎉 All migrations completed successfully!');
    
    // Verify the new tables exist
    console.log('\n🔍 Verifying new tables...');
    try {
      const { data: idempotencyData, error: idempotencyError } = await supabase
        .from('idempotency_keys')
        .select('*')
        .limit(1);
      
      if (!idempotencyError) {
        console.log('✅ idempotency_keys table verified');
      }
      
      const { data: logData, error: logError } = await supabase
        .from('app_transaction_log')
        .select('*')
        .limit(1);
      
      if (!logError) {
        console.log('✅ app_transaction_log table verified');
      }
      
      const { data: nfcData, error: nfcError } = await supabase
        .from('nfc_scan_log')
        .select('*')
        .limit(1);
      
      if (!nfcError) {
        console.log('✅ nfc_scan_log table verified');
      }
      
    } catch (error) {
      console.log('⚠️  Table verification failed, but migrations may have succeeded');
    }
    
  } else {
    console.log('\n❌ Some migrations failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run migrations
executeMigrations().catch(error => {
  console.error('💥 Unexpected error during migration:', error);
  process.exit(1);
});