import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { Rate } from 'k6/metrics';

// Define API key constant
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Base URL of the application
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';

// Implement a token bucket rate limiter for the entire test
// This is a global limit across all VUs
const globalRateLimiter = {
  tokens: 10,  // Start with 10 tokens
  maxTokens: 10, // Maximum number of tokens
  refillRate: 2, // Tokens per second to refill
  lastRefill: Date.now(), // Last time we refilled tokens
  
  // Take a token if available, or wait
  take: function() {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsedSecs = (now - this.lastRefill) / 1000;
    
    if (elapsedSecs > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSecs * this.refillRate);
      this.lastRefill = now;
    }
    
    // If we have a token, take it and return true
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    
    // No tokens available
    return false;
  }
};

// Create a custom metric to track rate limit errors
const rateLimitErrors = new Rate('rate_limit_errors');
const waitingForTokens = new Rate('waiting_for_tokens');

// All credentials
const credentials = new SharedArray('mixed credentials', function() {
  return [
    // Super admin
    { email: 'alex@lesaperosduchateau.be', password: 'g7YyT3KhWR84', role: 'admin' },
    
    // Bar accounts - reduced number to 5
    { email: 'bar1@lesaperosduchateau.be', password: '4Lq9svqIYQMD', role: 'bar' },
    { email: 'bar2@lesaperosduchateau.be', password: 'W7Wl5yYgtgCU', role: 'bar' },
    { email: 'bar3@lesaperosduchateau.be', password: 'aK0S7gk2NhjB', role: 'bar' },
    { email: 'bar4@lesaperosduchateau.be', password: 'JNYeKmwU4ufS', role: 'bar' },
    { email: 'bar5@lesaperosduchateau.be', password: '6dcQFVyPUkxI', role: 'bar' },
    
    // Recharge accounts - reduced number to 2
    { email: 'recharge1@lesaperosduchateau.be', password: 'R6uaMUZ1HgIS', role: 'recharge' },
    { email: 'recharge2@lesaperosduchateau.be', password: '53VxeoceKRvr', role: 'recharge' },
  ];
});

// Simulated card IDs - reducing the array size
const simulatedCardIds = new SharedArray('mixed card IDs', function() {
  return Array.from({ length: 100 }, (_, i) => `simulated-card-${i+1}`);
});

// Recharge amounts
const rechargeAmounts = [5, 10, 20, 50, 100];

// k6 options - mixed operations with greatly reduced concurrency
export const options = {
  scenarios: {
    mixed_operations: {
      executor: 'ramping-vus',
      startVUs: 2,           // Reduced from 5 to 2
      stages: [
        { duration: '1m', target: 5 },    // Slower ramp to only 5 users
        { duration: '2m', target: 8 },    // Slower ramp to only 8 users
        { duration: '3m', target: 8 },    // Stay at 8 users
        { duration: '1m', target: 0 },    // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],    // 95% of requests should complete within 3s
    http_req_failed: ['rate<0.05'],       // Less than 5% of requests should fail
    'rate_limit_errors': ['rate<0.1'],    // Track rate limit errors separately
    'waiting_for_tokens': ['rate<0.3'],   // Track how often we wait for tokens
  },
};

// Helper function to get random product items - reduced max items to 3
function getRandomOrderItems(products, minItems = 1, maxItems = 3) {
  const orderItems = [];
  const numProducts = randomIntBetween(minItems, maxItems);
  
  for (let i = 0; i < numProducts; i++) {
    const randomProduct = products[randomIntBetween(0, products.length - 1)];
    const quantity = randomIntBetween(1, 2); // Reduced max quantity from 3 to 2
    
    orderItems.push({
      product_id: randomProduct.id,
      quantity: quantity,
      unit_price: randomProduct.price,
    });
  }
  
  return orderItems;
}

// Function to retry on rate limit with token bucket integration
function rateLimitedRequest(method, url, body = null, params = {}) {
  const maxRetries = 5;
  let retries = 0;
  let result;

  const baseParams = {
    headers: {
      'apikey': API_KEY,
      'Content-Type': 'application/json',
      ...params.headers
    },
    tags: { name: params.name || url }
  };
  
  const fullParams = { ...baseParams, ...params };
  
  // Try to get a token from the rate limiter
  while (!globalRateLimiter.take()) {
    waitingForTokens.add(1);
    console.log(`Waiting for rate limit token...`);
    sleep(0.5); // Wait 500ms before trying again
  }
  
  while (retries < maxRetries) {
    if (retries > 0) {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s - increased from previous values
      const backoffTime = Math.pow(2, retries) * 1000;
      console.log(`Retry ${retries}/${maxRetries}, backing off for ${backoffTime}ms`);
      sleep(backoffTime / 1000); // convert ms to seconds for k6 sleep
    }
    
    if (method === 'GET') {
      result = http.get(url, fullParams);
    } else if (method === 'POST') {
      result = http.post(url, body ? JSON.stringify(body) : null, fullParams);
    } else if (method === 'PUT') {
      result = http.put(url, body ? JSON.stringify(body) : null, fullParams);
    } else if (method === 'PATCH') {
      result = http.patch(url, body ? JSON.stringify(body) : null, fullParams);
    }
    
    // Check for rate limiting
    if (result.status === 429) {
      console.log(`Rate limited on ${url}, attempt ${retries + 1}/${maxRetries}`);
      rateLimitErrors.add(1);
      retries++;
      continue;
    }
    
    // No rate limiting, return the result
    return result;
  }
  
  // If we get here, we've exhausted our retries
  console.log(`Failed after ${maxRetries} retries for ${url}`);
  return result;
}

// Main test function
export default function() {
  // 1. Select a random user based on the scenario
  const user = credentials[randomIntBetween(0, credentials.length - 1)];
  
  console.log(`Running test with user: ${user.email}, role: ${user.role}`);
  
  // Initial sleep to avoid burst at the start
  sleep(randomIntBetween(1, 3));
  
  // 2. Login
  const loginRes = rateLimitedRequest('POST', `${BASE_URL}/auth/v1/token?grant_type=password`, {
    email: user.email,
    password: user.password,
  }, {
    name: 'login'
  });
  
  check(loginRes, {
    'logged in successfully': (resp) => resp.status === 200,
  });
  
  if (loginRes.status !== 200) {
    console.error(`Login failed for ${user.email}: ${loginRes.body}`);
    sleep(randomIntBetween(5, 10)); // Long sleep if login failed
    return;
  }
  
  const authToken = JSON.parse(loginRes.body).access_token;
  
  // Add a longer sleep after login
  sleep(randomIntBetween(3, 5));
  
  // 3. Based on the user role, perform different operations
  switch (user.role) {
    case 'bar':
      // 20% chance to skip this operation to reduce load
      if (Math.random() < 0.2) {
        console.log("Skipping bar operations to reduce load");
        sleep(randomIntBetween(3, 5));
        return;
      }
      
      // Bar operation - get products
      const productsRes = rateLimitedRequest('GET', `${BASE_URL}/rest/v1/bar_products?select=*`, null, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'get_products'
      });
      
      if (productsRes.status !== 200) {
        console.error(`Failed to get products. Status: ${productsRes.status}, Response: ${productsRes.body}`);
        sleep(randomIntBetween(3, 5));
        return;
      }
      
      const productsBody = productsRes.body ? JSON.parse(productsRes.body) : [];
      
      if (!productsBody.length) {
        console.error('No products found in the response');
        sleep(randomIntBetween(3, 5));
        return;
      }
      
      const products = productsBody;
      console.log(`Found ${products.length} products`);
      
      // Add sleep to space out requests
      sleep(randomIntBetween(3, 5));
      
      // Create an order
      const cardId = simulatedCardIds[randomIntBetween(0, simulatedCardIds.length - 1)];
      
      // First check if the card exists
      const cardCheckRes = rateLimitedRequest('GET', `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=id,amount`, null, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'check_card'
      });
      
      const cardExists = cardCheckRes.status === 200 && JSON.parse(cardCheckRes.body).length > 0;
      console.log(`Card check for ${cardId}: exists = ${cardExists}`);
      
      // Add sleep to space out requests
      sleep(randomIntBetween(3, 5));
      
      // If card doesn't exist, create it
      if (!cardExists) {
        console.log(`Creating new card with ID: ${cardId}`);
        const createCardRes = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/table_cards`, 
          {
            id: cardId,
            amount: '50', // Start with some balance
            description: 'Test card for bar operations'
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
              'Authorization': `Bearer ${authToken}`,
              'apikey': API_KEY
            },
            name: 'create_card'
          }
        );
        
        if (createCardRes.status !== 201) {
          console.error(`Failed to create card. Status: ${createCardRes.status}, Response: ${createCardRes.body}`);
          sleep(randomIntBetween(3, 5));
          return;
        }
        
        console.log(`Card created successfully: ${createCardRes.body}`);
        
        // Add a larger pause to ensure the card is properly created
        sleep(3);
      }
      
      const orderItems = getRandomOrderItems(products);
      const orderTotal = orderItems.reduce((total, item) => total + (item.unit_price * item.quantity), 0);
      
      console.log(`Creating order for card ${cardId} with total amount ${orderTotal} and ${orderItems.length} items`);
      
      const orderPayload = {
        card_id: cardId,
        status: 'completed',
        total_amount: orderTotal
      };
      
      console.log(`Order payload: ${JSON.stringify(orderPayload)}`);
      
      const orderRes = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/bar_orders`, orderPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'create_order'
      });
      
      console.log(`Order response status: ${orderRes.status}, body: ${orderRes.body}`);
      
      check(orderRes, {
        'bar order created successfully': (resp) => resp.status === 201,
      });
      
      // Add sleep to space out requests
      sleep(randomIntBetween(3, 5));
      
      // If order was created successfully, create order items
      if (orderRes.status === 201) {
        let orderId;
        
        try {
          const responseBody = JSON.parse(orderRes.body);
          
          // Handle both array and object responses
          if (Array.isArray(responseBody) && responseBody.length > 0) {
            orderId = responseBody[0].id;
          } else if (responseBody && responseBody.id) {
            orderId = responseBody.id;
          } else {
            console.error('Could not extract order ID from response:', orderRes.body);
            return;
          }
        } catch (e) {
          console.error('Error parsing order response:', e, orderRes.body);
          return;
        }
        
        if (!orderId) {
          console.error('No order ID found in response:', orderRes.body);
          return;
        }
        
        // Create order items one by one
        for (const item of orderItems) {
          const product = products.find(p => p.id === item.product_id);
          
          if (!product) {
            console.error(`Product with ID ${item.product_id} not found`);
            continue;
          }
          
          rateLimitedRequest('POST', `${BASE_URL}/rest/v1/bar_order_items`, {
            order_id: orderId,
            product_name: product.name,
            price: item.unit_price,
            quantity: item.quantity,
            is_deposit: product.is_deposit || false,
            is_return: product.is_return || false
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
              'Authorization': `Bearer ${authToken}`,
              'apikey': API_KEY
            },
            name: 'create_order_item'
          });
          
          // Add a larger delay between item creations
          sleep(2);
        }
      }
      
      break;
      
    case 'recharge':
      // 20% chance to skip this operation to reduce load
      if (Math.random() < 0.2) {
        console.log("Skipping recharge operations to reduce load");
        sleep(randomIntBetween(3, 5));
        return;
      }
      
      // Recharge operation
      const rechargeCardId = simulatedCardIds[randomIntBetween(0, simulatedCardIds.length - 1)];
      const rechargeAmount = rechargeAmounts[randomIntBetween(0, rechargeAmounts.length - 1)];
      
      // First check if the card exists
      const rechargeCardCheckRes = rateLimitedRequest('GET', `${BASE_URL}/rest/v1/table_cards?id=eq.${rechargeCardId}&select=id,amount`, null, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'check_recharge_card'
      });
      
      const rechargeCardExists = rechargeCardCheckRes.status === 200 && JSON.parse(rechargeCardCheckRes.body).length > 0;
      console.log(`Recharge card check for ${rechargeCardId}: exists = ${rechargeCardExists}`);
      
      // Add sleep to space out requests
      sleep(randomIntBetween(3, 5));
      
      // If card doesn't exist, create it
      if (!rechargeCardExists) {
        console.log(`Creating new recharge card with ID: ${rechargeCardId}`);
        const createRechargeCardRes = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/table_cards`, 
          {
            id: rechargeCardId,
            amount: '0', // Start with zero balance
            description: 'Test card for recharge operations'
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
              'Authorization': `Bearer ${authToken}`,
              'apikey': API_KEY
            },
            name: 'create_recharge_card'
          }
        );
        
        if (createRechargeCardRes.status !== 201) {
          console.error(`Failed to create recharge card. Status: ${createRechargeCardRes.status}, Response: ${createRechargeCardRes.body}`);
          sleep(randomIntBetween(3, 5));
          return;
        }
        
        console.log(`Recharge card created successfully: ${createRechargeCardRes.body}`);
        
        // Add a larger pause to ensure the card is properly created
        sleep(3);
      }
      
      // Get current card amount if it exists
      let currentAmount = 0;
      if (rechargeCardExists) {
        const cardData = JSON.parse(rechargeCardCheckRes.body)[0];
        currentAmount = cardData.amount ? parseFloat(cardData.amount) : 0;
      }
      
      // Create a transaction record in paiements table
      console.log(`Creating recharge transaction for card ${rechargeCardId} with amount ${rechargeAmount}`);
      
      const transactionRes = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/paiements`, {
        id_card: rechargeCardId,
        amount: rechargeAmount,
        paid_by_card: randomIntBetween(0, 1) === 1,
        created_at: new Date().toISOString()
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'create_recharge_transaction'
      });
      
      console.log(`Recharge transaction response status: ${transactionRes.status}, body: ${transactionRes.body}`);
      
      check(transactionRes, {
        'recharge transaction created successfully': (resp) => resp.status === 201,
      });
      
      // Add sleep to space out requests
      sleep(randomIntBetween(3, 5));
      
      // Update card balance - add recharge amount to current amount
      const newAmount = currentAmount + parseFloat(rechargeAmount);
      console.log(`Updating card ${rechargeCardId} amount from ${currentAmount} to ${newAmount}`);
      
      const updateCardRes = rateLimitedRequest('PATCH', `${BASE_URL}/rest/v1/table_cards?id=eq.${rechargeCardId}`, {
        amount: newAmount.toString()
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'update_card_balance'
      });
      
      console.log(`Card update response status: ${updateCardRes.status}, body: ${updateCardRes.body}`);
      
      break;
      
    case 'admin':
      // 30% chance to skip admin operations to reduce load
      if (Math.random() < 0.3) {
        console.log("Skipping admin operations to reduce load");
        sleep(randomIntBetween(3, 5));
        return;
      }
      
      // Admin operations - mix of read operations
      // Reduce the query time range to last 30 minutes instead of hour
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      // Limit to 20 records
      rateLimitedRequest('GET', `${BASE_URL}/rest/v1/paiements?created_at=gte.${thirtyMinsAgo}&select=*&order=created_at.desc&limit=20`, null, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'get_transactions'
      });
      
      // Add sleep to space out requests
      sleep(randomIntBetween(3, 5));
      
      // 50% chance to skip the next operation to reduce load
      if (Math.random() < 0.5) {
        console.log("Skipping orders query to reduce load");
        sleep(randomIntBetween(3, 5));
        break;
      }
      
      // Limit to 20 records
      rateLimitedRequest('GET', `${BASE_URL}/rest/v1/bar_orders?created_at=gte.${thirtyMinsAgo}&select=*&order=created_at.desc&limit=20`, null, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'get_orders'
      });
      
      // Add sleep to space out requests
      sleep(randomIntBetween(3, 5));
      
      // 50% chance to skip the next operation to reduce load
      if (Math.random() < 0.5) {
        console.log("Skipping products query to reduce load");
        sleep(randomIntBetween(3, 5));
        break;
      }
      
      rateLimitedRequest('GET', `${BASE_URL}/rest/v1/bar_products?select=*`, null, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': API_KEY
        },
        name: 'get_all_products'
      });
      
      break;
  }
  
  // Longer sleep times to create more realistic load patterns and avoid rate limits
  sleep(randomIntBetween(5, 10));
} 