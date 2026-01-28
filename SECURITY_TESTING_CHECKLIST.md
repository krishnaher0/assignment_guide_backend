# Security Testing Checklist

This document provides a comprehensive checklist for testing security features of the ProjectHub application.

## Table of Contents
- [Authentication & Authorization](#authentication--authorization)
- [Password Security](#password-security)
- [Brute-Force Protection](#brute-force-protection)
- [Multi-Factor Authentication (MFA)](#multi-factor-authentication-mfa)
- [Session Management](#session-management)
- [Data Encryption](#data-encryption)
- [Payment Security](#payment-security)
- [Input Validation & Sanitization](#input-validation--sanitization)
- [API Security](#api-security)
- [Audit Logging](#audit-logging)

---

## Authentication & Authorization

### User Registration
- [ ] Register with valid email and strong password
- [ ] Attempt to register with existing email (should fail)
- [ ] Register with weak password (should fail with specific error)
- [ ] Register with compromised password from HaveIBeenPwned (should fail)
- [ ] Verify email OTP is sent and received
- [ ] Verify OTP with correct code (should succeed)
- [ ] Verify OTP with incorrect code (should fail)
- [ ] Verify OTP expires after 10 minutes
- [ ] Test OTP resend functionality

### User Login
- [ ] Login with correct credentials
- [ ] Login with incorrect password (should fail)
- [ ] Login with non-existent email (should fail with generic error)
- [ ] Login before email verification (should prompt for verification)
- [ ] Login with MFA enabled (should prompt for 2FA code)
- [ ] Verify JWT token is set in HTTP-only cookie
- [ ] Verify token expiration (30 days)

### Role-Based Access Control (RBAC)
- [ ] Client cannot access admin routes
- [ ] Developer cannot access admin routes
- [ ] Client cannot access developer-specific routes
- [ ] Admin can access all routes
- [ ] Unauthenticated users are redirected to login
- [ ] Test role tampering in JWT (should fail)

---

## Password Security

### Password Complexity
- [ ] Password less than 12 characters (should fail)
- [ ] Password without uppercase letter (should fail)
- [ ] Password without lowercase letter (should fail)
- [ ] Password without number (should fail)
- [ ] Password without special character (should fail)
- [ ] Password strength meter displays correctly
- [ ] Weak password (zxcvbn score < 2) rejected

### Password Expiry & Reuse
- [ ] Password expires after 90 days
- [ ] User prompted to change password after expiry
- [ ] Cannot reuse previous password
- [ ] Password change updates passwordChangedAt timestamp

### Password Reset
- [ ] Request password reset email
- [ ] Reset token is hashed (SHA-256) in database
- [ ] Reset link expires after 1 hour
- [ ] Cannot use expired reset token
- [ ] Cannot reuse reset token after password change
- [ ] Password reset link contains valid token

---

## Brute-Force Protection

### Account Lockout
- [ ] Account locked after 5 failed login attempts
- [ ] Lockout duration is 30 minutes
- [ ] User notified of account lockout
- [ ] Account automatically unlocked after 30 minutes
- [ ] Failed login attempts reset after successful login

### IP Blocking
- [ ] IP blocked after 20 failed attempts across all accounts
- [ ] IP block duration is 1 hour
- [ ] IP block returns HTTP 429 status
- [ ] Blocked IP cannot make requests

### Rate Limiting
- [ ] Login endpoint: 50 attempts per 15 minutes per IP
- [ ] Registration endpoint: 3 accounts per hour per IP
- [ ] Password reset: 3 requests per hour per IP
- [ ] MFA verification: 10 attempts per 15 minutes
- [ ] General API: 100 requests per 15 minutes per IP
- [ ] Rate limit headers present in response

### CAPTCHA Integration
- [ ] CAPTCHA triggered after 3 failed login attempts
- [ ] CAPTCHA validates with Google reCAPTCHA v3
- [ ] Score threshold is 0.5
- [ ] Failed CAPTCHA blocks login
- [ ] CAPTCHA resets after successful login

---

## Multi-Factor Authentication (MFA)

### MFA Setup
- [ ] User can initiate MFA setup
- [ ] QR code generated for authenticator app
- [ ] Secret key provided for manual entry
- [ ] TOTP verification required to complete setup
- [ ] 10 backup codes generated and displayed once
- [ ] Backup codes are bcrypt hashed in database

### MFA Login
- [ ] Login prompts for 6-digit TOTP code
- [ ] Valid TOTP code allows login
- [ ] Invalid TOTP code blocks login
- [ ] TOTP has ±2 step time window tolerance
- [ ] Can use backup code instead of TOTP
- [ ] Backup code is removed after single use
- [ ] Failed MFA attempts are logged in audit trail

### MFA Disable
- [ ] MFA disable requires password confirmation
- [ ] MFA secret and backup codes removed from database
- [ ] MFA disable logged in audit trail with high severity

---

## Session Management

### Session Tracking
- [ ] Active session created on login
- [ ] Session includes IP address, device info, location
- [ ] Maximum 5 concurrent sessions per user
- [ ] Oldest session removed when limit exceeded
- [ ] Session list displays all active sessions

### Session Revocation
- [ ] User can view all active sessions
- [ ] User can revoke specific session
- [ ] User can logout all other sessions
- [ ] Revoked session cannot access protected routes
- [ ] Session revocation logged in audit trail

### Cookies & JWT
- [ ] JWT stored in HTTP-only cookie
- [ ] Cookie has secure flag in production
- [ ] Cookie has SameSite=strict attribute
- [ ] Cookie expires in 30 days
- [ ] Token verified on each protected route request

---

## Data Encryption

### Password Hashing
- [ ] Passwords hashed with bcrypt (salt rounds: 10)
- [ ] Passwords never stored in plaintext
- [ ] Password hashes not returned in API responses

### AES-256-CBC Encryption
- [ ] Phone numbers encrypted in database
- [ ] MFA secrets encrypted in database
- [ ] Encryption uses 32-byte key from environment variable
- [ ] Random IV generated for each encryption
- [ ] Decryption works correctly via getters

### Token Hashing
- [ ] Password reset tokens hashed with SHA-256
- [ ] Email verification tokens hashed with SHA-256
- [ ] OTP codes hashed with SHA-256
- [ ] Tokens compared as hashes, not raw values

### HTTPS Enforcement
- [ ] HTTP requests redirected to HTTPS in production
- [ ] HSTS headers present (max-age: 1 year)
- [ ] includeSubDomains directive enabled
- [ ] preload directive enabled

---

## Payment Security

### eSewa Integration
- [ ] eSewa secret key loaded from environment variable
- [ ] Payment signature generated with HMAC-SHA256
- [ ] Payment initiation logged in audit trail
- [ ] Transaction UUID stored in order

### Payment Verification
- [ ] Payment response signature verified
- [ ] Transaction UUID matches order
- [ ] Duplicate payment prevented
- [ ] Failed signature verification logged
- [ ] Successful payment logged with high severity
- [ ] Payment data transmitted over HTTPS only

### Payment Data Protection
- [ ] Transaction IDs stored securely
- [ ] Payment amounts not manipulated
- [ ] Payment status accurately tracked
- [ ] Failed payments logged

---

## Input Validation & Sanitization

### MongoDB Injection Prevention
- [ ] express-mongo-sanitize middleware enabled
- [ ] Query parameters sanitized
- [ ] $ and . characters removed from input
- [ ] Mongoose schema validation enforced

### File Upload Security
- [ ] MIME type validation enforced
- [ ] File extension whitelisting enabled
- [ ] File size limits enforced (5MB-100MB)
- [ ] Filename sanitized (alphanumeric only)
- [ ] Uploaded files stored in secure directories
- [ ] File upload requires authentication

### Request Size Limits
- [ ] JSON body limited to 10MB
- [ ] URL-encoded body limited to 10MB
- [ ] Form data with reasonable limits

---

## API Security

### Security Headers (Helmet.js)
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Strict-Transport-Security (HSTS)
- [ ] Content-Security-Policy headers
- [ ] Referrer-Policy header

### CORS Configuration
- [ ] Origin whitelist enforced
- [ ] Credentials enabled for specific origins
- [ ] Only allowed methods permitted
- [ ] Only allowed headers accepted
- [ ] Preflight requests handled correctly

### Error Handling
- [ ] Sensitive error details not exposed
- [ ] Generic error messages to users
- [ ] Detailed errors logged server-side
- [ ] Stack traces not exposed in production

---

## Audit Logging

### Event Tracking
- [ ] Login events logged (success/failure)
- [ ] Password changes logged
- [ ] Password reset requests logged
- [ ] MFA enable/disable logged
- [ ] MFA verification attempts logged
- [ ] Account lockout logged
- [ ] Session creation/revocation logged
- [ ] Profile updates logged
- [ ] Payment initiation logged
- [ ] Payment verification logged

### Log Data Integrity
- [ ] Timestamps recorded (createdAt)
- [ ] User IDs recorded
- [ ] IP addresses recorded
- [ ] User agents recorded
- [ ] Geolocation captured (city, country)
- [ ] Action-specific metadata stored
- [ ] Severity levels assigned correctly
- [ ] Status (success/failure) recorded

### Log Access & Retention
- [ ] Admins can query audit logs
- [ ] Logs indexed for performance
- [ ] Logs retained for appropriate duration
- [ ] Sensitive data not logged (passwords, tokens)

---

## OWASP Top 10 Security Tests

### A01: Broken Access Control
- [ ] Test vertical privilege escalation (client → admin)
- [ ] Test horizontal privilege escalation (user A → user B)
- [ ] Test direct object reference (modify other user's data)
- [ ] Test forced browsing to restricted URLs

### A02: Cryptographic Failures
- [ ] Verify passwords are bcrypt hashed
- [ ] Verify sensitive data encrypted at rest
- [ ] Verify HTTPS used for all communications
- [ ] Verify no hardcoded secrets in code

### A03: Injection
- [ ] Test SQL injection (if SQL used)
- [ ] Test NoSQL injection (MongoDB)
- [ ] Test command injection
- [ ] Test XSS injection

### A04: Insecure Design
- [ ] Review authentication flow
- [ ] Review authorization flow
- [ ] Review payment flow
- [ ] Check for security anti-patterns

### A05: Security Misconfiguration
- [ ] Verify default credentials changed
- [ ] Verify unnecessary features disabled
- [ ] Verify error messages don't leak info
- [ ] Verify security headers configured

### A06: Vulnerable Components
- [ ] Run `npm audit` for dependency vulnerabilities
- [ ] Update outdated dependencies
- [ ] Remove unused dependencies
- [ ] Check for known CVEs

### A07: Authentication Failures
- [ ] Test weak password acceptance
- [ ] Test session fixation
- [ ] Test session hijacking
- [ ] Test credential stuffing

### A08: Software & Data Integrity
- [ ] Verify code integrity
- [ ] Verify CI/CD pipeline security
- [ ] Verify file upload integrity
- [ ] Verify payment data integrity

### A09: Security Logging Failures
- [ ] Verify all security events logged
- [ ] Verify log integrity
- [ ] Verify log monitoring capability
- [ ] Verify audit trail completeness

### A10: Server-Side Request Forgery (SSRF)
- [ ] Test SSRF in URL parameters
- [ ] Test SSRF in file uploads
- [ ] Test SSRF in webhooks
- [ ] Validate and sanitize URLs

---

## Penetration Testing Tools

### Recommended Tools
- **Burp Suite**: Web application security testing
- **OWASP ZAP**: Automated vulnerability scanning
- **Postman**: API testing and authentication
- **sqlmap**: SQL injection testing
- **nmap**: Network scanning
- **Wireshark**: Network traffic analysis
- **npm audit**: Dependency vulnerability scanning

### Testing Commands
```bash
# Check for dependency vulnerabilities
npm audit

# Check for outdated dependencies
npm outdated

# Run security linting
npm run lint

# Test HTTPS enforcement
curl -I http://your-domain.com

# Test rate limiting
for i in {1..100}; do curl -X POST http://localhost:5001/api/auth/login; done
```

---

## Security Test Results Template

### Test Session Information
- **Date**: YYYY-MM-DD
- **Tester**: Name
- **Environment**: Development/Staging/Production
- **Version**: Application version

### Summary
- **Total Tests**: X
- **Passed**: Y
- **Failed**: Z
- **Critical Issues**: N

### Detailed Results
| Test Case | Status | Notes | Severity |
|-----------|--------|-------|----------|
| Example | Pass/Fail | Details | Low/Medium/High/Critical |

### Recommendations
1. List of security improvements
2. Priority of fixes
3. Timeline for remediation

---

## Continuous Security Monitoring

### Daily
- [ ] Review failed login attempts
- [ ] Monitor account lockouts
- [ ] Check audit logs for suspicious activity

### Weekly
- [ ] Run `npm audit`
- [ ] Review security patches
- [ ] Analyze rate limiting effectiveness

### Monthly
- [ ] Conduct penetration testing
- [ ] Review access control policies
- [ ] Update security documentation
- [ ] Rotate API keys and secrets

### Quarterly
- [ ] Security architecture review
- [ ] Third-party security audit
- [ ] Update threat model
- [ ] Security training for team

---

## Contact & Incident Response

### Security Contact
- **Email**: security@projecthub.com
- **Response Time**: 24 hours for critical issues

### Incident Response Plan
1. **Identify**: Detect and confirm security incident
2. **Contain**: Isolate affected systems
3. **Eradicate**: Remove threat and vulnerabilities
4. **Recover**: Restore systems to normal operation
5. **Review**: Post-incident analysis and documentation

---

**Last Updated**: 2026-01-27
**Version**: 1.0
**Status**: Active
