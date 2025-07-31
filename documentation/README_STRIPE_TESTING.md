# 🔑 Stripe Key Management & Testing Guide

## 📍 **Current Stripe Keys Location**

All Stripe keys are now stored as **Supabase environment variables** (secrets), not in frontend code:

```bash
# View current keys
supabase secrets list | grep STRIPE
```

**Current Environment Variables:**
- `STRIPE_SECRET_KEY` - Original secret key 
- `STRIPE_SECRET_KEY_FINAL` - Production/Live secret key
- `STRIPE_SECRET_KEY_TEST` - Test mode secret key
- `STRIPE_TEST_MODE` - Flag to enable test mode (`true`/`false`)
- `STRIPE_WEBHOOK_SECRET` - Webhook endpoint secret

## 🔄 **How to Switch Between Test & Live Modes**

### **Option 1: Toggle Test Mode Flag**

**Enable Test Mode:**
```bash
supabase secrets set STRIPE_TEST_MODE=true
```

**Enable Live Mode:**
```bash
supabase secrets set STRIPE_TEST_MODE=false
```

### **Option 2: Update Test Key**

First, update your test key with your actual Stripe test key:
```bash
supabase secrets set STRIPE_SECRET_KEY_TEST=sk_test_YOUR_ACTUAL_TEST_KEY_HERE
```

## 🏗️ **Current Architecture**

### **Backend (Edge Functions):**
- **`create-stripe-checkout`**: Creates checkout sessions
- **`stripe-webhook`**: Processes payment results  

Both functions automatically choose the correct key based on `STRIPE_TEST_MODE`:
- `true` → Uses `STRIPE_SECRET_KEY_TEST`
- `false` → Uses `STRIPE_SECRET_KEY_FINAL`

### **Frontend:**
- **No direct Stripe keys** (removed from `src/api/stripe.ts`)
- All Stripe operations go through edge functions
- Frontend is **environment-agnostic**

## 🧪 **Testing Workflow**

### **Step 1: Set Test Mode**
```bash
# Enable test mode
supabase secrets set STRIPE_TEST_MODE=true

# Set your actual test key (replace with real key)
supabase secrets set STRIPE_SECRET_KEY_TEST=sk_test_51ABC123...

# Deploy functions to apply changes
supabase functions deploy create-stripe-checkout --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

### **Step 2: Test Payments**
- Use test card numbers (e.g., `4242424242424242`)
- Payments will process in Stripe test mode
- Check logs: Should show `"Using TEST mode"`

### **Step 3: Switch to Live Mode**
```bash
# Disable test mode
supabase secrets set STRIPE_TEST_MODE=false

# Deploy functions
supabase functions deploy create-stripe-checkout --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

## 🔍 **Debugging & Monitoring**

### **Check Current Mode:**
Look at function logs in Supabase Dashboard:
- `[create-stripe-checkout] Using TEST mode`
- `[stripe-webhook] Initialized in TEST mode`

### **View Logs:**
```bash
# Follow function logs
supabase functions logs create-stripe-checkout --follow
supabase functions logs stripe-webhook --follow
```

### **Test Connectivity:**
```bash
# Test the checkout function
curl -X POST https://dqghjrpeoyqvkvoivfnz.supabase.co/functions/v1/create-stripe-checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"card_id":"test123","amount":10,"client_request_id":"test"}'
```

## ⚠️ **Important Notes**

1. **Environment Variables are encrypted** in Supabase - you can't view the actual values
2. **Functions need to be redeployed** after changing environment variables  
3. **Test webhook URLs** need to be configured in your Stripe dashboard for test mode
4. **Frontend code doesn't change** - it's the same for both test and live modes
5. **Always verify mode in logs** before testing payments

## 🚀 **Quick Commands Reference**

```bash
# Enable test mode
supabase secrets set STRIPE_TEST_MODE=true && \
supabase functions deploy create-stripe-checkout --no-verify-jwt && \
supabase functions deploy stripe-webhook --no-verify-jwt

# Enable live mode  
supabase secrets set STRIPE_TEST_MODE=false && \
supabase functions deploy create-stripe-checkout --no-verify-jwt && \
supabase functions deploy stripe-webhook --no-verify-jwt

# View all Stripe environment variables
supabase secrets list | grep STRIPE
```

## 📝 **Benefits of This Approach**

✅ **Centralized key management** - All keys in one secure location  
✅ **Environment-agnostic frontend** - Same code works in test and live  
✅ **Secure** - No keys exposed in browser or frontend code  
✅ **Easy switching** - Single flag to toggle between modes  
✅ **Consistent architecture** - Same pattern as other functions  
✅ **No CORS issues** - All requests go through edge functions  
``` 