# Process Refunds API Endpoint

## Overview

The Process Refunds API endpoint is the main orchestrator for the refund system that integrates the database function and XML generation service to create downloadable CBC-compatible XML files for bank transfers.

## Features

- **Complete Refund Processing**: Orchestrates the entire refund workflow from data retrieval to XML generation
- **CBC Bank Integration**: Generates pain.001.001.03 format XML files compatible with CBC bank systems
- **Comprehensive Validation**: Validates refund data, debtor configuration, and IBAN formats
- **Flexible Processing Options**: Supports dry run mode, batch limits, and warning filtering
- **Security**: Admin authentication required with comprehensive input validation
- **Error Handling**: Detailed error responses with proper HTTP status codes
- **Audit Trail**: Complete logging for debugging and compliance
- **Performance**: Optimized for processing large batches of refunds

## API Specification

### Endpoint
```
POST /functions/v1/process-refunds
```

### Authentication
- **Required**: Admin access only
- **Methods**: Bearer token in `Authorization` header or API key in `apikey` header
- **Headers**:
  ```
  Authorization: Bearer <token>
  # OR
  apikey: <api-key>
  ```

### Request Format

#### Content-Type
```
Content-Type: application/json
```

#### Request Body Schema
```typescript
interface ProcessRefundsRequest {
  debtor_config: {
    name: string;                    // Debtor company name
    iban: string;                    // Debtor IBAN (Belgian format)
    bic?: string;                    // Bank BIC (defaults to CBC: GKCCBEBB)
    address_line1?: string;          // Address line 1
    address_line2?: string;          // Address line 2
    country: string;                 // Country code (e.g., "BE")
    organization_id?: string;        // Organization ID (e.g., KBO number)
    organization_issuer?: string;    // ID issuer (defaults to "KBO-BCE")
  };
  xml_options?: {
    message_id_prefix?: string;      // Message ID prefix (default: "CBC")
    payment_info_id_prefix?: string; // Payment info ID prefix (default: "PMT")
    instruction_priority?: 'NORM' | 'HIGH'; // Priority (default: "NORM")
    service_level?: 'SEPA' | 'PRPT'; // Service level (default: "SEPA")
    category_purpose?: 'SUPP' | 'SALA' | 'INTC' | 'TREA' | 'TAXS'; // Purpose (default: "SUPP")
    charge_bearer?: 'SLEV' | 'SHAR'; // Charge bearer (default: "SLEV")
    batch_booking?: boolean;         // Batch booking (default: true)
    requested_execution_date?: string; // Execution date (YYYY-MM-DD, default: tomorrow)
  };
  processing_options?: {
    max_refunds?: number;            // Maximum refunds to process
    dry_run?: boolean;               // Dry run mode (no XML generation)
    include_warnings?: boolean;      // Include refunds with warnings (default: true)
  };
}
```

#### Example Request
```json
{
  "debtor_config": {
    "name": "Château Apéro SPRL",
    "iban": "BE68539007547034",
    "bic": "GKCCBEBB",
    "address_line1": "123 Rue de la Paix",
    "address_line2": "1000 Bruxelles",
    "country": "BE",
    "organization_id": "0123456789",
    "organization_issuer": "KBO-BCE"
  },
  "xml_options": {
    "message_id_prefix": "CHATEAU",
    "requested_execution_date": "2024-01-16"
  },
  "processing_options": {
    "max_refunds": 50,
    "include_warnings": true
  }
}
```

### Response Formats

#### Success Response (XML Download)
- **Status**: 200 OK
- **Content-Type**: `application/xml`
- **Headers**:
  ```
  Content-Disposition: attachment; filename="CBC_Refunds_<MessageID>_<Timestamp>.xml"
  X-Message-ID: <Generated Message ID>
  X-Transaction-Count: <Number of transactions>
  X-Total-Amount: <Total amount in EUR>
  X-Processing-Time: <Processing time in ms>
  X-Request-ID: <Unique request ID>
  ```
- **Body**: CBC-compatible XML file in pain.001.001.03 format

#### Dry Run Response (JSON)
```json
{
  "success": true,
  "message": "Dry run completed successfully",
  "data": {
    "message_id": "DRY_RUN",
    "transaction_count": 25,
    "total_amount": 1250.75,
    "filename": "dry_run.xml",
    "processing_summary": {
      "refunds_processed": 25,
      "validation_errors": 2,
      "xml_generation_time_ms": 0,
      "total_processing_time_ms": 450
    }
  },
  "request_id": "uuid-request-id"
}
```

#### Error Response (JSON)
```json
{
  "success": false,
  "error": "Error description",
  "error_code": "ERROR_CODE",
  "details": "Additional error details",
  "request_id": "uuid-request-id"
}
```

### Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_REQUEST` | Invalid request method or malformed JSON | 400/405 |
| `UNAUTHORIZED` | Missing or invalid authentication | 401 |
| `CONFIGURATION_ERROR` | Invalid debtor configuration | 400 |
| `NO_REFUNDS_AVAILABLE` | No valid refunds to process | 400 |
| `REFUND_DATA_ERROR` | Error retrieving refund data | 500 |
| `XML_GENERATION_ERROR` | Error generating XML | 500 |
| `SERVER_ERROR` | Internal server error | 500 |

## Integration Workflow

### 1. Authentication & Validation
- Validates admin authentication
- Parses and validates request body
- Validates debtor configuration

### 2. Refund Data Retrieval
- Calls `generate-refund-data` function
- Retrieves validated refund records
- Handles database errors

### 3. Processing Options
- Applies `max_refunds` limit
- Filters warnings if `include_warnings` is false
- Handles dry run mode

### 4. XML Generation
- Initializes CBCXMLGenerator with debtor config
- Generates pain.001.001.03 format XML
- Validates all refund data

### 5. Response Generation
- Returns XML file with proper headers
- Includes processing metadata
- Comprehensive error handling

## Usage Examples

### Basic Refund Processing
```bash
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "debtor_config": {
      "name": "Your Company",
      "iban": "BE68539007547034",
      "country": "BE"
    }
  }' \
  https://your-project.supabase.co/functions/v1/process-refunds \
  --output refunds.xml
```

### Dry Run Mode
```bash
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "debtor_config": {
      "name": "Your Company",
      "iban": "BE68539007547034",
      "country": "BE"
    },
    "processing_options": {
      "dry_run": true
    }
  }' \
  https://your-project.supabase.co/functions/v1/process-refunds
```

### Limited Batch Processing
```bash
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "debtor_config": {
      "name": "Your Company",
      "iban": "BE68539007547034",
      "country": "BE"
    },
    "processing_options": {
      "max_refunds": 10,
      "include_warnings": false
    }
  }' \
  https://your-project.supabase.co/functions/v1/process-refunds \
  --output limited_refunds.xml
```

## Security Considerations

### Authentication
- Admin-level authentication required
- Supports both Bearer tokens and API keys
- All requests are logged with request IDs

### Input Validation
- Comprehensive validation of all input parameters
- IBAN format validation for Belgian accounts
- Character set validation for XML compatibility
- Request size limits to prevent abuse

### Data Sanitization
- All text fields are sanitized for XML output
- Invalid characters are removed or replaced
- XSS prevention measures in place

### Rate Limiting
- Consider implementing rate limiting for production use
- Monitor processing times and resource usage
- Set appropriate timeouts for large batches

## Monitoring & Logging

### Request Logging
- Unique request ID for each call
- Complete request/response logging
- Processing time tracking
- Error details with stack traces

### Audit Trail
- All refund processing attempts logged
- Success/failure rates tracked
- Processing volumes monitored
- Performance metrics collected

### Health Monitoring
- Integration with generate-refund-data function
- XML generation success rates
- Database connectivity status
- Response time monitoring

## Error Handling

### Graceful Degradation
- Detailed error messages for debugging
- Proper HTTP status codes
- Structured error responses
- Request ID tracking for support

### Recovery Scenarios
- Database connection failures
- Network timeouts
- Invalid data handling
- Partial processing recovery

## Performance Considerations

### Optimization
- Efficient data processing pipeline
- Minimal memory footprint
- Streaming XML generation for large batches
- Connection pooling for database access

### Scalability
- Handles large numbers of refunds efficiently
- Configurable batch sizes
- Memory-efficient processing
- Horizontal scaling support

### Limits
- Maximum refunds per request: Configurable
- Request timeout: 30 seconds (Supabase Edge Function limit)
- Memory limit: 128MB (Supabase Edge Function limit)
- File size limit: Depends on number of refunds

## Testing

### Test Coverage
- Authentication and authorization tests
- Request validation tests
- Integration tests with generate-refund-data
- XML generation and validation tests
- Error handling scenarios
- Performance and load tests

### Test Data
- Mock refund data for testing
- Invalid data scenarios
- Edge cases and boundary conditions
- Security test cases

## Deployment

### Environment Variables
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Dependencies
- Supabase Edge Functions runtime
- generate-refund-data function
- Database access permissions
- Admin authentication system

### Deployment Steps
1. Deploy the function to Supabase
2. Configure environment variables
3. Set up authentication policies
4. Test with sample data
5. Monitor initial usage

## Troubleshooting

### Common Issues

#### Authentication Errors
- Verify admin token is valid
- Check API key permissions
- Ensure proper headers are set

#### Configuration Errors
- Validate IBAN format (Belgian: BE + 14 digits)
- Check required debtor fields
- Verify character encoding

#### No Refunds Available
- Check refunds table has data
- Verify validation rules
- Review processing options filters

#### XML Generation Errors
- Validate refund data integrity
- Check IBAN formats in refund records
- Verify name character sets

### Debug Information
- Use request ID for log correlation
- Check function logs in Supabase dashboard
- Monitor database query performance
- Verify network connectivity

## API Changelog

### Version 1.0.0 (Initial Release)
- Complete refund processing workflow
- CBC XML generation
- Comprehensive error handling
- Admin authentication
- Processing options support
- Dry run mode
- Audit logging

## Support

For technical support or questions about the Process Refunds API:

1. Check the logs using the request ID
2. Verify authentication and permissions
3. Test with dry run mode first
4. Review the troubleshooting section
5. Contact system administrators with request ID and error details

## Related Documentation

- [Generate Refund Data Function](../generate-refund-data/README.md)
- [CBC XML Generator Service](../../../src/lib/xml-generator.ts)
- [Database Schema Documentation](../../../documentation/improvement_plan/PHASE3_DATABASE_SCHEMA.md)
- [API Reference](../../../documentation/improvement_plan/PHASE4_API_REFERENCE.md)