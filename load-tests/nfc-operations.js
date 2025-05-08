import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Enhanced metrics for better reporting
const rateLimitErrors = new Rate('rate_limit_errors');
const rateLimitErrorsByEndpoint = {};
const responseTimeByEndpoint = {};
const maxRetryCount = new Trend('max_retry_count');
const backoffDuration = new Trend('backoff_duration_ms');
const nfcScanSuccessRate = new Rate('nfc_scan_success_rate');
const nfcTotalScans = new Counter('nfc_total_scans');
const nfcReconnectAttempts = new Counter('nfc_reconnect_attempts');
const unknownEndpointTime = new Trend('response_time_unknown');

// Pre-declare all endpoint-specific metrics in the init context
const ENDPOINTS = [
  'login', 'check_card', 'create_card', 'verify_card'
];

// Initialize all endpoint metrics in init context
ENDPOINTS.forEach(endpoint => {
  rateLimitErrorsByEndpoint[endpoint] = new Rate(`rate_limit_${endpoint}`);
  responseTimeByEndpoint[endpoint] = new Trend(`response_time_${endpoint}`);
});

// Define base URL and API key
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Bar credentials for testing - using alex@lesaperosduchateau.be as it's a known valid admin user
const barCredentials = [
  { email: 'alex@lesaperosduchateau.be', password: 'g7YyT3KhWR84' },
  { email: 'bar1@lesaperosduchateau.be', password: '4Lq9svqIYQMD' },
  { email: 'bar2@lesaperosduchateau.be', password: 'W7Wl5yYgtgCU' },
];

// Generate a unique ID for this test run to avoid collisions
const testRunId = new Date().getTime();

// Simulated NFC card IDs with different types
const simulatedNfcIds = new SharedArray('simulatedNfcIds', function() {
  const cards = [];
  
  // Regular cards
  for (let i = 1; i <= 100; i++) {
    cards.push({
      id: `nfc-test-${testRunId}-${i}`,
      type: 'regular',
      initialBalance: 50 + Math.random() * 150 // Random balance between 50 and 200
    });
  }
  
  // Low balance cards (10%)
  for (let i = 1; i <= 20; i++) {
    cards.push({
      id: `nfc-low-${testRunId}-${i}`,
      type: 'low_balance',
      initialBalance: Math.random() * 10 // Random balance between 0 and 10
    });
  }
  
  // Empty cards (5%)
  for (let i = 1; i <= 10; i++) {
    cards.push({
      id: `nfc-empty-${testRunId}-${i}`,
      type: 'empty',
      initialBalance: 0 // No balance
    });
  }
  
  return cards;
});

// NFC scan types simulation
const nfcScanTypes = [
  { type: 'quick_scan', weight: 60, delayAfterScan: [0.5, 1.5] }, // Quick scan, move away quickly
  { type: 'normal_scan', weight: 30, delayAfterScan: [1.5, 3] },  // Normal scan, stays in range
  { type: 'flaky_scan', weight: 10, delayAfterScan: [0.1, 0.3] }  // Flaky scan, in and out of range
];

// Function to select a weighted random scan type
function getRandomScanType() {
  const totalWeight = nfcScanTypes.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of nfcScanTypes) {
    if (random < item.weight) {
      return item;
    }
    random -= item.weight;
  }
  
  return nfcScanTypes[0]; // Fallback
}

// k6 options - Progressive load testing with multiple stages
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
      preAllocatedVUs: 15,
      maxVUs: 25,
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
    'nfc_scan_success_rate': ['rate>0.7'], // At least 70% of NFC scans should succeed
  },
};

// Function to get rate limit metric for an endpoint - now just returns the pre-created metric
function getOrCreateRateLimitMetric(endpoint) {
  return rateLimitErrorsByEndpoint[endpoint] || rateLimitErrors; // Fallback to global metric
}

// Function to get response time metric for an endpoint - now just returns the pre-created metric
function getOrCreateResponseTimeMetric(endpoint) {
  return responseTimeByEndpoint[endpoint] || unknownEndpointTime; // Use pre-created fallback
}

// Enhanced function to retry on rate limit with better metrics
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
    
    if (method === 'GET') {
      result = http.get(url, fullParams);
    } else if (method === 'POST') {
      result = http.post(url, body ? JSON.stringify(body) : null, fullParams);
    } else if (method === 'PUT') {
      result = http.put(url, body ? JSON.stringify(body) : null, fullParams);
    } else if (method === 'PATCH') {
      result = http.patch(url, body ? JSON.stringify(body) : null, fullParams);
    } else if (method === 'DELETE') {
      result = http.del(url, null, fullParams);
    }
    
    endpointResponseTime.add(new Date() - requestStartTime);
    
    // Check for rate limiting
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
  
  // If we get here, we've exhausted our retries
  console.log(`[${endpoint}] Failed after ${maxRetries} retries`);
  maxRetryCount.add(maxRetries);
  backoffDuration.add(totalBackoffTime);
  return result;
}

// Enhanced function to ensure a card exists with better error handling
function ensureCardExists(authHeader, cardInfo) {
  try {
    const cardId = cardInfo.id;
    const initialBalance = cardInfo.initialBalance.toFixed(2);
    const cardType = cardInfo.type;
    
    // Check if card exists in table_cards
    const cardCheckUrl = `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=id,amount,description`;
    const cardCheckResponse = rateLimitedRequest('GET', cardCheckUrl, null, {
      headers: authHeader,
      name: 'check_card'
    });
    
    if (cardCheckResponse.status === 200 && cardCheckResponse.json().length > 0) {
      // Card exists, return it
      const cardData = cardCheckResponse.json()[0];
      return {
        success: true,
        card: cardData,
        isNew: false,
        balance: parseFloat(cardData.amount || '0')
      };
    }
    
    // Card doesn't exist, create it with random description based on type
    let description;
    switch(cardType) {
      case 'low_balance':
        description = `Test NFC card with low balance (${new Date().toISOString()})`;
        break;
      case 'empty':
        description = `Test NFC card with no balance (${new Date().toISOString()})`;
        break;
      default:
        description = `Test NFC card with standard balance (${new Date().toISOString()})`;
    }
    
    console.log(`Creating card ${cardId} with initial balance ${initialBalance}€`);
    
    const createCardResponse = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/table_cards`, {
      id: cardId,
      amount: initialBalance,
      description: description
    }, {
      headers: { ...authHeader, 'Prefer': 'return=representation' },
      name: 'create_card'
    });
    
    if (createCardResponse.status === 201 || createCardResponse.status === 200) {
      // Card created successfully
      sleep(0.5); // Give time for the card to be fully created in the database
      
      // Verify the card was created by getting it
      const verifyCardResponse = rateLimitedRequest('GET', cardCheckUrl, null, {
        headers: authHeader,
        name: 'verify_card'
      });
      
      if (verifyCardResponse.status === 200 && verifyCardResponse.json().length > 0) {
        const cardData = verifyCardResponse.json()[0];
        return {
          success: true,
          card: cardData,
          isNew: true,
          balance: parseFloat(cardData.amount || '0')
        };
      }
    }
    
    // If we're here, card creation or verification failed
    console.error(`Failed to create or verify card: ${createCardResponse.status} ${createCardResponse.body}`);
    return { 
      success: false, 
      error: `Failed to create or verify card: ${createCardResponse.status}` 
    };
  } catch (error) {
    console.error('Error in ensureCardExists:', error);
    return { 
      success: false, 
      error: `Exception: ${error.message}` 
    };
  }
}

// Enhanced function to simulate NFC card scanning with various behaviors
function simulateNfcScan(authHeader, cardInfo, scanType, minimumBalance) {
  try {
    nfcTotalScans.add(1); // Increment total scan counter
    
    // Step 1: Ensure the card exists
    const cardResult = ensureCardExists(authHeader, cardInfo);
    if (!cardResult.success) {
      return { 
        success: false, 
        scanned: true,
        error: cardResult.error,
        stage: 'card_verification'
      };
    }
    
    // Simulate scan delay based on scan type
    const scanDelay = randomIntBetween(scanType.delayAfterScan[0] * 1000, scanType.delayAfterScan[1] * 1000);
    sleep(scanDelay / 1000); // Convert to seconds
    
    // For flaky scans, simulate random disconnection and reconnection
    if (scanType.type === 'flaky_scan' && Math.random() < 0.7) {
      console.log(`Simulating flaky NFC scan for card ${cardInfo.id} - temporary disconnect`);
      
      // Simulate disconnection
      sleep(0.3);
      
      // 70% chance to simulate reconnect attempt
      if (Math.random() < 0.7) {
        console.log(`Attempting to reconnect to card ${cardInfo.id}`);
        nfcReconnectAttempts.add(1);
        
        // 50% chance of successful reconnect
        if (Math.random() < 0.5) {
          sleep(0.5); // Time to reconnect
        } else {
          return { 
            success: false, 
            scanned: true,
            error: 'NFC connection lost during scan',
            stage: 'card_scanning'
          };
        }
      } else {
        return { 
          success: false, 
          scanned: true,
          error: 'NFC scan interrupted',
          stage: 'card_scanning'
        };
      }
    }
    
    // Get the card data
    const card = cardResult.card;
    console.log(`Card ${cardInfo.id} ${cardResult.isNew ? 'created' : 'found'} with balance: ${cardResult.balance}€`);
    
    // Verify the card balance is sufficient
    const currentBalance = cardResult.balance;
    
    if (currentBalance < minimumBalance) {
      console.log(`Card ${cardInfo.id} has insufficient balance: ${currentBalance}€ (minimum: ${minimumBalance}€)`);
      return { 
        success: true,  // The scan worked, but balance insufficient
        hasBalance: false, 
        balance: currentBalance,
        minimumRequired: minimumBalance,
        scanned: true,
        stage: 'balance_check'
      };
    }
    
    // Card has sufficient balance, return success
    return {
      success: true,
      hasBalance: true,
      balance: currentBalance,
      scanned: true,
      stage: 'complete'
    };
  } catch (error) {
    console.error('Error in simulateNfcScan:', error);
    return { 
      success: false, 
      error: error.message,
      scanned: false,
      stage: 'exception'
    };
  }
}

// Main test function
export default function() {
  let stageSuccess = false;
  
  group('NFC scanning operation', function() {
    try {
      // Log current stage for better reporting
      console.log(`Running NFC scanning - VU: ${__VU}, iteration: ${__ITER}`);
      
      // Add random delay at start to spread out requests
      sleep(Math.random() * 1.5);
      
      // Step 1: Login as bar user
      group('Login', function() {
        // Randomly select a bar user
        const barCredential = barCredentials[Math.floor(Math.random() * barCredentials.length)];
        
        console.log(`Logging in as ${barCredential.email}`);
        const loginResponse = rateLimitedRequest('POST', `${BASE_URL}/auth/v1/token?grant_type=password`, {
          email: barCredential.email,
          password: barCredential.password
        }, {
          name: 'login',
          addInitialJitter: true // Add jitter to avoid all VUs hitting login at the same time
        });
        
        // Check if login was successful
        if (!check(loginResponse, { 
          'login successful': (r) => r.status === 200 && r.json('access_token') !== undefined 
        })) {
          console.error(`Login failed: ${loginResponse.status} ${loginResponse.body}`);
          sleep(randomIntBetween(2, 4));
          return;
        }
        
        // Get access token
        const accessToken = loginResponse.json('access_token');
        // Include the API key in the auth header
        const authHeader = { 
          'Authorization': `Bearer ${accessToken}`,
          'apikey': API_KEY
        };
        
        // Step 2: Random simulated NFC scanning
        group('NFC scanning', function() {
          // Randomly select card
          const cardInfo = simulatedNfcIds[Math.floor(Math.random() * simulatedNfcIds.length)];
          
          // Randomly select scan type
          const scanType = getRandomScanType();
          
          // Set random minimum balance required (3-12€)
          const minimumBalance = 3 + Math.random() * 9;
          
          console.log(`Simulating ${scanType.type} NFC scan for card ${cardInfo.id}`);
          
          // Simulate NFC card scan
          const scanResult = simulateNfcScan(authHeader, cardInfo, scanType, minimumBalance);
          
          // Track scan results
          nfcScanSuccessRate.add(scanResult.success ? 1 : 0);
          
          // Check the scan result
          check(scanResult, { 
            'NFC scan processed': (r) => r.scanned === true,
            'Card has sufficient balance': (r) => r.hasBalance === true
          });
          
          // Detailed logging for diagnostics
          if (scanResult.success) {
            if (scanResult.hasBalance) {
              console.log(`✓ NFC scan successful: Card ${cardInfo.id} has sufficient balance: ${scanResult.balance}€`);
              stageSuccess = true;
            } else {
              console.log(`✓ NFC scan successful but insufficient balance: Card ${cardInfo.id} has ${scanResult.balance}€, needs ${scanResult.minimumRequired}€`);
              stageSuccess = true; // The scan itself succeeded
            }
          } else {
            console.log(`✗ NFC scan failed for card ${cardInfo.id}: ${scanResult.error} (stage: ${scanResult.stage})`);
          }
          
          // Simulate a random "settle time" between scans
          sleep(randomIntBetween(1, 3));
        });
      });
      
      // Variable sleep between operations with randomization to create more realistic patterns
      sleep(randomIntBetween(2, 4));
      
    } catch (error) {
      console.error(`Unhandled error in NFC operation: ${error.message}`);
    }
  });
  
  // Track overall success of the execution
  nfcScanSuccessRate.add(stageSuccess ? 1 : 0);
} 