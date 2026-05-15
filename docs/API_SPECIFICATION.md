# API Specification

This service exposes endpoints for phone-number verification (OTP), email-address verification (link), generic transactional notifications, and a manual trigger for the SMS-reply processor.

> The SMS-reply cron and STOP/unsubscribe flow are documented separately in [SMS_REPLY_CRON.md](./SMS_REPLY_CRON.md). All log events emitted by these endpoints are catalogued in [LOGGING.md](./LOGGING.md).

## Table of Contents

- [Endpoint Summary](#endpoint-summary)
- [Common Conventions](#common-conventions)
- [1. Generate OTP](#1-generate-otp)
- [2. Validate OTP](#2-validate-otp)
- [3. Generate Email Verification Link](#3-generate-email-verification-link)
- [4. Validate Email Verification Link](#4-validate-email-verification-link)
- [5. Send Generic Notification](#5-send-generic-notification)
- [6. Process SMS Replies (manual trigger)](#6-process-sms-replies-manual-trigger)
- [Mock / Automation Mode](#mock--automation-mode)
- [Database Schemas](#database-schemas)
- [Joi Validation Schemas](#joi-validation-schemas)
- [Internal Error Mapping](#internal-error-mapping)
- [OpenAPI Excerpt](#openapi-excerpt)

## Endpoint Summary

| Method | Path                              | Purpose                                                                              |
| :----- | :-------------------------------- | :----------------------------------------------------------------------------------- |
| POST   | `/subscribe/generate-otp`         | Generate a 5-digit OTP and send via SMS                                              |
| POST   | `/subscribe/validate-otp`         | Validate a previously-issued OTP                                                     |
| POST   | `/subscribe/generate-link`        | Generate a UUID verification link and send via email                                 |
| GET    | `/subscribe/validate-link/{uuid}` | Validate a verification link by UUID                                                 |
| POST   | `/send-notification`              | Send a generic SMS or email via GOV.UK Notify                                        |
| GET    | `/process-sms-replies`            | Manual trigger for the SMS-reply cron — see [SMS_REPLY_CRON.md](./SMS_REPLY_CRON.md) |

## Common Conventions

### Request Tracking

Every endpoint accepts an optional `x-cdp-request-id` header. If absent, the service falls back to `request.info.id`, then `req_<uuid>`. The chosen value flows through every log line as `requestId`.

### Phone Number Formats

The OTP endpoints accept any of the following — all are normalised to E.164 (`+447...`) before storage:

- `07123456789`
- `+447123456789`
- `447123456789`
- With spaces, hyphens or parentheses (stripped)

### Email Normalisation

Email addresses are lowercased and trimmed before storage.

### Masking in Logs

Sensitive values are masked: phone numbers show last 3 digits (`***123`), emails show first 2 chars and domain (`ab***@example.com`), UUIDs are truncated to the first 8 chars. See [LOGGING.md → Data Masking](./LOGGING.md#data-masking).

## 1. Generate OTP

```
POST /subscribe/generate-otp
```

Generates a cryptographically secure 5-digit OTP for the supplied UK mobile number, stores it with a 15-minute expiry, and submits an SMS send request to GOV.UK Notify.

> When `USE_MOCK=true`, the stored OTP is replaced with the fixed value `12345` so automation can validate against a known code. The real OTP is still generated and sent via Notify, **but the SMS code will not work for validation** — only `12345` is accepted. The response shape of this endpoint is unchanged. See [Mock / Automation Mode](#mock--automation-mode).

### Request

```json
{
  "phoneNumber": "07123456789"
}
```

### Success Response (201 Created)

```json
{
  "notificationId": "aa468012-f444-4a02-ae44-09fc5dbaa0cc",
  "status": "submitted"
}
```

`status` is always `"submitted"`; it acknowledges that Notify accepted the send request, not that the SMS was delivered.

### Error Responses

| Status | When                                                                       | Body `message` (example)   |
| :----- | :------------------------------------------------------------------------- | :------------------------- |
| 400    | Invalid phone-number format, missing field, or internal validation failure | `"Invalid phone number"`   |
| 424    | Downstream Notify send failure (rate limit, template issue, server error)  | `"Failed to send SMS"`     |
| 500    | Unexpected server failure                                                  | `"Failed to generate OTP"` |

### Curl

```bash
curl -X POST http://localhost:3001/subscribe/generate-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"07123456789"}'
```

## 2. Validate OTP

```
POST /subscribe/validate-otp
```

Validates a previously-issued OTP. OTPs are single-use and must not be expired.

### Request

```json
{
  "phoneNumber": "07123456789",
  "otp": "12345"
}
```

### Success Response (200 OK)

```json
{
  "message": "+447123456789 has been validated successfully"
}
```

### Error Responses

| Status | When                                                                                                                                  | Body `message` (example)   |
| :----- | :------------------------------------------------------------------------------------------------------------------------------------ | :------------------------- |
| 400    | Invalid phone format, invalid OTP format (must be 5 digits), OTP expired, OTP already used, or phone number not found in the database | `"OTP has expired"`        |
| 500    | Unexpected server failure                                                                                                             | `"Failed to validate OTP"` |

### Curl

```bash
curl -X POST http://localhost:3001/subscribe/validate-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"07123456789","otp":"12345"}'
```

## 3. Generate Email Verification Link

```
POST /subscribe/generate-link
```

Generates a unique verification token (UUID v4), persists it with the original subscription details, and emails the resulting link via GOV.UK Notify. The link has a 15-minute expiry.

### Request

```json
{
  "emailAddress": "user@example.com",
  "alertType": "email",
  "location": "staines",
  "lat": 0.789,
  "long": -0.876
}
```

### Success Response (201 Created)

```json
{
  "message": "Link has been sent to email",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

When `USE_MOCK=true`, the response additionally includes the raw verification token so automation can call `/subscribe/validate-link/{uuid}` without parsing the email:

```json
{
  "message": "Link has been sent to email",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "verificationToken": "550e8400-e29b-41d4-a716-446655440000"
}
```

The `verificationToken` field is **never** included in non-mock environments. See [Mock / Automation Mode](#mock--automation-mode).

> If Notify rejects the send (rate limit, template issue, etc.), the endpoint still returns 201 so the verification record can be re-used by retry tooling. The failure is logged as `email.generate_link.notification_failed`.

### Error Responses

| Status | When                                              | Body `message` (example)                   |
| :----- | :------------------------------------------------ | :----------------------------------------- |
| 400    | Invalid email format or missing required fields   | `"\"emailAddress\" must be a valid email"` |
| 500    | Unexpected server failure (e.g. database failure) | `"Failed to generate verification link"`   |

### Curl

```bash
curl -X POST http://localhost:3001/subscribe/generate-link \
  -H "Content-Type: application/json" \
  -d '{
    "emailAddress":"user@example.com",
    "alertType":"email",
    "location":"staines",
    "lat":0.789,
    "long":-0.876
  }'
```

## 4. Validate Email Verification Link

```
GET /subscribe/validate-link/{uuid}
```

Validates a verification UUID, marks the record as validated, and returns the original subscription payload so the caller can complete the signup.

### Path Parameters

| Name   | Type             | Description                          |
| :----- | :--------------- | :----------------------------------- |
| `uuid` | string (UUID v4) | The token returned in the email link |

### Success Response (200 OK)

```json
{
  "message": "Email validated successfully",
  "emailAddress": "user@example.com",
  "alertType": "email",
  "location": "staines",
  "lat": 0.789,
  "long": -0.876
}
```

### Error Responses

| Status | When                                                  | Body `message` (example)          |
| :----- | :---------------------------------------------------- | :-------------------------------- |
| 400    | Invalid UUID, expired link, or link already validated | `"Verification link has expired"` |
| 500    | Unexpected server failure                             | `"Failed to validate link"`       |

### Curl

```bash
curl -X GET http://localhost:3001/subscribe/validate-link/550e8400-e29b-41d4-a716-446655440000
```

## 5. Send Generic Notification

```
POST /send-notification
```

Sends a generic notification via SMS or email using GOV.UK Notify. The endpoint routes based on whether `phoneNumber` or `emailAddress` is supplied. On success, an audit record is persisted in the `user-notification-details` collection.

### Request — SMS

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

### Request — Email

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

### Success Response (201 Created)

```json
{
  "notificationId": "cc468012-f444-4a02-ae44-09fc5dbaa0cc",
  "status": "submitted"
}
```

### Error Responses

| Status | When                                                                            |
| :----- | :------------------------------------------------------------------------------ |
| 400    | Invalid input (missing both `phoneNumber` and `emailAddress`, missing template) |
| 424    | Downstream Notify send failure                                                  |
| 500    | Unexpected server failure                                                       |

## 6. Process SMS Replies (manual trigger)

```
GET /process-sms-replies
```

Manual trigger that runs one iteration of the SMS-reply poll loop. Intended for testing/debugging — the same logic runs on a 1-minute cron in normal operation.

```json
{
  "success": true,
  "total": 10,
  "processed": 3
}
```

See [SMS_REPLY_CRON.md](./SMS_REPLY_CRON.md) for the full flow, schema, and log events.

## Mock / Automation Mode

The service supports an automation-friendly mode controlled by `USE_MOCK`. It is intended for end-to-end / UI automation suites that cannot read SMS or email inboxes.

### Behaviour when `USE_MOCK=true`

| Flow                                   | Effect                                                                                                                                                                                                                              |
| :------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /subscribe/generate-otp`         | The OTP persisted in `user-contact-details.secret` is replaced with the fixed value `12345`. The real OTP is still generated and sent via Notify. Response shape is unchanged.                                                      |
| OTP expiry                             | Extended from **15 minutes** to **180 minutes (3 hours)** so slow automation runs don't fail mid-flow.                                                                                                                              |
| `POST /subscribe/validate-otp`         | **Only `otp: "12345"` is accepted.** Submitting the real OTP received by SMS will fail with `400 Bad Request` / `"Invalid secret"` — the validation path does a strict compare against the DB value, which is `12345` in mock mode. |
| `POST /subscribe/generate-link`        | Response body adds `verificationToken: <uuid>` so automation can call `/subscribe/validate-link/{uuid}` directly without parsing the email.                                                                                         |
| Email link expiry                      | Extended from **15 minutes** to **180 minutes (3 hours)** for the same reason.                                                                                                                                                      |
| `GET  /subscribe/validate-link/{uuid}` | Unchanged — works against the returned token exactly as it would against a token extracted from a real email.                                                                                                                       |

### Behaviour when `USE_MOCK=false` (default)

All flows behave exactly as documented above. `verificationToken` is never present in responses, the OTP stored in the database is the real, cryptographically generated code, and both OTPs and email links expire after **15 minutes**.

### Environment Guard

`USE_MOCK=true` is rejected at startup in restricted environments. The service will fail to boot with:

```
useMock=true is not permitted in environment '<env>'. Set USE_MOCK=false (or unset it) before starting the service.
```

Restricted environments: **`prod`**, **`ext-test`**.

## Database Schemas

### Collection: `user-contact-details` (OTP)

```javascript
{
  contact: '+447123456789',      // normalized phone (+44...)
  secret: '12345',               // 5-digit OTP (literal '12345' when USE_MOCK=true)
  expiryTime: Date,              // 15 minutes after creation
  validated: false,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: unique on `contact`, cleanup on `expiryTime`, performance on `validated`.

### Collection: `user-email-verification-details` (Email Verification)

```javascript
{
  contact: 'user@example.com',   // normalized email (lowercase)
  secret: 'uuid-v4-string',      // verification token
  expiryTime: Date,              // 15 minutes after creation
  validated: false,
  createdAt: Date,
  updatedAt: Date,
  verificationData: {            // original request payload
    emailAddress: 'user@example.com',
    alertType: 'email',
    location: 'staines',
    lat: 0.789,
    long: -0.876
  }
}
```

Indexes: unique on `contact` and on `secret`.

### Collection: `user-notification-details` (Generic notification audit trail)

Populated on successful sends from `/send-notification`:

```javascript
{
  notificationId: String,        // Notify's notification UUID
  alertId: String,               // caller-supplied alert correlation id
  notifyStatus: String,          // e.g. 'submitted'
  createdAt: Date
}
```

### Collection: `sms_replies` (STOP/unsubscribe audit + dedup)

See [SMS_REPLY_CRON.md → Data Model](./SMS_REPLY_CRON.md#data-model).

## Joi Validation Schemas

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

// generate-link payload
{
  emailAddress: Joi.string().email().required(),
  alertType: Joi.string().required(),
  location: Joi.string().required(),
  lat: Joi.number().required(),
  long: Joi.number().required()
}

// validate-link params
{
  uuid: Joi.string().uuid().required()
}

// send-notification payload (one of phoneNumber/emailAddress required)
{
  phoneNumber: Joi.string().optional(),
  emailAddress: Joi.string().email().optional(),
  templateId: Joi.string().required(),
  personalisation: Joi.object().optional(),
  alertId: Joi.string().optional()
}
```

## Internal Error Mapping

### Notify Send Failures

Notify failures bubble up as `NotifySmsError` / `NotifyEmailError` with a `category` field set by `parseNotifyError()`:

| Category       | Notify trigger         | HTTP status returned | Retriable |
| :------------- | :--------------------- | :------------------- | :-------- |
| `unauthorized` | 401                    | 424                  | No        |
| `forbidden`    | 403                    | 424                  | No        |
| `rate_limit`   | `RateLimitError`       | 424                  | Yes       |
| `daily_limit`  | `TooManyRequestsError` | 424                  | Yes       |
| `bad_request`  | 400                    | 424                  | No        |
| `server_error` | 5xx                    | 424                  | Yes       |
| `unknown`      | Anything else          | 424                  | No        |

Do not rely on Notify error-message text (it changes). The classification uses `status_code` and `errors[0].error` only.

### Example Internal Error (not returned to client)

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

## OpenAPI Excerpt

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
  /subscribe/generate-link:
    post:
      summary: Generate and send an email verification link
      responses:
        '201': { description: Email verification link sent }
        '400': { description: Invalid input }
        '500': { description: Internal error }
  /subscribe/validate-link/{uuid}:
    get:
      summary: Validate an email verification link
      responses:
        '200': { description: Email verified successfully }
        '400': { description: Invalid or expired link }
        '500': { description: Internal error }
  /send-notification:
    post:
      summary: Send a generic notification via SMS or Email
      responses:
        '201': { description: Notification submitted }
        '400': { description: Invalid input }
        '424': { description: Downstream Notify failure }
        '500': { description: Internal error }
  /process-sms-replies:
    get:
      summary: Manual trigger for the SMS reply cron
      responses:
        '200': { description: Poll cycle complete }
        '500': { description: Internal error }
```
