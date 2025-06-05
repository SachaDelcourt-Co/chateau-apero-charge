// deployment/04_validate_test_environment.js
// Environment validation script for production-ready test suite

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test configuration
const REQUIRED_TEST_CARDS = 50;
const REQUIRED_TEST_PRODUCTS = 10;
const REQUIRED_STORED_PROCEDURES = ['sp_process_bar_order', 'sp_process_checkpoint_recharge', 'sp_process_stripe_recharge'];
const REQUIRED_ENDPOINTS = ['/process-bar-order', '/process-checkpoint-recharge', '/stripe-webhook', '/log'];

// Validation results
let validationResults = {
    overall: false,
    database: {
        connected: false,
        stored_procedures: false,
        test_data: false,
        rls_policies: false
    },
    endpoints: {
        reachable: false,
        functional: false
    },
    test_environment: {
        cards_ready: false,
        products_ready: false,
        staff_ready: false,
        checkpoints_ready: false
    },
    errors: [],
    warnings: []
};

// Utility functions
function logSuccess(message) {
    console.log(`✅ ${message}`);
}

function logError(message) {
    console.log(`❌ ${message}`);
    validationResults.errors.push(message);
}

function logWarning(message) {
    console.log(`⚠️  ${message}`);
    validationResults.warnings.push(message);
}

function logInfo(message) {
    console.log(`ℹ️  ${message}`);
}

// Validation functions
async function validateDatabaseConnection() {
    console.log('\n🔍 VALIDATING DATABASE CONNECTION');
    console.log('==================================');
    
    try {
        const { data, error } = await supabase.from('table_cards').select('count').limit(1);
        
        if (error) {
            logError(`Database connection failed: ${error.message}`);
            return false;
        }
        
        logSuccess('Database connection established');
        validationResults.database.connected = true;
        return true;
    } catch (e) {
        logError(`Database connection error: ${e.message}`);
        return false;
    }
}

async function validateStoredProcedures() {
    console.log('\n📋 VALIDATING STORED PROCEDURES');
    console.log('===============================');
    
    let allProceduresExist = true;
    
    for (const procedure of REQUIRED_STORED_PROCEDURES) {
        try {
            // Test with empty parameters to check if procedure exists
            const { error } = await supabase.rpc(procedure, {});
            
            if (error && error.message.includes('Could not find the function')) {
                logError(`Stored procedure missing: ${procedure}`);
                allProceduresExist = false;
            } else {
                logSuccess(`Stored procedure exists: ${procedure}`);
            }
        } catch (e) {
            logError(`Error checking stored procedure ${procedure}: ${e.message}`);
            allProceduresExist = false;
        }
    }
    
    validationResults.database.stored_procedures = allProceduresExist;
    return allProceduresExist;
}

async function validateTestData() {
    console.log('\n💾 VALIDATING TEST DATA');
    console.log('=======================');
    
    let testDataValid = true;
    
    // Check test cards
    try {
        const { data: cards, error: cardsError } = await supabase
            .from('table_cards')
            .select('id, amount')
            .like('id', 'k6-test-%');
            
        if (cardsError) {
            logError(`Error checking test cards: ${cardsError.message}`);
            testDataValid = false;
        } else {
            const cardCount = cards.length;
            if (cardCount >= REQUIRED_TEST_CARDS) {
                logSuccess(`Test cards available: ${cardCount}/${REQUIRED_TEST_CARDS}`);
                validationResults.test_environment.cards_ready = true;
            } else {
                logError(`Insufficient test cards: ${cardCount}/${REQUIRED_TEST_CARDS}`);
                testDataValid = false;
            }
            
            // Check card balances
            const cardsWithBalance = cards.filter(card => card.amount > 0);
            logInfo(`Cards with positive balance: ${cardsWithBalance.length}/${cardCount}`);
        }
    } catch (e) {
        logError(`Error validating test cards: ${e.message}`);
        testDataValid = false;
    }
    
    // Check test products
    try {
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, name, price')
            .like('id', '550e8400-e29b-41d4-a716-44665544%');
            
        if (productsError) {
            logError(`Error checking test products: ${productsError.message}`);
            testDataValid = false;
        } else {
            const productCount = products.length;
            if (productCount >= REQUIRED_TEST_PRODUCTS) {
                logSuccess(`Test products available: ${productCount}/${REQUIRED_TEST_PRODUCTS}`);
                validationResults.test_environment.products_ready = true;
            } else {
                logError(`Insufficient test products: ${productCount}/${REQUIRED_TEST_PRODUCTS}`);
                testDataValid = false;
            }
        }
    } catch (e) {
        logError(`Error validating test products: ${e.message}`);
        testDataValid = false;
    }
    
    // Check test staff
    try {
        const { data: staff, error: staffError } = await supabase
            .from('staff')
            .select('id, name, role')
            .like('id', 'k6-test-%');
            
        if (staffError) {
            logWarning(`Error checking test staff: ${staffError.message}`);
        } else {
            const staffCount = staff.length;
            if (staffCount >= 5) {
                logSuccess(`Test staff available: ${staffCount}`);
                validationResults.test_environment.staff_ready = true;
            } else {
                logWarning(`Limited test staff: ${staffCount}`);
            }
        }
    } catch (e) {
        logWarning(`Error validating test staff: ${e.message}`);
    }
    
    // Check test checkpoints
    try {
        const { data: checkpoints, error: checkpointsError } = await supabase
            .from('checkpoints')
            .select('id, name, active')
            .like('id', 'checkpoint-%');
            
        if (checkpointsError) {
            logWarning(`Error checking test checkpoints: ${checkpointsError.message}`);
        } else {
            const checkpointCount = checkpoints.length;
            if (checkpointCount >= 4) {
                logSuccess(`Test checkpoints available: ${checkpointCount}`);
                validationResults.test_environment.checkpoints_ready = true;
            } else {
                logWarning(`Limited test checkpoints: ${checkpointCount}`);
            }
        }
    } catch (e) {
        logWarning(`Error validating test checkpoints: ${e.message}`);
    }
    
    validationResults.database.test_data = testDataValid;
    return testDataValid;
}

async function validateEndpoints() {
    console.log('\n🌐 VALIDATING API ENDPOINTS');
    console.log('===========================');
    
    const baseUrl = 'https://dqghjrpeoyqvkvoivfnz.supabase.co/functions/v1';
    let endpointsValid = true;
    
    // Test log endpoint (simplest)
    try {
        const response = await fetch(`${baseUrl}/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                level: 'info',
                message: 'Environment validation test',
                timestamp: new Date().toISOString()
            })
        });
        
        if (response.ok) {
            logSuccess('Log endpoint reachable and functional');
            validationResults.endpoints.reachable = true;
        } else {
            logError(`Log endpoint failed: ${response.status} ${response.statusText}`);
            endpointsValid = false;
        }
    } catch (e) {
        logError(`Error testing log endpoint: ${e.message}`);
        endpointsValid = false;
    }
    
    validationResults.endpoints.functional = endpointsValid;
    return endpointsValid;
}

async function validateFunctionalTest() {
    console.log('\n🧪 PERFORMING FUNCTIONAL TESTS');
    console.log('==============================');
    
    let functionalTestsPassed = true;
    
    // Test checkpoint recharge with a real test card
    try {
        const testCardId = 'k6-test-card-001';
        const testAmount = 1.00;
        const clientRequestId = `validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        logInfo(`Testing checkpoint recharge for card: ${testCardId}`);
        
        const { data, error } = await supabase.rpc('sp_process_checkpoint_recharge', {
            card_id_in: testCardId,
            amount_in: testAmount,
            payment_method_in: 'cash',
            staff_id_in: 'k6-test-staff-001',
            client_request_id_in: clientRequestId,
            checkpoint_id_in: 'checkpoint-main'
        });
        
        if (error) {
            logError(`Functional test failed: ${error.message}`);
            functionalTestsPassed = false;
        } else if (data && data.status === 'SUCCESS') {
            logSuccess(`Functional test passed: Checkpoint recharge successful`);
            logInfo(`New balance: €${data.new_balance}`);
        } else {
            logWarning(`Functional test completed with status: ${data?.status || 'unknown'}`);
        }
    } catch (e) {
        logError(`Functional test error: ${e.message}`);
        functionalTestsPassed = false;
    }
    
    return functionalTestsPassed;
}

async function validateEnvironmentHelper() {
    console.log('\n🔧 VALIDATING ENVIRONMENT HELPER FUNCTION');
    console.log('==========================================');
    
    try {
        const { data, error } = await supabase.rpc('validate_test_environment');
        
        if (error) {
            logError(`Environment helper function failed: ${error.message}`);
            return false;
        }
        
        if (data && data.environment_ready) {
            logSuccess('Environment helper confirms test environment is ready');
            logInfo(`Test cards: ${data.test_cards}`);
            logInfo(`Test products: ${data.test_products}`);
            logInfo(`Total card balance: €${data.total_card_balance}`);
            logInfo(`Stored procedures exist: ${data.stored_procedures_exist}`);
            return true;
        } else {
            logWarning('Environment helper indicates test environment may not be fully ready');
            logInfo(`Environment status: ${JSON.stringify(data, null, 2)}`);
            return false;
        }
    } catch (e) {
        logError(`Error calling environment helper: ${e.message}`);
        return false;
    }
}

async function generateValidationReport() {
    console.log('\n📊 VALIDATION REPORT');
    console.log('====================');
    
    const overallValid = validationResults.database.connected &&
                        validationResults.database.stored_procedures &&
                        validationResults.database.test_data &&
                        validationResults.endpoints.functional &&
                        validationResults.test_environment.cards_ready &&
                        validationResults.test_environment.products_ready;
    
    validationResults.overall = overallValid;
    
    console.log(`Overall Status: ${overallValid ? '✅ READY' : '❌ NOT READY'}`);
    console.log(`Database Connected: ${validationResults.database.connected ? '✅' : '❌'}`);
    console.log(`Stored Procedures: ${validationResults.database.stored_procedures ? '✅' : '❌'}`);
    console.log(`Test Data: ${validationResults.database.test_data ? '✅' : '❌'}`);
    console.log(`Endpoints Functional: ${validationResults.endpoints.functional ? '✅' : '❌'}`);
    console.log(`Test Cards Ready: ${validationResults.test_environment.cards_ready ? '✅' : '❌'}`);
    console.log(`Test Products Ready: ${validationResults.test_environment.products_ready ? '✅' : '❌'}`);
    
    if (validationResults.errors.length > 0) {
        console.log('\n❌ ERRORS:');
        validationResults.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    if (validationResults.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        validationResults.warnings.forEach(warning => console.log(`   - ${warning}`));
    }
    
    if (overallValid) {
        console.log('\n🎉 ENVIRONMENT IS READY FOR PRODUCTION TESTING!');
        console.log('You can now run: k6 run load-tests/full-festival-simulation-production.js');
    } else {
        console.log('\n🔧 ENVIRONMENT REQUIRES FIXES BEFORE TESTING');
        console.log('Please address the errors above and run validation again.');
    }
    
    return validationResults;
}

// Main validation function
async function validateTestEnvironment() {
    console.log('🚀 FESTIVAL SIMULATION ENVIRONMENT VALIDATION');
    console.log('==============================================');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Supabase URL: ${SUPABASE_URL}`);
    console.log('==============================================');
    
    try {
        // Run all validations
        await validateDatabaseConnection();
        await validateStoredProcedures();
        await validateTestData();
        await validateEndpoints();
        await validateFunctionalTest();
        await validateEnvironmentHelper();
        
        // Generate final report
        const results = await generateValidationReport();
        
        // Exit with appropriate code
        process.exit(results.overall ? 0 : 1);
        
    } catch (e) {
        logError(`Validation failed with error: ${e.message}`);
        console.log('\n💥 VALIDATION FAILED');
        process.exit(1);
    }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    validateTestEnvironment();
}

export {
    validateTestEnvironment,
    validationResults
};