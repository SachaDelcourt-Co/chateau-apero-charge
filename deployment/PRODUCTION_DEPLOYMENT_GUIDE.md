# Production-Ready Festival Simulation Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying and executing the complete, production-ready Full Festival Simulation Test Plan (Phase 2.6) with real database integration and no mocked components.

## Prerequisites

- Node.js (v16 or higher)
- K6 load testing tool installed
- Access to Supabase project with service role key
- PostgreSQL database with proper schema

## Deployment Files

### Database Scripts
- [`01_fix_database_schema.sql`](./01_fix_database_schema.sql) - Schema fixes and RLS policies
- [`02_deploy_stored_procedures_fixed.sql`](./02_deploy_stored_procedures_fixed.sql) - Corrected stored procedures
- [`03_seed_comprehensive_test_data.sql`](./03_seed_comprehensive_test_data.sql) - Test data seeding

### Validation Scripts
- [`04_validate_test_environment.js`](./04_validate_test_environment.js) - Pre-test environment validation
- [`05_post_test_validation.js`](./05_post_test_validation.js) - Post-test data integrity validation

### Load Test Scripts
- [`../load-tests/full-festival-simulation-production.js`](../load-tests/full-festival-simulation-production.js) - Production-ready load test

## Step-by-Step Deployment

### Phase 1: Database Preparation

#### 1.1 Apply Database Schema Fixes
```bash
# Execute schema fixes in Supabase SQL Editor
# Copy and paste content from deployment/01_fix_database_schema.sql
```

#### 1.2 Deploy Corrected Stored Procedures
```bash
# Execute stored procedures in Supabase SQL Editor
# Copy and paste content from deployment/02_deploy_stored_procedures_fixed.sql
```

#### 1.3 Seed Comprehensive Test Data
```bash
# Execute test data seeding in Supabase SQL Editor
# Copy and paste content from deployment/03_seed_comprehensive_test_data.sql
```

### Phase 2: Environment Validation

#### 2.1 Install Dependencies
```bash
npm install @supabase/supabase-js
```

#### 2.2 Run Environment Validation
```bash
node deployment/04_validate_test_environment.js
```

**Note:** The validation scripts have been converted to ES module syntax to work with this project's configuration.

**Expected Output:**
```
🚀 FESTIVAL SIMULATION ENVIRONMENT VALIDATION
==============================================

✅ Database connection established
✅ Stored procedure exists: sp_process_bar_order
✅ Stored procedure exists: sp_process_checkpoint_recharge
✅ Stored procedure exists: sp_process_stripe_recharge
✅ Test cards available: 50/50
✅ Test products available: 10/10
✅ Log endpoint reachable and functional
✅ Functional test passed: Checkpoint recharge successful
✅ Environment helper confirms test environment is ready

📊 VALIDATION REPORT
====================
Overall Status: ✅ READY

🎉 ENVIRONMENT IS READY FOR PRODUCTION TESTING!
```

### Phase 3: Load Test Execution

#### 3.1 Execute Production Load Test
```bash
k6 run load-tests/full-festival-simulation-production.js
```

**Optional: With Service Role Key**
```bash
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" k6 run load-tests/full-festival-simulation-production.js
```

#### 3.2 Monitor Test Execution
The test runs in 3 phases:
- **Phase 1 (5 min):** Gates Open - Light load (10 VUs)
- **Phase 2 (10 min):** Peak Hours - High load (50 VUs)
- **Phase 3 (5 min):** Winding Down - Moderate load (20 VUs)

**Total Duration:** 20 minutes

### Phase 4: Post-Test Validation

#### 4.1 Run Post-Test Validation
```bash
node deployment/05_post_test_validation.js
```

**Expected Output:**
```
🔍 FESTIVAL SIMULATION POST-TEST VALIDATION
============================================

✅ No negative card balances found
✅ All bar order totals are consistent
✅ No stuck idempotency keys found
✅ Database query performance acceptable

📊 POST-TEST VALIDATION REPORT
===============================
Overall Status: ✅ PASSED

🎉 POST-TEST VALIDATION PASSED!
```

## Success Criteria

### Primary Success Criteria
- **Success Rate:** >95% of all operations complete successfully
- **Balance Integrity:** 99.999% accuracy in card balance calculations
- **Data Consistency:** All transactions properly logged and reconciled
- **No Negative Balances:** Zero cards with negative balances after testing

### Performance Criteria
- **Response Time:** 95% of requests complete under 2 seconds
- **Peak Performance:** 95% of peak hour requests complete under 3 seconds
- **Error Rate:** <5% HTTP failures
- **Transaction Errors:** <100 total transaction errors
- **Balance Errors:** <5 balance integrity errors

### Business Logic Validation
- **Idempotency:** All duplicate requests properly handled
- **Transaction Totals:** Bar order totals match item calculations
- **Recharge Accuracy:** All recharges properly applied to card balances
- **Audit Trail:** Complete transaction logging for all operations

## Troubleshooting

### Common Issues

#### 1. Stored Procedures Not Found
```bash
# Verify procedures exist
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('YOUR_URL', 'YOUR_KEY');
supabase.rpc('sp_process_checkpoint_recharge', {}).then(console.log);
"
```

**Solution:** Re-run [`02_deploy_stored_procedures_fixed.sql`](./02_deploy_stored_procedures_fixed.sql)

#### 2. Test Data Missing
```bash
# Check test data
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('YOUR_URL', 'YOUR_KEY');
supabase.from('table_cards').select('count').like('id', 'k6-test-%').then(console.log);
"
```

**Solution:** Re-run [`03_seed_comprehensive_test_data.sql`](./03_seed_comprehensive_test_data.sql)

#### 3. Edge Functions Not Responding
- Verify Edge Functions are deployed and active in Supabase dashboard
- Check function logs for errors
- Ensure proper authentication headers

#### 4. High Error Rates During Testing
- Check database connection limits
- Verify RLS policies allow test operations
- Monitor Supabase dashboard for rate limiting

### Performance Optimization

#### Database Optimization
- Ensure proper indexes on frequently queried columns
- Monitor connection pool usage
- Consider read replicas for high-load scenarios

#### Load Test Optimization
- Adjust VU (Virtual User) counts based on system capacity
- Modify test duration for longer stress testing
- Customize test scenarios for specific use cases

## Test Results Analysis

### K6 Metrics to Monitor
- `http_req_duration`: Response time percentiles
- `http_req_failed`: HTTP failure rate
- `success_rate`: Custom business logic success rate
- `balance_integrity_rate`: Card balance accuracy rate
- `transaction_errors`: Count of transaction failures
- `balance_errors`: Count of balance integrity issues

### Database Metrics to Monitor
- Connection count and pool utilization
- Query execution times
- Lock contention and deadlocks
- Storage and memory usage

### Business Metrics to Validate
- Total transaction volume processed
- Revenue calculations accuracy
- Card balance distribution
- Error pattern analysis

## Security Considerations

### API Keys
- Use environment variables for sensitive keys
- Rotate keys regularly
- Use service role key only when necessary
- Monitor API usage and rate limits

### Database Security
- Verify RLS policies are properly configured
- Audit user permissions and roles
- Monitor for suspicious query patterns
- Ensure test data isolation from production

### Test Data Management
- Use clearly identifiable test data prefixes (`k6-test-`)
- Clean up test data after testing if required
- Ensure test data doesn't contain sensitive information
- Implement proper test data lifecycle management

## Maintenance and Updates

### Regular Maintenance
- Update test data periodically to reflect realistic scenarios
- Review and update performance thresholds
- Validate stored procedure performance
- Monitor for schema changes that might affect tests

### Continuous Integration
- Integrate validation scripts into CI/CD pipeline
- Automate test environment setup and teardown
- Set up automated performance regression testing
- Implement alerting for test failures

## Support and Documentation

### Additional Resources
- [Complete Implementation Plan](./COMPLETE_IMPLEMENTATION_PLAN.md)
- [Manual Deployment Steps](./MANUAL_DEPLOYMENT_STEPS.md)
- [Load Test Debugging Guide](../load-tests/DEBUGGING_GUIDE.md)

### Contact Information
For technical support or questions about this deployment:
- Review error logs and validation output
- Check Supabase dashboard for system status
- Verify all prerequisites are met
- Consult troubleshooting section above

---

**Last Updated:** January 2025  
**Version:** 2.6 Production Ready  
**Status:** Complete Implementation with Real Database Integration