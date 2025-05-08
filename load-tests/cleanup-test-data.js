import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Create a custom metric to track rate limit errors
const rateLimitErrors = new Rate('rate_limit_errors');

// Admin credentials for testing
const ADMIN_EMAIL = 'alex@lesaperosduchateau.be';
const ADMIN_PASSWORD = 'g7YyT3KhWR84';

// Define base URL and API key
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y';

// Define patterns for identifying test data
const TEST_CARD_PATTERNS = ['simulated-card-%', 'nfc-card-%', 'nfc-test-%', 'simulated-card-_', 'nfc-test-_'];

// k6 options - one user, one iteration
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    'rate_limit_errors': ['rate<0.1'], // Track rate limit errors separately
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
function processBatch(items, processFn, batchSize = 10) {
  console.log(`Processing ${items.length} items in batches of ${batchSize}`);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(items.length/batchSize)}`);
    
    batch.forEach(item => {
      processFn(item);
      // Small delay between each item in batch
      sleep(0.2);
    });
    
    // Longer delay between batches
    if (i + batchSize < items.length) {
      console.log('Sleeping between batches to avoid rate limits');
      sleep(2);
    }
  }
}

export default function() {
  console.log('Starting cleanup of test data');
  
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
  
  console.log('Login successful, retrieving test cards');
  
  // 2. Get all test card IDs
  const allCardIds = [];
  
  // Try to get all cards first to check for patterns manually
  const allCardsResponse = rateLimitedRequest('GET', `${BASE_URL}/rest/v1/table_cards?select=id`, null, {
    headers: authHeader,
    name: 'get_all_cards'
  });
  
  if (allCardsResponse.status === 200) {
    const allCards = allCardsResponse.json();
    console.log(`Total cards in the database: ${allCards.length}`);
    
    // Identify test cards by checking patterns
    const testCards = allCards.filter(card => 
      card.id.includes('simulated') || 
      card.id.includes('nfc-test') || 
      card.id.includes('test') ||
      card.id.match(/^simulated-card-\d+$/) ||
      card.id.match(/^nfc-test-\d+$/)
    );
    
    console.log(`Found ${testCards.length} test cards by pattern matching`);
    testCards.forEach(card => {
      allCardIds.push({ id: card.id, table: 'table_cards' });
      console.log(`-> Test card identified: ${card.id}`);
    });
  }
  
  // Also try the pattern-based search as before
  TEST_CARD_PATTERNS.forEach(pattern => {
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
    
    // Check cards backup table
    const cardsUrl = `${BASE_URL}/rest/v1/cards?id=like.${pattern}&select=id`;
    const cardsResponse = rateLimitedRequest('GET', cardsUrl, null, {
      headers: authHeader,
      name: 'get_cards'
    });
    
    if (cardsResponse.status === 200) {
      const cards = cardsResponse.json();
      console.log(`Found ${cards.length} test cards in cards matching ${pattern}`);
      cards.forEach(card => {
        // Check if this card ID is already in our list
        if (!allCardIds.some(c => c.id === card.id)) {
          allCardIds.push({ id: card.id, table: 'cards' });
          console.log(`-> Added test card: ${card.id}`);
        }
      });
    }
    
    // Sleep to avoid rate limits
    sleep(1);
  });
  
  // Also try to find cards created by the mixed-operations.js test directly by ID format
  for (let i = 1; i <= 100; i++) {
    const cardId = `simulated-card-${i}`;
    // Check if this card ID is already in our list
    if (!allCardIds.some(c => c.id === cardId)) {
      allCardIds.push({ id: cardId, table: 'table_cards' });
      console.log(`-> Added potential test card: ${cardId}`);
    }
  }
  
  console.log(`Total test cards found: ${allCardIds.length}`);
  
  if (allCardIds.length === 0) {
    console.log('No test cards found, nothing to clean up');
    return;
  }
  
  // 3. Delete all related data for each card
  processBatch(allCardIds, (cardInfo) => {
    console.log(`Cleaning up data for card: ${cardInfo.id}`);
    
    // 3.1 Delete card transactions
    const transactionsUrl = `${BASE_URL}/rest/v1/card_transactions?card_id=eq.${cardInfo.id}`;
    const deleteTransactionsResponse = rateLimitedRequest('DELETE', transactionsUrl, null, {
      headers: authHeader,
      name: 'delete_transactions'
    });
    
    console.log(`Deleted transactions for card ${cardInfo.id}: ${deleteTransactionsResponse.status}`);
    sleep(0.5);
    
    // 3.2 Delete payments
    const paymentsUrl = `${BASE_URL}/rest/v1/paiements?id_card=eq.${cardInfo.id}`;
    const deletePaymentsResponse = rateLimitedRequest('DELETE', paymentsUrl, null, {
      headers: authHeader,
      name: 'delete_payments'
    });
    
    console.log(`Deleted payments for card ${cardInfo.id}: ${deletePaymentsResponse.status}`);
    sleep(0.5);
    
    // 3.3 Delete orders
    if (cardInfo.table === 'table_cards') {
      // First get order IDs to delete their items
      const ordersUrl = `${BASE_URL}/rest/v1/bar_orders?card_id=eq.${cardInfo.id}&select=id`;
      const ordersResponse = rateLimitedRequest('GET', ordersUrl, null, {
        headers: authHeader,
        name: 'get_orders'
      });
      
      if (ordersResponse.status === 200) {
        const orders = ordersResponse.json();
        console.log(`Found ${orders.length} orders for card ${cardInfo.id}`);
        
        orders.forEach(order => {
          // Delete order items
          const orderItemsUrl = `${BASE_URL}/rest/v1/bar_order_items?order_id=eq.${order.id}`;
          const deleteItemsResponse = rateLimitedRequest('DELETE', orderItemsUrl, null, {
            headers: authHeader,
            name: 'delete_order_items'
          });
          
          console.log(`Deleted items for order ${order.id}: ${deleteItemsResponse.status}`);
          sleep(0.5);
        });
        
        // Now delete the orders
        const deleteOrdersUrl = `${BASE_URL}/rest/v1/bar_orders?card_id=eq.${cardInfo.id}`;
        const deleteOrdersResponse = rateLimitedRequest('DELETE', deleteOrdersUrl, null, {
          headers: authHeader,
          name: 'delete_orders'
        });
        
        console.log(`Deleted orders for card ${cardInfo.id}: ${deleteOrdersResponse.status}`);
      }
    } else {
      // Try backup orders table
      const ordersUrl = `${BASE_URL}/rest/v1/orders?card_id=eq.${cardInfo.id}`;
      const deleteOrdersResponse = rateLimitedRequest('DELETE', ordersUrl, null, {
        headers: authHeader,
        name: 'delete_backup_orders'
      });
      
      console.log(`Deleted backup orders for card ${cardInfo.id}: ${deleteOrdersResponse.status}`);
    }
    
    sleep(1);
    
    // 3.4 Delete the card
    const cardUrl = `${BASE_URL}/rest/v1/${cardInfo.table}?id=eq.${cardInfo.id}`;
    const deleteCardResponse = rateLimitedRequest('DELETE', cardUrl, null, {
      headers: authHeader,
      name: 'delete_card'
    });
    
    console.log(`Deleted card ${cardInfo.id} from ${cardInfo.table}: ${deleteCardResponse.status}`);
    
    // Also try to delete from the other table just to be sure
    const otherTable = cardInfo.table === 'table_cards' ? 'cards' : 'table_cards';
    const otherCardUrl = `${BASE_URL}/rest/v1/${otherTable}?id=eq.${cardInfo.id}`;
    const deleteOtherCardResponse = rateLimitedRequest('DELETE', otherCardUrl, null, {
      headers: authHeader,
      name: 'delete_other_card'
    });
    
    console.log(`Attempted to delete card ${cardInfo.id} from ${otherTable}: ${deleteOtherCardResponse.status}`);
  }, 3); // Process 3 cards at a time to be more careful
  
  console.log('Cleanup completed!');
} 