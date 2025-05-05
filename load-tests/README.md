# Load Testing for Château Apéro System

This directory contains load testing scripts for the Château Apéro payment and card charging system. These tests are designed to simulate high-volume scenarios to ensure the platform can handle the expected load during an event with up to 3,000 attendees.

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
   - Simulates multiple concurrent bar operations
   - Respects Supabase API rate limits with automatic retries
   - Tests product listing, order creation, and payment processing

2. **Card Recharge Test** (`card-recharges.js`)
   - Simulates high-volume card recharging operations
   - Implements backoff strategy for rate limit handling
   - Tests the recharge flow, including transaction creation and balance updates

3. **Mixed Operations Test** (`mixed-operations.js`)
   - Simulates a realistic mix of bar operations, recharges, and admin activities
   - Tests the system under varied load conditions
   - Uses role-based operations to mimic real-world usage

4. **NFC Operations Test** (`nfc-operations.js`)
   - Focuses specifically on testing the NFC scanning functionality
   - Simulates card scans with rate limit handling
   - Tests the auto-reconnect feature and card balance checks

5. **Cleanup Utility** (`cleanup-test-data.js`)
   - Cleans up all test data created during load testing
   - Removes simulated cards, orders, and transactions
   - Should be run after completing load testing

## Running the Tests

To run any of the tests, use the k6 command-line tool:

```bash
# Run bar operations test
k6 run bar-operations.js

# Run card recharge test
k6 run card-recharges.js

# Run mixed operations test
k6 run mixed-operations.js

# Run NFC operations test
k6 run nfc-operations.js

# Clean up test data after testing
k6 run cleanup-test-data.js
```

## Rate Limits and Test Parameters

Supabase enforces rate limits that prevent excessive API requests. The tests have been configured to work within these limits by:

1. **Reduced Concurrency**: Tests use lower number of virtual users and request rates.
2. **Retry Logic**: Automatic retry with exponential backoff when rate limits are hit.
3. **Increased Delays**: Added sleep durations between requests to spread the load.
4. **Modified Thresholds**: Adjusted success criteria to account for rate limiting.

If you encounter rate limit errors (`over_request_rate_limit`), you can further adjust the following parameters in the test scripts:

```javascript
// Example: Reduce request rate
export const options = {
  scenarios: {
    operations: {
      rate: 1,                // Decrease to reduce requests per second
      preAllocatedVUs: 3,     // Decrease to reduce concurrent users
      maxVUs: 5,              // Decrease to reduce maximum concurrent users
    },
  },
};

// Example: Increase delays between requests
sleep(5);  // Increase sleep time to further spread requests
```

## Test Results and Analysis

After running the tests, k6 will provide metrics including:

- Request rates and durations
- Error rates
- HTTP response codes
- Rate limit error count (via `rate_limit_errors` metric)
- Custom metrics defined in the test

Key thresholds to monitor:

- `http_req_duration`: Response time should be under 3 seconds in most cases
- `http_req_failed`: Error rate should be below 20% (higher threshold to account for rate limits)
- `rate_limit_errors`: Tracks specific rate limit errors

## Test Environment Considerations

When running these tests:

1. **Database Impact**: These tests will create simulated cards, orders, and transactions in your database.
2. **API Rate Limits**: Tests are designed to work within Supabase rate limits, but you may still hit them occasionally.
3. **Test Data Cleanup**: After testing, run the `cleanup-test-data.js` script to remove all test data.

## Recommended Testing Strategy

For thorough testing before your event, we recommend the following approach:

1. **Initial Testing**: Run individual tests at low volume to verify functionality
2. **Gradual Scale-Up**: If tests succeed, you can gradually increase load by modifying request rates
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