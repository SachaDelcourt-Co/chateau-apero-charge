# Phase 3 API Reference Documentation

## Overview

Phase 3 introduces enhanced logging capabilities and backend coordination for NFC operations. This document provides complete API specifications for all Phase 3 endpoints, database functions, and integration patterns.

## 📡 API Endpoints

### Enhanced Logging Endpoint

#### `POST /functions/v1/log`

Enhanced logging endpoint that supports both regular application logs and comprehensive NFC scan logging with backend coordination.

**Endpoint URL:**
```
POST https://your-project.supabase.co/functions/v1/log
```

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer <optional-jwt-token>
```

**Request Body Schema:**

```typescript
interface LogRequest {
  logs?: LogEntry[];           // Regular application logs
  nfc_scans?: NFCScanLogEntry[]; // NFC scan events
  metadata: {
    timestamp: string;         // ISO 8601 timestamp
    userAgent: string;         // Browser user agent
    route: string;            // Current application route
    appVersion: string;       // Application version
    environment: string;      // Environment (production, staging, etc.)
    userId?: string;          // Optional user identifier
  };
  batchId: string;            // Unique batch identifier
}

interface LogEntry {
  level: string;              // Log level (info, warn, error, debug)
  message: string;            // Log message
  args: any[];               // Additional arguments
  timestamp: string;          // ISO 8601 timestamp
}

interface NFCScanLogEntry {
  card_id_scanned?: string;           // Scanned card ID
  raw_data?: string;                  // Raw NFC data
  scan_status: ScanStatus;            // Scan result status
  processing_duration_ms?: number;    // Processing time
  operation_id?: string;              // Unique operation ID
  client_request_id?: string;         // Client request ID
  scan_location_context?: string;     // Where scan occurred
  device_identifier?: string;         // Device identifier
  error_message?: string;             // Error description
  error_code?: string;                // Machine-readable error code
  backend_lock_acquired?: boolean;    // Lock acquisition status
  backend_lock_duration_ms?: number;  // Lock duration
  edge_function_name?: string;        // Processing function
  edge_function_request_id?: string;  // Function request ID
  metadata?: any;                     // Additional metadata
}

type ScanStatus = 
  | 'success'           // Successful scan and processing
  | 'failure'           // Technical scan failure
  | 'duplicate'         // Duplicate scan prevented
  | 'invalid_format'    // Invalid card format
  | 'backend_rejected'  // Backend coordination rejected
  | 'processing_error'  // Business logic error
  | 'timeout';          // Operation timeout
```

**Example Request:**

```json
{
  "logs": [
    {
      "level": "info",
      "message": "User initiated bar payment",
      "args": ["cardId", "ABC12345"],
      "timestamp": "2025-06-14T14:30:15.123Z"
    }
  ],
  "nfc_scans": [
    {
      "card_id_scanned": "ABC12345",
      "scan_status": "success",
      "processing_duration_ms": 250,
      "operation_id": "nfc_op_1718374215_abc123",
      "client_request_id": "req_bar_1718374215",
      "scan_location_context": "/bar",
      "device_identifier": "Mozilla/5.0 (Android 12; Mobile)",
      "metadata": {
        "total_amount": 15.50,
        "items_count": 3,
        "payment_method": "nfc"
      }
    }
  ],
  "metadata": {
    "timestamp": "2025-06-14T14:30:15.123Z",
    "userAgent": "Mozilla/5.0 (Android 12; Mobile) Chrome/91.0",
    "route": "/bar",
    "appVersion": "1.0.0",
    "environment": "production"
  },
  "batchId": "batch_1718374215_xyz789"
}
```

**Response Schema:**

```typescript
interface LogResponse {
  status: 'success' | 'error';
  message: string;
  logs_processed: number;
  logs_inserted: number;
  nfc_scans_processed: number;
  nfc_scans_inserted: number;
  requestId: string;
  error?: string;
}
```

**Success Response:**
```json
{
  "status": "success",
  "message": "Processed 1 logs and 1 NFC scans",
  "logs_processed": 1,
  "logs_inserted": 1,
  "nfc_scans_processed": 1,
  "nfc_scans_inserted": 1,
  "requestId": "req_123abc-def456"
}
```

**Error Response:**
```json
{
  "status": "error",
  "error": "Invalid JSON format",
  "message": "Request body contains invalid JSON",
  "requestId": "req_123abc-def456"
}
```

**HTTP Status Codes:**

| Code | Description | Response Body |
|------|-------------|---------------|
| `200` | Success | LogResponse with success status |
| `400` | Bad Request | Error details (invalid JSON, missing fields) |
| `405` | Method Not Allowed | Only POST requests accepted |
| `500` | Internal Server Error | Server error details |

**Rate Limiting:**
- No explicit rate limiting implemented
- Supabase edge function limits apply
- Recommended: Batch multiple events in single request

**Integration Example:**

```typescript
// Frontend integration
async function logNFCScan(scanData: NFCScanLogEntry) {
  try {
    const response = await fetch('/functions/v1/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nfc_scans: [scanData],
        metadata: {
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          route: window.location.pathname,
          appVersion: '1.0.0',
          environment: 'production'
        },
        batchId: `nfc_batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('NFC scan logged:', result);
    return result;
  } catch (error) {
    console.error('Failed to log NFC scan:', error);
    throw error;
  }
}
```

## 🗄️ Database Functions API

### Lock Management Functions

#### `acquire_nfc_operation_lock()`

Acquires a short-lived lock for NFC operations to prevent concurrent processing.

**Function Signature:**
```sql
acquire_nfc_operation_lock(
    card_id_in TEXT,
    operation_type_in TEXT,
    client_request_id_in TEXT,
    edge_function_name_in TEXT DEFAULT NULL,
    lock_duration_seconds INTEGER DEFAULT 30
) RETURNS JSONB
```

**Parameters:**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `card_id_in` | TEXT | Yes | Card ID to lock | `"ABC12345"` |
| `operation_type_in` | TEXT | Yes | Operation type | `"bar_order"` |
| `client_request_id_in` | TEXT | Yes | Client request ID | `"req_bar_1718374215"` |
| `edge_function_name_in` | TEXT | No | Calling function name | `"process-bar-order"` |
| `lock_duration_seconds` | INTEGER | No | Lock duration (default: 30) | `30` |

**Operation Types:**
- `bar_order`: Bar payment processing
- `stripe_recharge`: Stripe payment processing
- `checkpoint_recharge`: Manual recharge processing
- `balance_check`: Balance inquiry

**Return Value:**
```json
{
  "success": true,
  "lock_acquired": true,
  "lock_id": "nfc_lock_ABC12345_bar_order_1718374215_123",
  "expires_at": "2025-06-14T14:30:45+02:00"
}
```

**Error Response:**
```json
{
  "success": false,
  "lock_acquired": false,
  "error": "Operation already in progress",
  "existing_lock_id": "nfc_lock_ABC12345_bar_order_1718374214_456",
  "existing_lock_expires_at": "2025-06-14T14:30:44+02:00"
}
```

**Usage Example:**
```sql
-- Acquire lock for bar order
SELECT acquire_nfc_operation_lock(
    'ABC12345',
    'bar_order',
    'req_bar_1718374215',
    'process-bar-order',
    30
);
```

#### `release_nfc_operation_lock()`

Releases an NFC operation lock.

**Function Signature:**
```sql
release_nfc_operation_lock(
    lock_id_in TEXT
) RETURNS JSONB
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lock_id_in` | TEXT | Yes | Lock ID to release |

**Return Value:**
```json
{
  "success": true,
  "lock_released": true,
  "lock_id": "nfc_lock_ABC12345_bar_order_1718374215_123"
}
```

**Usage Example:**
```sql
-- Release specific lock
SELECT release_nfc_operation_lock('nfc_lock_ABC12345_bar_order_1718374215_123');
```

#### `check_nfc_operation_lock()`

Checks if an NFC operation lock exists for a card and operation type.

**Function Signature:**
```sql
check_nfc_operation_lock(
    card_id_in TEXT,
    operation_type_in TEXT
) RETURNS JSONB
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `card_id_in` | TEXT | Yes | Card ID to check |
| `operation_type_in` | TEXT | Yes | Operation type |

**Return Value (Lock Exists):**
```json
{
  "lock_exists": true,
  "lock_id": "nfc_lock_ABC12345_bar_order_1718374215_123",
  "locked_at": "2025-06-14T14:30:15+02:00",
  "expires_at": "2025-06-14T14:30:45+02:00",
  "client_request_id": "req_bar_1718374215"
}
```

**Return Value (No Lock):**
```json
{
  "lock_exists": false
}
```

### Enhanced Stored Procedures

#### `sp_process_bar_order_with_debouncing()`

Enhanced bar order processing with comprehensive NFC debouncing and logging.

**Function Signature:**
```sql
sp_process_bar_order_with_debouncing(
    card_id_in TEXT,
    items_in JSONB,
    total_amount_in DECIMAL,
    client_request_id_in TEXT,
    point_of_sale_in INT DEFAULT 1,
    nfc_scan_log_id_in BIGINT DEFAULT NULL
) RETURNS JSONB
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `card_id_in` | TEXT | Yes | Card ID for payment |
| `items_in` | JSONB | Yes | Order items array |
| `total_amount_in` | DECIMAL | Yes | Total order amount |
| `client_request_id_in` | TEXT | Yes | Unique request ID |
| `point_of_sale_in` | INT | No | POS identifier (default: 1) |
| `nfc_scan_log_id_in` | BIGINT | No | Associated scan log ID |

**Items JSON Schema:**
```json
[
  {
    "name": "Beer",
    "unit_price": 5.50,
    "quantity": 2,
    "is_deposit": false,
    "is_return": false
  },
  {
    "name": "Cup Deposit",
    "unit_price": 2.00,
    "quantity": 2,
    "is_deposit": true,
    "is_return": false
  }
]
```

**Success Response:**
```json
{
  "success": true,
  "order_id": 1234,
  "transaction_id": "550e8400-e29b-41d4-a716-446655440000",
  "previous_balance": 25.00,
  "new_balance": 11.00,
  "processing_duration_ms": 150
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Insufficient funds: 5.00 < 14.00",
  "error_code": "INSUFFICIENT_FUNDS"
}
```

**Lock Conflict Response:**
```json
{
  "success": false,
  "error": "Operation already in progress for this card",
  "error_code": "OPERATION_IN_PROGRESS",
  "details": {
    "existing_lock_id": "nfc_lock_ABC12345_bar_order_1718374214_456",
    "existing_lock_expires_at": "2025-06-14T14:30:44+02:00"
  }
}
```

#### `sp_process_checkpoint_recharge_with_debouncing()`

Enhanced checkpoint recharge processing with NFC debouncing.

**Function Signature:**
```sql
sp_process_checkpoint_recharge_with_debouncing(
    card_id_in TEXT,
    amount_in DECIMAL,
    payment_method_in TEXT,
    staff_id_in TEXT,
    client_request_id_in TEXT,
    checkpoint_id_in TEXT,
    nfc_scan_log_id_in BIGINT DEFAULT NULL
) RETURNS JSONB
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `card_id_in` | TEXT | Yes | Card ID to recharge |
| `amount_in` | DECIMAL | Yes | Recharge amount |
| `payment_method_in` | TEXT | Yes | Payment method ("card" or "cash") |
| `staff_id_in` | TEXT | Yes | Staff member ID |
| `client_request_id_in` | TEXT | Yes | Unique request ID |
| `checkpoint_id_in` | TEXT | Yes | Checkpoint identifier |
| `nfc_scan_log_id_in` | BIGINT | No | Associated scan log ID |

**Success Response:**
```json
{
  "success": true,
  "transaction_id": "550e8400-e29b-41d4-a716-446655440001",
  "previous_balance": 5.00,
  "new_balance": 25.00,
  "processing_duration_ms": 120
}
```

#### `sp_process_stripe_recharge_with_debouncing()`

Enhanced Stripe recharge processing with NFC debouncing.

**Function Signature:**
```sql
sp_process_stripe_recharge_with_debouncing(
    card_id_in TEXT,
    amount_in DECIMAL,
    stripe_session_id_in TEXT,
    stripe_metadata_in JSONB,
    nfc_scan_log_id_in BIGINT DEFAULT NULL
) RETURNS JSONB
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `card_id_in` | TEXT | Yes | Card ID to recharge |
| `amount_in` | DECIMAL | Yes | Recharge amount |
| `stripe_session_id_in` | TEXT | Yes | Stripe session ID |
| `stripe_metadata_in` | JSONB | Yes | Stripe metadata |
| `nfc_scan_log_id_in` | BIGINT | No | Associated scan log ID |

**Success Response:**
```json
{
  "success": true,
  "transaction_id": "550e8400-e29b-41d4-a716-446655440002",
  "previous_balance": 10.00,
  "new_balance": 30.00,
  "stripe_session_id": "cs_test_1234567890",
  "processing_duration_ms": 200
}
```

### Maintenance Functions

#### `cleanup_expired_nfc_resources()`

Comprehensive cleanup of expired NFC resources.

**Function Signature:**
```sql
cleanup_expired_nfc_resources() RETURNS JSONB
```

**Return Value:**
```json
{
  "deleted_locks": 15,
  "deleted_idempotency_keys": 8,
  "deleted_scan_logs": 1250,
  "cleanup_timestamp": "2025-06-14T14:30:15+02:00"
}
```

**Usage Example:**
```sql
-- Manual cleanup
SELECT cleanup_expired_nfc_resources();

-- Automated cleanup (recommended every 5 minutes)
SELECT cron.schedule('cleanup-nfc-resources', '*/5 * * * *', 'SELECT cleanup_expired_nfc_resources();');
```

## 🔌 Integration Patterns

### Frontend NFC Hook Integration

#### Basic Integration

```typescript
import { useNfc } from '@/hooks/use-nfc';

const BarPaymentForm = () => {
  const { 
    state, 
    isScanning, 
    startScan, 
    stopScan, 
    lastScannedId,
    error 
  } = useNfc({
    onScan: async (cardId) => {
      try {
        await processBarOrder(cardId, orderItems, totalAmount);
      } catch (error) {
        console.error('Payment failed:', error);
      }
    },
    validateId: (id) => /^[A-Z0-9]{8}$/.test(id),
    getTotalAmount: () => orderTotal,
    enableBackendCoordination: true
  });

  return (
    <div>
      <button onClick={startScan} disabled={isScanning}>
        {isScanning ? 'Scanning...' : 'Start NFC Scan'}
      </button>
      {error && <div className="error">{error}</div>}
      {lastScannedId && <div>Last scanned: {lastScannedId}</div>}
    </div>
  );
};
```

#### Advanced Integration with Custom Logging

```typescript
const useAdvancedNfc = (options: UseNfcOptions) => {
  const nfcHook = useNfc({
    ...options,
    enableBackendCoordination: true
  });

  // Custom logging integration
  useEffect(() => {
    if (nfcHook.lastScannedId) {
      // Log successful scan
      logNFCScan({
        card_id_scanned: nfcHook.lastScannedId,
        scan_status: 'success',
        operation_id: nfcHook.getCurrentOperationId(),
        scan_location_context: window.location.pathname,
        metadata: {
          total_amount: options.getTotalAmount?.(),
          timestamp: new Date().toISOString()
        }
      });
    }
  }, [nfcHook.lastScannedId]);

  // Log errors
  useEffect(() => {
    if (nfcHook.error) {
      logNFCScan({
        scan_status: 'failure',
        error_message: nfcHook.error,
        operation_id: nfcHook.getCurrentOperationId(),
        scan_location_context: window.location.pathname
      });
    }
  }, [nfcHook.error]);

  return nfcHook;
};
```

### Backend Edge Function Integration

#### Enhanced Bar Order Processing

```typescript
// supabase/functions/process-bar-order/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  
  try {
    const { card_id, items, total_amount, client_request_id } = await req.json();
    
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Call enhanced stored procedure with debouncing
    const { data, error } = await supabase.rpc(
      'sp_process_bar_order_with_debouncing',
      {
        card_id_in: card_id,
        items_in: items,
        total_amount_in: total_amount,
        client_request_id_in: client_request_id,
        point_of_sale_in: 1
      }
    );
    
    if (error) {
      console.error(`[${requestId}] Database error:`, error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        requestId
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Return the stored procedure result
    return new Response(JSON.stringify({
      ...data,
      requestId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      requestId
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

### Error Handling Patterns

#### Comprehensive Error Handling

```typescript
// Error handling utility
class NFCError extends Error {
  constructor(
    message: string,
    public code: string,
    public cardId?: string,
    public operationId?: string
  ) {
    super(message);
    this.name = 'NFCError';
  }
}

// Error handling in NFC operations
const handleNFCOperation = async (
  cardId: string,
  operation: () => Promise<any>
) => {
  const operationId = `nfc_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Log operation start
    await logNFCScan({
      card_id_scanned: cardId,
      scan_status: 'success',
      operation_id: operationId,
      scan_location_context: window.location.pathname
    });
    
    // Execute operation
    const result = await operation();
    
    // Log success
    await logNFCScan({
      card_id_scanned: cardId,
      scan_status: 'success',
      operation_id: operationId,
      processing_duration_ms: Date.now() - startTime
    });
    
    return result;
    
  } catch (error) {
    // Log error
    await logNFCScan({
      card_id_scanned: cardId,
      scan_status: 'processing_error',
      operation_id: operationId,
      error_message: error.message,
      error_code: error.code || 'UNKNOWN_ERROR'
    });
    
    throw error;
  }
};
```

## 🔒 Security Considerations

### Authentication and Authorization

#### API Security
- **No Authentication Required**: The logging endpoint is designed to be publicly accessible
- **Rate Limiting**: Implement client-side batching to reduce request frequency
- **Data Validation**: All inputs are validated and sanitized
- **Error Sanitization**: Sensitive error details are not exposed to clients

#### Database Security
- **Function Security**: All stored procedures use appropriate security contexts
- **Row-Level Security**: Can be enabled for additional access control
- **Input Validation**: All parameters are validated within functions
- **SQL Injection Prevention**: Parameterized queries and proper escaping

### Data Privacy

#### Sensitive Data Handling
```typescript
// Example of data sanitization
const sanitizeNFCData = (scanData: NFCScanLogEntry): NFCScanLogEntry => {
  return {
    ...scanData,
    // Truncate user agent to prevent excessive data collection
    device_identifier: scanData.device_identifier?.substring(0, 100),
    // Remove potentially sensitive metadata
    metadata: {
      ...scanData.metadata,
      // Remove any PII that might have been included
      user_id: undefined,
      personal_info: undefined
    }
  };
};
```

#### Data Retention
- **Automatic Cleanup**: Old scan logs are automatically cleaned up after 30 days
- **Configurable Retention**: Retention periods can be adjusted based on requirements
- **Secure Deletion**: Sensitive data is properly deleted, not just marked as deleted

## 📊 Performance Considerations

### Request Optimization

#### Batching Requests
```typescript
// Batch multiple NFC scans in single request
const batchNFCLogs = (scans: NFCScanLogEntry[]) => {
  return fetch('/functions/v1/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nfc_scans: scans,
      metadata: {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        route: window.location.pathname,
        appVersion: '1.0.0',
        environment: 'production'
      },
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })
  });
};
```

#### Connection Pooling
- **Database Connections**: Supabase handles connection pooling automatically
- **Edge Function Optimization**: Functions are optimized for cold start performance
- **Caching**: Consider implementing caching for frequently accessed data

### Database Performance

#### Query Optimization
```sql
-- Efficient queries using proper indexes
EXPLAIN ANALYZE SELECT * FROM nfc_scan_log 
WHERE card_id_scanned = 'ABC12345' 
  AND scan_timestamp > NOW() - INTERVAL '1 hour'
ORDER BY scan_timestamp DESC;

-- Use composite indexes for complex queries
SELECT * FROM nfc_scan_log 
WHERE edge_function_name = 'process-bar-order'
  AND scan_status = 'success'
  AND scan_timestamp > NOW() - INTERVAL '24 hours';
```

#### Lock Performance
- **Short Lock Duration**: 30-second default prevents long-running locks
- **Automatic Cleanup**: Expired locks are automatically cleaned up
- **Efficient Lock Checking**: Optimized queries for lock status checks

## 🧪 Testing and Validation

### API Testing

#### Unit Tests
```typescript
describe('NFC Logging API', () => {
  it('should accept valid NFC scan data', async () => {
    const scanData = {
      card_id_scanned: 'ABC12345',
      scan_status: 'success' as const,
      operation_id: 'test_op_123'
    };
    
    const response = await fetch('/functions/v1/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nfc_scans: [scanData],
        metadata: {
          timestamp: new Date().toISOString(),
          userAgent: 'test-agent',
          route: '/test',
          appVersion: '1.0.0',
          environment: 'test'
        },
        batchId: 'test_batch_123'
      })
    });
    
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe('success');
    expect(result.nfc_scans_processed).toBe(1);
  });
});
```

#### Integration Tests
```typescript
describe('Database Function Integration', () => {
  it('should acquire and release NFC locks', async () => {
    // Acquire lock
    const lockResult = await supabase.rpc('acquire_nfc_operation_lock', {
      card_id_in: 'TEST123',
      operation_type_in: 'bar_order',
      client_request_id_in: 'test_req_123'
    });
    
    expect(lockResult.data.success).toBe(true);
    expect(lockResult.data.lock_acquired).toBe(true);
    
    const lockId = lockResult.data.lock_id;
    
    // Release lock
    const releaseResult = await supabase.rpc('release_nfc_operation_lock', {
      lock_id_in: lockId
    });
    
    expect(releaseResult.data.success).toBe(true);
    expect(releaseResult.data.lock_released).toBe(true);
  });
});
```

### Load Testing

#### Performance Testing
```javascript
// K6 load test for logging endpoint
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
};

export default function() {
  const payload = JSON.stringify({
    nfc_scans: [{
      card_id_scanned: `TEST${Math.floor(Math.random() * 10000)}`,
      scan_status: 'success',
      operation_id: `load_test_${Date.now()}_${Math.random()}`
    }],
    metadata: {
      timestamp: new Date().toISOString(),
      userAgent: 'k6-load-test',
      route: '/test',
      appVersion: '1.0.0',
      environment: 'test'
    },
    batchId: `load_test_batch_${Date.now()}`
  });
  
  const response = http.post('https://your-project.supabase.co/functions/v1/log', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

## 📚 Related Documentation

- **[`PHASE3_NFC_STATE_MACHINE.md`](PHASE3_NFC_STATE_MACHINE.md:1)**: Detailed NFC state machine implementation
- **[`PHASE3_DATABASE_SCHEMA.md`](PHASE3_DATABASE_SCHEMA.md:1)**: Complete database schema reference
- **[`PHASE3_MONITORING_GUIDE.md`](PHASE3_MONITORING_GUIDE.md:1)**: Operational monitoring and troubleshooting
- **[`../supabase/functions/log/index.ts`](../supabase/functions/log/index.ts:1)**: Complete logging endpoint implementation
- **[`../src/hooks/use-nfc.tsx`](../src/hooks/use-nfc.tsx:1)**: Frontend NFC hook implementation