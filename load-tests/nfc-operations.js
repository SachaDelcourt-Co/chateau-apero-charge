import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';

// Create a custom metric to track rate limit errors
const rateLimitErrors = new Rate('rate_limit_errors');

// Define base URL and API key
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Bar credentials for testing - using alex@lesaperosduchateau.be as it's a known valid admin user
const barCredentials = [
  { email: 'alex@lesaperosduchateau.be', password: 'g7YyT3KhWR84' },
];

// Generate a unique ID for this test run to avoid collisions
const testRunId = new Date().getTime();

// Simulated NFC card IDs
const simulatedNfcIds = new SharedArray('simulatedNfcIds', function() {
  const cards = [];
  for (let i = 1; i <= 50; i++) {
    cards.push(`nfc-test-${testRunId}-${i}`);
  }
  return cards;
});

// k6 options - reduced VUs and rate to prevent hitting rate limits
export const options = {
  scenarios: {
    nfc_operations: {
      executor: 'constant-arrival-rate',
      rate: 1, // 1 simulated NFC scan per second
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 3,
      maxVUs: 5,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.3'], // Allow up to 30% of requests to fail for testing
    'rate_limit_errors': ['rate<0.15'], // Track rate limit errors separately
  },
};

// Function to retry on rate limit
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
  
  while (retries < maxRetries) {
    if (retries > 0) {
      // Exponential backoff: 0.5s, 1s, 2s, 4s, 8s
      const backoffTime = Math.pow(2, retries - 1) * 500;
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

// Helper function to ensure a card exists in the system
function ensureCardExists(authHeader, cardId, initialAmount = '1000') {
  try {
    // First try to check if card exists in table_cards
    const cardCheckUrl = `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=id,amount`;
    const cardCheckResponse = rateLimitedRequest('GET', cardCheckUrl, null, {
      headers: authHeader,
      name: 'check_card'
    });
    
    if (cardCheckResponse.status === 200 && cardCheckResponse.json().length > 0) {
      // Card exists, return it
      return {
        success: true,
        card: cardCheckResponse.json()[0],
        isNew: false
      };
    }
    
    // Card doesn't exist, create it
    console.log(`Creating card ${cardId} in table_cards`);
    const createCardResponse = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/table_cards`, {
      id: cardId,
      amount: initialAmount,
      description: 'Test NFC card'
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
        return {
          success: true,
          card: verifyCardResponse.json()[0],
          isNew: true
        };
      }
    }
    
    // If we're here, card creation or verification failed
    console.error('Failed to create or verify card:', createCardResponse.status, createCardResponse.body);
    return { success: false };
  } catch (error) {
    console.error('Error in ensureCardExists:', error);
    return { success: false };
  }
}

// Function to simulate NFC card processing
function processNfcCard(authHeader, cardId) {
  try {
    // Step 1: Ensure the card exists
    const cardResult = ensureCardExists(authHeader, cardId);
    if (!cardResult.success) {
      return { success: false, error: 'Card creation failed' };
    }
    
    // Get the card data
    const card = cardResult.card;
    console.log(`Card ${cardId} ${cardResult.isNew ? 'created' : 'found'} with balance: ${card.amount}`);
    
    // For NFC operations, we'll just verify the card balance is sufficient for a small purchase
    const minimumBalance = 5.0; // 5 EUR minimum
    const currentBalance = parseFloat(card.amount || '0');
    
    if (currentBalance < minimumBalance) {
      console.log(`Card ${cardId} has insufficient balance: ${currentBalance} (minimum: ${minimumBalance})`);
      return { 
        success: true, 
        hasBalance: false, 
        balance: currentBalance,
        minimumRequired: minimumBalance
      };
    }
    
    // Card has sufficient balance, return success
    return {
      success: true,
      hasBalance: true,
      balance: currentBalance
    };
  } catch (error) {
    console.error('Error in processNfcCard:', error);
    return { success: false, error: error.message };
  }
}

export default function() {
  // Randomly select a bar user
  const barCredential = barCredentials[Math.floor(Math.random() * barCredentials.length)];
  
  // Login
  console.log(`Logging in as ${barCredential.email}`);
  const loginResponse = rateLimitedRequest('POST', `${BASE_URL}/auth/v1/token?grant_type=password`, {
    email: barCredential.email,
    password: barCredential.password
  }, {
    name: 'login'
  });
  
  // Check if login was successful
  if (!check(loginResponse, { 'login successful': (r) => r.status === 200 && r.json('access_token') !== undefined })) {
    console.error('Login failed:', loginResponse.status, loginResponse.body);
    sleep(3);
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
  
  // Simulate NFC card scan
  const cardId = simulatedNfcIds[Math.floor(Math.random() * simulatedNfcIds.length)];
  console.log(`Simulating NFC scan for card: ${cardId}`);
  
  // Process the NFC card
  const nfcResult = processNfcCard(authHeader, cardId);
  
  // Check if NFC processing was successful
  check(nfcResult, { 
    'nfc scan processed': (r) => r.success === true 
  });
  
  // Sleep to allow some time between complete operations
  sleep(3 + Math.random() * 2);
} 