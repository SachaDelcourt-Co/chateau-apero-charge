# Checkpoint Recharge Edge Function Implementation

## Overview

The `process-checkpoint-recharge` edge function has been successfully implemented as part of Phase 2 of the comprehensive cashless festival payment system. This function enables staff members to perform card recharges at various checkpoints throughout the festival venue.

## Key Features

### 🔒 **Atomic Operations**
- Single call to `sp_process_checkpoint_recharge` stored procedure
- Database-level locking prevents race conditions
- All-or-nothing transaction processing

### 🛡️ **Idempotency Protection**
- Mandatory `client_request_id` parameter prevents duplicate processing
- Automatic detection and handling of duplicate requests
- Returns existing result for already-processed requests

### 👥 **Staff Authentication & Logging**
- Validates `staff_id` parameter for all operations
- Comprehensive audit trail for staff-performed recharges
- Checkpoint location tracking for operational insights

### 💳 **Payment Method Support**
- **Cash payments**: Direct cash-to-card recharges
- **Card payments**: Card-to-card transfers or POS integration
- Proper recording of payment method for reconciliation

### 🔍 **Comprehensive Error Handling**
- Categorized error responses with appropriate HTTP status codes
- User-friendly error messages for different scenarios
- Detailed logging for debugging and monitoring

## Function Interface

### Request Format
```typescript
interface CheckpointRechargeRequest {
  card_id: string;              // Target card ID for recharge
  amount: number;               // Recharge amount (positive, max €1000)
  payment_method: 'cash' | 'card'; // Payment method
  staff_id: string;             // Staff member performing operation
  client_request_id: string;    // Unique request ID for idempotency
  checkpoint_id?: string;       // Optional checkpoint identifier
}
```

### Response Format
```typescript
interface CheckpointRechargeResponse {
  success: boolean;
  transaction_id?: string;      // Unique transaction identifier
  previous_balance?: number;    // Card balance before recharge
  new_balance?: number;         // Card balance after recharge
  recharge_amount?: number;     // Amount recharged
  payment_method?: string;      // Payment method used
  staff_id?: string;           // Staff member who performed operation
  checkpoint_id?: string;      // Checkpoint where operation occurred
  error?: string;              // Error message if failed
  error_code?: string;         // Categorized error code
  request_id?: string;         // Request tracing ID
  processing_time_ms?: number; // Processing time in milliseconds
}
```

## Error Handling

### Error Categories
- **`INVALID_REQUEST`** (400): Invalid input parameters
- **`CARD_NOT_FOUND`** (404): Card ID not found in system
- **`STAFF_NOT_FOUND`** (404): Staff ID not found or invalid
- **`INVALID_PAYMENT_METHOD`** (400): Payment method not 'cash' or 'card'
- **`DUPLICATE_REQUEST`** (409): Request already processed
- **`DATABASE_ERROR`** (400): General database operation error
- **`SERVER_ERROR`** (500): Unexpected server error

### Input Validation
- **Card ID**: Required, non-empty string
- **Amount**: Required, positive number, maximum €1000
- **Payment Method**: Required, must be 'cash' or 'card'
- **Staff ID**: Required, non-empty string
- **Client Request ID**: Required, non-empty string for idempotency
- **Checkpoint ID**: Optional, non-empty string if provided

## Database Integration

### Stored Procedure: `sp_process_checkpoint_recharge`
```sql
sp_process_checkpoint_recharge(
    card_id_in TEXT,
    amount_in DECIMAL,
    payment_method_in TEXT,
    staff_id_in TEXT,
    client_request_id_in TEXT,
    checkpoint_id_in TEXT
) RETURNS JSONB
```

### Database Operations
1. **Idempotency Check**: Verifies if request already processed
2. **Card Locking**: Locks card record to prevent race conditions
3. **Balance Update**: Atomically increases card balance
4. **Recharge Recording**: Creates record in `recharges` table
5. **Transaction Logging**: Logs operation in `app_transaction_log`
6. **Audit Trail**: Records staff and checkpoint information

## Security Considerations

### Input Validation
- All parameters validated before processing
- Amount limits enforced (positive, max €1000)
- Payment method restricted to allowed values
- Staff ID validation (basic validation, full auth via Supabase RLS)

### Data Protection
- No sensitive information exposed in error messages
- Comprehensive logging for audit purposes
- Proper error categorization without system details

## Usage Examples

### Cash Recharge
```bash
curl -X POST https://your-project.supabase.co/functions/v1/process-checkpoint-recharge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "card_id": "CARD123456",
    "amount": 50.00,
    "payment_method": "cash",
    "staff_id": "STAFF001",
    "client_request_id": "checkpoint-recharge-' + Date.now() + '",
    "checkpoint_id": "entrance-gate-1"
  }'
```

### Card Recharge
```bash
curl -X POST https://your-project.supabase.co/functions/v1/process-checkpoint-recharge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "card_id": "CARD123456",
    "amount": 25.00,
    "payment_method": "card",
    "staff_id": "STAFF002",
    "client_request_id": "checkpoint-recharge-' + Date.now() + '",
    "checkpoint_id": "bar-station-3"
  }'
```

## Logging and Monitoring

### Request Tracing
- Unique request ID generated for each operation
- Comprehensive logging at all stages
- Processing time measurement
- Detailed error logging with stack traces

### Audit Trail
- All operations logged in `app_transaction_log` table
- Staff member identification for accountability
- Checkpoint location tracking
- Payment method recording for reconciliation

## Integration with Phase 2 Architecture

### Atomic Operations
- Follows same pattern as `process-bar-order` function
- Uses atomic stored procedures for all database operations
- Prevents race conditions through database-level locking

### Idempotency Protection
- Implements same idempotency pattern as other Phase 2 functions
- Uses `idempotency_keys` table for duplicate detection
- Automatic cleanup of expired idempotency keys

### Error Handling Standards
- Consistent error categorization across all functions
- Standardized HTTP status codes
- User-friendly error messages

## Testing

### Test Coverage
- Input validation for all parameters
- Payment method validation (cash/card)
- Staff ID validation and error handling
- Idempotency protection verification
- Error scenario testing
- Stored procedure integration testing

### Test Structure
```typescript
// Test cases include:
- Invalid input parameters
- Missing required fields
- Payment method validation
- Staff authentication
- Duplicate request handling
- Database error scenarios
- Stored procedure integration
```

## Deployment

### Prerequisites
- Phase 2 foundation migration must be applied
- `sp_process_checkpoint_recharge` stored procedure must exist
- Required environment variables configured

### Environment Variables
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database operations

### Deployment Command
```bash
supabase functions deploy process-checkpoint-recharge
```

## Phase 2 Completion

This checkpoint recharge function completes Phase 2 of the comprehensive implementation plan by providing:

1. ✅ **Atomic Operations**: All database operations are atomic via stored procedures
2. ✅ **Idempotency Protection**: Mandatory client_request_id prevents duplicates
3. ✅ **Staff Operations**: Full support for staff-performed recharges
4. ✅ **Payment Methods**: Support for both cash and card payments
5. ✅ **Comprehensive Logging**: Detailed audit trail and monitoring
6. ✅ **Error Handling**: Robust error categorization and user-friendly messages
7. ✅ **Race Condition Prevention**: Database-level locking eliminates race conditions

The system now provides complete transaction safety and operational robustness for all core payment operations: bar orders, Stripe recharges, and checkpoint recharges.