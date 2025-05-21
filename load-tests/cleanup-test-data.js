import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Create a custom metric to track rate limit errors
const rateLimitErrors = new Rate('rate_limit_errors');
const cleanupSuccess = new Rate('cleanup_success');

// Admin credentials for testing
const ADMIN_EMAIL = 'alex@lesaperosduchateau.be';
const ADMIN_PASSWORD = 'g7YyT3KhWR84';

// Define base URL and API key
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Define patterns for identifying test data
const TEST_CARD_PATTERNS = [
  'simulated-card-%',       // Original load tests
  'nfc-card-%',             // NFC tests
  'nfc-test-%',             // NFC tests
  'simulated-card-_',       // Original load tests alternative pattern
  'nfc-test-_',             // NFC tests alternative pattern 
  'test-card-%',            // New functional bar tests
  'test-recharge-%',        // New functional recharge tests
  'nfc-low-%',              // NFC low balance tests
  'nfc-empty-%',            // NFC empty tests
  'test-card-normal-%',     // Specific functional test patterns
  'test-card-low-%',        // Specific functional test patterns
  'test-card-exact-%',      // Specific functional test patterns
  'test-card-empty-%',      // Specific functional test patterns
  'test-recharge-new-%',    // Specific recharge test patterns
  'test-recharge-existing-%', // Specific recharge test patterns
  'test-recharge-high-%'    // Specific recharge test patterns
];

// k6 options - one user, one iteration
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'rate_limit_errors': ['rate<0.1'], // Track rate limit errors separately
    'cleanup_success': ['rate>0.9'],   // At least 90% of cleanup operations should succeed
  },
};

// Function to retry on rate limit with improved error handling and increased backoff
function rateLimitedRequest(method, url, body = null, params = {}) {
  const maxRetries = 8;  // Increased from 5 to 8 for cleanup operations
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
  
  // Always add initial jitter to avoid thundering herd
  const initialJitter = Math.random() * 1000;
  sleep(initialJitter / 1000);
  
  while (retries < maxRetries) {
    if (retries > 0) {
      // Exponential backoff with jitter - increased values
      const randomFactor = 0.7 + Math.random(); // 0.7 to 1.7 range
      const backoffTime = Math.pow(2, retries) * 800 * randomFactor; // increased base from 500 to 800ms
      console.log(`Retry ${retries}/${maxRetries}, backing off for ${backoffTime.toFixed(0)}ms`);
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
    } else if (method === 'DELETE') {
      result = http.del(url, body ? JSON.stringify(body) : null, fullParams);
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

// Process in batches to avoid hitting API limits
function processBatch(items, processFn, batchSize = 3) {  // Reduced batch size from 5 to 3
  console.log(`Processing ${items.length} items in batches of ${batchSize}`);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(items.length/batchSize)}`);
    
    batch.forEach(item => {
      const success = processFn(item);
      cleanupSuccess.add(success ? 1 : 0);
      
      // Longer delay between each item in batch
      sleep(0.5);  // Increased from 0.2 to 0.5
    });
    
    // Longer delay between batches
    if (i + batchSize < items.length) {
      console.log('Sleeping between batches to avoid rate limits');
      sleep(3);  // Increased from 2 to 3 seconds
    }
  }
}

// Optimized function to find and clean up test data
export default function() {
  console.log('Starting enhanced cleanup of test data');
  
  // 1. Login as admin
  console.log(`Logging in as ${ADMIN_EMAIL}`);
  const loginResponse = rateLimitedRequest('POST', `${BASE_URL}/auth/v1/token?grant_type=password`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  }, {
    headers: { 
      'apikey': API_KEY,
      'Prefer': 'return=representation' 
    },
    name: 'login'
  });
  
  if (!check(loginResponse, { 'login successful': (r) => r.status === 200 && r.json('access_token') !== undefined })) {
    console.error('Admin login failed:', loginResponse.status, loginResponse.body);
    return;
  }
  
  const accessToken = loginResponse.json('access_token');
  // Include the API key in the auth header
  const authHeader = { 
    'Authorization': `Bearer ${accessToken}`,
    'apikey': API_KEY
  };
  
  console.log('Login successful, retrieving test data');
  
  // 2. Get all test card IDs using our expanded patterns
  const allCardIds = [];
  
  // Try to get cards that match our test patterns - process in smaller chunks
  const patternBatchSize = 4;  // Process 4 patterns at a time
  
  for (let i = 0; i < TEST_CARD_PATTERNS.length; i += patternBatchSize) {
    const patternBatch = TEST_CARD_PATTERNS.slice(i, i + patternBatchSize);
    console.log(`Processing pattern batch ${Math.floor(i/patternBatchSize) + 1}`);
    
    patternBatch.forEach((pattern, index) => {
      // Add a delay to avoid rate limiting on these requests
      sleep(1);  // Increased from 0.5 to 1
      
    // Check table_cards
    const tableCardsUrl = `${BASE_URL}/rest/v1/table_cards?id=like.${pattern}&select=id`;
    const tableCardsResponse = rateLimitedRequest('GET', tableCardsUrl, null, {
      headers: authHeader,
      name: 'get_table_cards'
    });
    
    if (tableCardsResponse.status === 200) {
      const tableCards = tableCardsResponse.json();
      console.log(`Found ${tableCards.length} test cards in table_cards matching ${pattern}`);
      tableCards.forEach(card => {
        // Check if this card ID is already in our list
        if (!allCardIds.some(c => c.id === card.id)) {
          allCardIds.push({ id: card.id, table: 'table_cards' });
          console.log(`-> Added test card: ${card.id}`);
        }
      });
    }
    });
    
    // Longer sleep between pattern batches
    console.log('Sleeping between pattern batches to avoid rate limits');
    sleep(3);  // Give the API a rest between pattern batches
  }
  
  // Also try to find cards by checking specific prefixes from functional tests
  const specificPrefixes = [
    'test-card-normal-',
    'test-card-low-',
    'test-card-exact-',
    'test-card-empty-',
    'test-recharge-'
  ];
  
  specificPrefixes.forEach((prefix, index) => {
    // Add a delay to avoid rate limiting on these requests
    sleep(1);  // Increased from 0.5 to 1
    
    // Get recently created cards with this prefix, fewer at a time
    const recentCardsUrl = `${BASE_URL}/rest/v1/table_cards?id=ilike.${prefix}%&select=id&order=created_at.desc&limit=30`;  // Reduced limit from 50 to 30
    const recentCardsResponse = rateLimitedRequest('GET', recentCardsUrl, null, {
      headers: authHeader,
      name: 'get_recent_functional_cards'
    });
    
    if (recentCardsResponse.status === 200) {
      const recentCards = recentCardsResponse.json();
      console.log(`Found ${recentCards.length} recent test cards matching prefix ${prefix}`);
      recentCards.forEach(card => {
        // Check if this card ID is already in our list
        if (!allCardIds.some(c => c.id === card.id)) {
          allCardIds.push({ id: card.id, table: 'table_cards' });
          console.log(`-> Added recent test card: ${card.id}`);
        }
      });
    }
    
    sleep(1.5);  // Increased from 0.5 to 1.5
  });
  
  console.log(`Total test cards found: ${allCardIds.length}`);
  
  if (allCardIds.length === 0) {
    console.log('No test cards found, nothing to clean up');
    return;
  }
  
  // 3. Delete all related data for each card - reduced batch size
  processBatch(allCardIds, (cardInfo) => {
    try {
    console.log(`Cleaning up data for card: ${cardInfo.id}`);
      let success = true;
    
      // 3.1 Delete payment records first
    const paymentsUrl = `${BASE_URL}/rest/v1/paiements?id_card=eq.${cardInfo.id}`;
    const deletePaymentsResponse = rateLimitedRequest('DELETE', paymentsUrl, null, {
      headers: authHeader,
      name: 'delete_payments'
    });
    
      if (deletePaymentsResponse.status === 200 || deletePaymentsResponse.status === 204) {
        console.log(`✓ Deleted payments for card ${cardInfo.id}`);
      } else {
        console.log(`✗ Failed to delete payments for card ${cardInfo.id}: ${deletePaymentsResponse.status}`);
        success = false;
      }
      
      sleep(1);  // Increased from 0.5 to 1
    
      // 3.2 Delete order items and orders
      // First get order IDs for this card
      const ordersUrl = `${BASE_URL}/rest/v1/bar_orders?card_id=eq.${cardInfo.id}&select=id`;
      const ordersResponse = rateLimitedRequest('GET', ordersUrl, null, {
        headers: authHeader,
        name: 'get_orders'
      });
      
      if (ordersResponse.status === 200) {
        const orders = ordersResponse.json();
        if (orders && orders.length > 0) {
        console.log(`Found ${orders.length} orders for card ${cardInfo.id}`);
        
          // Process orders in smaller batches to avoid rate limits
          const orderBatchSize = 2;  // Reduced from 3 to 2
          for (let i = 0; i < orders.length; i += orderBatchSize) {
            const orderBatch = orders.slice(i, i + orderBatchSize);
            
            // Delete order items for each order in batch
            orderBatch.forEach(order => {
          const orderItemsUrl = `${BASE_URL}/rest/v1/bar_order_items?order_id=eq.${order.id}`;
          const deleteItemsResponse = rateLimitedRequest('DELETE', orderItemsUrl, null, {
            headers: authHeader,
            name: 'delete_order_items'
          });
          
              if (deleteItemsResponse.status === 200 || deleteItemsResponse.status === 204) {
                console.log(`✓ Deleted items for order ${order.id}`);
              } else {
                console.log(`✗ Failed to delete items for order ${order.id}: ${deleteItemsResponse.status}`);
                success = false;
              }
              
              sleep(0.5);  // Increased from 0.2 to 0.5
        
              // Now delete the order itself
              const deleteOrderUrl = `${BASE_URL}/rest/v1/bar_orders?id=eq.${order.id}`;
              const deleteOrderResponse = rateLimitedRequest('DELETE', deleteOrderUrl, null, {
          headers: authHeader,
                name: 'delete_order'
        });
        
              if (deleteOrderResponse.status === 200 || deleteOrderResponse.status === 204) {
                console.log(`✓ Deleted order ${order.id}`);
              } else {
                console.log(`✗ Failed to delete order ${order.id}: ${deleteOrderResponse.status}`);
                success = false;
              }
              
              sleep(0.5);  // Increased from 0.2 to 0.5
            });
            
            // Add a pause between order batches
            if (i + orderBatchSize < orders.length) {
              sleep(2);  // Increased from 1 to 2
            }
          }
        } else {
          console.log(`No orders found for card ${cardInfo.id}`);
        }
      } else {
        console.log(`Failed to get orders for card ${cardInfo.id}: ${ordersResponse.status}`);
        success = false;
    }
    
      sleep(1.5);  // Increased from 0.5 to 1.5
    
      // 3.3 Finally, delete the card
      const cardUrl = `${BASE_URL}/rest/v1/table_cards?id=eq.${cardInfo.id}`;
    const deleteCardResponse = rateLimitedRequest('DELETE', cardUrl, null, {
      headers: authHeader,
      name: 'delete_card'
    });
    
      if (deleteCardResponse.status === 200 || deleteCardResponse.status === 204) {
        console.log(`✓ Deleted card ${cardInfo.id}`);
      } else {
        console.log(`✗ Failed to delete card ${cardInfo.id}: ${deleteCardResponse.status}`);
        success = false;
      }
      
      return success;
    } catch (error) {
      console.error(`Error cleaning up card ${cardInfo.id}:`, error);
      return false;
    }
  }, 2); // Process 2 cards at a time instead of 3
  
  console.log('Cleanup completed! Check above for any failures.');
} 