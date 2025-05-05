import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Metrics for tracking rate limit errors
const rateLimitErrors = new Rate('rate_limit_errors');

// Admin credentials for testing
const adminCredential = {
  email: 'alex@lesaperosduchateau.be',
  password: 'g7YyT3KhWR84'
};

// Base URL of the application
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Patterns for identifying test data
const TEST_CARD_ID_PATTERNS = [
  'simulated-card-%',
  'nfc-card-%',
  'nfc-test-%'
];

// Test configuration
export const options = {
  vus: 1,            // Only need one virtual user
  iterations: 1,     // Run only once
  thresholds: {
    'rate_limit_errors': ['rate<0.3'],  // Track rate limit errors separately
  },
};

// Helper function for rate-limited API calls with retries
function rateLimitedRequest(method, url, body, headers, maxRetries = 3) {
  let retries = 0;
  let response;

  while (retries <= maxRetries) {
    if (retries > 0) {
      // Exponential backoff with jitter (2^retries + random)
      const backoffTime = (Math.pow(2, retries) + Math.random()) * 2;
      console.log(`Rate limited, retrying in ${backoffTime.toFixed(2)}s (attempt ${retries}/${maxRetries})`);
      sleep(backoffTime);
    }

    if (method.toLowerCase() === 'get') {
      response = http.get(url, { headers });
    } else if (method.toLowerCase() === 'post') {
      response = http.post(url, body, { headers });
    } else if (method.toLowerCase() === 'patch') {
      response = http.patch(url, body, { headers });
    } else if (method.toLowerCase() === 'delete') {
      response = http.del(url, null, { headers });
    }

    // Check if we hit a rate limit
    if (response.status === 429) {
      rateLimitErrors.add(1);
      retries++;
      continue;
    }

    return response;
  }

  // Return the last response if we exhausted our retries
  return response;
}

// Main function
export default function() {
  console.log('Starting test data cleanup...');
  
  // 1. Login as admin
  const loginRes = rateLimitedRequest('post', `${BASE_URL}/auth/v1/token?grant_type=password`, 
    JSON.stringify({
      email: adminCredential.email,
      password: adminCredential.password,
    }),
    {
      'Content-Type': 'application/json',
      'apikey': API_KEY
    }
  );
  
  const loginSuccess = check(loginRes, {
    'admin logged in successfully': (resp) => resp.status === 200,
  });
  
  if (!loginSuccess) {
    console.error(`Login failed for admin: ${loginRes.body}`);
    return;
  }
  
  const authToken = JSON.parse(loginRes.body).access_token;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    'apikey': API_KEY
  };
  
  let allCardIds = [];
  
  // 2. Get all test cards using various patterns
  for (let pattern of TEST_CARD_ID_PATTERNS) {
    console.log(`Searching for cards with pattern: ${pattern}`);
    
    const cardIdsRes = rateLimitedRequest('get', 
      `${BASE_URL}/rest/v1/cards?id=like.${encodeURIComponent(pattern)}&select=id`,
      null, headers
    );
    
    if (cardIdsRes.status === 200) {
      const foundCards = JSON.parse(cardIdsRes.body);
      allCardIds = allCardIds.concat(foundCards.map(card => card.id));
      console.log(`Found ${foundCards.length} cards matching pattern '${pattern}'`);
    }
    
    // Add delay between queries to avoid rate limiting
    sleep(1);
  }
  
  console.log(`Found ${allCardIds.length} total test cards to clean up`);
  
  if (allCardIds.length === 0) {
    console.log('No test cards found. Cleanup complete.');
    return;
  }
  
  // Process cards in smaller batches to avoid rate limits
  const BATCH_SIZE = 5;
  const batches = [];
  
  for (let i = 0; i < allCardIds.length; i += BATCH_SIZE) {
    batches.push(allCardIds.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Processing cards in ${batches.length} batches of up to ${BATCH_SIZE} cards each`);
  
  // 3. For each batch of cards, perform cleanup
  for (let [batchIndex, cardBatch] of batches.entries()) {
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${cardBatch.length} cards`);
    
    for (let cardId of cardBatch) {
      console.log(`Cleaning up data for card: ${cardId}`);
      
      // 3.1 Delete transactions
      const deleteTransactionsRes = rateLimitedRequest('delete',
        `${BASE_URL}/rest/v1/transactions?card_id=eq.${encodeURIComponent(cardId)}`,
        null,
        {
          ...headers,
          'Prefer': 'return=minimal'
        }
      );
      
      check(deleteTransactionsRes, {
        'transactions deleted successfully': (resp) => resp.status === 204 || resp.status === 200,
      });
      
      // Add short delay between operations
      sleep(1);
      
      // 3.2 Delete orders
      const deleteOrdersRes = rateLimitedRequest('delete',
        `${BASE_URL}/rest/v1/orders?card_id=eq.${encodeURIComponent(cardId)}`,
        null,
        {
          ...headers,
          'Prefer': 'return=minimal'
        }
      );
      
      check(deleteOrdersRes, {
        'orders deleted successfully': (resp) => resp.status === 204 || resp.status === 200,
      });
      
      // Add short delay between operations
      sleep(1);
      
      // 3.3 Delete card
      const deleteCardRes = rateLimitedRequest('delete',
        `${BASE_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}`,
        null,
        {
          ...headers,
          'Prefer': 'return=minimal'
        }
      );
      
      check(deleteCardRes, {
        'card deleted successfully': (resp) => resp.status === 204 || resp.status === 200,
      });
      
      // Add short delay between cards
      sleep(1);
    }
    
    // Add longer delay between batches
    if (batchIndex < batches.length - 1) {
      console.log(`Finished batch ${batchIndex + 1}/${batches.length}. Pausing before next batch...`);
      sleep(5);
    }
  }
  
  console.log('Test data cleanup completed successfully!');
} 