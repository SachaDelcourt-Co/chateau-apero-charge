import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
// import { uuidv4 } from 'k6/crypto'; // Removing dependency on k6/crypto for UUID

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
const operationSuccessRate = new Rate('operation_success_rate');
const unknownEndpointTime = new Trend('response_time_unknown');

// Pre-declare all endpoint-specific metrics in the init context
const ENDPOINTS = [
  'login', 'get_products', 'check_card', 'create_card', 'process_bar_order'
  // Removed: 'create_order_record', 'get_latest_order', 'create_order_item', 'get_card_balance', 'update_card_balance'
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
];

// Use existing test cards instead of generating random ones
const simulatedCardIds = new SharedArray('simulatedCardIds', function() {
  return [
    'k6-test-card-001',  // Created test card with €50 balance
    'K7McPLKa',          // Existing card (may need balance)
    'dQdtfYgZ',          // Existing card (may need balance)
    'tRS2RVg1',          // Existing card (may need balance)
    'brJm7KCu',          // Existing card (may need balance)
  ];
});

// Define product categories for better randomization
const productCategories = ['drinks', 'food', 'deposits', 'returns'];

// k6 options - Progressive load testing with multiple stages
export const options = {
  scenarios: {
    low_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 5 },   // Gradually ramp up to 5 users
        { duration: '1m', target: 5 },    // Stay at 5 users for 1 minute
      ],
      gracefulRampDown: '10s',
    },
    medium_load: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: 10 },  // Ramp up to 10 users
        { duration: '1m', target: 10 },   // Stay at 10 users for 1 minute
      ],
      gracefulRampDown: '10s',
      startTime: '2m',  // Start after the low load finishes
    },
    high_load: {
      executor: 'ramping-vus', 
      startVUs: 10,
      stages: [
        { duration: '30s', target: 20 },  // Push to 20 users
        { duration: '1m', target: 20 },   // Stay at high load
      ],
      gracefulRampDown: '10s',
      startTime: '4m',  // Start after medium load finishes
    },
    extreme_load: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 30,
      maxVUs: 50,
      stages: [
        { duration: '30s', target: 20 },  // Ramp up to extreme load
        { duration: '30s', target: 30 },  // Push system to limits
        { duration: '30s', target: 10 },  // Ramp down
      ],
      startTime: '6m',  // Start after high load finishes
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.3'], // Allow up to 30% of requests to fail (higher threshold for testing)
    'rate_limit_errors': ['rate<0.20'], // Track rate limit errors separately
    'operation_success_rate': ['rate>0.7'], // At least 70% of operations should succeed
    'http_req_duration': ['p(95)<5000'], // 95% of requests should be under 5s
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

// Enhanced retry function with better logging and metrics
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
  
  // Random jitter to avoid thundering herd problem
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
      result = http.del(url, body ? JSON.stringify(body) : null, fullParams);
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

// Function to handle the order creation process with enhanced randomization and error tracking
function createOrder(baseApiUrl, apiKey, cardId, products, pointOfSaleId = 'load-test-pos-1') {
  try {
    const clientRequestId = generateUuidv4(); // Use custom UUID generator

    // Select a random number of products (1-5)
    const numProducts = randomIntBetween(1, 5);
    
    const orderPayloadItems = [];
    let simulatedTotal = 0; // For client-side validation/logging if needed

    // Filter products that have an ID and price
    const usableProducts = products.filter(p => p.id && p.price !== null);
    if (usableProducts.length === 0) {
      console.error('No usable products (with id and price) available for order.');
      return { success: false, stage: 'product_selection', error: 'No usable products' };
    }

    // Build order items
    for (let i = 0; i < numProducts; i++) {
      const randomProduct = usableProducts[randomIntBetween(0, usableProducts.length - 1)];
      const quantity = randomIntBetween(1, 3);

      // Avoid adding the same product multiple times in this simple selection
      // A more sophisticated approach might allow it or sum quantities
      if (orderPayloadItems.some(item => item.product_id === randomProduct.id)) {
        continue;
      }

      orderPayloadItems.push({
        product_id: randomProduct.id, // Use product ID
        quantity: quantity,
      });
      
      // Simulate total calculation (Edge function will do the authoritative one)
      if (randomProduct.is_return) {
        simulatedTotal -= randomProduct.price * quantity;
      } else {
        simulatedTotal += randomProduct.price * quantity;
      }
    }
    
    if (orderPayloadItems.length === 0) {
      // Fallback: add at least one item if the above loop didn't (e.g. due to all random products being duplicates)
      const randomProduct = usableProducts[randomIntBetween(0, usableProducts.length - 1)];
      const quantity = randomIntBetween(1, 2);
      orderPayloadItems.push({
        product_id: randomProduct.id,
        quantity: quantity,
      });
      if (randomProduct.is_return) {
        simulatedTotal = (randomProduct.price * quantity) * -1;
      } else {
        simulatedTotal = randomProduct.price * quantity;
      }
    }

    console.log(`Attempting order for card ${cardId} with ${orderPayloadItems.length} item types. client_request_id: ${clientRequestId}`);

    const payload = {
      client_request_id: clientRequestId,
      card_id: cardId,
      point_of_sale_id: pointOfSaleId,
      items: orderPayloadItems
    };

    const processOrderUrl = `${baseApiUrl}/functions/v1/process-bar-order`;
    const orderResponse = rateLimitedRequest('POST', processOrderUrl, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`, // Use API_KEY (anon/service) as Bearer token
        'Content-Type': 'application/json'
      },
      name: 'process_bar_order' // Metric name for this specific Edge Function call
    });

    if (orderResponse.status === 200) {
      // Assuming 200 is success and response body might contain order details
      const responseBody = orderResponse.json(); // Safely parse JSON
      console.log(`Order processed successfully for client_request_id: ${clientRequestId}. Response: ${JSON.stringify(responseBody)}`);
      return {
        success: true,
        client_request_id: clientRequestId,
        orderId: responseBody ? responseBody.order_id : null, // Extract order_id if present
        response: responseBody,
        simulatedTotal: simulatedTotal // Keep for potential local checks
      };
    } else {
      console.error(`Failed to process order (client_request_id: ${clientRequestId}): ${orderResponse.status} ${orderResponse.body}`);
      return {
        success: false,
        client_request_id: clientRequestId,
        stage: 'process_bar_order_edge_function',
        status: orderResponse.status,
        error: orderResponse.body
      };
    }

  } catch (error) {
    console.error('Error in createOrder function:', error);
    return { success: false, error: error.message, stage: 'createOrder_internal_error' };
  }
}

export default function() {
  let stageSuccess = false;
  
  group('Bar operation test', function() {
    try {
      // Log current stage for better reporting
      console.log(`Running bar operation - VU: ${__VU}, iteration: ${__ITER}`);

  // Randomly select a bar user
  const barCredential = barCredentials[Math.floor(Math.random() * barCredentials.length)];
  
      group('Login', function() {
  console.log(`Logging in as ${barCredential.email}`);
  const loginResponse = rateLimitedRequest('POST', `${BASE_URL}/auth/v1/token?grant_type=password`, {
    email: barCredential.email,
    password: barCredential.password
  }, {
          name: 'login',
          addInitialJitter: true // Add jitter to avoid all VUs hitting login at the same time
  });
  
  // Check if login was successful
  if (!check(loginResponse, { 'login successful': (r) => r.status === 200 && r.json('access_token') !== undefined })) {
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
  
  // Sleep a random amount to spread out requests
  sleep(Math.random() * 2);
  
        group('Get products', function() {
  // Get bar products - Use the correct table name 'bar_products' instead of 'products'
  const productsUrl = `${BASE_URL}/rest/v1/bar_products?select=*`;
  const productsResponse = rateLimitedRequest('GET', productsUrl, null, {
    headers: authHeader,
    name: 'get_products'
  });
  
  if (!check(productsResponse, { 'products retrieved': (r) => r.status === 200 && r.json().length > 0 })) {
            console.error(`No products found: ${productsResponse.status} ${productsResponse.body}`);
            sleep(randomIntBetween(2, 4));
    return;
  }
  
  // Get available products
  const products = productsResponse.json();
  if (products.length === 0) {
    console.error('No products available');
            sleep(randomIntBetween(2, 4));
    return;
  }
  
          group('Card operations', function() {
  // Randomly select card
  const cardId = simulatedCardIds[Math.floor(Math.random() * simulatedCardIds.length)];
  
  // Check if card exists, create if not (this helps with test stability)
  const cardCheckUrl = `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=id,amount`;
  const cardCheckResponse = rateLimitedRequest('GET', cardCheckUrl, null, {
    headers: authHeader,
    name: 'check_card'
  });
  
  if (cardCheckResponse.json().length === 0) {
    console.log(`Creating test card: ${cardId}`);
              
              // Randomize initial card balance (50-200)
              const initialBalance = (50 + Math.random() * 150).toFixed(2);
              
    const createCardResponse = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/table_cards`, {
      id: cardId,
                amount: initialBalance,
      description: 'Test load card'
    }, {
      headers: authHeader,
      name: 'create_card'
    });
    
    if (!check(createCardResponse, { 'card created': (r) => r.status === 201 })) {
                console.error(`Failed to create card: ${createCardResponse.status} ${createCardResponse.body}`);
                sleep(randomIntBetween(2, 4));
      return;
    }
    
    // Sleep to make sure the card is created before we try to use it
              sleep(randomIntBetween(0.8, 1.5));
  }
  
  // Random delay
  sleep(Math.random() * 1);
  
            group('Process order', function() {
              // Use enhanced createOrder function, passing BASE_URL and API_KEY
              // authHeader is for REST calls, API_KEY directly for Edge Function Bearer token
              const orderResult = createOrder(BASE_URL, API_KEY, cardId, products);
              
              check(orderResult, {
                'order processed successfully': (r) => r.success === true,
              });
              
              // Track overall operation success
              operationSuccessRate.add(orderResult.success ? 1 : 0);
              
              // Record more detailed information if the operation failed
              if (!orderResult.success) {
                console.log(`Order processing failed at stage: ${orderResult.stage}, status: ${orderResult.status}, error: ${orderResult.error || 'unknown'}, client_request_id: ${orderResult.client_request_id}`);
              } else {
                console.log(`Order processing successful - client_request_id: ${orderResult.client_request_id}, Supabase order_id: ${orderResult.orderId}, Simulated Total: ${orderResult.simulatedTotal}`);
                stageSuccess = true;
              }
            });
          });
        });
  });
  
  // Sleep to allow some time between complete operations
      sleep(randomIntBetween(3, 6));
      
    } catch (error) {
      console.error(`Unhandled error in bar operation: ${error.message}`);
      // Ensure operationSuccessRate reflects failures in the main try-catch
      operationSuccessRate.add(0);
    }
  });
  
  // This metric add might be redundant if already handled inside the group on success/failure
  // operationSuccessRate.add(stageSuccess ? 1 : 0);
  // Let's rely on the one inside the 'Process order' group for per-operation success.
  // If the whole VU iteration fails before that, it won't be counted as success.
}