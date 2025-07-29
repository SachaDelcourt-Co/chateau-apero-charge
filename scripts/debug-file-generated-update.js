/**
 * Debug File Generated Update
 * 
 * This script helps debug why the file_generated column is not being updated.
 * It tests the database update operation directly.
 */

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = 'your-service-role-key';

async function debugFileGeneratedUpdate() {
  console.log('🔍 Debugging File Generated Update Issue');
  console.log('==========================================\n');

  try {
    // Step 1: Check current state of refunds
    console.log('📋 Step 1: Checking current refunds state');
    
    const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/refunds?select=id,file_generated&limit=10`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!checkResponse.ok) {
      throw new Error(`Failed to check refunds: ${checkResponse.status} ${await checkResponse.text()}`);
    }

    const currentRefunds = await checkResponse.json();
    console.log('✅ Current refunds state:');
    currentRefunds.forEach(refund => {
      console.log(`   - ID: ${refund.id}, file_generated: ${refund.file_generated}`);
    });
    console.log('');

    // Step 2: Test direct database update
    console.log('🔄 Step 2: Testing direct database update');
    
    // Get a few refunds that are false
    const falseRefunds = currentRefunds.filter(r => r.file_generated === false);
    if (falseRefunds.length === 0) {
      console.log('ℹ️  No refunds with file_generated = false found. Creating test scenario...');
      
      // Reset a few refunds to false for testing
      const resetResponse = await fetch(`${SUPABASE_URL}/rest/v1/refunds?id=in.(${currentRefunds.slice(0, 2).map(r => r.id).join(',')})`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ file_generated: false })
      });

      if (!resetResponse.ok) {
        throw new Error(`Failed to reset refunds: ${resetResponse.status} ${await resetResponse.text()}`);
      }

      const resetData = await resetResponse.json();
      console.log(`✅ Reset ${resetData.length} refunds to file_generated = false for testing`);
      falseRefunds.push(...resetData);
    }

    // Now test updating them to true
    const testIds = falseRefunds.slice(0, 2).map(r => r.id);
    console.log(`🧪 Testing update for IDs: ${testIds.join(', ')}`);

    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/refunds?id=in.(${testIds.join(',')})`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ file_generated: true })
    });

    console.log(`📊 Update response status: ${updateResponse.status}`);
    console.log(`📊 Update response headers:`, Object.fromEntries(updateResponse.headers.entries()));

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`❌ Update failed: ${updateResponse.status}`);
      console.error(`❌ Error response: ${errorText}`);
      throw new Error(`Update failed: ${updateResponse.status} ${errorText}`);
    }

    const updateData = await updateResponse.json();
    console.log('✅ Update successful!');
    console.log(`📊 Updated ${updateData.length} records:`);
    updateData.forEach(refund => {
      console.log(`   - ID: ${refund.id}, file_generated: ${refund.file_generated}`);
    });
    console.log('');

    // Step 3: Verify the update
    console.log('🔍 Step 3: Verifying the update');
    
    const verifyResponse = await fetch(`${SUPABASE_URL}/rest/v1/refunds?id=in.(${testIds.join(',')})&select=id,file_generated`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!verifyResponse.ok) {
      throw new Error(`Failed to verify: ${verifyResponse.status} ${await verifyResponse.text()}`);
    }

    const verifyData = await verifyResponse.json();
    console.log('✅ Verification results:');
    verifyData.forEach(refund => {
      const status = refund.file_generated ? '✅ TRUE' : '❌ FALSE';
      console.log(`   - ID: ${refund.id}, file_generated: ${status}`);
    });

    const allUpdated = verifyData.every(r => r.file_generated === true);
    if (allUpdated) {
      console.log('\n🎉 SUCCESS: All refunds were successfully updated!');
      console.log('💡 The database update mechanism is working correctly.');
      console.log('💡 The issue might be in the Edge Function logic or permissions.');
    } else {
      console.log('\n⚠️  ISSUE: Some refunds were not updated.');
      console.log('💡 There might be a database constraint or trigger preventing the update.');
    }

    // Step 4: Test the Edge Function approach
    console.log('\n🔄 Step 4: Testing Edge Function approach');
    
    // Reset one refund to false
    const resetOneResponse = await fetch(`${SUPABASE_URL}/rest/v1/refunds?id=eq.${testIds[0]}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file_generated: false })
    });

    if (resetOneResponse.ok) {
      console.log(`✅ Reset refund ${testIds[0]} to file_generated = false`);
      
      // Now test the process-refunds function with dry run
      console.log('🧪 Testing process-refunds function (dry run)...');
      
      const processResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-refunds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          debtor_config: {
            name: 'Test Company',
            iban: 'BE68 5390 0754 7034',
            country: 'BE'
          },
          processing_options: {
            dry_run: true,
            max_refunds: 1
          }
        })
      });

      console.log(`📊 Process-refunds response status: ${processResponse.status}`);
      
      if (processResponse.ok) {
        const processData = await processResponse.json();
        console.log('✅ Process-refunds dry run successful');
        console.log(`📊 Would process ${processData.data?.transaction_count || 0} refunds`);
      } else {
        const errorText = await processResponse.text();
        console.error(`❌ Process-refunds failed: ${errorText}`);
      }
    }

  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
    console.error('📋 Error details:', error);
  }
}

// Additional helper functions
async function checkDatabasePermissions() {
  console.log('\n🔐 Checking Database Permissions');
  console.log('=================================\n');

  try {
    // Test basic read permission
    const readResponse = await fetch(`${SUPABASE_URL}/rest/v1/refunds?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    console.log(`📖 Read permission: ${readResponse.ok ? '✅ OK' : '❌ FAILED'}`);

    // Test write permission
    const writeTestResponse = await fetch(`${SUPABASE_URL}/rest/v1/refunds?id=eq.999999`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file_generated: true })
    });

    console.log(`✏️  Write permission: ${writeTestResponse.ok || writeTestResponse.status === 404 ? '✅ OK' : '❌ FAILED'}`);
    
    if (!writeTestResponse.ok && writeTestResponse.status !== 404) {
      const errorText = await writeTestResponse.text();
      console.log(`❌ Write error: ${errorText}`);
    }

  } catch (error) {
    console.error('❌ Permission check failed:', error.message);
  }
}

async function showDatabaseSchema() {
  console.log('\n📋 Database Schema Information');
  console.log('==============================\n');

  try {
    // Get table info
    const schemaResponse = await fetch(`${SUPABASE_URL}/rest/v1/refunds?select=*&limit=1`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    if (schemaResponse.ok) {
      const sampleData = await schemaResponse.json();
      if (sampleData.length > 0) {
        console.log('✅ Sample refund record structure:');
        const sample = sampleData[0];
        Object.keys(sample).forEach(key => {
          const value = sample[key];
          const type = typeof value;
          console.log(`   - ${key}: ${type} (${value})`);
        });
        
        if ('file_generated' in sample) {
          console.log('\n✅ file_generated column exists in the table');
        } else {
          console.log('\n❌ file_generated column is MISSING from the table!');
          console.log('💡 You need to add the column: ALTER TABLE refunds ADD COLUMN file_generated BOOLEAN DEFAULT FALSE;');
        }
      }
    }

  } catch (error) {
    console.error('❌ Schema check failed:', error.message);
  }
}

// Run all debug tests
async function runAllDebugTests() {
  console.log('🚀 Starting Complete Debug Analysis\n');
  
  console.log('💡 Instructions:');
  console.log('1. Update SUPABASE_URL and SUPABASE_SERVICE_KEY with your actual values');
  console.log('2. Run this script to identify the issue');
  console.log('3. Check the detailed logs for clues\n');
  
  await showDatabaseSchema();
  await checkDatabasePermissions();
  await debugFileGeneratedUpdate();
  
  console.log('\n🏁 Debug analysis completed!');
  console.log('\n💡 Next Steps:');
  console.log('1. If the direct database update works, the issue is in the Edge Function');
  console.log('2. If the direct database update fails, check database permissions');
  console.log('3. If file_generated column is missing, add it to the database');
  console.log('4. Check the Edge Function logs for detailed error messages');
}

// Execute if run directly
if (typeof window === 'undefined') {
  runAllDebugTests().catch(console.error);
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    debugFileGeneratedUpdate,
    checkDatabasePermissions,
    showDatabaseSchema,
    runAllDebugTests
  };
}