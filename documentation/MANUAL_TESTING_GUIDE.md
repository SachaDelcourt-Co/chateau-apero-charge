# Manual Testing Guide for Automatic Refund System

This guide provides comprehensive manual testing procedures for the automatic refund system, covering all components from database to XML generation and file download.

## Prerequisites

### Environment Setup
- Supabase project configured with proper environment variables
- Admin user account with appropriate permissions
- Test data in `refunds` and `table_cards` tables
- CBC bank account details for testing

### Required Environment Variables
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Test Data Setup

### 1. Create Test Cards
```sql
INSERT INTO table_cards (id, amount, created_at, updated_at) VALUES
('TEST001', 25.50, NOW(), NOW()),
('TEST002', 15.75, NOW(), NOW()),
('TEST003', 50.00, NOW(), NOW());
```

### 2. Create Test Refunds
```sql
INSERT INTO refunds ("first name", "last name", account, email, id_card, card_balance, matched_card, amount_recharged, created_at) VALUES
('Jean', 'Dupont', 'BE68539007547034', 'jean.dupont@example.com', 'TEST001', 25.50, 'TEST001', 25.50, NOW()),
('Marie', 'Martin', 'BE62510007547061', 'marie.martin@example.com', 'TEST002', 15.75, 'TEST002', 15.75, NOW()),
('Pierre', 'Dubois', 'BE43068999999501', 'pierre.dubois@example.com', 'TEST003', 50.00, 'TEST003', 50.00, NOW());
```

### 3. Create Error Test Cases
```sql
-- Missing matched_card
INSERT INTO refunds ("first name", "last name", account, email, id_card, created_at) VALUES
('Invalid', 'User', 'BE68539007547034', 'invalid@example.com', 'MISSING001', NOW());

-- Invalid IBAN
INSERT INTO refunds ("first name", "last name", account, email, id_card, matched_card, amount_recharged, created_at) VALUES
('Bad', 'IBAN', 'INVALID_IBAN', 'bad.iban@example.com', 'ERROR002', 'TEST001', 50.00, NOW());
```

## Manual Testing Procedures

### Test 1: Database Function Testing

#### 1.1 Test generate-refund-data Function
```bash
# Test via Supabase Edge Function
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://your-project.supabase.co/functions/v1/generate-refund-data
```

**Expected Results:**
- ✅ Returns JSON with `valid_refunds`, `validation_errors`, and `summary`
- ✅ Valid refunds have all required fields populated
- ✅ Validation errors are properly categorized
- ✅ Summary shows correct counts and totals

#### 1.2 Verify Data Validation
**Test Cases:**
- Cards with missing `matched_card` should be auto-matched via `id_card`
- Invalid IBANs should be flagged in validation errors
- Missing required fields should be reported
- Card balance mismatches should be noted

### Test 2: XML Generation Testing

#### 2.1 Test XML Generator Directly
```typescript
// In browser console or test script
import { CBCXMLGenerator } from './src/lib/xml-generator';

const debtorConfig = {
  name: 'Château Apéro SPRL',
  iban: 'BE68539007547034',
  bic: 'GKCCBEBB',
  country: 'BE',
  address_line1: 'Rue de la Fête 123',
  address_line2: '5000 Namur'
};

const testRefunds = [
  {
    id: 1,
    first_name: 'Jean',
    last_name: 'Dupont',
    email: 'jean.dupont@example.com',
    account: 'BE68539007547034',
    id_card: 'TEST001',
    matched_card: 'TEST001',
    card_balance: 25.50,
    amount_recharged: 25.50,
    created_at: new Date().toISOString(),
    card_exists: true,
    validation_status: 'valid',
    validation_notes: []
  }
];

const generator = new CBCXMLGenerator(debtorConfig);
const result = await generator.generateXML(testRefunds);
console.log(result);
```

**Expected Results:**
- ✅ `result.success` is `true`
- ✅ `result.xml_content` contains valid XML
- ✅ XML follows pain.001.001.03 format
- ✅ Contains proper CBC BIC code (GKCCBEBB)
- ✅ Transaction count and amounts are correct

#### 2.2 Validate XML Structure
**Check for Required Elements:**
- `<?xml version="1.0" encoding="UTF-8"?>`
- `xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"`
- `<PmtMtd>TRF</PmtMtd>`
- `<BIC>GKCCBEBB</BIC>`
- `<SvcLvl><Cd>SEPA</Cd></SvcLvl>`
- `<CtgyPurp><Cd>SUPP</Cd></CtgyPurp>`

### Test 3: API Endpoint Testing

#### 3.1 Test process-refunds Endpoint
```bash
# Basic refund processing
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "debtor_config": {
      "name": "Château Apéro SPRL",
      "iban": "BE68539007547034",
      "country": "BE"
    },
    "processing_options": {
      "max_refunds": 50,
      "include_warnings": true
    }
  }' \
  https://your-project.supabase.co/functions/v1/process-refunds \
  --output refunds.xml
```

**Expected Results:**
- ✅ Returns XML file with proper headers
- ✅ `Content-Type: application/xml`
- ✅ `Content-Disposition: attachment; filename="refunds_YYYYMMDD_HHMMSS.xml"`
- ✅ Custom headers: `X-Message-ID`, `X-Transaction-Count`, `X-Total-Amount`

#### 3.2 Test Dry Run Mode
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "debtor_config": {
      "name": "Château Apéro SPRL",
      "iban": "BE68539007547034",
      "country": "BE"
    },
    "processing_options": {
      "dry_run": true,
      "max_refunds": 10
    }
  }' \
  https://your-project.supabase.co/functions/v1/process-refunds
```

**Expected Results:**
- ✅ Returns JSON response (not XML)
- ✅ Contains `dry_run: true`
- ✅ Includes processing summary and preview
- ✅ No actual XML file generated

### Test 4: Frontend Integration Testing

#### 4.1 Test Admin Dashboard Button
1. **Navigate to Admin Dashboard**
   - Go to `/admin` page
   - Ensure you're logged in as admin user
   - Locate "Générer fichier de remboursement" button

2. **Test Button Click**
   - Click the refund generation button
   - Configuration dialog should open
   - All form fields should be present and functional

3. **Test Configuration Dialog**
   - **Required Fields:**
     - Organization name (required)
     - IBAN (required, with validation)
   - **Optional Fields:**
     - BIC, Country, Address lines, Organization ID
   - **Processing Options:**
     - Max refunds slider
     - Include warnings toggle
     - Dry run toggle

#### 4.2 Test Form Validation
**IBAN Validation:**
- ✅ Valid Belgian IBAN: `BE68539007547034`
- ❌ Invalid format: `INVALID_IBAN`
- ❌ Wrong checksum: `BE68539007547035`

**Required Field Validation:**
- ❌ Empty organization name
- ❌ Empty IBAN field

#### 4.3 Test File Download
1. **Configure Valid Settings:**
   ```
   Organization: Château Apéro SPRL
   IBAN: BE68539007547034
   Country: Belgium
   Max Refunds: 50
   Include Warnings: Yes
   Dry Run: No
   ```

2. **Submit Form:**
   - Click "Générer le fichier XML"
   - Loading spinner should appear
   - Success toast notification should show
   - XML file should download automatically

3. **Verify Downloaded File:**
   - File name format: `remboursements_YYYYMMDD_HHMMSS.xml`
   - File contains valid XML content
   - Can be opened in text editor or XML viewer

### Test 5: Error Handling Testing

#### 5.1 Test Authentication Errors
```bash
# Test without authentication
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"debtor_config": {"name": "Test", "iban": "BE68539007547034", "country": "BE"}}' \
  https://your-project.supabase.co/functions/v1/process-refunds
```
**Expected:** 401 Unauthorized

#### 5.2 Test Invalid Configuration
```bash
# Test with invalid IBAN
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "debtor_config": {
      "name": "",
      "iban": "INVALID_IBAN",
      "country": "BE"
    }
  }' \
  https://your-project.supabase.co/functions/v1/process-refunds
```
**Expected:** 400 Bad Request with validation errors

#### 5.3 Test No Refunds Available
1. Clear all refunds from database: `DELETE FROM refunds;`
2. Try to generate refunds
**Expected:** 404 Not Found with "NO_REFUNDS_AVAILABLE" error

### Test 6: Security Testing

#### 6.1 Test Rate Limiting
- Make multiple rapid requests to refund endpoints
- Should be rate limited after configured threshold

#### 6.2 Test Input Sanitization
- Try SQL injection in form fields
- Try XSS payloads in organization name
- All inputs should be properly sanitized

#### 6.3 Test Audit Logging
- Check application logs for refund processing attempts
- Verify sensitive data is masked in logs
- Confirm audit trail is complete

### Test 7: Performance Testing

#### 7.1 Test Large Batch Processing
1. Create 100+ test refunds in database
2. Process all refunds in single batch
3. Measure processing time and memory usage
**Expected:** Complete within 30 seconds, reasonable memory usage

#### 7.2 Test Concurrent Requests
- Make multiple simultaneous refund requests
- System should handle gracefully without errors

## Test Results Documentation

### Test Execution Checklist

| Test Category | Test Case | Status | Notes |
|---------------|-----------|--------|-------|
| Database | generate-refund-data function | ⬜ | |
| Database | Data validation logic | ⬜ | |
| Database | Card matching algorithm | ⬜ | |
| XML Generation | Basic XML structure | ⬜ | |
| XML Generation | CBC format compliance | ⬜ | |
| XML Generation | Batch processing | ⬜ | |
| API Endpoint | Successful processing | ⬜ | |
| API Endpoint | Dry run mode | ⬜ | |
| API Endpoint | Error handling | ⬜ | |
| Frontend | Button functionality | ⬜ | |
| Frontend | Form validation | ⬜ | |
| Frontend | File download | ⬜ | |
| Security | Authentication | ⬜ | |
| Security | Authorization | ⬜ | |
| Security | Input sanitization | ⬜ | |
| Performance | Large batches | ⬜ | |
| Performance | Concurrent requests | ⬜ | |

### Issue Tracking

| Issue ID | Description | Severity | Status | Resolution |
|----------|-------------|----------|--------|------------|
| | | | | |

## Troubleshooting Guide

### Common Issues

#### 1. "No refunds available" Error
- **Cause:** Empty refunds table or all refunds have validation errors
- **Solution:** Check database for refund records, verify data integrity

#### 2. XML Generation Fails
- **Cause:** Invalid debtor configuration or malformed refund data
- **Solution:** Validate IBAN format, check required fields

#### 3. File Download Doesn't Start
- **Cause:** Browser blocking download or network error
- **Solution:** Check browser settings, verify network connectivity

#### 4. Authentication Errors
- **Cause:** Invalid or expired tokens
- **Solution:** Re-login, check token expiry

### Debug Information

#### Enable Debug Logging
```javascript
// In browser console
localStorage.setItem('debug', 'refund-system:*');
```

#### Check Network Requests
- Open browser DevTools
- Monitor Network tab during refund processing
- Check request/response details for errors

#### Verify Database State
```sql
-- Check refunds count
SELECT COUNT(*) FROM refunds;

-- Check cards count  
SELECT COUNT(*) FROM table_cards;

-- Check refunds with matched cards
SELECT COUNT(*) FROM refunds WHERE matched_card IS NOT NULL;
```

## Acceptance Criteria

### ✅ System is ready for production when:
- [ ] All test cases pass successfully
- [ ] No critical or high-severity issues remain
- [ ] Performance meets requirements (< 30s for 100 refunds)
- [ ] Security measures are validated
- [ ] Documentation is complete and accurate
- [ ] Audit logging is functional
- [ ] Error handling covers all scenarios
- [ ] File downloads work across different browsers
- [ ] XML files are CBC-compatible and valid

### 📋 Pre-deployment Checklist
- [ ] Environment variables configured
- [ ] Database schema is up to date
- [ ] Security policies are applied
- [ ] Monitoring and alerting configured
- [ ] Backup procedures tested
- [ ] Rollback plan prepared
- [ ] User training completed
- [ ] Support documentation available