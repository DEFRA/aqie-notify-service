# Subscribe Endpoints

This service provides phone number verification using a 5‑digit OTP (One-Time Password) sent via GOV.UK Notify.
The service now also uses a generic verification store that can support future email link verification.

## Environment Variables

```bash
NOTIFY_API_KEY=your-notify-api-key
NOTIFY_TEMPLATE_ID=your-sms-template-id
NOTIFY_OTP_PERSONALISATION_KEY=otp_code            # matches placeholder in Notify template
NOTIFY_TIMEOUT_MS=8000                             # optional
MONGO_URI=mongodb://localhost:27017/
MONGO_DATABASE=aqie-notify-service
```

## Endpoints

### 1. Generate OTP

POST /subscribe/generate-otp

Generates a cryptographically secure 5‑digit OTP for the supplied UK mobile number, stores it with a 24‑hour expiry, and submits an SMS send request to GOV.UK Notify.

#### Request Body

```json
{
  "phoneNumber": "07123456789"
}
```

Supported input formats (auto-normalised to E.164 +44...):

- 07123456789
- +447123456789
- 447123456789
- With spaces, hyphens, parentheses (they are stripped)

#### Success Response (201 Created)

```json
{
  "notificationId": "aa468012-f444-4a02-ae44-09fc5dbaa0cc",
  "status": "submitted"
}
```

Notes:

- notificationId: Returned from Notify (used for auditing / potential status lookup).
- status: Always "submitted" (does not guarantee delivery).

#### Error Responses

400 Bad Request – Invalid phone number format, missing field, or internal validation failure

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid phone number"
}
```

424 Failed Dependency – Downstream Notify send failure (rate limit, template issue, etc.)

```json
{
  "statusCode": 424,
  "error": "Failed Dependency",
  "message": "Failed to send SMS"
}
```

500 Internal Server Error – Unexpected server failure

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Failed to generate OTP"
}
```

#### Curl Example

```bash
curl -X POST http://localhost:3001/subscribe/generate-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"07123456789"}'
```

### 2. Validate OTP

POST /subscribe/validate-otp

Validates a previously issued OTP for the given phone number. The OTP can be used only once and must not be expired.

#### Request Body

```json
{
  "phoneNumber": "07123456789",
  "otp": "12345"
}
```

#### Success Response (200 OK)

```json
{
  "message": "+447123456789 has been validated successfully"
}
```

#### Error Responses

400 Bad Request – Any of:

- Invalid phone number format
- Invalid OTP format (must be 5 digits)
- OTP expired
- OTP already used
- Phone number not found

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "OTP has expired"
}
```

500 Internal Server Error – Unexpected server failure

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Failed to validate OTP"
}
```

#### Curl Example

```bash
curl -X POST http://localhost:3001/subscribe/validate-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"07123456789","otp":"12345"}'
```

## OTP Characteristics

- Length: 5 digits (10000–99999)
- Generation: crypto.randomInt (cryptographically secure)
- Default Expiry: 24 hours (previously 10 minutes)
- One-Time Use: Marked validated after first successful verification

If you changed the expiry from 10 minutes to 24 hours, update your Notify SMS template text accordingly.

## Notify Integration Notes

- Do not rely on Notify error message text (it may change).
- Internal error classification uses status_code and errors[0].error only.
- Retriable categories (handled upstream): RateLimitError, TooManyRequestsError, 5xx server errors.

## Internal Error Mapping (Generate OTP)

Notify failure -> internal NotifySmsError -> controller maps to 424 Failed Dependency.

Example internal (not returned to client):

```json
{
  "name": "NotifySmsError",
  "message": "FailedToSendSMS",
  "statusCode": 429,
  "errorType": "RateLimitError",
  "category": "rate_limit",
  "retriable": true
}
```

## Database Schema

Collection (generic): user-contact-verifications

Phone OTP rows use:

```javascript
{
  contactType: 'phone',          // future-proof (email link support later)
  contact: '+447123456789',      // normalized E.164
  mode: 'otp',                   // verification mechanism
  secret: '12345',               // the OTP (consider hashing later)
  expiryTime: Date,              // ~24h after creation
  validated: false,
  createdAt: Date,
  updatedAt: Date,
  validatedAt: Date | null
}
```

Indexes:

- Unique: (contactType, contact)
- Lookup: secret (for future email token mode)
- Cleanup: expiryTime + validated

## Validation (Joi Examples)

```javascript
// generate-otp payload
{
  phoneNumber: Joi.string().required()
}

// validate-otp payload
{
  phoneNumber: Joi.string().required(),
  otp: Joi.string().pattern(/^[0-9]{5}$/).required()
}
```

## Security Features

- Normalization of phone numbers
- Cryptographically secure OTP generation
- One-time use semantics
- Expiry enforcement
- Structured error handling (no leaking upstream internals)

## Testing Focus

- Phone number normalization
- OTP expiry logic (24h)
- Single-use enforcement
- Notify send failure mapping to 424
- Validation errors (400)

## Planned Extension (Email Link Verification)

The storage model already supports:

- contactType: 'email'
- mode: 'link'
- secret: random token (e.g. 32 hex chars)
  Future endpoints would:
- POST /subscribe/generate-email-link
- GET /subscribe/verify-email?token=...

(These are not yet exposed.)

## OpenAPI (Excerpt)

```yaml
paths:
  /subscribe/generate-otp:
    post:
      summary: Generate and send an OTP to a phone number
      responses:
        '201':
          description: OTP generated and submission accepted
          content:
            application/json:
              schema:
                type: object
                properties:
                  notificationId: { type: string, format: uuid }
                  status: { type: string, enum: [submitted] }
        '400': { description: Invalid input }
        '424': { description: Downstream Notify failure }
        '500': { description: Internal error }
  /subscribe/validate-otp:
    post:
      summary: Validate an OTP for a phone number
      responses:
        '200':
          description: OTP validated successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  message: { type: string }
        '400': { description: Validation / functional error }
        '500': { description: Internal error }
```

## Change Log (Recent)

- Added 201 Created response with notificationId (replaced previous 204)
- Introduced generic user-contact-verifications schema
- Extended error handling with NotifySmsError classification
- Increased default OTP expiry from 10 minutes to 24
