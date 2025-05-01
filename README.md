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
git clone [repository-url]

# Navigate to the project directory
cd chateau-apero-charge

# Install dependencies
npm install

# Start the development server
npm run dev
```

## 🏗️ Project Structure
├── src/ # Source code
│ ├── api/ # API integrations
│ ├── assets/ # Static assets
│ ├── components/ # Reusable UI components
│ ├── hooks/ # Custom React hooks
│ │   └── use-nfc.tsx # NFC card scanning hook
│ ├── lib/ # Utility functions and helpers
│ ├── pages/ # Application pages
│ └── integrations/ # Third-party integrations
├── supabase/ # Supabase configuration and edge functions
│ ├── functions/ # Serverless edge functions
│ │ ├── create-checkout-session/ # Stripe checkout creation
│ │ └── stripe-webhook/ # Stripe webhook handler
└── public/ # Public assets


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

## 🤝 Contributing

Please read our contribution guidelines before submitting pull requests.

## 📝 License

[License information]

## 🔗 Additional Resources

- [Supabase Documentation](https://supabase.io/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [React Documentation](https://reactjs.org/docs)