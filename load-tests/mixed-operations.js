import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// All credentials
const credentials = new SharedArray('mixed credentials', function() {
  return [
    // Super admin
    { email: 'alex@lesaperosduchateau.be', password: 'g7YyT3KhWR84', role: 'admin' },
    
    // Bar accounts
    { email: 'bar1@lesaperosduchateau.be', password: '4Lq9svqIYQMD', role: 'bar' },
    { email: 'bar2@lesaperosduchateau.be', password: 'W7Wl5yYgtgCU', role: 'bar' },
    { email: 'bar3@lesaperosduchateau.be', password: 'aK0S7gk2NhjB', role: 'bar' },
    { email: 'bar4@lesaperosduchateau.be', password: 'JNYeKmwU4ufS', role: 'bar' },
    { email: 'bar5@lesaperosduchateau.be', password: '6dcQFVyPUkxI', role: 'bar' },
    { email: 'bar6@lesaperosduchateau.be', password: 'WMq8l8EwJQf6', role: 'bar' },
    { email: 'bar7@lesaperosduchateau.be', password: 'GC8aLpzYrARc', role: 'bar' },
    { email: 'bar8@lesaperosduchateau.be', password: 'apsvf9ITMgzc', role: 'bar' },
    { email: 'bar9@lesaperosduchateau.be', password: '2WoQtPXF90g4', role: 'bar' },
    { email: 'bar10@lesaperosduchateau.be', password: 'BXD8hHjr6K9X', role: 'bar' },
    
    // Recharge accounts
    { email: 'recharge1@lesaperosduchateau.be', password: 'R6uaMUZ1HgIS', role: 'recharge' },
    { email: 'recharge2@lesaperosduchateau.be', password: '53VxeoceKRvr', role: 'recharge' },
    { email: 'recharge3@lesaperosduchateau.be', password: 'RG0uzw5EL0xm', role: 'recharge' },
  ];
});

// Simulated card IDs
const simulatedCardIds = new SharedArray('mixed card IDs', function() {
  return Array.from({ length: 1000 }, (_, i) => `simulated-card-${i+1}`);
});

// Recharge amounts
const rechargeAmounts = [5, 10, 20, 50, 100];

// Export k6 test options - mixed high-concurrency operations
export const options = {
  scenarios: {
    mixed_operations: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 20 },  // Ramp up to 20 concurrent users
        { duration: '1m', target: 50 },   // Increase to 50 concurrent users
        { duration: '2m', target: 50 },   // Stay at 50 users
        { duration: '30s', target: 0 },   // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // 95% of requests should complete within 3s
    http_req_failed: ['rate<0.05'],     // Less than 5% of requests should fail
  },
};

// Base URL of the application
const BASE_URL = 'https://dqghjrpeoyqvkvoivfnz.supabase.co';

// Helper function to get random product items
function getRandomOrderItems(products, minItems = 1, maxItems = 5) {
  const orderItems = [];
  const numProducts = randomIntBetween(minItems, maxItems);
  
  for (let i = 0; i < numProducts; i++) {
    const randomProduct = products[randomIntBetween(0, products.length - 1)];
    const quantity = randomIntBetween(1, 3);
    
    orderItems.push({
      product_id: randomProduct.id,
      quantity: quantity,
      unit_price: randomProduct.price,
    });
  }
  
  return orderItems;
}

// Main test function
export default function() {
  // 1. Select a random user based on the scenario
  const user = credentials[randomIntBetween(0, credentials.length - 1)];
  
  // 2. Login
  const loginRes = http.post(`${BASE_URL}/auth/v1/token?grant_type=password`, JSON.stringify({
    email: user.email,
    password: user.password,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y'
    },
  });
  
  check(loginRes, {
    'logged in successfully': (resp) => resp.status === 200,
  });
  
  if (loginRes.status !== 200) {
    console.error(`Login failed for ${user.email}: ${loginRes.body}`);
    return;
  }
  
  const authToken = JSON.parse(loginRes.body).access_token;
  
  // 3. Based on the user role, perform different operations
  switch (user.role) {
    case 'bar':
      // Bar operation - get products
      const productsRes = http.get(`${BASE_URL}/rest/v1/products?select=*`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y'
        },
      });
      
      if (productsRes.status !== 200 || !JSON.parse(productsRes.body).length) {
        console.error('Failed to get products or no products found');
        return;
      }
      
      const products = JSON.parse(productsRes.body);
      
      // Create an order
      const cardId = simulatedCardIds[randomIntBetween(0, simulatedCardIds.length - 1)];
      const orderItems = getRandomOrderItems(products);
      const orderTotal = orderItems.reduce((total, item) => total + (item.unit_price * item.quantity), 0);
      
      const orderRes = http.post(`${BASE_URL}/rest/v1/orders`, JSON.stringify({
        card_id: cardId,
        status: 'completed',
        total_amount: orderTotal,
        items: orderItems,
        created_by: user.email
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y'
        },
      });
      
      check(orderRes, {
        'bar order created successfully': (resp) => resp.status === 201,
      });
      
      break;
      
    case 'recharge':
      // Recharge operation
      const rechargeCardId = simulatedCardIds[randomIntBetween(0, simulatedCardIds.length - 1)];
      const rechargeAmount = rechargeAmounts[randomIntBetween(0, rechargeAmounts.length - 1)];
      
      // Create transaction record
      const transactionRes = http.post(`${BASE_URL}/rest/v1/transactions`, JSON.stringify({
        card_id: rechargeCardId,
        amount: rechargeAmount,
        type: 'recharge',
        created_by: user.email,
        payment_method: randomIntBetween(0, 1) === 0 ? 'cash' : 'card',
        status: 'completed'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y'
        },
      });
      
      check(transactionRes, {
        'recharge transaction created successfully': (resp) => resp.status === 201,
      });
      
      // Update card balance
      http.patch(`${BASE_URL}/rest/v1/cards?id=eq.${rechargeCardId}`, JSON.stringify({
        balance: rechargeAmount,
        last_updated: new Date().toISOString()
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y'
        },
      });
      
      break;
      
    case 'admin':
      // Admin operations - mix of read operations
      // Pull reports, check system metrics, etc.
      
      // 1. Get all transactions in the last hour
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      http.get(`${BASE_URL}/rest/v1/transactions?created_at=gte.${hourAgo}&select=*&order=created_at.desc&limit=100`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y'
        },
      });
      
      // 2. Get recent orders
      http.get(`${BASE_URL}/rest/v1/orders?created_at=gte.${hourAgo}&select=*&order=created_at.desc&limit=100`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y'
        },
      });
      
      // 3. Get all products
      http.get(`${BASE_URL}/rest/v1/products?select=*`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y'
        },
      });
      
      break;
  }
  
  // Randomize sleep times to create more realistic load patterns
  sleep(randomIntBetween(0.5, 3));
} 