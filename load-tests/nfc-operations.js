import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';

// Create a custom metric to track rate limit errors
const rateLimitErrors = new Rate('rate_limit_errors');

// Define base URL and API key
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Bar credentials for testing
const barCredentials = [
  { email: 'bar1@lesaperosduchateau.be', password: 'g7YyT3KhWR84' },
  { email: 'bar2@lesaperosduchateau.be', password: 'g7YyT3KhWR84' },
  { email: 'bar3@lesaperosduchateau.be', password: 'g7YyT3KhWR84' },
  { email: 'bar4@lesaperosduchateau.be', password: 'g7YyT3KhWR84' },
  { email: 'bar5@lesaperosduchateau.be', password: 'g7YyT3KhWR84' },
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
      result = http.post(body ? JSON.stringify(body) : null, url, fullParams);
    } else if (method === 'PUT') {
      result = http.put(body ? JSON.stringify(body) : null, url, fullParams);
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
  const authHeader = { 'Authorization': `Bearer ${accessToken}` };
  
  // Sleep a random amount to spread out requests
  sleep(Math.random() * 2);
  
  // Simulate NFC card scan
  const cardId = simulatedNfcIds[Math.floor(Math.random() * simulatedNfcIds.length)];
  
  // Check if card exists, create if not (this helps with test stability)
  const cardCheckUrl = `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=id,amount`;
  const cardCheckResponse = rateLimitedRequest('GET', cardCheckUrl, null, {
    headers: authHeader,
    name: 'check_card'
  });
  
  let cardExists = cardCheckResponse.status === 200 && cardCheckResponse.json().length > 0;
  
  if (!cardExists) {
    console.log(`Creating test NFC card: ${cardId}`);
    
    // Try backup cards table
    const cardBackupCheckUrl = `${BASE_URL}/rest/v1/cards?id=eq.${cardId}&select=id,balance`;
    const cardBackupCheckResponse = rateLimitedRequest('GET', cardBackupCheckUrl, null, {
      headers: authHeader,
      name: 'check_card_backup'
    });
    
    cardExists = cardBackupCheckResponse.status === 200 && cardBackupCheckResponse.json().length > 0;
    
    if (!cardExists) {
      const createCardResponse = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/table_cards`, {
        id: cardId,
        amount: '1000',
        description: 'Test NFC card'
      }, {
        headers: authHeader,
        name: 'create_card'
      });
      
      // If first attempt fails, try backup table
      if (createCardResponse.status !== 201) {
        console.log('Trying backup table for card creation');
        const createCardBackupResponse = rateLimitedRequest('POST', `${BASE_URL}/rest/v1/cards`, {
          id: cardId,
          balance: 1000,
          description: 'Test NFC card'
        }, {
          headers: authHeader,
          name: 'create_card_backup'
        });
        
        if (!check(createCardBackupResponse, { 'card created (backup)': (r) => r.status === 201 || r.status === 200 })) {
          console.error('Failed to create card in either table:', createCardBackupResponse.status, createCardBackupResponse.body);
          sleep(3);
          return;
        }
      }
    }
  }
  
  // Random delay
  sleep(Math.random() * 1);
  
  // Process NFC scan - get card balance
  console.log(`Processing NFC scan for card: ${cardId}`);
  
  // Try table_cards first
  const getCardUrl = `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=id,amount`;
  const getCardResponse = rateLimitedRequest('GET', getCardUrl, null, {
    headers: authHeader,
    name: 'get_card'
  });
  
  let balanceCheck = false;
  
  if (getCardResponse.status === 200 && getCardResponse.json().length > 0) {
    const cardData = getCardResponse.json()[0];
    balanceCheck = check(cardData, { 
      'card has balance': (card) => card.amount && parseFloat(card.amount) > 0 
    });
    
    if (balanceCheck) {
      console.log(`NFC card ${cardId} has balance: ${cardData.amount}`);
    }
  } else {
    // Try backup table
    const getCardBackupUrl = `${BASE_URL}/rest/v1/cards?id=eq.${cardId}&select=id,balance`;
    const getCardBackupResponse = rateLimitedRequest('GET', getCardBackupUrl, null, {
      headers: authHeader,
      name: 'get_card_backup'
    });
    
    if (getCardBackupResponse.status === 200 && getCardBackupResponse.json().length > 0) {
      const cardData = getCardBackupResponse.json()[0];
      balanceCheck = check(cardData, { 
        'card has balance (backup)': (card) => card.balance && parseFloat(card.balance) > 0 
      });
      
      if (balanceCheck) {
        console.log(`NFC card ${cardId} has balance: ${cardData.balance}`);
      }
    }
  }
  
  if (!balanceCheck) {
    console.error('Could not verify card balance');
  }
  
  // Sleep to allow some time between complete operations
  sleep(3 + Math.random() * 2);
} 