# Load Testing for Château Apéro System

This directory contains enhanced load testing scripts for the Château Apéro payment and card charging system. These tests are designed to simulate high-volume scenarios with a gradual load increase approach to identify exactly when rate limiting issues occur and how well they are handled.

## Prerequisites

To run these tests, you'll need to install k6:

```bash
# MacOS
brew install k6

# Windows (using Chocolatey)
choco install k6

# Docker alternative
docker pull grafana/k6
```

## Available Tests

1. **Bar Operations Test** (`bar-operations.js`)
   - Simulates multiple concurrent bar order operations with progressive load
   - Tests product listing, order creation, and card balance updates
   - Enhanced randomization for more realistic order patterns

2. **Bar Operations Functional Test** (`bar-operations-functional.js`) **[NEW]**
   - End-to-end business logic validation of the complete bar order workflow
   - Validates data integrity across all operations (card balances, orders, items)
   - Tests specific edge cases like exact balance orders and complex orders
   - Provides detailed metrics on balance accuracy and order integrity

3. **Card Recharge Test** (`card-recharges.js`)
   - Simulates card recharging with progressive load testing
   - Includes weighted distribution of recharge amounts
   - Implements comprehensive error tracking and reporting

4. **Card Recharge Functional Test** (`card-recharges-functional.js`) **[NEW]**
   - End-to-end business logic validation of the complete recharge workflow
   - Verifies payment records are properly created and linked to cards
   - Tests various recharge scenarios (small/large amounts, cash/card payments)
   - Validates final card balances match expected values after recharge

5. **Mixed Operations Test** (`mixed-operations.js`)
   - Simulates a realistic mix of bar operations, recharges, and admin activities
   - Implements token bucket rate limiting to avoid overwhelming the API
   - Enhanced reporting of operation success rates

6. **NFC Operations Test** (`nfc-operations.js`)
   - Simulates various NFC scanning patterns (quick, normal, flaky)
   - Tests different card types (regular, low balance, empty)
   - Detailed metrics for scan success and reconnection attempts

7. **Cleanup Utility** (`cleanup-test-data.js`)
   - Removes all test data created during load testing sessions
   - Uses rate limit-aware deletion to avoid API limits

## Progressive Load Testing Approach

All tests now use a gradual increase in load across four distinct stages:

1. **Low Load Stage**
   - Starts with minimal users/requests
   - Verifies basic functionality works without overwhelming the system
   - Duration: ~1.5 minutes

2. **Medium Load Stage**
   - Moderate increase in concurrent users/requests
   - Tests system performance under reasonable load
   - Duration: ~1.5 minutes

3. **High Load Stage**
   - Significant increase in concurrent users/requests
   - Approaches but doesn't exceed expected production limits
   - Duration: ~1.5 minutes

4. **Extreme Load Stage**
   - Pushes beyond expected limits to identify breaking points
   - Uses arrival rate executor for maximum stress testing
   - Automatically ramps down to avoid prolonged overload
   - Duration: ~1.5 minutes

This staged approach allows you to pinpoint exactly when rate limiting begins affecting the system and how well the application handles increasing loads.

## Enhanced Metrics

The updated tests track numerous metrics to provide comprehensive insights:

| Metric | Description |
|--------|-------------|
| `rate_limit_errors` | Overall rate of 429 responses from the API |
| `rate_limit_[endpoint]` | Rate limit errors by specific endpoint |
| `response_time_[endpoint]` | Response time trends by endpoint |
| `max_retry_count` | Distribution of retry attempts |
| `backoff_duration_ms` | Time spent in exponential backoff |
| `operation_success_rate` | Rate of successfully completed operations |
| `nfc_scan_success_rate` | Rate of successful NFC card scans |
| `nfc_total_scans` | Counter of total NFC scan attempts |
| `nfc_reconnect_attempts` | Count of NFC reconnection attempts |
| `total_recharge_amount` | Total value of all card recharges |

### Business Logic Validation Metrics (New)

The functional tests also include business validation metrics:

| Metric | Description |
|--------|-------------|
| `business_balance_accuracy` | Rate of successful card balance verifications |
| `business_order_integrity` | Rate of correctly created orders |
| `business_item_integrity` | Rate of correctly created order items |
| `business_workflow_success` | Rate of end-to-end workflow success |
| `business_recharge_success` | Rate of successful card recharges |
| `business_payment_record` | Rate of correct payment record creation |

## Running the Tests

To run any test with detailed metrics output:

```bash
# Run bar operations test with output to JSON for analysis
k6 run --out json=results/bar-results.json bar-operations.js

# Run bar operations functional test
k6 run --out json=results/bar-functional-results.json bar-operations-functional.js

# Run card recharge test
k6 run --out json=results/recharge-results.json card-recharges.js

# Run card recharge functional test
k6 run --out json=results/recharge-functional-results.json card-recharges-functional.js

# Run mixed operations test
k6 run --out json=results/mixed-results.json mixed-operations.js 

# Run NFC operations test
k6 run --out json=results/nfc-results.json nfc-operations.js

# Clean up test data after testing (always run this!)
k6 run cleanup-test-data.js
```

For the best visualization of results, you can use InfluxDB and Grafana:

```bash
# Run with output to InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 bar-operations-functional.js
```

## Interpreting Test Results

After running the tests, pay special attention to:

1. **Operation Success Rate**
   - When does it start to drop below 100%?
   - Which endpoints fail first under load?

2. **Rate Limit Errors**
   - At what load level do they first appear?
   - How does the retry mechanism handle them?

3. **Backoff Analysis**
   - How much time is spent in backoff at each load level?
   - Do operations still complete successfully after retries?

4. **Response Time Degradation**
   - How do response times change as load increases?
   - Is there a clear inflection point where performance degrades?

5. **Endpoint-Specific Issues**
   - Which specific API endpoints hit rate limits first?
   - Are there particular operations that struggle under load?

6. **Business Logic Integrity** (New)
   - Does the card balance remain accurate under load?
   - Are all order items properly created and linked?
   - At what point does data integrity start to degrade?

## New Functional Testing Approach

The new functional tests go beyond technical success to validate full business logic:

### End-to-End Workflow Validation

Each test run verifies the complete workflow:

1. **Card Verification/Creation**
   - Ensures test cards exist with the correct initial balance
   - Verifies card data can be retrieved consistently

2. **Transaction Processing**
   - For Bar Operations: Creates orders and order items with proper relationships
   - For Card Recharges: Creates payment records with unique transaction IDs

3. **Balance Management**
   - Updates card balances correctly based on operation type
   - For Bar: Deducts the order total from card balance
   - For Recharges: Adds the recharge amount to card balance

4. **Data Integrity Checks**
   - Validates all relationships between entities
   - Confirms no data is lost during high concurrency operations
   - Verifies final balances match expected values

### Specific Edge Cases Tested

The functional tests include specific scenarios to verify edge cases:

- **Simple/Complex Orders**: Order variations with different product mixes
- **Exact Balance Orders**: Orders that use nearly all of a card's available balance
- **Recharge Scenarios**: Various recharge amounts (small, medium, large)
- **Payment Methods**: Testing both card and cash payment processing

## Randomization and Realism

Each test now includes enhanced randomization to better simulate real-world usage:

- **Bar Operations**: Varies number of items (1-5), product types, and quantities
- **Card Recharges**: Uses weighted distributions for recharge amounts
- **NFC Operations**: Simulates different scan patterns and card types
- **Mixed Operations**: Random selection of operation types with varying intervals

This randomization helps identify edge cases and makes the load profile more realistic.

## Rate Limit Handling

All tests include sophisticated rate limit handling:

1. **Exponential Backoff with Jitter**
   - Base delay: 500ms
   - Multiplier: 2^retry_count
   - Random factor: 0.5-1.5
   - Maximum delay: 10 seconds

2. **Per-Endpoint Tracking**
   - Metrics for each endpoint to identify problematic APIs
   - Detailed logging of rate limit encounters

3. **Controlled Request Pacing**
   - Random delays between operations
   - Jittered requests to avoid thundering herd problem
   - Group-based execution for clearer reporting

## Understanding the Test Scenarios

### Bar Operations Functional Test

The bar operations functional test validates the entire business process:

1. Login as bar staff
2. Get available products
3. Create test cards with known balances
4. Process simulated orders with different complexity levels
5. Verify all data is correctly saved and consistent across the database

This test focuses on data integrity and correctness rather than just successful API calls.

### Card Recharge Functional Test

The card recharge functional test validates the entire recharge process:

1. Login as recharge staff
2. Create or verify test cards with specific starting balances
3. Process various recharge scenarios (different amounts, payment methods)
4. Create payment records with unique transaction IDs
5. Update card balances and verify correctness
6. Validate payment records match the expected values

This test ensures that the entire recharge workflow maintains data integrity under load.

### Bar Operations Test

The standard bar operations test simulates the technical flow of processing orders at the bar:

1. Login as bar staff
2. Get available products
3. Check/create a card 
4. Create an order with random products
5. Create order items
6. Update card balance

Issues typically appear during order creation and card balance updates as these operations modify data.

### Card Recharge Test

The card recharge test simulates recharging NFC cards at recharge stations:

1. Login as recharge staff
2. Check/create a card
3. Record payment transaction
4. Update card balance

Rate limits often appear during the payment recording phase as this generates new records.

### Mixed Operations Test

This test runs a mix of all operations with different user types:

1. Bar operations (orders, payments)
2. Recharge operations (top-ups)
3. Admin operations (reports, queries)

This test is the most realistic as it simulates multiple simultaneous user types accessing the system.

### NFC Operations Test

This test focuses specifically on NFC card scanning:

1. Simulates quick scans, normal scans, and flaky scans
2. Tests with regular cards, low-balance cards, and empty cards
3. Verifies reconnection behavior when scans are interrupted

## Recommendations for Testing

For the most comprehensive analysis:

1. Start with the functional tests to verify business logic correctness
2. Run the standard load tests to establish performance baselines
3. Run the mixed operations test to simulate real event conditions
4. Monitor both technical and business metrics throughout the tests
5. Identify the specific load point where data integrity starts to degrade
6. Always run the cleanup script after testing

## Analyzing the Results

After running the tests, you'll be able to answer these key questions:

1. How many concurrent users can the system handle before rate limiting occurs?
2. How much does the exponential backoff and retry mechanism improve completion rates?
3. Which specific operations are most vulnerable to rate limiting?
4. How well does the system handle flaky NFC connections?
5. What is the maximum sustainable throughput (operations per second)?
6. At what point does business logic validation start to fail?
7. Which aspects of data integrity (balance, orders, items) are most vulnerable?

This information will help you configure appropriate rate limits and optimize the system for your expected attendance of 3,000 people across 10 bars.

## Test Environment Considerations

When running these tests:

1. **Database Impact**: These tests will create simulated cards, orders, and transactions in your database.
2. **API Rate Limits**: Tests are designed to work within Supabase rate limits, but you may still hit them occasionally.
3. **Test Data Cleanup**: After testing, run the `cleanup-test-data.js` script to remove all test data.

## Recommended Testing Strategy

For thorough testing before your event, we recommend the following approach:

1. **Initial Testing**: Run functional tests at low volume to verify business logic correctness
2. **Gradual Scale-Up**: If tests succeed, gradually increase load by modifying request rates
3. **Mixed Workload**: Test with the mixed-operations script to simulate real-world usage
4. **Sustained Load**: Run extended tests (10+ minutes) to verify system stability
5. **Cleanup**: Clean up test data after each testing session

## Real-World Load Estimation

Based on your expected attendance of 3,000 people and 10 bars:

- Each bar might process 1-5 orders per minute during peak times
- Recharge stations might handle 10-30 recharges per minute during peak times
- The system should handle 50+ concurrent users during peak periods

The tests are configured to simulate these loads while respecting API rate limits.

## Troubleshooting

If the tests fail with rate limit errors:
- Decrease the request rates and concurrent users
- Increase sleep times between requests
- Run tests at different times (Supabase may have different load)
- Consider upgrading your Supabase plan for higher rate limits

For other errors, check:
- API key and endpoint URL validity
- User credentials validity
- Permission settings for test users

## Customizing the Tests

You can modify these test scripts to:

- Adjust the number of virtual users (VUs)
- Change the ramp-up patterns
- Modify the thresholds for pass/fail criteria
- Add additional scenarios specific to your use case

## Troubleshooting

If the tests fail with authentication errors, check:
- The API key and endpoint URL
- User credentials validity
- Permission settings for test users

For performance issues, look at:
- Database indexes and query performance
- API response times
- Rate limiting configuration 