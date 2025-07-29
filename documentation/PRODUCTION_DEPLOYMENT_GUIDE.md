# Production Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Château Apéro Refund System to production with proper security configurations.

## Prerequisites

- Node.js 18+ installed
- Supabase project set up
- Production domain configured
- SSL certificates installed
- Database backups configured

## Security Checklist

### 1. Environment Configuration

1. Copy `.env.production.example` to `.env.production`
2. Fill in all required production values:
   - `VITE_SUPABASE_URL`: Your production Supabase URL
   - `VITE_SUPABASE_ANON_KEY`: Your production anon key
   - `VITE_API_BASE_URL`: Your production domain
   - `VITE_ALLOWED_ORIGINS`: Whitelist your domains

### 2. Database Security

1. **Enable Row Level Security (RLS)** on all tables:
   ```sql
   ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
   ALTER TABLE table_cards ENABLE ROW LEVEL SECURITY;
   ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
   ```

2. **Create security policies**:
   ```sql
   -- Only authenticated users can access refund data
   CREATE POLICY "refund_access_policy" ON refunds
   FOR ALL USING (auth.role() = 'authenticated');
   
   -- Only admin users can process refunds
   CREATE POLICY "admin_refund_policy" ON refunds
   FOR UPDATE USING (
     EXISTS (
       SELECT 1 FROM profiles 
       WHERE profiles.id = auth.uid() 
       AND profiles.role = 'admin'
     )
   );
   ```

3. **Set up database backups**:
   - Configure automated daily backups
   - Test backup restoration process
   - Set retention period to 7 years for financial records

### 3. Application Security

1. **Remove hardcoded credentials** (✅ COMPLETED):
   - All credentials now use environment variables
   - No sensitive data in source code

2. **Enable authentication validation** (✅ COMPLETED):
   - JWT token validation implemented
   - Role-based access control active
   - Session timeout configured

3. **SQL injection protection** (✅ COMPLETED):
   - Parameterized queries implemented
   - Input validation and sanitization active
   - Query limits enforced

### 4. Network Security

1. **Configure HTTPS**:
   - Force HTTPS redirects
   - Set HSTS headers
   - Use strong SSL/TLS configuration

2. **Set up firewall rules**:
   - Allow only necessary ports (80, 443)
   - Restrict database access to application servers
   - Block unnecessary services

3. **Configure CORS**:
   - Whitelist only production domains
   - Remove wildcard origins
   - Set appropriate headers

### 5. Monitoring and Logging

1. **Enable audit logging**:
   - All financial operations logged
   - User actions tracked
   - Error monitoring active

2. **Set up alerts**:
   - Failed authentication attempts
   - Large refund amounts
   - System errors
   - Unusual access patterns

3. **Performance monitoring**:
   - Response time tracking
   - Database query performance
   - Resource utilization

## Deployment Steps

### 1. Pre-deployment

```bash
# 1. Clone the repository
git clone <repository-url>
cd chateau-apero-charge

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.production.example .env.production
# Edit .env.production with your values

# 4. Run security tests
npm run test:security

# 5. Build for production
npm run build
```

### 2. Database Setup

```bash
# 1. Run database migrations
npx supabase db push

# 2. Set up Edge Functions
npx supabase functions deploy generate-refund-data
npx supabase functions deploy process-refunds

# 3. Configure function secrets
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Application Deployment

```bash
# 1. Deploy to your hosting platform
npm run deploy

# 2. Verify deployment
curl -I https://your-domain.com/health

# 3. Test critical functions
npm run test:production
```

### 4. Post-deployment Verification

1. **Security verification**:
   - [ ] HTTPS working correctly
   - [ ] Authentication required for admin functions
   - [ ] CORS configured properly
   - [ ] Security headers present

2. **Functionality verification**:
   - [ ] User login/logout working
   - [ ] Refund data retrieval working
   - [ ] XML generation working
   - [ ] File download working

3. **Performance verification**:
   - [ ] Page load times < 3 seconds
   - [ ] API response times < 1 second
   - [ ] Database queries optimized

## Security Maintenance

### Daily Tasks
- [ ] Review audit logs
- [ ] Check system alerts
- [ ] Monitor failed login attempts

### Weekly Tasks
- [ ] Review user access permissions
- [ ] Check backup integrity
- [ ] Update security patches

### Monthly Tasks
- [ ] Security vulnerability scan
- [ ] Performance optimization review
- [ ] Access control audit

### Quarterly Tasks
- [ ] Full security audit
- [ ] Disaster recovery test
- [ ] Compliance review

## Incident Response

### Security Incident
1. **Immediate response**:
   - Isolate affected systems
   - Preserve evidence
   - Notify stakeholders

2. **Investigation**:
   - Analyze logs
   - Identify root cause
   - Assess impact

3. **Recovery**:
   - Apply fixes
   - Restore from backups if needed
   - Verify system integrity

4. **Post-incident**:
   - Document lessons learned
   - Update security measures
   - Conduct training

### Data Breach Response
1. **Within 1 hour**:
   - Contain the breach
   - Assess scope
   - Notify security team

2. **Within 24 hours**:
   - Notify authorities (GDPR compliance)
   - Prepare user notifications
   - Begin forensic analysis

3. **Within 72 hours**:
   - Submit regulatory reports
   - Notify affected users
   - Implement additional controls

## Compliance Requirements

### GDPR Compliance
- [ ] Data retention policies implemented (7 years for financial records)
- [ ] User consent mechanisms in place
- [ ] Data portability features available
- [ ] Right to erasure implemented

### Financial Regulations
- [ ] Audit trail for all transactions
- [ ] Data integrity checks
- [ ] Secure data transmission
- [ ] Regular compliance audits

### PCI DSS Considerations
- [ ] Secure payment data handling
- [ ] Network security controls
- [ ] Access control measures
- [ ] Regular security testing

## Support and Maintenance

### Technical Support
- **Primary contact**: [Your technical team]
- **Emergency contact**: [24/7 support number]
- **Documentation**: [Link to technical docs]

### Maintenance Windows
- **Scheduled maintenance**: Sundays 2:00-4:00 AM UTC
- **Emergency maintenance**: As needed with 1-hour notice
- **Security updates**: Applied immediately

### Backup and Recovery
- **Backup frequency**: Daily at 2:00 AM UTC
- **Retention period**: 7 years for financial data, 1 year for system data
- **Recovery time objective (RTO)**: 4 hours
- **Recovery point objective (RPO)**: 24 hours

## Troubleshooting

### Common Issues

1. **Authentication failures**:
   - Check JWT token expiry
   - Verify user permissions
   - Review audit logs

2. **XML generation errors**:
   - Validate input data
   - Check IBAN format
   - Verify debtor configuration

3. **Performance issues**:
   - Check database query performance
   - Review server resources
   - Analyze network latency

### Emergency Contacts

- **System Administrator**: [Contact info]
- **Database Administrator**: [Contact info]
- **Security Team**: [Contact info]
- **Business Owner**: [Contact info]

## Version History

| Version | Date | Changes | Security Updates |
|---------|------|---------|------------------|
| 1.0.0 | 2025-01-29 | Initial production release | All critical security fixes applied |

---

**Important**: This system handles sensitive financial data. Always follow security best practices and regulatory requirements. When in doubt, consult with your security team before making changes.