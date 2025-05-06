import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { Rate } from 'k6/metrics';

// Metrics for tracking rate limit errors
const rateLimitErrors = new Rate('rate_limit_errors');

// Recharge admin credentials
const rechargeCredentials = new SharedArray('recharge credentials', function() {
  return [
    { email: 'recharge1@lesaperosduchateau.be', password: 'R6uaMUZ1HgIS' },
    { email: 'recharge2@lesaperosduchateau.be', password: '53VxeoceKRvr' },
    { email: 'recharge3@lesaperosduchateau.be', password: 'RG0uzw5EL0xm' },
  ];
});

// Simulated card IDs (representing NFC cards)
const simulatedCardIds = new SharedArray('card IDs', function() {
  return Array.from({ length: 100 }, (_, i) => `simulated-card-${i+1}-recharge`);
});

// Recharge amounts
const rechargeAmounts = [5, 10, 20, 50, 100];

// Export k6 test options - reduced concurrency for rate limits
export const options = {
  scenarios: {
    recharge_operations: {
      executor: 'constant-arrival-rate',
      rate: 1,               // Only 1 recharge per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 3,
      maxVUs: 5,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // Allow more time for requests
    http_req_failed: ['rate<0.2'],      // Allow higher failure rate during testing
    'rate_limit_errors': ['rate<0.3'],   // Track rate limit errors separately
  },
};

// Base URL of the application
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Helper function for rate-limited API calls with retries
function rateLimitedRequest(method, url, body, headers, maxRetries = 3) {
  let retries = 0;
  let response;

  while (retries <= maxRetries) {
    if (retries > 0) {
      // Exponential backoff with jitter (2^retries + random)
      const backoffTime = (Math.pow(2, retries) + Math.random()) * 1;
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

// Main test function
export default function() {
  // Add random delay between users to spread the load
  sleep(Math.random() * 2);
  
  // 1. Login as recharge admin
  const rechargeUser = rechargeCredentials[randomIntBetween(0, rechargeCredentials.length - 1)];
  
  const loginRes = rateLimitedRequest('post', `${BASE_URL}/auth/v1/token?grant_type=password`, 
    JSON.stringify({
      email: rechargeUser.email,
      password: rechargeUser.password,
    }),
    {
      'Content-Type': 'application/json',
      'apikey': API_KEY
    }
  );
  
  const loginSuccess = check(loginRes, {
    'recharge admin logged in successfully': (resp) => resp.status === 200,
  });
  
  if (!loginSuccess) {
    console.error(`Login failed for ${rechargeUser.email}: ${loginRes.body}`);
    return;
  }
  
  const authToken = JSON.parse(loginRes.body).access_token;
  const authHeaders = {
    'Authorization': `Bearer ${authToken}`,
    'apikey': API_KEY
  };
  
  // Add a short sleep to pace the requests
  sleep(1.5);
  
  // 2. Simulate card scan for recharge
  const cardId = simulatedCardIds[randomIntBetween(0, simulatedCardIds.length - 1)];
  
  // Check if card exists (or create it if needed)
  const cardRes = rateLimitedRequest('get', `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=*`, null, authHeaders);
  
  const cardExists = cardRes.status === 200 && JSON.parse(cardRes.body).length > 0;
  
  // Add a short sleep to pace the requests
  sleep(1);
  
  if (!cardExists) {
    // Create a new card
    const createCardRes = rateLimitedRequest('post', `${BASE_URL}/rest/v1/table_cards`, 
      JSON.stringify({
        id: cardId,
        amount: '0',
        description: 'Test recharge card'
      }),
      {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...authHeaders
      }
    );
    
    check(createCardRes, {
      'new card created successfully': (resp) => resp.status === 201,
    });
    
    sleep(1);
  }
  
  // 3. Process card recharge
  const rechargeAmount = rechargeAmounts[randomIntBetween(0, rechargeAmounts.length - 1)];
  
  // Let's use the correct "paiements" table instead of "payments"
  let paymentCreated = false;
  
  try {
    // Use the "paiements" table which is the correct French spelling
    const transactionRes = rateLimitedRequest('post', `${BASE_URL}/rest/v1/paiements`, 
      JSON.stringify({
        amount: rechargeAmount.toString(),
        id_card: cardId,
        paid_by_card: randomIntBetween(0, 1) === 1, // randomly true or false
        created_at: new Date().toISOString()
      }),
      {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...authHeaders
      }
    );
    
    paymentCreated = transactionRes.status === 201;
    check(transactionRes, {
      'recharge transaction created successfully': (resp) => resp.status === 201,
    });
    
    // If the payment creation failed, let's check the response for hints
    if (!paymentCreated) {
      console.log(`Payment creation failed with status ${transactionRes.status}: ${transactionRes.body}`);
    }
  } catch (error) {
    console.error('Error creating payment:', error);
  }
  
  // If the payment wasn't created successfully, we'll still proceed with updating the card balance
  // which still works as seen in previous runs
  
  // Add a short sleep to pace the requests
  sleep(1);
  
  // 4. Update card balance
  // First get current amount
  const currentCardRes = rateLimitedRequest('get', `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}&select=amount`, null, authHeaders);
  let currentAmount = 0;
  
  if (currentCardRes.status === 200 && JSON.parse(currentCardRes.body).length > 0) {
    currentAmount = parseFloat(JSON.parse(currentCardRes.body)[0].amount || '0');
  }
  
  const newAmount = (currentAmount + rechargeAmount).toString();
  
  const updateCardRes = rateLimitedRequest('patch', `${BASE_URL}/rest/v1/table_cards?id=eq.${cardId}`, 
    JSON.stringify({
      amount: newAmount
    }),
    {
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
      ...authHeaders
    }
  );
  
  check(updateCardRes, {
    'card balance updated successfully': (resp) => resp.status === 204,
  });
  
  // Longer sleep between complete operations to reduce overall rate
  sleep(randomIntBetween(4, 6));
} 