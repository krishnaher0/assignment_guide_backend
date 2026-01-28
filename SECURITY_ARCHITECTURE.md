# Security Architecture Documentation

## ProjectHub - Comprehensive Security Implementation

**Version**: 1.0
**Last Updated**: 2026-01-27
**Status**: Active

---

## Table of Contents
1. [Overview](#overview)
2. [Authentication Architecture](#authentication-architecture)
3. [Authorization & Access Control](#authorization--access-control)
4. [Password Security](#password-security)
5. [Multi-Factor Authentication (MFA)](#multi-factor-authentication-mfa)
6. [Session Management](#session-management)
7. [Data Encryption](#data-encryption)
8. [Payment Security](#payment-security)
9. [Brute-Force Protection](#brute-force-protection)
10. [API Security](#api-security)
11. [Audit Logging](#audit-logging)
12. [Security Headers](#security-headers)
13. [Threat Model](#threat-model)
14. [Security Best Practices](#security-best-practices)

---

## Overview

ProjectHub implements a multi-layered security architecture following industry best practices and OWASP guidelines. The application provides secure user management, transaction processing, and data protection.

### Security Principles
- **Defense in Depth**: Multiple layers of security controls
- **Least Privilege**: Users granted minimal necessary permissions
- **Secure by Default**: Security features enabled by default
- **Zero Trust**: Verify every request and user action
- **Fail Securely**: Errors default to deny access

### Technology Stack
- **Backend**: Node.js + Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Encryption**: bcrypt, AES-256-CBC, SHA-256
- **Security Libraries**: Helmet.js, express-mongo-sanitize, express-rate-limit
- **Payment Gateway**: eSewa (HMAC-SHA256 signatures)

---

## Authentication Architecture

### Registration Flow

```
┌─────────────┐
│   Client    │
│  Register   │
└──────┬──────┘
       │
       ├─► Password Validation (12+ chars, complexity check)
       │
       ├─► HaveIBeenPwned Check (breach detection)
       │
       ├─► bcrypt Hash (salt rounds: 10)
       │
       ├─► Generate 6-digit OTP
       │
       ├─► Hash OTP with SHA-256
       │
       ├─► Store User in Database
       │
       └─► Send Email with OTP (10-min expiry)
```

**Files**:
- `controllers/authController.js` (registerUser)
- `validators/passwordValidator.js`
- `services/emailService.js`

### Login Flow

```
┌─────────────┐
│   Client    │
│    Login    │
└──────┬──────┘
       │
       ├─► Check IP Block (20 failures = 1hr block)
       │
       ├─► Check Account Lockout (5 failures = 30min)
       │
       ├─► CAPTCHA Check (after 3 failures)
       │
       ├─► Rate Limiting (50/15min per IP)
       │
       ├─► Verify Email/Password
       │
       ├─► Check Email Verified
       │
       ├─► Check MFA Enabled
       │   ├─► Yes: Prompt for TOTP/Backup Code
       │   └─► No: Issue JWT Token
       │
       ├─► Create Session (IP, device, location)
       │
       ├─► Set HTTP-Only Cookie (30 days)
       │
       └─► Log Successful Login
```

**Files**:
- `controllers/authController.js` (loginUser)
- `middleware/bruteForceProtection.js`
- `middleware/captchaVerifier.js`
- `middleware/rateLimiter.js`

### Email Verification Flow

```
┌─────────────┐
│   Client    │
│  Enter OTP  │
└──────┬──────┘
       │
       ├─► Hash Provided OTP (SHA-256)
       │
       ├─► Compare with Stored Hash
       │
       ├─► Check Expiry (10 minutes)
       │
       ├─► Mark Email Verified
       │
       ├─► Clear OTP from Database
       │
       ├─► Issue JWT Token
       │
       └─► Log Email Verification
```

**Files**:
- `controllers/authController.js` (verifyOTP)
- `models/User.js`

---

## Authorization & Access Control

### Role-Based Access Control (RBAC)

```
┌──────────────────────────────────────┐
│           User Roles                 │
├──────────────────────────────────────┤
│  • client (student)                  │
│  • developer (team member)           │
│  • worker (legacy)                   │
│  • admin (full access)               │
└──────────────────────────────────────┘
```

### Access Control Matrix

| Resource | Client | Developer | Admin |
|----------|--------|-----------|-------|
| Submit Order | ✅ | ❌ | ✅ |
| View Own Orders | ✅ | ❌ | ✅ |
| View All Orders | ❌ | ❌ | ✅ |
| Accept Tasks | ❌ | ✅ | ✅ |
| View Payments | ✅ | ✅ | ✅ |
| Manage Users | ❌ | ❌ | ✅ |
| View Analytics | ❌ | ❌ | ✅ |
| Manage Settings | ❌ | ❌ | ✅ |

### Middleware Stack

```
┌────────────────────────────────────┐
│        Incoming Request            │
└────────────┬───────────────────────┘
             │
             ├─► protect (JWT verification)
             │   ├─► Verify Token Signature
             │   ├─► Check Token Expiry
             │   └─► Extract User from Token
             │
             ├─► authorize(...roles)
             │   ├─► Check User Role
             │   └─► Allow/Deny Access
             │
             └─► Route Handler
```

**Files**:
- `middleware/authMiddleware.js` (protect, authorize)
- `models/User.js` (role enum)

---

## Password Security

### Password Requirements

```
┌────────────────────────────────────┐
│     Password Requirements          │
├────────────────────────────────────┤
│  • Minimum Length: 12 characters   │
│  • At least 1 uppercase letter     │
│  • At least 1 lowercase letter     │
│  • At least 1 number               │
│  • At least 1 special character    │
│  • zxcvbn Score ≥ 2 (moderate)     │
│  • Not in breach database          │
│  • Password Expiry: 90 days        │
└────────────────────────────────────┘
```

### Password Validation Flow

```
┌─────────────┐
│  Password   │
│   Input     │
└──────┬──────┘
       │
       ├─► Length Check (≥ 12 chars)
       │
       ├─► Complexity Check (regex)
       │
       ├─► Strength Meter (zxcvbn)
       │   ├─► Score 0: Very Weak ❌
       │   ├─► Score 1: Weak ❌
       │   ├─► Score 2: Moderate ✅
       │   ├─► Score 3: Strong ✅
       │   └─► Score 4: Very Strong ✅
       │
       ├─► HaveIBeenPwned API Check
       │   ├─► Generate SHA-1 hash
       │   ├─► Send first 5 chars (k-anonymity)
       │   ├─► Check full hash in response
       │   └─► Reject if found in breach
       │
       └─► Accept/Reject Password
```

**Files**:
- `validators/passwordValidator.js`
- `controllers/authController.js` (registerUser, changePassword, resetPassword)

### Password Storage

```
Plaintext Password
      │
      ├─► bcrypt.genSalt(10)
      │
      ├─► bcrypt.hash(password, salt)
      │
      └─► Store Hash in Database

Example:
$2a$10$N9qo8uLOickgx2ZMRZoMye7L4h2kKZVT2FU.5Wj5F2WgMZJgJYZCW
│ │  │  │                     │
│ │  │  └─ Salt              └─ Hash
│ │  └─ Cost Factor (10)
│ └─ bcrypt version (2a)
└─ Algorithm identifier ($)
```

---

## Multi-Factor Authentication (MFA)

### MFA Architecture

```
┌────────────────────────────────────┐
│         MFA Setup Flow             │
├────────────────────────────────────┤
│  1. Generate TOTP Secret           │
│  2. Encrypt Secret (AES-256-CBC)   │
│  3. Generate QR Code               │
│  4. Display QR + Manual Entry Key  │
│  5. User Scans with Auth App       │
│  6. User Enters 6-digit Code       │
│  7. Verify Code (±2 step window)   │
│  8. Generate 10 Backup Codes       │
│  9. Hash Backup Codes (bcrypt)     │
│  10. Store in Database             │
│  11. Display Codes Once            │
└────────────────────────────────────┘
```

### TOTP Algorithm

```
TOTP = HOTP(K, T)

Where:
  K = Secret Key (base32 encoded)
  T = Time Step (current time / 30 seconds)

Steps:
1. Current Unix Time: 1674567890
2. Time Step (30s): 1674567890 / 30 = 55818929
3. HMAC-SHA1(secret, timeStep)
4. Dynamic Truncation → 6-digit code
5. Code valid for ±2 steps (60s window)
```

### MFA Login Flow

```
┌─────────────┐
│   Client    │
│    Login    │
└──────┬──────┘
       │
       ├─► Standard Auth (email/password)
       │
       ├─► Check mfaEnabled = true
       │
       ├─► Return { mfaRequired: true, userId }
       │
       ├─► Frontend Prompts for Code
       │
       ├─► User Enters 6-digit TOTP
       │   OR
       ├─► User Enters 8-digit Backup Code
       │
       ├─► Verify Code
       │   ├─► TOTP: speakeasy.verify() with window=2
       │   └─► Backup: bcrypt.compare() all codes
       │
       ├─► Remove Used Backup Code
       │
       ├─► Issue JWT Token
       │
       └─► Log MFA Verification
```

**Files**:
- `controllers/mfaController.js`
- `services/otpService.js`
- `models/User.js` (mfaEnabled, mfaSecret, mfaBackupCodes)

---

## Session Management

### Session Architecture

```
┌────────────────────────────────────┐
│       Active Session Object        │
├────────────────────────────────────┤
│  sessionId: random string (13)     │
│  deviceInfo: User-Agent            │
│  ipAddress: Client IP              │
│  location: City, Country (geoip)   │
│  lastActivity: Timestamp           │
└────────────────────────────────────┘

User can have max 5 concurrent sessions
Oldest session removed when limit exceeded
```

### Cookie Configuration

```javascript
Cookie Options:
{
  expires: Date.now() + 30 days,
  httpOnly: true,          // Prevent JS access
  secure: production,      // HTTPS only in prod
  sameSite: 'strict'       // CSRF protection
}

Cookie Format:
token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Session Lifecycle

```
┌─────────────┐
│    Login    │
└──────┬──────┘
       │
       ├─► Generate Session ID
       │
       ├─► Capture Device Info (User-Agent)
       │
       ├─► Capture IP Address
       │
       ├─► Geolocation Lookup (geoip-lite)
       │
       ├─► Create Session Object
       │
       ├─► Push to user.activeSessions[]
       │
       ├─► Limit to 5 Sessions (remove oldest)
       │
       ├─► Track Login Location
       │
       ├─► Detect New Location
       │
       ├─► Send Email Alert (if new location)
       │
       └─► Store in Database
```

### Session Revocation

```
┌─────────────┐
│   Logout    │
└──────┬──────┘
       │
       ├─► Remove Session from activeSessions[]
       │
       ├─► Clear Cookie
       │
       ├─► Log Session Revocation
       │
       └─► Invalidate JWT Token
```

**Files**:
- `controllers/sessionController.js`
- `controllers/authController.js` (login, logout)
- `models/User.js` (activeSessions, loginLocations)

---

## Data Encryption

### Encryption Methods

```
┌────────────────────────────────────────────────┐
│           Encryption Algorithms                │
├────────────────────────────────────────────────┤
│  bcrypt (Salt Rounds: 10)                      │
│    • User Passwords                            │
│    • MFA Backup Codes                          │
│                                                 │
│  AES-256-CBC (256-bit key)                     │
│    • Phone Numbers                             │
│    • MFA Secrets                               │
│    • Random IV per encryption                  │
│                                                 │
│  SHA-256 (Cryptographic Hash)                  │
│    • Password Reset Tokens                     │
│    • Email Verification Tokens                 │
│    • OTP Codes                                 │
│                                                 │
│  HMAC-SHA256 (Message Authentication)          │
│    • Payment Signatures (eSewa)                │
│    • JWT Signatures                            │
└────────────────────────────────────────────────┘
```

### AES-256-CBC Implementation

```
Encryption:
┌─────────────┐
│  Plaintext  │
└──────┬──────┘
       │
       ├─► Generate Random IV (16 bytes)
       │
       ├─► Create AES-256-CBC Cipher
       │   (Key from ENCRYPTION_KEY env var)
       │
       ├─► Encrypt Data
       │
       ├─► Concatenate IV + Encrypted
       │
       └─► Store as Hex String

Decryption:
┌─────────────┐
│  Ciphertext │
└──────┬──────┘
       │
       ├─► Extract IV (first 16 bytes)
       │
       ├─► Extract Encrypted Data
       │
       ├─► Create AES-256-CBC Decipher
       │
       ├─► Decrypt Data
       │
       └─► Return Plaintext
```

**Files**:
- `utils/encryption.js`
- `models/User.js` (phone, mfaSecret with getters/setters)

### Data at Rest

```
┌─────────────────────────────────────┐
│      Encrypted in Database          │
├─────────────────────────────────────┤
│  • Passwords (bcrypt)               │
│  • Phone Numbers (AES-256)          │
│  • MFA Secrets (AES-256)            │
│  • MFA Backup Codes (bcrypt)        │
│  • Reset Tokens (SHA-256)           │
│  • Verification Tokens (SHA-256)    │
│  • OTP Codes (SHA-256)              │
└─────────────────────────────────────┘
```

### Data in Transit

```
┌─────────────────────────────────────┐
│      Protected in Transit           │
├─────────────────────────────────────┤
│  • HTTPS/TLS 1.2+ (All Traffic)     │
│  • HTTP → HTTPS Redirect            │
│  • HSTS Headers (1 year)            │
│  • Secure Cookies (HTTPS only)      │
│  • JWT in HTTP-Only Cookies         │
└─────────────────────────────────────┘
```

---

## Payment Security

### eSewa Integration Architecture

```
┌─────────────┐
│   Client    │
│  Initiates  │
│   Payment   │
└──────┬──────┘
       │
       ├─► Generate Transaction UUID
       │
       ├─► Create Signature String
       │   total_amount={amount},
       │   transaction_uuid={uuid},
       │   product_code={code}
       │
       ├─► HMAC-SHA256(secret, signatureString)
       │
       ├─► Store UUID in Order
       │
       ├─► Log Payment Initiation
       │
       ├─► Redirect to eSewa
       │
       └─► User Completes Payment
              │
              ├─► eSewa Callback
              │
              ├─► Verify Signature
              │
              ├─► Verify UUID Matches
              │
              ├─► Check Status = COMPLETE
              │
              ├─► Prevent Duplicate Payment
              │
              ├─► Update Order Status
              │
              ├─► Update Developer Earnings
              │
              └─► Log Payment Verification
```

### Payment Signature Generation

```
Signature = HMAC-SHA256(secretKey, message)

Message Format (Initiation):
total_amount=1000,transaction_uuid=abc123,product_code=EPAYTEST

Verification Format:
transaction_code=xyz789,status=COMPLETE,total_amount=1000,
transaction_uuid=abc123,product_code=EPAYTEST,
signed_field_names=transaction_code,status,total_amount,
                    transaction_uuid,product_code
```

### Payment Security Controls

```
┌────────────────────────────────────┐
│    Payment Security Controls       │
├────────────────────────────────────┤
│  ✅ Secret Key in Environment Var   │
│  ✅ HMAC-SHA256 Signature           │
│  ✅ Transaction UUID Verification   │
│  ✅ Duplicate Payment Prevention    │
│  ✅ Signature Verification          │
│  ✅ Amount Validation               │
│  ✅ HTTPS Only                      │
│  ✅ Audit Logging                   │
│  ✅ Payment Status Tracking         │
└────────────────────────────────────┘
```

**Files**:
- `controllers/paymentController.js`
- `models/Order.js` (transactionId, transactionUuid, paidAmount)
- `.env` (ESEWA_SECRET_KEY, ESEWA_MERCHANT_CODE)

---

## Brute-Force Protection

### Multi-Layer Defense

```
┌────────────────────────────────────┐
│   Layer 1: Rate Limiting           │
│   50 requests / 15 min per IP      │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│   Layer 2: Account Lockout         │
│   5 failures → 30 min lockout      │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│   Layer 3: IP Blocking             │
│   20 failures → 1 hour block       │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│   Layer 4: CAPTCHA                 │
│   Triggered after 3 failures       │
└────────────────────────────────────┘
```

### Rate Limiting Configuration

```javascript
Login: 50 attempts / 15 minutes / IP
Registration: 3 accounts / 1 hour / IP
Password Reset: 3 requests / 1 hour / IP
MFA Verification: 10 attempts / 15 minutes
General API: 100 requests / 15 minutes / IP
```

### Account Lockout Flow

```
Failed Login Attempt
      │
      ├─► Increment failedLoginAttempts
      │
      ├─► Check if failedLoginAttempts ≥ 5
      │   │
      │   ├─► Yes: Set lockoutUntil = now + 30 min
      │   │         Log Account Lockout
      │   │         Return "Account Locked"
      │   │
      │   └─► No: Continue Login Attempt
      │
      └─► Log Failed Login

Successful Login
      │
      └─► Reset failedLoginAttempts = 0
          Clear lockoutUntil
```

### CAPTCHA Integration

```
┌─────────────┐
│   Login     │
│  Attempt    │
└──────┬──────┘
       │
       ├─► Check failedLoginAttempts ≥ 3
       │
       ├─► Require CAPTCHA Token
       │
       ├─► Verify with Google reCAPTCHA v3
       │   POST https://www.google.com/recaptcha/api/siteverify
       │   {
       │     secret: RECAPTCHA_SECRET_KEY,
       │     response: captchaToken
       │   }
       │
       ├─► Check Score ≥ 0.5
       │   (1.0 = very likely human, 0.0 = very likely bot)
       │
       ├─► Allow Login if Pass
       │
       └─► Block Login if Fail
```

**Files**:
- `middleware/bruteForceProtection.js`
- `middleware/rateLimiter.js`
- `middleware/captchaVerifier.js`
- `models/User.js` (failedLoginAttempts, lockoutUntil)

---

## API Security

### Security Headers (Helmet.js)

```
HTTP Response Headers:
┌────────────────────────────────────────────┐
│  X-Frame-Options: DENY                     │
│    Prevents clickjacking attacks           │
│                                             │
│  X-Content-Type-Options: nosniff           │
│    Prevents MIME-type sniffing             │
│                                             │
│  X-XSS-Protection: 1; mode=block           │
│    Enables browser XSS filter              │
│                                             │
│  Strict-Transport-Security:                │
│    max-age=31536000;                       │
│    includeSubDomains; preload              │
│    Forces HTTPS for 1 year                 │
│                                             │
│  Content-Security-Policy:                  │
│    Restricts resource loading              │
│                                             │
│  Referrer-Policy: no-referrer              │
│    Controls referrer information           │
└────────────────────────────────────────────┘
```

### CORS Configuration

```javascript
Allowed Origins:
  - http://localhost:5173 (dev)
  - http://localhost:3000 (dev)
  - https://www.projecthubnepal.app (prod)
  - https://projecthubnepal.app (prod)

Credentials: true (allow cookies)

Allowed Methods:
  GET, POST, PUT, DELETE, PATCH, OPTIONS

Allowed Headers:
  Content-Type, Authorization
```

### Input Sanitization

```
Request Body
      │
      ├─► MongoDB Sanitize
      │   • Remove $ and . characters
      │   • Prevent NoSQL injection
      │
      ├─► File Upload Validation
      │   • MIME type check
      │   • Extension whitelist
      │   • File size limit
      │   • Filename sanitization
      │
      └─► Request Size Limit
          • JSON: 10MB
          • URL-encoded: 10MB
```

**Files**:
- `index.js` (helmet, CORS, mongoSanitize)
- `middleware/uploadMiddleware.js`

---

## Audit Logging

### Logged Events (18+ Actions)

```
Authentication:
  • login (success/failure)
  • logout
  • login_failed

Password Management:
  • password_change
  • password_reset_request
  • password_reset_complete

MFA:
  • mfa_enabled
  • mfa_disabled
  • mfa_verified
  • mfa_failed

Account Security:
  • account_locked
  • account_unlocked
  • email_verified

Session Management:
  • session_created
  • session_revoked

Profile:
  • profile_updated

Payments:
  • payment_initiated
  • payment_verified
  • payment_verification_failed

Security:
  • security_alert
  • suspicious_activity
```

### Audit Log Schema

```javascript
{
  userId: ObjectId,              // User who performed action
  action: String,                // Action type (enum above)
  ipAddress: String,             // Client IP address
  userAgent: String,             // Browser/device info
  city: String,                  // Geolocation city
  country: String,               // Geolocation country
  latitude: Number,              // GPS coordinates
  longitude: Number,
  status: String,                // success/failure/warning
  severity: String,              // low/medium/high/critical
  details: Mixed,                // Action-specific metadata
  createdAt: Date,               // Timestamp
  updatedAt: Date
}
```

### Indexes for Performance

```javascript
// Compound index for user activity queries
{ userId: 1, createdAt: -1 }

// Index for action-based queries
{ action: 1, createdAt: -1 }

// Index for IP-based queries
{ ipAddress: 1 }
```

### Audit Log Retention

```
- Development: 30 days
- Production: 1 year (recommended)
- Critical Events: 7 years (compliance)
- Sensitive Data: Never logged (passwords, tokens)
```

**Files**:
- `models/AuditLog.js`
- All controllers (logging throughout)

---

## Security Headers

### HTTPS Enforcement

```javascript
// Middleware to redirect HTTP → HTTPS
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' &&
      req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});
```

### HSTS Configuration

```javascript
Strict-Transport-Security:
  max-age=31536000        // 1 year
  includeSubDomains       // Apply to all subdomains
  preload                 // Submit to browser preload list
```

---

## Threat Model

### Identified Threats

#### High Priority
1. **Brute-Force Attacks**
   - **Mitigation**: Rate limiting, account lockout, IP blocking, CAPTCHA

2. **Credential Stuffing**
   - **Mitigation**: MFA, breach detection, unique passwords

3. **Session Hijacking**
   - **Mitigation**: HTTP-only cookies, secure flag, SameSite, short expiry

4. **Payment Fraud**
   - **Mitigation**: Signature verification, duplicate prevention, audit logging

5. **Data Breaches**
   - **Mitigation**: Encryption at rest, HTTPS, access control

#### Medium Priority
6. **SQL/NoSQL Injection**
   - **Mitigation**: MongoDB sanitization, Mongoose validation

7. **XSS Attacks**
   - **Mitigation**: Content-Type headers, input sanitization

8. **CSRF Attacks**
   - **Mitigation**: SameSite cookies, CORS configuration

9. **Man-in-the-Middle (MITM)**
   - **Mitigation**: HTTPS, HSTS, certificate pinning

10. **Privilege Escalation**
    - **Mitigation**: RBAC, route-level authorization

#### Low Priority
11. **Clickjacking**
    - **Mitigation**: X-Frame-Options header

12. **MIME Sniffing**
    - **Mitigation**: X-Content-Type-Options header

### Attack Surface

```
┌────────────────────────────────────┐
│         Attack Surface             │
├────────────────────────────────────┤
│  • Authentication Endpoints        │
│  • Password Reset Flow             │
│  • Payment Processing              │
│  • File Uploads                    │
│  • API Endpoints                   │
│  • WebSocket Connections           │
│  • OAuth Callbacks                 │
└────────────────────────────────────┘
```

---

## Security Best Practices

### Environment Variables

```bash
# NEVER commit .env to git
# Use .env.example as template
# Rotate secrets regularly
# Use strong random keys

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Password Guidelines for Users

```
❌ Avoid:
  - Common passwords (password123, qwerty)
  - Personal information (name, birthday)
  - Dictionary words
  - Repeated characters (aaaaaa)
  - Sequential characters (123456)

✅ Recommended:
  - Use password manager
  - Enable 2FA/MFA
  - Unique password per site
  - 12+ characters
  - Mix of character types
  - Regular password rotation
```

### Developer Security Checklist

- [ ] Never commit secrets to git
- [ ] Use environment variables for config
- [ ] Keep dependencies updated (`npm audit`)
- [ ] Validate all user input
- [ ] Sanitize database queries
- [ ] Use prepared statements
- [ ] Implement proper error handling
- [ ] Log security events
- [ ] Use HTTPS in production
- [ ] Enable security headers
- [ ] Implement rate limiting
- [ ] Use least privilege principle
- [ ] Conduct code reviews
- [ ] Perform security testing
- [ ] Document security architecture

---

## Deployment Security

### Production Checklist

```
┌────────────────────────────────────┐
│     Pre-Deployment Checklist       │
├────────────────────────────────────┤
│  ✅ NODE_ENV=production            │
│  ✅ Secure cookies enabled         │
│  ✅ HTTPS enforced                 │
│  ✅ HSTS headers configured        │
│  ✅ Rate limiting active           │
│  ✅ MongoDB sanitization enabled   │
│  ✅ Helmet.js configured           │
│  ✅ CORS whitelist set             │
│  ✅ Error messages sanitized       │
│  ✅ Logging configured             │
│  ✅ Secrets in environment vars    │
│  ✅ Dependencies audited           │
│  ✅ Security tests passed          │
│  ✅ Backup strategy in place       │
│  ✅ Monitoring configured          │
└────────────────────────────────────┘
```

### Monitoring & Alerts

```
┌────────────────────────────────────┐
│      Security Monitoring           │
├────────────────────────────────────┤
│  • Failed login spikes             │
│  • Account lockouts                │
│  • IP blocks                       │
│  • Payment failures                │
│  • Suspicious activity             │
│  • Error rate increases            │
│  • API rate limit hits             │
│  • Unauthorized access attempts    │
└────────────────────────────────────┘
```

---

## Compliance & Standards

### Standards Compliance

- ✅ **OWASP Top 10**: All vulnerabilities addressed
- ✅ **PCI-DSS**: Payment data security (via eSewa)
- ✅ **GDPR**: User data protection and privacy
- ✅ **ISO 27001**: Information security management
- ✅ **NIST**: Cryptographic standards

### Security Certifications

- [ ] Annual security audit
- [ ] Penetration testing (quarterly)
- [ ] Vulnerability scanning (monthly)
- [ ] Compliance review (annual)

---

## Incident Response Plan

### Response Phases

```
1. Identification
   ├─► Detect security incident
   ├─► Confirm threat
   └─► Assess severity

2. Containment
   ├─► Isolate affected systems
   ├─► Prevent further damage
   └─► Preserve evidence

3. Eradication
   ├─► Remove threat
   ├─► Patch vulnerabilities
   └─► Strengthen defenses

4. Recovery
   ├─► Restore services
   ├─► Verify security
   └─► Monitor for reoccurrence

5. Lessons Learned
   ├─► Document incident
   ├─► Update procedures
   └─► Improve security
```

### Contact Information

```
Security Team: security@projecthub.com
Response Time: 24 hours (critical)
              72 hours (high)
              1 week (medium)
```

---

## Appendix

### File Structure

```
coursework_backend/
├── controllers/
│   ├── authController.js       # Authentication logic
│   ├── mfaController.js        # MFA logic
│   ├── paymentController.js    # Payment processing
│   ├── sessionController.js    # Session management
│   └── userController.js       # User management
│
├── middleware/
│   ├── authMiddleware.js       # JWT & RBAC
│   ├── bruteForceProtection.js # Account lockout & IP blocking
│   ├── captchaVerifier.js      # reCAPTCHA verification
│   └── rateLimiter.js          # Rate limiting
│
├── models/
│   ├── User.js                 # User schema
│   ├── AuditLog.js             # Audit trail
│   └── Order.js                # Payment data
│
├── utils/
│   ├── encryption.js           # AES-256-CBC encryption
│   └── generateToken.js        # JWT generation
│
├── validators/
│   └── passwordValidator.js    # Password validation
│
├── services/
│   ├── emailService.js         # Email notifications
│   └── otpService.js           # TOTP generation
│
├── .env                        # Environment variables (gitignored)
├── .env.example                # Environment template
├── SECURITY_ARCHITECTURE.md    # This document
└── SECURITY_TESTING_CHECKLIST.md
```

### References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [NIST Digital Identity Guidelines](https://pages.nist.gov/800-63-3/)
- [HaveIBeenPwned API](https://haveibeenpwned.com/API/v3)
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- [Helmet.js](https://helmetjs.github.io/)
- [eSewa Developer Docs](https://developer.esewa.com.np/)

---

**Document Version**: 1.0
**Last Review**: 2026-01-27
**Next Review**: 2026-07-27
**Maintained By**: Security Team
