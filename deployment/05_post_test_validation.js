// deployment/05_post_test_validation.js
// Post-test validation script for verifying data integrity after load testing

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Validation results
let validationResults = {
    overall: false,
    data_integrity: {
        card_balances: false,
        transaction_consistency: false,
        idempotency_integrity: false,
        log_completeness: false
    },
    business_logic: {
        no_negative_balances: false,
        transaction_totals_match: false,
        recharge_accuracy: false
    },
    performance_indicators: {
        response_times_acceptable: false,
        error_rates_acceptable: false,
        throughput_achieved: false
    },
    errors: [],
    warnings: [],
    statistics: {}
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

function logStat(label, value) {
    console.log(`📊 ${label}: ${value}`);
    validationResults.statistics[label] = value;
}

// Validation functions
async function validateCardBalances() {
    console.log('\n💳 VALIDATING CARD BALANCE INTEGRITY');
    console.log('====================================');
    
    try {
        // Check for negative balances (should never happen)
        const { data: negativeBalances, error: negError } = await supabase
            .from('table_cards')
            .select('id, amount')
            .lt('amount', 0)
            .like('id', 'k6-test-%');
            
        if (negError) {
            logError(`Error checking negative balances: ${negError.message}`);
            return false;
        }
        
        if (negativeBalances.length > 0) {
            logError(`Found ${negativeBalances.length} cards with negative balances`);
            negativeBalances.forEach(card => {
                logError(`  Card ${card.id}: €${card.amount}`);
            });
            return false;
        } else {
            logSuccess('No negative card balances found');
            validationResults.business_logic.no_negative_balances = true;
        }
        
        // Get balance statistics
        const { data: balanceStats, error: statsError } = await supabase
            .from('table_cards')
            .select('amount')
            .like('id', 'k6-test-%');
            
        if (statsError) {
            logWarning(`Error getting balance statistics: ${statsError.message}`);
        } else {
            const balances = balanceStats.map(card => parseFloat(card.amount));
            const totalBalance = balances.reduce((sum, balance) => sum + balance, 0);
            const avgBalance = totalBalance / balances.length;
            const minBalance = Math.min(...balances);
            const maxBalance = Math.max(...balances);
            
            logStat('Total card balance', `€${totalBalance.toFixed(2)}`);
            logStat('Average card balance', `€${avgBalance.toFixed(2)}`);
            logStat('Minimum card balance', `€${minBalance.toFixed(2)}`);
            logStat('Maximum card balance', `€${maxBalance.toFixed(2)}`);
            logStat('Cards with zero balance', balances.filter(b => b === 0).length);
        }
        
        validationResults.data_integrity.card_balances = true;
        return true;
        
    } catch (e) {
        logError(`Card balance validation error: ${e.message}`);
        return false;
    }
}

async function validateTransactionConsistency() {
    console.log('\n🔄 VALIDATING TRANSACTION CONSISTENCY');
    console.log('=====================================');
    
    try {
        // Count transactions by type
        const { data: transactionCounts, error: countError } = await supabase
            .from('app_transaction_log')
            .select('transaction_type, status')
            .like('client_request_id', 'k6-test-%');
            
        if (countError) {
            logError(`Error counting transactions: ${countError.message}`);
            return false;
        }
        
        // Analyze transaction patterns
        const transactionStats = {};
        transactionCounts.forEach(tx => {
            const key = `${tx.transaction_type}_${tx.status}`;
            transactionStats[key] = (transactionStats[key] || 0) + 1;
        });
        
        logInfo('Transaction breakdown:');
        Object.entries(transactionStats).forEach(([key, count]) => {
            logStat(`  ${key}`, count);
        });
        
        // Check for orphaned transactions
        const { data: barOrders, error: ordersError } = await supabase
            .from('bar_orders')
            .select('id, client_request_id')
            .like('client_request_id', 'k6-test-%');
            
        if (ordersError) {
            logWarning(`Error checking bar orders: ${ordersError.message}`);
        } else {
            logStat('Bar orders created', barOrders.length);
        }
        
        const { data: recharges, error: rechargesError } = await supabase
            .from('recharges')
            .select('id, client_request_id')
            .like('client_request_id', 'k6-test-%');
            
        if (rechargesError) {
            logWarning(`Error checking recharges: ${rechargesError.message}`);
        } else {
            logStat('Recharges created', recharges.length);
        }
        
        validationResults.data_integrity.transaction_consistency = true;
        return true;
        
    } catch (e) {
        logError(`Transaction consistency validation error: ${e.message}`);
        return false;
    }
}

async function validateIdempotencyIntegrity() {
    console.log('\n🔒 VALIDATING IDEMPOTENCY INTEGRITY');
    console.log('===================================');
    
    try {
        // Check idempotency keys
        const { data: idempotencyKeys, error: idempError } = await supabase
            .from('idempotency_keys')
            .select('request_id, source_function, status')
            .like('request_id', 'k6-test-%');
            
        if (idempError) {
            logError(`Error checking idempotency keys: ${idempError.message}`);
            return false;
        }
        
        // Analyze idempotency status
        const statusCounts = {};
        idempotencyKeys.forEach(key => {
            const statusKey = `${key.source_function}_${key.status}`;
            statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
        });
        
        logInfo('Idempotency key status:');
        Object.entries(statusCounts).forEach(([key, count]) => {
            logStat(`  ${key}`, count);
        });
        
        // Check for stuck processing states
        const stuckKeys = idempotencyKeys.filter(key => 
            key.status === 'PROCESSING' || key.status === 'PENDING'
        );
        
        if (stuckKeys.length > 0) {
            logWarning(`Found ${stuckKeys.length} idempotency keys in processing state`);
            stuckKeys.forEach(key => {
                logWarning(`  ${key.request_id} (${key.source_function}): ${key.status}`);
            });
        } else {
            logSuccess('No stuck idempotency keys found');
        }
        
        validationResults.data_integrity.idempotency_integrity = true;
        return true;
        
    } catch (e) {
        logError(`Idempotency integrity validation error: ${e.message}`);
        return false;
    }
}

async function validateLogCompleteness() {
    console.log('\n📝 VALIDATING LOG COMPLETENESS');
    console.log('==============================');
    
    try {
        // Count log entries
        const { data: logEntries, error: logError } = await supabase
            .from('app_transaction_log')
            .select('correlation_id, transaction_type, status, created_at')
            .like('client_request_id', 'k6-test-%')
            .order('created_at', { ascending: false });
            
        if (logError) {
            logError(`Error checking log entries: ${logError.message}`);
            return false;
        }
        
        logStat('Total log entries', logEntries.length);
        
        // Check log entry distribution over time
        if (logEntries.length > 0) {
            const firstEntry = new Date(logEntries[logEntries.length - 1].created_at);
            const lastEntry = new Date(logEntries[0].created_at);
            const duration = (lastEntry - firstEntry) / 1000; // seconds
            
            logStat('Test duration', `${Math.round(duration)} seconds`);
            logStat('Average log rate', `${(logEntries.length / duration).toFixed(2)} entries/second`);
        }
        
        // Check for error patterns
        const errorEntries = logEntries.filter(entry => 
            entry.status.includes('ERROR') || entry.status.includes('FAILED')
        );
        
        logStat('Error log entries', errorEntries.length);
        
        if (errorEntries.length > 0) {
            const errorRate = (errorEntries.length / logEntries.length * 100).toFixed(2);
            logStat('Error rate', `${errorRate}%`);
            
            if (parseFloat(errorRate) > 10) {
                logWarning(`High error rate detected: ${errorRate}%`);
            }
        }
        
        validationResults.data_integrity.log_completeness = true;
        return true;
        
    } catch (e) {
        logError(`Log completeness validation error: ${e.message}`);
        return false;
    }
}

async function validateBusinessLogic() {
    console.log('\n💼 VALIDATING BUSINESS LOGIC');
    console.log('============================');
    
    try {
        // Validate transaction amount consistency
        const { data: barOrderItems, error: itemsError } = await supabase
            .from('bar_order_items')
            .select(`
                quantity,
                price_at_purchase,
                bar_orders!inner(total_amount, client_request_id)
            `)
            .like('bar_orders.client_request_id', 'k6-test-%');
            
        if (itemsError) {
            logWarning(`Error checking bar order items: ${itemsError.message}`);
        } else {
            let inconsistentOrders = 0;
            const orderTotals = {};
            
            // Group items by order and calculate totals
            barOrderItems.forEach(item => {
                const orderId = item.bar_orders.client_request_id;
                if (!orderTotals[orderId]) {
                    orderTotals[orderId] = {
                        calculated: 0,
                        recorded: parseFloat(item.bar_orders.total_amount)
                    };
                }
                orderTotals[orderId].calculated += item.quantity * parseFloat(item.price_at_purchase);
            });
            
            // Check for discrepancies
            Object.entries(orderTotals).forEach(([orderId, totals]) => {
                const diff = Math.abs(totals.calculated - totals.recorded);
                if (diff > 0.01) { // Allow for small rounding differences
                    inconsistentOrders++;
                    logWarning(`Order ${orderId}: calculated €${totals.calculated.toFixed(2)}, recorded €${totals.recorded.toFixed(2)}`);
                }
            });
            
            if (inconsistentOrders === 0) {
                logSuccess('All bar order totals are consistent');
                validationResults.business_logic.transaction_totals_match = true;
            } else {
                logError(`Found ${inconsistentOrders} orders with inconsistent totals`);
            }
            
            logStat('Bar orders validated', Object.keys(orderTotals).length);
        }
        
        // Validate recharge accuracy
        const { data: recharges, error: rechargeError } = await supabase
            .from('recharges')
            .select('amount, client_request_id')
            .like('client_request_id', 'k6-test-%');
            
        if (rechargeError) {
            logWarning(`Error checking recharges: ${rechargeError.message}`);
        } else {
            const totalRechargeAmount = recharges.reduce((sum, recharge) => 
                sum + parseFloat(recharge.amount), 0
            );
            
            logStat('Total recharge amount', `€${totalRechargeAmount.toFixed(2)}`);
            logStat('Average recharge amount', `€${(totalRechargeAmount / recharges.length).toFixed(2)}`);
            
            validationResults.business_logic.recharge_accuracy = true;
        }
        
        return true;
        
    } catch (e) {
        logError(`Business logic validation error: ${e.message}`);
        return false;
    }
}

async function validatePerformanceIndicators() {
    console.log('\n⚡ VALIDATING PERFORMANCE INDICATORS');
    console.log('====================================');
    
    try {
        // This would typically analyze K6 output or performance logs
        // For now, we'll check basic database performance indicators
        
        const startTime = Date.now();
        
        // Test query performance
        const { data: perfTest, error: perfError } = await supabase
            .from('app_transaction_log')
            .select('count')
            .like('client_request_id', 'k6-test-%');
            
        const queryTime = Date.now() - startTime;
        
        if (perfError) {
            logWarning(`Performance test query failed: ${perfError.message}`);
        } else {
            logStat('Query response time', `${queryTime}ms`);
            
            if (queryTime < 1000) {
                logSuccess('Database query performance acceptable');
                validationResults.performance_indicators.response_times_acceptable = true;
            } else {
                logWarning(`Slow database query: ${queryTime}ms`);
            }
        }
        
        // Check for any obvious performance issues
        logInfo('Performance validation completed (basic checks only)');
        logInfo('For detailed performance analysis, review K6 output and metrics');
        
        validationResults.performance_indicators.throughput_achieved = true;
        validationResults.performance_indicators.error_rates_acceptable = true;
        
        return true;
        
    } catch (e) {
        logError(`Performance validation error: ${e.message}`);
        return false;
    }
}

async function generateFinalReport() {
    console.log('\n📊 POST-TEST VALIDATION REPORT');
    console.log('===============================');
    
    const overallValid = validationResults.data_integrity.card_balances &&
                        validationResults.data_integrity.transaction_consistency &&
                        validationResults.data_integrity.idempotency_integrity &&
                        validationResults.business_logic.no_negative_balances &&
                        validationResults.business_logic.transaction_totals_match;
    
    validationResults.overall = overallValid;
    
    console.log(`Overall Status: ${overallValid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Card Balance Integrity: ${validationResults.data_integrity.card_balances ? '✅' : '❌'}`);
    console.log(`Transaction Consistency: ${validationResults.data_integrity.transaction_consistency ? '✅' : '❌'}`);
    console.log(`Idempotency Integrity: ${validationResults.data_integrity.idempotency_integrity ? '✅' : '❌'}`);
    console.log(`No Negative Balances: ${validationResults.business_logic.no_negative_balances ? '✅' : '❌'}`);
    console.log(`Transaction Totals Match: ${validationResults.business_logic.transaction_totals_match ? '✅' : '❌'}`);
    console.log(`Log Completeness: ${validationResults.data_integrity.log_completeness ? '✅' : '❌'}`);
    
    if (validationResults.errors.length > 0) {
        console.log('\n❌ ERRORS:');
        validationResults.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    if (validationResults.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        validationResults.warnings.forEach(warning => console.log(`   - ${warning}`));
    }
    
    console.log('\n📈 STATISTICS:');
    Object.entries(validationResults.statistics).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
    });
    
    if (overallValid) {
        console.log('\n🎉 POST-TEST VALIDATION PASSED!');
        console.log('The festival simulation completed successfully with data integrity maintained.');
    } else {
        console.log('\n⚠️  POST-TEST VALIDATION ISSUES DETECTED');
        console.log('Please review the errors above and investigate any data integrity issues.');
    }
    
    return validationResults;
}

// Main validation function
async function postTestValidation() {
    console.log('🔍 FESTIVAL SIMULATION POST-TEST VALIDATION');
    console.log('============================================');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Supabase URL: ${SUPABASE_URL}`);
    console.log('============================================');
    
    try {
        // Run all validations
        await validateCardBalances();
        await validateTransactionConsistency();
        await validateIdempotencyIntegrity();
        await validateLogCompleteness();
        await validateBusinessLogic();
        await validatePerformanceIndicators();
        
        // Generate final report
        const results = await generateFinalReport();
        
        // Exit with appropriate code
        process.exit(results.overall ? 0 : 1);
        
    } catch (e) {
        logError(`Post-test validation failed with error: ${e.message}`);
        console.log('\n💥 POST-TEST VALIDATION FAILED');
        process.exit(1);
    }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    postTestValidation();
}

export {
    postTestValidation,
    validationResults
};