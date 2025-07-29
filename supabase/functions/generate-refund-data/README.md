# Generate Refund Data Edge Function

## Overview

The `generate-refund-data` Supabase Edge Function is designed to retrieve and validate refund data from the database with comprehensive error handling and data integrity checks. This function addresses the data integrity issues identified in the schema analysis and provides a robust solution for refund processing.

## Key Features

- **Comprehensive Data Retrieval**: Retrieves all pending refunds from the `refunds` table
- **Cross-Reference Validation**: Cross-references with `table_cards` to get accurate card balances
- **Smart Card Matching**: Handles missing `matched_card` values by attempting to match via `id_card`
- **Data Integrity Checks**: Validates card existence and data integrity
- **Structured Response**: Returns structured data suitable for XML generation
- **Security Measures**: Implements proper authentication for financial data processing
- **Comprehensive Logging**: Detailed logging for debugging and monitoring purposes
- **Error Categorization**: Categorizes errors for better handling and user experience

## Database Schema Requirements

### Refunds Table (`refunds`)
```sql
- id: number (primary key)
- created_at: timestamp
- "first name": string (note: column name has spaces)
- "last name": string (note: column name has spaces)
- account: string
- email: string
- id_card: string
- card_balance: number (nullable)
- matched_card: string (nullable)
- amount_recharged: number
```

### Cards Table (`table_cards`)
```sql
- id: string (primary key)
- amount: number
- created_at: timestamp
- updated_at: timestamp
```

## API Specification

### Endpoint
```
GET/POST /functions/v1/generate-refund-data
```

### Authentication
Requires either:
- `Authorization` header with Bearer token
- `apikey` header with valid API key

### Request Headers
```
Authorization: Bearer <token>
# OR
apikey: <api-key>
Content-Type: application/json
```

### Response Format

#### Success Response
```json
{
  "success": true,
  "data": {
    "valid_refunds": [
      {
        "id": 1,
        "created_at": "2025-01-01T10:00:00Z",
        "first_name": "John",
        "last_name": "Doe",
        "account": "ACC001",
        "email": "john.doe@example.com",
        "id_card": "CARD001",
        "card_balance": 50.00,
        "matched_card": "CARD001",
        "amount_recharged": 25.00,
        "card_exists": true,
        "validation_status": "valid",
        "validation_notes": []
      }
    ],
    "validation_errors": [
      {
        "refund_id": 2,
        "error_type": "missing_card",
        "error_message": "No card found for id_card: CARD002",
        "refund_data": { /* partial refund data */ }
      }
    ],
    "summary": {
      "total_refunds": 10,
      "valid_refunds": 8,
      "error_count": 2,
      "total_amount": 250.00,
      "processing_time_ms": 150
    }
  },
  "request_id": "uuid-request-id"
}
```

#### Error Response
```json
{
  "success": false,
  "error": "Error description",
  "error_code": "ERROR_CODE",
  "details": "Additional error details",
  "request_id": "uuid-request-id"
}
```

## Validation Logic

### Data Integrity Checks

1. **Required Fields Validation**
   - Validates presence of `first name`, `last name`, `email`
   - Ensures `id_card` is not empty
   - Validates `amount_recharged` is a positive number

2. **Card Matching Logic**
   - If `matched_card` exists, validates against `table_cards`
   - If `matched_card` is missing, attempts to match using `id_card`
   - Updates card balance from `table_cards` if different or null

3. **Business Logic Validation**
   - Checks if card balance is sufficient for refund amount
   - Validates email format contains '@' symbol
   - Ensures amount_recharged is positive

### Validation Status Levels

- **`valid`**: All validations passed
- **`warning`**: Minor issues (e.g., card matched via id_card, balance updated)
- **`error`**: Critical issues preventing processing

### Error Types

- **`missing_card`**: Card not found in database
- **`invalid_data`**: Required fields missing or invalid format
- **`balance_mismatch`**: Card balance inconsistencies
- **`data_integrity`**: General data integrity issues

## Security Features

1. **Authentication Required**: Function requires valid authorization header or API key
2. **Request Logging**: All requests are logged with unique request IDs
3. **Error Sanitization**: Sensitive data is not exposed in error messages
4. **CORS Configuration**: Proper CORS headers for web application integration

## Error Handling

### Error Codes

- `INVALID_REQUEST`: Invalid request method or missing parameters
- `DATABASE_ERROR`: Database connection or query errors
- `VALIDATION_ERROR`: Data validation failures
- `SERVER_ERROR`: Unexpected server errors
- `UNAUTHORIZED`: Missing or invalid authentication

### Logging

All operations are logged with:
- Unique request ID for traceability
- Processing timestamps
- Validation results
- Error details
- Performance metrics

## Usage Examples

### Basic Request (GET)
```bash
curl -X GET \
  'https://your-project.supabase.co/functions/v1/generate-refund-data' \
  -H 'Authorization: Bearer your-token' \
  -H 'apikey: your-api-key'
```

### Basic Request (POST)
```bash
curl -X POST \
  'https://your-project.supabase.co/functions/v1/generate-refund-data' \
  -H 'Authorization: Bearer your-token' \
  -H 'apikey: your-api-key' \
  -H 'Content-Type: application/json'
```

## Performance Considerations

- **Efficient Queries**: Uses single queries to retrieve all data
- **In-Memory Processing**: Card matching uses Map for O(1) lookups
- **Processing Time Tracking**: Monitors and reports processing time
- **Batch Processing**: Processes all refunds in a single operation

## Integration Notes

### XML Generation Integration
The function returns structured data specifically designed for XML generation:
- Normalized field names (removes spaces from column names)
- Complete validation status for each record
- Categorized errors for different handling strategies
- Summary statistics for reporting

### Monitoring Integration
- Request IDs for distributed tracing
- Performance metrics for monitoring
- Error categorization for alerting
- Comprehensive logging for debugging

## Testing

The function includes comprehensive tests covering:
- Response structure validation
- Data validation logic
- Card matching algorithms
- Error handling scenarios
- Security measures
- Performance considerations
- CORS configuration

Run tests with:
```bash
deno test supabase/functions/__tests__/generate-refund-data.test.ts
```

## Deployment

Deploy the function using Supabase CLI:
```bash
supabase functions deploy generate-refund-data
```

## Environment Variables

Required environment variables:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify Authorization header or apikey is provided
   - Check token/key validity and permissions

2. **Database Connection Issues**
   - Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   - Check database connectivity

3. **Validation Errors**
   - Review refund data for missing required fields
   - Ensure card data exists in table_cards

4. **Performance Issues**
   - Monitor processing time in response
   - Check database query performance
   - Consider data volume and indexing

### Debug Mode

Enable detailed logging by checking the function logs in Supabase Dashboard under Functions > generate-refund-data > Logs.

## Version History

- **v1.0.0**: Initial implementation with comprehensive validation and error handling