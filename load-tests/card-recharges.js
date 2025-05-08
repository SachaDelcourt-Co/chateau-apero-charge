import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { Rate, Trend, Counter } from 'k6/metrics';

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
  'login', 'check_card', 'create_card', 'create_payment', 'update_balance',
  'verify_card'
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

// Generate a unique ID for this test run to avoid collisions
const testRunId = new Date().getTime();

// Simulated card IDs (representing NFC cards)
const simulatedCardIds = new SharedArray('card IDs', function() {
  return Array.from({ length: 200 }, (_, i) => `simulated-card-${testRunId}-${i+1}`);
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

// Enhanced function to process a card recharge with better error tracking
function processRecharge(authToken, cardId, rechargeAmount, isPaidByCard) {
  const authHeaders = {
    'Authorization': `Bearer ${authToken}`,
    'apikey': API_KEY
  };
  
  let success = false;
  let rechargeResponse = {
    cardExists: false,
    paymentCreated: false,
    balanceUpdated: false,
    previousBalance: 0,
    newBalance: 0,
    errors: []
  };
  
  // Step 1: Check if card exists or create it
  group('Card verification', function() {
    const cardRes = rateLimitedRequest('get', `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=*`, null, {
      headers: authHeaders,
      name: 'check_card'
    });
    
    if (cardRes.status === 200) {
      const cardData = JSON.parse(cardRes.body);
      if (cardData.length > 0) {
        rechargeResponse.cardExists = true;
        rechargeResponse.previousBalance = parseFloat(cardData[0].amount || '0');
        console.log(`Found existing card ${cardId} with balance: ${rechargeResponse.previousBalance}`);
      }
    } else {
      rechargeResponse.errors.push({
        stage: 'card_verification',
        status: cardRes.status,
        message: cardRes.body
      });
    }
    
    // If card doesn't exist, create it
    if (!rechargeResponse.cardExists) {
      // Generate a descriptive name for the test card
      const cardDescription = `Test recharge card (${new Date().toISOString()})`;
      
      console.log(`Creating new card with ID: ${cardId} and description: ${cardDescription}`);
      
      const createCardRes = rateLimitedRequest('post', `${BASE_URL}/rest/v1/table_cards`, 
        {
          id: cardId,
          amount: '0',
          description: cardDescription
        },
        {
          headers: {
            ...authHeaders,
            'Prefer': 'return=representation'
          },
          name: 'create_card'
        }
      );
      
      if (createCardRes.status === 201) {
        rechargeResponse.cardExists = true;
        rechargeResponse.previousBalance = 0;
        console.log(`Successfully created new card ${cardId}`);
      } else {
        rechargeResponse.errors.push({
          stage: 'card_creation',
          status: createCardRes.status,
          message: createCardRes.body
        });
        console.error(`Failed to create card: ${createCardRes.status} ${createCardRes.body}`);
      }
    }
  });
  
  // Only proceed if card exists
  if (!rechargeResponse.cardExists) {
    return rechargeResponse;
  }
  
  // Step 2: Create payment record
  group('Payment record creation', function() {
    // Create payment record (removed description field as it doesn't exist)
    const transactionRes = rateLimitedRequest('post', `${BASE_URL}/rest/v1/paiements`, 
      {
        amount: rechargeAmount,
        id_card: cardId,
        paid_by_card: isPaidByCard,
        created_at: new Date().toISOString()
      },
      {
        headers: {
          ...authHeaders,
          'Prefer': 'return=representation',
        },
        name: 'create_payment'
      }
    );
    
    if (transactionRes.status === 201) {
      rechargeResponse.paymentCreated = true;
      console.log(`Payment record created for card ${cardId} with amount ${rechargeAmount}€`);
    } else {
      rechargeResponse.errors.push({
        stage: 'payment_creation',
        status: transactionRes.status,
        message: transactionRes.body
      });
      console.error(`Failed to create payment record: ${transactionRes.status} ${transactionRes.body}`);
    }
  });
  
  // Step 3: Update card balance
  group('Balance update', function() {
    // Calculate new balance
    rechargeResponse.newBalance = rechargeResponse.previousBalance + rechargeAmount;
    
    console.log(`Updating card ${cardId} balance from ${rechargeResponse.previousBalance} to ${rechargeResponse.newBalance}`);
    
    const updateCardRes = rateLimitedRequest('patch', `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}`, 
      {
        amount: rechargeResponse.newBalance.toString()
      },
      {
        headers: {
          ...authHeaders,
          'Prefer': 'return=minimal'
        },
        name: 'update_balance'
      }
    );
    
    if (updateCardRes.status === 204 || updateCardRes.status === 200) {
      rechargeResponse.balanceUpdated = true;
      
      // Track the total amount recharged
      totalRechargeAmount.add(rechargeAmount);
      
      console.log(`Successfully updated card ${cardId} balance to ${rechargeResponse.newBalance}€`);
    } else {
      rechargeResponse.errors.push({
        stage: 'balance_update',
        status: updateCardRes.status,
        message: updateCardRes.body
      });
      console.error(`Failed to update card balance: ${updateCardRes.status} ${updateCardRes.body}`);
    }
  });
  
  // Determine overall success
  success = rechargeResponse.cardExists && rechargeResponse.paymentCreated && rechargeResponse.balanceUpdated;
  rechargeResponse.success = success;
  
  return rechargeResponse;
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
        
        const authToken = JSON.parse(loginRes.body).access_token;
        
        // Step 2: Simulate card scan for recharge
        group('Process recharge', function() {
          // Select a random card ID
          const cardId = simulatedCardIds[randomIntBetween(0, simulatedCardIds.length - 1)];
          
          // Select a weighted random recharge amount
          const rechargeAmount = getRandomRechargeAmount();
          
          // Randomly determine payment method (card or cash)
          const isPaidByCard = Math.random() < 0.7; // 70% card payments, 30% cash
          
          console.log(`Processing ${rechargeAmount}€ recharge for card ${cardId} paid by ${isPaidByCard ? 'card' : 'cash'}`);
          
          // Process the recharge
          const rechargeResult = processRecharge(authToken, cardId, rechargeAmount, isPaidByCard);
          
          // Check results
          check(rechargeResult, {
            'Card exists or was created': (r) => r.cardExists,
            'Payment record created': (r) => r.paymentCreated,
            'Card balance updated': (r) => r.balanceUpdated,
            'Recharge completed successfully': (r) => r.success
          });
          
          // Track success rate
          rechargeSuccessRate.add(rechargeResult.success ? 1 : 0);
          
          // Log detailed results for diagnostics
          if (rechargeResult.success) {
            console.log(`✓ Recharge successful: Card ${cardId} balance updated from ${rechargeResult.previousBalance}€ to ${rechargeResult.newBalance}€`);
            stageSuccess = true;
          } else {
            console.log(`✗ Recharge failed for card ${cardId}. Errors: ${JSON.stringify(rechargeResult.errors)}`);
          }
        });
      });
      
      // Longer sleep between operations with randomization to create more realistic patterns
      sleep(randomIntBetween(3, 5));
      
    } catch (error) {
      console.error(`Unhandled error in card recharge: ${error.message}`);
    }
  });
  
  // Track overall success of the execution
  rechargeSuccessRate.add(stageSuccess ? 1 : 0);
} 