#!/bin/bash

# Configuration
API_URL="https://dqghjrpeoyqvkvoivfnz.supabase.co"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZ2hqcnBlb3lxdmt2b2l2Zm56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwMjE5MDgsImV4cCI6MjA1OTU5NzkwOH0.zzvFJVZ_b4zFe54eTY2iuE0ce-AkhdjjLWewSDoFu-Y"
ADMIN_EMAIL="alex@lesaperosduchateau.be"
ADMIN_PASSWORD="g7YyT3KhWR84"

# Step 1: Log in and get auth token
echo "Logging in as admin..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

AUTH_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | sed 's/"access_token":"//')

if [ -z "$AUTH_TOKEN" ]; then
  echo "Failed to log in. Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "Login successful!"

# Step 2: Get all cards
echo "Getting all cards..."
CARDS_RESPONSE=$(curl -s -X GET "$API_URL/rest/v1/table_cards?select=id" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $AUTH_TOKEN")

# Step 3: Extract simulated cards
echo "Identifying test cards..."
TEST_CARDS=$(echo $CARDS_RESPONSE | grep -o '"id":"[^"]*' | sed 's/"id":"//' | grep -E 'simulated|test|nfc')

# Count test cards
TEST_CARD_COUNT=$(echo "$TEST_CARDS" | wc -l)
echo "Found $TEST_CARD_COUNT test cards"

# Step 4: Delete each test card and its related data
echo "Starting cleanup..."
for CARD_ID in $TEST_CARDS; do
  echo "Cleaning up card: $CARD_ID"
  
  # Delete transactions
  echo "  Deleting transactions..."
  curl -s -X DELETE "$API_URL/rest/v1/card_transactions?card_id=eq.$CARD_ID" \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_TOKEN" > /dev/null
  
  # Delete payments
  echo "  Deleting payments..."
  curl -s -X DELETE "$API_URL/rest/v1/paiements?id_card=eq.$CARD_ID" \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_TOKEN" > /dev/null
  
  # Get orders
  echo "  Finding and deleting orders..."
  ORDERS_RESPONSE=$(curl -s -X GET "$API_URL/rest/v1/bar_orders?card_id=eq.$CARD_ID&select=id" \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_TOKEN")
  
  # Extract order IDs
  ORDER_IDS=$(echo $ORDERS_RESPONSE | grep -o '"id":"[^"]*' | sed 's/"id":"//')
  
  # Delete order items and orders
  for ORDER_ID in $ORDER_IDS; do
    echo "    Deleting items for order: $ORDER_ID"
    curl -s -X DELETE "$API_URL/rest/v1/bar_order_items?order_id=eq.$ORDER_ID" \
      -H "apikey: $API_KEY" \
      -H "Authorization: Bearer $AUTH_TOKEN" > /dev/null
  done
  
  # Delete the orders
  if [ -n "$ORDER_IDS" ]; then
    echo "    Deleting orders..."
    curl -s -X DELETE "$API_URL/rest/v1/bar_orders?card_id=eq.$CARD_ID" \
      -H "apikey: $API_KEY" \
      -H "Authorization: Bearer $AUTH_TOKEN" > /dev/null
  fi
  
  # Delete the card
  echo "  Deleting card..."
  curl -s -X DELETE "$API_URL/rest/v1/table_cards?id=eq.$CARD_ID" \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_TOKEN" > /dev/null
  
  # Try backup table
  curl -s -X DELETE "$API_URL/rest/v1/cards?id=eq.$CARD_ID" \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $AUTH_TOKEN" > /dev/null
    
  echo "  Card $CARD_ID cleanup complete"
  # Add delay to avoid rate limits
  sleep 1
done

echo "Cleanup completed!" 