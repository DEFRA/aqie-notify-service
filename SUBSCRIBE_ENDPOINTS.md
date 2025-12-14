# Subscribe Endpoints

This service provides phone number verification using a 5‑digit OTP (One-Time Password) sent via GOV.UK Notify.
The service also supports generic notification sending via SMS and email.

## Environment Variables

```bash
NOTIFY_API_KEY=your-notify-api-key
NOTIFY_TEMPLATE_ID=your-sms-template-id
NOTIFY_EMAIL_TEMPLATE_ID=your-email-template-id
NOTIFY_OTP_PERSONALISATION_KEY=code                # matches placeholder in Notify template
NOTIFY_TIMEOUT_MS=15000                            # optional
MONGO_URI=mongodb://localhost:27017/
MONGO_DATABASE=aqie-notify-service
```

## Endpoints

### 1. Generate OTP

POST /subscribe/generate-otp

Generates a cryptographically secure 5‑digit OTP for the supplied UK mobile number, stores it with a 30-minute expiry, and submits an SMS send request to GOV.UK Notify.

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

### 3. Send Generic Notification

POST /send-notification

Sends a generic notification via SMS or Email using GOV.UK Notify.

#### Request Body

```json
{
  "phoneNumber": "07123456789",
  "templateId": "your-template-id",
  "personalisation": {
    "name": "John Doe",
    "code": "12345"
  }
}
```

Or for email:

```json
{
  "emailAddress": "user@example.com",
  "templateId": "your-email-template-id",
  "personalisation": {
    "name": "John Doe",
    "verification_link": "https://example.com/verify"
  }
}
```

#### Success Response (201 Created)

```json
{
  "notificationId": "cc468012-f444-4a02-ae44-09fc5dbaa0cc",
  "status": "submitted"
}
```

#### Error Responses

400 Bad Request – Missing phoneNumber/emailAddress or invalid data
424 Failed Dependency – Notify service failure

#### Curl Example

```bash
curl -X POST http://localhost:3001/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber":"07123456789",
    "templateId":"your-template-id",
    "personalisation":{"code":"12345"}
  }'
```

## OTP Characteristics

- Length: 5 digits (10000–99999)
- Generation: crypto.randomInt (cryptographically secure)
- Default Expiry: 30 minutes
- One-Time Use: Marked validated after first successful verification

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

Collection: user-contact-details

```javascript
{
  contact: '+447123456789',      // normalized phone (+44...) or lowercased email
  secret: '12345',               // OTP (phone) or token (email link)
  expiryTime: Date,              // 30 minutes after creation
  validated: false,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:

- Unique: contact
- Cleanup: expiryTime
- Performance: validated

## Validation (Joi Examples)

```javascript
// generate-otp payload
{
  phoneNumber: Joi.string().required().min(10).max(15).pattern(/^[\+\d\s\-\(\)]+$/)
}

// validate-otp payload
{
  phoneNumber: Joi.string().required().min(10).max(15).pattern(/^[\+\d\s\-\(\)]+$/),
  otp: Joi.string().required().length(5).pattern(/^\d{5}$/)
}

// send-notification payload
{
  phoneNumber: Joi.string().optional(),
  emailAddress: Joi.string().email().optional(),
  templateId: Joi.string().required(),
  personalisation: Joi.object().required()
}.or('phoneNumber', 'emailAddress')
```

## Security Features

- Normalization of phone numbers
- Cryptographically secure OTP generation
- One-time use semantics
- Expiry enforcement
- Structured error handling (no leaking upstream internals)

## Testing Focus

- Phone number normalization
- OTP expiry logic (30 minutes)
- Single-use enforcement
- Notify send failure mapping to 424
- Validation errors (400)

## Logging and Debugging

All endpoints include comprehensive logging with:

- Request IDs for tracing complete user journeys
- Operation IDs for service-level debugging
- Masked sensitive data (phone numbers, emails)
- Detailed error information with stack traces
- Performance timing information

### Log Examples

```
[16:06:06.718] INFO: notification.send.requested [req_123] SMS to ***586 template=abc-123
[16:06:06.718] INFO: notification.send.start [req_123] type=sms
[16:06:06.720] INFO: notify.send_sms.start [sms_456] template=abc-123 phone=xxx586
[16:06:07.343] INFO: notify.send_sms.success [sms_456] notificationId=0118bf31-6f96-4dfa-9746
[16:06:07.343] INFO: notification.send.success [req_123] notificationId=0118bf31-6f96-4dfa-9746 type=sms
```

## OpenAPI (Excerpt)

```yaml
paths:
  /subscribe/generate-otp:
    post:
      summary: Generate and send an OTP to a phone number
      responses:
        '201': { description: OTP generated and SMS submitted }
        '400': { description: Invalid input }
        '424': { description: Downstream Notify failure }
        '500': { description: Internal error }
  /subscribe/validate-otp:
    post:
      summary: Validate an OTP for a phone number
      responses:
        '200': { description: OTP validated successfully }
        '400': { description: Validation / functional error }
        '500': { description: Internal error }
ate and send email verification link
      responses:
        '201': { description: Email verification link sent }
        '400': { description: Invalid input }
        '500': { description: Internal error }
  /send-notification:
    post:
      summary: Send generic notification via SMS or Email
      responses:
        '201': { description: Notification submitted }
        '400': { description: Invalid input }
        '424': { description: Downstream Notify failure }
        '500': { description: Internal error }
```

## Change Log (Recent)

- Added email verification link endpoint (/subscribe/generate-link)
- Added generic notification endpoint (/send-notification)
- Implemented comprehensive logging with request/operation IDs
- Added data masking for security (phone numbers, emails)
- Updated database schema to user-contact-details collection
- Enhanced error handling with detailed stack traces
- Added performance monitoring and timing information
