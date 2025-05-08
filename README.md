# Les Apéros du Château - Cashless Payment System

A comprehensive web application for managing a cashless payment system for "Les Apéros du Château" events. This system allows for managing prepaid cards, processing bar orders, recharging card balances, and handling refund requests.

## 🍸 Project Overview

This application provides a complete solution for managing cashless payments at events, with features designed for both customers and staff:

### Key Features

- **Card Management**: Check balance with unique 8-character card IDs
- **Payment & Recharge**: Multiple ways to add funds to cards (Stripe, cash, card)
- **Bar Order System**: Optimized interface for bartenders to quickly process orders
- **NFC Integration**: Automatic NFC card scanning for quick payment processing
- **Refund System**: Process refund requests with proper tracking
- **Admin Dashboard**: System statistics, transaction data, and management tools
- **Role-based Access**: Different interfaces for admin, bar staff, and recharge staff

## 🛠️ Technology Stack

- **Frontend**: React with TypeScript, using Vite as the build tool
- **UI Components**: Shadcn UI (built on Radix UI) with Tailwind CSS
- **Routing**: React Router for navigation
- **State Management**: React Hooks and Context API
- **Backend**: Supabase for database, authentication, and serverless functions
- **Payment Processing**: Stripe integration
- **Card Integration**: Web NFC API for contactless card reading

## 🚀 Getting Started

### Prerequisites

- Node.js & npm - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
- Supabase account (for database and authentication)
- Stripe account (for payment processing)
- For NFC functionality: 
  - Android device with Chrome browser (version 89+)
  - NFC-enabled hardware
  - NFC cards with 8-character IDs

### Installation

```bash
# Clone the repository
git clone git@github.com:SachaDelcourt-Co/chateau-apero-charge.git

# Navigate to the project directory
cd chateau-apero-charge

# Install dependencies
npm install

# Start the development server
npm run dev
```

## 🏗️ Project Structure
## 🏗️ Project Structure

```
├── src/                     # Source code
│   ├── api/                # API integrations
│   ├── assets/             # Static assets
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   │   └── use-nfc.tsx     # NFC card scanning hook
│   ├── lib/                # Utility functions and helpers
│   ├── pages/              # Application pages
│   └── integrations/       # Third-party integrations
├── supabase/               # Supabase configuration and edge functions
│   ├── functions/          # Serverless edge functions
│   │   ├── create-checkout-session/  # Stripe checkout creation
│   │   └── stripe-webhook/           # Stripe webhook handler
└── public/                 # Public assets
```


## 🔄 User Flows

### Customer Flow
1. Enter card ID on the home page
2. View current balance
3. Recharge card via Stripe payment
4. Request a refund through the form

### Bar Staff Flow
1. Log in with bar role credentials
2. Access the bar order system
3. Select products for a customer's order
4. Simply hold customer's NFC card near the phone to process payment
   (or manually enter the card ID)

### Recharge Staff Flow
1. Log in with recharge role credentials
2. Access the recharge page
3. Enter card ID and amount to add
4. Record payment method (card/cash)

### Admin Flow
1. Log in with admin credentials
2. Access all features (bar, recharge, dashboard)
3. View system statistics and monitor card balances
4. Manage user accounts

## 📱 NFC Features

The application uses the Web NFC API to scan NFC cards for payment:

- **Always-on Scanning**: The Bar page continuously scans for NFC cards
- **Auto-Payment Processing**: When a card is detected, payment is processed automatically
- **Compatibility**: Works on Android devices with Chrome 89+ and NFC hardware
- **Development Tools**: Debug mode available in development environment

## 📊 Database Structure

The application uses Supabase with the following main tables:

- **table_cards**: Card information including ID and balance
- **bar_products**: Products available for purchase
- **bar_orders**: Completed orders with total amount
- **bar_order_items**: Individual items in each order
- **paiements**: Transaction history for card recharges
- **refunds**: Refund requests with user details
- **profiles**: User profiles with role information

## 🔒 Authentication & Authorization

The system implements role-based access control with different user types:
- **Admin**: Full access to all features
- **Bar**: Access to the bar ordering system
- **Recharge**: Access to manual card recharge functionality

## 📝 Testing Rate Limit Handling

The application includes comprehensive rate limit handling with exponential backoff for all API operations. This ensures that the application can gracefully handle rate limits imposed by the Supabase API.

### How to test rate limit handling

1. Install dependencies:
   ```
   npm install
   ```

2. Run the tests:
   ```
   npm test
   ```

### Implementation of rate limit tests

The application properly handles rate limit errors (HTTP 429) with exponential backoff retry logic. Our tests verify that:

1. When rate limit errors occur, the application retries the operation with increasing delays
2. After successful retry, the operation completes as expected
3. If maximum retries are exceeded, the application shows an appropriate error message

Here's how we've implemented reliable testing for rate limits:

```typescript
// Example test for handling rate limit errors with exponential backoff
it('should handle rate limit errors with exponential backoff', async () => {
  // Mock the API function to simulate rate limit errors
  let callCount = 0;
  vi.mocked(apiFunction).mockImplementation(async () => {
    callCount++;
    if (callCount <= 2) {
      // Fail with rate limit for first 2 calls
      return Promise.reject({ status: 429, message: 'Too many requests' });
    } else {
      // Succeed on third call
      return Promise.resolve({ success: true });
    }
  });

  // Perform the operation that will trigger the API call
  await performOperation();

  // Verify first call was made
  expect(apiFunction).toHaveBeenCalledTimes(1);

  // Advance timer to trigger first retry
  await vi.advanceTimersByTime(1100); // Just past 1000ms backoff

  // Verify second call was made
  expect(apiFunction).toHaveBeenCalledTimes(2);

  // Advance timer to trigger second retry
  await vi.advanceTimersByTime(2100); // Just past 2000ms backoff

  // Verify third call was made and succeeded
  expect(apiFunction).toHaveBeenCalledTimes(3);
  
  // Verify success message or state
  expect(successIndicator).toBeTruthy();
});
```

### Key testing techniques

1. **Fake timers**: Use `vi.useFakeTimers()` to control time advancement in tests
2. **Controlled API mocks**: Implement mocks that return different responses based on call count
3. **Timer advancement**: Use `vi.advanceTimersByTime()` to trigger retry logic
4. **Assertion at each step**: Verify the correct behavior after each timer advancement

### Areas with rate limit handling

The following operations include rate limit handling with exponential backoff:

- **Bar payment processing**: When creating bar orders during high traffic
- **Card topup operations**: When recharging cards from the admin interface
- **Stripe webhook handling**: When processing Stripe events
- **Product operations**: When creating or updating multiple products

### Common issues and fixes

If you encounter issues when testing rate limit handling:

1. **Timer advancement**: Make sure to use `vi.advanceTimersByTime()` with enough time to trigger the retry logic
2. **Mock implementation**: Your mocks should track call counts properly
3. **Component rendering**: Use `act()` when updating component state in tests
4. **Browser APIs**: Mock browser APIs that aren't available in the test environment

### Testing in real environments

For manual testing:

1. **Concurrent requests**: Open multiple browser tabs and perform the same operation simultaneously
2. **Network throttling**: Use browser dev tools to simulate slow network connections
3. **Supabase limits**: Be aware of actual Supabase rate limits in production environments

## 🤝 Contributing

Please read our contribution guidelines before submitting pull requests.

## 📝 License

[License information]

## 🔗 Additional Resources

- [Supabase Documentation](https://supabase.io/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [React Documentation](https://reactjs.org/docs)
