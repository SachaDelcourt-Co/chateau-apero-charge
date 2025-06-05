import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { Rate, Trend, Counter } from 'k6/metrics';
// import { uuidv4 } from 'k6/crypto'; // Removing dependency

// Custom UUIDv4 Generator
function generateUuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Enhanced metrics for better reporting
const rateLimitErrors = new Rate('rate_limit_errors');
const rateLimitErrorsByEndpoint = {};
const responseTimeByEndpoint = {};
const maxRetryCount = new Trend('max_retry_count');
const backoffDuration = new Trend('backoff_duration_ms');
const rechargeSuccessRate = new Rate('recharge_success_rate');
const totalRechargeAmount = new Counter('total_recharge_amount');
const unknownEndpointTime = new Trend('response_time_unknown');

// Pre-declare all endpoint-specific metrics in the init context
const ENDPOINTS = [
  'login', 'process_checkpoint_recharge', 'check_card_optional' // check_card might be used pre-recharge if desired, but not core to EF
];

// Initialize all endpoint metrics in init context
ENDPOINTS.forEach(endpoint => {
  rateLimitErrorsByEndpoint[endpoint] = new Rate(`rate_limit_${endpoint}`);
  responseTimeByEndpoint[endpoint] = new Trend(`response_time_${endpoint}`);
});

// Recharge admin credentials
const rechargeCredentials = new SharedArray('recharge credentials', function() {
  return [
    { email: 'recharge1@lesaperosduchateau.be', password: 'R6uaMUZ1HgIS' },
    { email: 'recharge2@lesaperosduchateau.be', password: '53VxeoceKRvr' },
    { email: 'recharge3@lesaperosduchateau.be', password: 'RG0uzw5EL0xm' },
  ];
});

// Use existing test cards instead of generating random ones
const simulatedCardIds = new SharedArray('card IDs', function() {
  return [
    'k6-test-card-001',  // Created test card with €50 balance
    'K7McPLKa',          // Existing card (may need balance)
    'dQdtfYgZ',          // Existing card (may need balance)
    'tRS2RVg1',          // Existing card (may need balance)
    'brJm7KCu',          // Existing card (may need balance)
  ];
});

// Recharge amounts with weighted distribution
const rechargeAmounts = [
  { value: 5, weight: 30 },
  { value: 10, weight: 25 },
  { value: 20, weight: 20 },
  { value: 50, weight: 15 },
  { value: 100, weight: 10 }
];

// Function to select a weighted random recharge amount
function getRandomRechargeAmount() {
  const totalWeight = rechargeAmounts.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of rechargeAmounts) {
    if (random < item.weight) {
      return item.value;
    }
    random -= item.weight;
  }
  
  return rechargeAmounts[0].value; // Fallback
}

// Export k6 test options - progressive load testing
export const options = {
  scenarios: {
    low_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 3 },   // Gradually ramp up to 3 users
        { duration: '1m', target: 3 },    // Stay at 3 users for 1 minute
      ],
      gracefulRampDown: '10s',
    },
    medium_load: {
      executor: 'ramping-vus',
      startVUs: 3,
      stages: [
        { duration: '30s', target: 6 },  // Ramp up to 6 users
        { duration: '1m', target: 6 },   // Stay at 6 users for 1 minute
      ],
      gracefulRampDown: '10s',
      startTime: '2m',  // Start after the low load finishes
    },
    high_load: {
      executor: 'ramping-vus', 
      startVUs: 6,
      stages: [
        { duration: '30s', target: 10 },  // Push to 10 users
        { duration: '1m', target: 10 },   // Stay at high load
      ],
      gracefulRampDown: '10s',
      startTime: '4m',  // Start after medium load finishes
    },
    extreme_load: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 30,
      stages: [
        { duration: '30s', target: 10 },  // Ramp up to extreme load
        { duration: '30s', target: 15 },  // Push system to limits
        { duration: '30s', target: 5 },   // Ramp down
      ],
      startTime: '6m',  // Start after high load finishes
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],  // 95% of requests should be under 5s
    http_req_failed: ['rate<0.25'],     // Allow up to 25% failed requests during testing
    'rate_limit_errors': ['rate<0.20'],  // Track rate limit errors separately
    'recharge_success_rate': ['rate>0.7'], // At least 70% of recharges should succeed
  },
};

// Base URL of the application
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Function to get rate limit metric for an endpoint - now just returns the pre-created metric
function getOrCreateRateLimitMetric(endpoint) {
  return rateLimitErrorsByEndpoint[endpoint] || rateLimitErrors; // Fallback to global metric
}

// Function to get response time metric for an endpoint - now just returns the pre-created metric
function getOrCreateResponseTimeMetric(endpoint) {
  return responseTimeByEndpoint[endpoint] || unknownEndpointTime; // Use pre-created fallback
}

// Helper function for rate-limited API calls with enhanced metrics
function rateLimitedRequest(method, url, body = null, params = {}) {
  const maxRetries = 5;
  let retries = 0;
  let result;
  let totalBackoffTime = 0;
  const endpoint = params.name || url.split('/').slice(-1)[0].split('?')[0]; // Extract endpoint name for metrics

  const baseParams = {
    headers: {
      'apikey': API_KEY,
      'Content-Type': 'application/json',
      ...params.headers
    },
    tags: { name: params.name || url }
  };
  
  const fullParams = { ...baseParams, ...params };
  
  // Get or create endpoint-specific metrics
  const endpointRateLimitMetric = getOrCreateRateLimitMetric(endpoint);
  const endpointResponseTime = getOrCreateResponseTimeMetric(endpoint);
  
  // Add random jitter to prevent thundering herd
  if (params.addInitialJitter) {
    const jitter = Math.random() * 500; // Up to 500ms jitter
    sleep(jitter / 1000);
  }
  
  const startTime = new Date();

  while (retries < maxRetries) {
    if (retries > 0) {
      // Exponential backoff with jitter: Base * (2^retry) * (0.5-1.5 random factor)
      const randomFactor = 0.5 + Math.random();
      const backoffTime = Math.pow(2, retries) * 500 * randomFactor;
      totalBackoffTime += backoffTime;
      
      console.log(`[${endpoint}] Retry ${retries}/${maxRetries}, backing off for ${backoffTime.toFixed(0)}ms`);
      sleep(backoffTime / 1000); // convert ms to seconds for k6 sleep
    }
    
    let requestStartTime = new Date();

    if (method.toLowerCase() === 'get') {
      result = http.get(url, fullParams);
    } else if (method.toLowerCase() === 'post') {
      result = http.post(url, body ? JSON.stringify(body) : null, fullParams);
    } else if (method.toLowerCase() === 'patch') {
      result = http.patch(url, body ? JSON.stringify(body) : null, fullParams);
    } else if (method.toLowerCase() === 'delete') {
      result = http.del(url, null, fullParams);
    }
    
    endpointResponseTime.add(new Date() - requestStartTime);

    // Check if we hit a rate limit
    if (result.status === 429) {
      console.log(`[${endpoint}] Rate limited, attempt ${retries + 1}/${maxRetries}`);
      rateLimitErrors.add(1);
      endpointRateLimitMetric.add(1);
      retries++;
      continue;
    }

    // No rate limiting, return the result
    maxRetryCount.add(retries);
    if (totalBackoffTime > 0) {
      backoffDuration.add(totalBackoffTime);
    }
    return result;
  }

  // Return the last response if we exhausted our retries
  console.log(`[${endpoint}] Failed after ${maxRetries} retries`);
  maxRetryCount.add(maxRetries);
  backoffDuration.add(totalBackoffTime);
  return result;
}

// Enhanced function to process a card recharge via Edge Function
function processRecharge(baseApiUrl, apiKey, cardId, rechargeAmount, isPaidByCard, rechargePointId = 'load-test-recharge-station-1') {
  const clientRequestId = generateUuidv4(); // Use custom UUID generator
  const paymentMethod = isPaidByCard ? 'card_terminal' : 'cash'; // Example payment methods

  try {
    console.log(`Attempting recharge for card ${cardId}, amount ${rechargeAmount}, method ${paymentMethod}, client_request_id: ${clientRequestId}, point: ${rechargePointId}`);

    const payload = {
      client_request_id: clientRequestId,
      card_id: cardId,
      recharge_amount: rechargeAmount,
      payment_method_at_checkpoint: paymentMethod,
      staff_id: 'k6-test-staff',
      checkpoint_id: rechargePointId
    };

    const processRechargeUrl = `${baseApiUrl}/functions/v1/process-checkpoint-recharge`;
    const rechargeEdgeResponse = rateLimitedRequest('POST', processRechargeUrl, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`, // Use API_KEY (anon/service) as Bearer token
        'Content-Type': 'application/json'
      },
      name: 'process_checkpoint_recharge' // Metric name for this Edge Function call
    });

    if (rechargeEdgeResponse.status === 200) {
      const responseBody = rechargeEdgeResponse.json(); // Safely parse JSON
      console.log(`Recharge processed successfully for client_request_id: ${clientRequestId}. Response: ${JSON.stringify(responseBody)}`);
      totalRechargeAmount.add(rechargeAmount); // Track successful recharge amount
      return {
        success: true,
        client_request_id: clientRequestId,
        response: responseBody,
        recharge_id: responseBody ? responseBody.recharge_id : null,
        new_balance: responseBody ? responseBody.new_balance : null
      };
    } else {
      console.error(`Failed to process recharge (client_request_id: ${clientRequestId}): ${rechargeEdgeResponse.status} ${rechargeEdgeResponse.body}`);
      return {
        success: false,
        client_request_id: clientRequestId,
        stage: 'process_checkpoint_recharge_edge_function',
        status: rechargeEdgeResponse.status,
        error: rechargeEdgeResponse.body
      };
    }

  } catch (error) {
    console.error(`Error in processRecharge function (client_request_id: ${clientRequestId}):`, error);
    return {
        success: false,
        client_request_id: clientRequestId,
        error: error.message,
        stage: 'processRecharge_internal_error'
    };
  }
}

// Main test function
export default function() {
  let stageSuccess = false;
  
  group('Card recharge operation', function() {
    try {
      // Log current stage for better reporting
      console.log(`Running card recharge - VU: ${__VU}, iteration: ${__ITER}`);
      
      // Add random delay at start to spread out requests
      sleep(Math.random() * 1.5);
  
      // Step 1: Login as recharge admin
      group('Login', function() {
        // Select a random recharge user from our pool
        const rechargeUser = rechargeCredentials[randomIntBetween(0, rechargeCredentials.length - 1)];
        
        console.log(`Logging in as recharge admin: ${rechargeUser.email}`);
        
        const loginRes = rateLimitedRequest('post', `${BASE_URL}/auth/v1/token?grant_type=password`, 
          {
            email: rechargeUser.email,
            password: rechargeUser.password,
          },
          {
            name: 'login',
            addInitialJitter: true // Add jitter to avoid all VUs hitting login at the same time
          }
        );
        
        const loginSuccess = check(loginRes, {
          'Recharge admin logged in successfully': (resp) => resp.status === 200,
        });
        
        if (!loginSuccess) {
          console.error(`Login failed for ${rechargeUser.email}: ${loginRes.body}`);
          return;
        }
        
        // const authToken = JSON.parse(loginRes.body).access_token; // authToken not directly used for Edge Function call with API_KEY
        
        // Step 2: Simulate card scan for recharge
        group('Process recharge via Edge Function', function() {
          // Select a random card ID
          const cardId = simulatedCardIds[randomIntBetween(0, simulatedCardIds.length - 1)];
          
          // Select a weighted random recharge amount
          const rechargeAmount = getRandomRechargeAmount();
          
          // Randomly determine payment method (card or cash)
          const isPaidByCard = Math.random() < 0.7; // 70% card payments, 30% cash
          
          // Process the recharge using the new function targeting the Edge Function
          // Pass BASE_URL and API_KEY. authToken from login is not used here.
          const rechargeResult = processRecharge(BASE_URL, API_KEY, cardId, rechargeAmount, isPaidByCard);
          
          // Check results
          check(rechargeResult, {
            'Recharge processed successfully by Edge Function': (r) => r.success === true,
          });
          
          // Track success rate
          rechargeSuccessRate.add(rechargeResult.success ? 1 : 0);
          
          // Log detailed results for diagnostics
          if (rechargeResult.success) {
            console.log(`✓ Recharge successful via Edge Function: client_request_id: ${rechargeResult.client_request_id}, Card ${cardId}, New Balance: ${rechargeResult.new_balance}€, Recharge ID: ${rechargeResult.recharge_id}`);
            stageSuccess = true;
          } else {
            console.log(`✗ Recharge failed via Edge Function: client_request_id: ${rechargeResult.client_request_id}, Card ${cardId}. Stage: ${rechargeResult.stage}, Status: ${rechargeResult.status}, Error: ${rechargeResult.error}`);
          }
        });
  });
  
      // Longer sleep between operations with randomization to create more realistic patterns
      sleep(randomIntBetween(3, 5));
      
    } catch (error) {
      console.error(`Unhandled error in card recharge: ${error.message}`);
      rechargeSuccessRate.add(0); // Ensure failure is tracked if an unhandled error occurs
    }
  });
  
  // This might be redundant if stageSuccess correctly captures the outcome of the core operation.
  // rechargeSuccessRate.add(stageSuccess ? 1 : 0);
}