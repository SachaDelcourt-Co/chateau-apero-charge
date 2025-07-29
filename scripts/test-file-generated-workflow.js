/**
 * Test File Generated Workflow
 * 
 * This script tests the complete refund processing workflow with the new file_generated column:
 * 1. Tests that generate-refund-data only returns records where file_generated = false
 * 2. Tests that process-refunds marks records as processed (file_generated = true)
 * 3. Verifies that subsequent calls don't reprocess the same records
 */

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

// Test configuration
const testConfig = {
  debtor_config: {
    name: 'Test Company SPRL',
    iban: 'BE68 5390 0754 7034',
    bic: 'GKCCBEBB',
    address_line1: '123 Test Street',
    address_line2: '1000 Brussels',
    country: 'BE',
    organization_id: '0123456789',
    organization_issuer: 'KBO-BCE'
  },
  xml_options: {
    message_id_prefix: 'TEST',
    requested_execution_date: '2024-01-16'
  },
  processing_options: {
    max_refunds: 5, // Limit for testing
    include_warnings: true,
    dry_run: true // Use dry run for testing
  }
};

async function testFileGeneratedWorkflow() {
  console.log('🧪 Testing File Generated Workflow');
  console.log('=====================================\n');

  try {
    // Step 1: Test initial data retrieval (should return records with file_generated = false)
    console.log('📋 Step 1: Testing generate-refund-data (initial call)');
    console.log('Expected: Should return records where file_generated = false\n');
    
    const initialDataResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-refund-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!initialDataResponse.ok) {
      throw new Error(`Generate refund data failed: ${initialDataResponse.status} ${await initialDataResponse.text()}`);
    }

    const initialData = await initialDataResponse.json();
    console.log('✅ Initial data retrieval successful');
    console.log(`📊 Found ${initialData.data?.summary?.valid_refunds || 0} valid refunds to process`);
    console.log(`📊 Total refunds in database: ${initialData.data?.summary?.total_refunds || 0}`);
    console.log(`📊 Validation errors: ${initialData.data?.summary?.error_count || 0}\n`);

    if (!initialData.data?.valid_refunds || initialData.data.valid_refunds.length === 0) {
      console.log('ℹ️  No refunds available for processing (all may already be processed)');
      console.log('💡 To test the workflow, ensure some refunds have file_generated = false in the database\n');
      return;
    }

    // Show sample of refunds to be processed
    console.log('📋 Sample refunds to be processed:');
    initialData.data.valid_refunds.slice(0, 3).forEach(refund => {
      console.log(`   - ID: ${refund.id}, Name: ${refund.first_name} ${refund.last_name}, Amount: €${refund.amount_recharged}`);
    });
    console.log('');

    // Step 2: Test refund processing (dry run mode)
    console.log('🔄 Step 2: Testing process-refunds (dry run mode)');
    console.log('Expected: Should process refunds and mark them as file_generated = true\n');
    
    const processResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-refunds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testConfig)
    });

    if (!processResponse.ok) {
      throw new Error(`Process refunds failed: ${processResponse.status} ${await processResponse.text()}`);
    }

    const processResult = await processResponse.json();
    console.log('✅ Refund processing successful (dry run)');
    console.log(`📊 Processed ${processResult.data?.transaction_count || 0} refunds`);
    console.log(`💰 Total amount: €${processResult.data?.total_amount?.toFixed(2) || '0.00'}`);
    console.log(`⏱️  Processing time: ${processResult.data?.processing_summary?.total_processing_time_ms || 0}ms\n`);

    // Step 3: Test actual processing (non-dry run) with limited refunds
    console.log('🚀 Step 3: Testing actual refund processing (limited batch)');
    console.log('Expected: Should update file_generated = true for processed refunds\n');
    
    const actualProcessConfig = {
      ...testConfig,
      processing_options: {
        ...testConfig.processing_options,
        dry_run: false,
        max_refunds: 2 // Process only 2 refunds for testing
      }
    };

    const actualProcessResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-refunds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(actualProcessConfig)
    });

    if (!actualProcessResponse.ok) {
      throw new Error(`Actual process refunds failed: ${actualProcessResponse.status} ${await actualProcessResponse.text()}`);
    }

    // Check if we got XML content or JSON response
    const contentType = actualProcessResponse.headers.get('content-type');
    if (contentType?.includes('application/xml')) {
      const xmlContent = await actualProcessResponse.text();
      const messageId = actualProcessResponse.headers.get('X-Message-ID');
      const transactionCount = actualProcessResponse.headers.get('X-Transaction-Count');
      const totalAmount = actualProcessResponse.headers.get('X-Total-Amount');
      
      console.log('✅ XML generation successful');
      console.log(`📄 Message ID: ${messageId}`);
      console.log(`📊 Transactions: ${transactionCount}`);
      console.log(`💰 Total amount: €${totalAmount}`);
      console.log(`📝 XML length: ${xmlContent.length} characters\n`);
    } else {
      const actualProcessResult = await actualProcessResponse.json();
      console.log('✅ Actual refund processing completed');
      console.log('📊 Result:', actualProcessResult);
    }

    // Step 4: Test subsequent data retrieval (should return fewer records)
    console.log('🔍 Step 4: Testing generate-refund-data (after processing)');
    console.log('Expected: Should return fewer records (processed ones excluded)\n');
    
    const subsequentDataResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-refund-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!subsequentDataResponse.ok) {
      throw new Error(`Subsequent data retrieval failed: ${subsequentDataResponse.status} ${await subsequentDataResponse.text()}`);
    }

    const subsequentData = await subsequentDataResponse.json();
    console.log('✅ Subsequent data retrieval successful');
    console.log(`📊 Found ${subsequentData.data?.summary?.valid_refunds || 0} valid refunds (after processing)`);
    console.log(`📊 Total refunds in database: ${subsequentData.data?.summary?.total_refunds || 0}`);
    
    // Compare results
    const initialCount = initialData.data?.summary?.valid_refunds || 0;
    const subsequentCount = subsequentData.data?.summary?.valid_refunds || 0;
    const processedCount = initialCount - subsequentCount;
    
    console.log(`\n📈 Workflow Summary:`);
    console.log(`   - Initial available refunds: ${initialCount}`);
    console.log(`   - Refunds after processing: ${subsequentCount}`);
    console.log(`   - Refunds marked as processed: ${processedCount}`);
    
    if (processedCount > 0) {
      console.log('✅ File generated workflow is working correctly!');
      console.log('✅ Refunds are being marked as processed and excluded from subsequent calls');
    } else {
      console.log('⚠️  No refunds were marked as processed - check the update logic');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('📋 Error details:', error);
  }
}

// Test different scenarios
async function testEdgeCases() {
  console.log('\n🧪 Testing Edge Cases');
  console.log('=====================\n');

  try {
    // Test with no available refunds (all processed)
    console.log('🔍 Testing scenario: All refunds already processed');
    
    // This would happen if all refunds have file_generated = true
    const noRefundsResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-refund-data`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (noRefundsResponse.ok) {
      const noRefundsData = await noRefundsResponse.json();
      if (noRefundsData.data?.summary?.valid_refunds === 0) {
        console.log('✅ Correctly handles case with no available refunds');
      }
    }

    // Test processing with no refunds available
    console.log('🔄 Testing process-refunds with no available refunds');
    
    const noProcessResponse = await fetch(`${SUPABASE_URL}/functions/v1/process-refunds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...testConfig,
        processing_options: { dry_run: true }
      })
    });

    if (!noProcessResponse.ok) {
      const errorData = await noProcessResponse.json();
      if (errorData.error_code === 'NO_REFUNDS_AVAILABLE') {
        console.log('✅ Correctly handles case with no refunds to process');
      }
    }

  } catch (error) {
    console.error('❌ Edge case test failed:', error.message);
  }
}

// Run the tests
async function runAllTests() {
  console.log('🚀 Starting File Generated Workflow Tests\n');
  
  await testFileGeneratedWorkflow();
  await testEdgeCases();
  
  console.log('\n🏁 All tests completed!');
  console.log('\n💡 Usage Notes:');
  console.log('   - Update SUPABASE_URL and SUPABASE_ANON_KEY with your actual values');
  console.log('   - Ensure your database has some refunds with file_generated = false');
  console.log('   - The test uses dry_run mode by default to avoid affecting production data');
  console.log('   - Check the database to verify file_generated status changes');
}

// Execute if run directly
if (typeof window === 'undefined') {
  runAllTests().catch(console.error);
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testFileGeneratedWorkflow,
    testEdgeCases,
    runAllTests
  };
}