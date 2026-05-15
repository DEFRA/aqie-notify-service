# Logging Reference

Ops/debugging reference for log events emitted by this service. Use this doc to find which event names to grep for when investigating an incident, what data each event carries, and which events are worth alerting on.

> See [API_SPECIFICATION.md](./API_SPECIFICATION.md) for endpoint contracts and [SMS_REPLY_CRON.md](./SMS_REPLY_CRON.md) for the inbound-SMS cron architecture.

## Table of Contents

- [Conventions](#conventions)
- [Data Masking](#data-masking)
- [Request & Operation Tracking](#request--operation-tracking)
- [Event Catalogue](#event-catalogue)
  - [Controllers](#controllers)
  - [Services](#services)
- [Debugging Workflows](#debugging-workflows)
- [Common Grep Recipes](#common-grep-recipes)
- [Error Categories](#error-categories)
- [Performance Monitoring](#performance-monitoring)
- [Alerting Recommendations](#alerting-recommendations)

## Conventions

All log lines follow the shape:

```
<event.name> {"requestId":"...", ...JSON context}
```

Event names use dot-namespaced lowercase tokens: `<component>.<action>.<outcome>` (e.g. `otp.generate.success`).

| Suffix               | Meaning                                              |
| :------------------- | :--------------------------------------------------- |
| `.requested`         | Inbound request received at the controller           |
| `.start`             | Processing began (after validation passes)           |
| `.success`           | Operation completed successfully                     |
| `.failed`            | Business-logic failure (handled, returned to client) |
| `.unexpected_error`  | Unhandled exception caught at outer catch            |
| `.validation_failed` | Input validation failure                             |

## Data Masking

Sensitive values are masked via helpers in [common/helpers/masking-utils.js](../src/common/helpers/masking-utils.js):

| Helper                               | Format                                      | Example                    |
| :----------------------------------- | :------------------------------------------ | :------------------------- |
| `maskPhoneNumber()` / `maskMsisdn()` | last 3 digits                               | `***123`                   |
| `maskEmail()`                        | first 2 chars + domain                      | `ab***@example.com`        |
| `maskContact()`                      | auto-detects phone/email                    | —                          |
| `maskTemplateId()`                   | template id                                 | (8-char prefix + ellipsis) |
| `maskUuid()`                         | first 8 chars + ellipsis                    | `550e8400…`                |
| OTP codes                            | **Never logged.** Only the length is shown. |

## Request & Operation Tracking

| Field              | Source                                                                 | Use                                 |
| :----------------- | :--------------------------------------------------------------------- | :---------------------------------- |
| `requestId`        | `x-cdp-request-id` header → `request.info.id` → `req_<uuid>`           | Trace one client request end-to-end |
| `operationId`      | Per-service-call (e.g. `store_<uuid>`, `validate_<uuid>`, `gen_<...>`) | Trace one service operation         |
| `userAgent` / `ip` | Logged at request entry                                                | Audit / incident triage             |
| `apiResponseTime`  | Email notify path                                                      | Performance monitoring              |

## Event Catalogue

### Controllers

#### [otp.controller.js](../src/subscribe/controllers/otp.controller.js)

```
otp.generate.requested        - Initial request received
otp.generate.start            - Processing begins
otp.generate.service_result   - Service operation result
otp.generate.otp_created      - OTP successfully created
otp.generate.notification_start    - Notification sending begins
otp.generate.notification_success  - Notification sent successfully
otp.generate.notification_failed   - Notification sending failed
otp.generate.validation_failed     - Phone validation failed
otp.generate.unexpected_error      - Unexpected error occurred

otp.validate.requested        - Validation request received
otp.validate.start            - Validation processing begins
otp.validate.service_result   - Service validation result
otp.validate.success          - OTP validated successfully
otp.validate.validation_failed     - OTP validation failed
otp.validate.unexpected_error      - Unexpected error occurred
```

#### [notification.controller.js](../src/subscribe/controllers/notification.controller.js)

```
notification.send.requested   - Notification request received
notification.send.success     - Notification sent successfully
notification.send.failed      - Notification sending failed
```

On success, the controller also persists an audit record (`user-notification-details`) — see the `user_notification_detail.*` events under [Services](#services).

#### [email-verification.controller.js](../src/subscribe/controllers/email-verification.controller.js)

```
email.generate_link.requested              - Link generation requested
email.generate_link.start                  - Processing begins
email.generate_link.stored                 - Verification details persisted
email.generate_link.notification_start     - Email sending attempt
email.generate_link.notification_success   - Email sent successfully
email.generate_link.notification_failed    - Email sending failed (still returns 201 to allow retry)
email.generate_link.unexpected_error       - Unexpected error occurred
```

#### [validate-link.controller.js](../src/subscribe/controllers/validate-link.controller.js)

```
validate_link.validation_failed   - Validation failed (invalid / expired / already used)
validate_link.success             - Link validated successfully
validate_link.unexpected_error    - Unexpected error occurred
```

#### [sms-reply.controller.js](../src/subscribe/controllers/sms-reply.controller.js)

Manual trigger for the cron — covered in detail in [SMS_REPLY_CRON.md](./SMS_REPLY_CRON.md#log-events).

```
process_sms_replies.failure   - Polling or processing failed (manual trigger)
```

### Services

#### [otp.service.js](../src/subscribe/services/otp.service.js)

```
otp.generate.success          - Service generation successful
otp.generate.failed           - Service generation failed

otp.validate.success          - Service validation successful
otp.validate.failed           - Service validation failed
```

#### [user-contact-service.js](../src/subscribe/services/user-contact-service.js)

Backs the OTP store; collection `user-contact-details`.

```
user_contact.store.start                    - Storage operation begins
user_contact.store.executing_upsert         - Database upsert operation
user_contact.store.success                  - Storage successful
user_contact.store.error                    - Storage failed

user_contact.validate.start                 - Validation begins
user_contact.validate.finding_document      - Document lookup
user_contact.validate.document_found        - Document retrieved
user_contact.validate.document_not_found    - Document not found
user_contact.validate.secret_mismatch       - Invalid OTP provided
user_contact.validate.secret_expired        - OTP has expired
user_contact.validate.secret_already_used   - OTP already used
user_contact.validate.marking_as_validated  - Marking OTP as used
user_contact.validate.failed_to_mark_validated - Update failed unexpectedly
user_contact.validate.success               - Validation successful
user_contact.validate.error                 - Validation failed

user_contact.get.start                      - User lookup begins
user_contact.get.completed                  - User lookup completed
user_contact.get.error                      - User lookup failed

user_contact.cleanup.success                - Expired secrets cleanup successful
user_contact.cleanup.error                  - Cleanup failed
```

#### [notify-service.js](../src/subscribe/services/notify-service.js)

Wrapper around the GOV.UK Notify SDK.

```
notify.send_sms.start                       - SMS sending begins
notify.send_sms.calling_notify_api          - API call to Notify
notify.send_sms.api_response_received       - Response received from API
notify.send_sms.success                     - SMS sent successfully
notify.send_sms.missing_parameters          - Required parameters missing
notify.send_sms_generic.missing_id          - Notification id missing in response
notify.send_sms_generic.failure             - SMS sending failed

notify.send_email.start                     - Email sending begins
notify.send_email.validation_failed         - Required parameters missing
notify.send_email.api_call.calling_notify_api      - API call to Notify
notify.send_email.api_call.api_response_received   - Response received from API
notify.send_email.success                   - Email sent successfully (includes apiResponseTime)
notify.send_email.missing_notification_id   - Notification id missing in response
notify.send_email.failure                   - Email sending failed

notify.get_status.start                     - Status check begins
notify.get_status.calling_notify_api        - API call to Notify
notify.get_status.success                   - Status retrieved successfully
notify.get_status.failure                   - Status check failed
```

Notify failures are categorised via `parseNotifyError()` — the resulting `category` and `retriable` flag appear in `*.failure` events. See [Error Categories](#error-categories).

#### [email-verification.service.js](../src/subscribe/services/email-verification.service.js)

Backs the email-link flow; collection `user-email-verification-details`.

```
email_verification.indexes.created  - Indexes created successfully
email_verification.indexes.error    - Index creation failed

email_verification.store.start      - Store operation begins
email_verification.store.success    - Store successful (upsert/modified flags)
email_verification.store.error      - Store failed

email_verification.get.start        - Lookup begins
email_verification.get.completed    - Lookup completed (found flag)
email_verification.get.error        - Lookup failed

email_verification.validate.error   - Validate operation failed
```

#### [user-notification-detail.service.js](../src/subscribe/services/user-notification-detail.service.js)

Audit trail for `/send-notification`; collection `user-notification-details`.

```
user_notification_detail.store.start    - Store operation begins
user_notification_detail.store.success  - Store successful (with insertedId)
user_notification_detail.store.error    - Store failed
```

#### [sms-reply.service.js](../src/subscribe/services/sms-reply.service.js)

All inbound SMS reply / cron events — see the complete table in [SMS_REPLY_CRON.md → Log Events](./SMS_REPLY_CRON.md#log-events).

## Debugging Workflows

### Trace a complete OTP flow

1. Find the `requestId` from `otp.generate.requested`.
2. Grep that `requestId` to see: requested → start → service_result → otp_created → notification_start → notification_success.
3. If a service operation looks slow or wrong, grep the `operationId` from the service-level event (e.g. `store_<uuid>`).
4. The corresponding `otp.validate.*` chain runs later when the user submits the code.

### Trace a complete email verification flow

1. `email.generate_link.requested` → `email_verification.store.*` → `notify.send_email.*` → `email.generate_link.notification_success`.
2. Later: `validate_link.success` (or `validate_link.validation_failed` with reason).

### Trace an SMS STOP flow

`sms_reply.poll` → `sms_reply.process` → `sms_reply.stop.unsubscribed` → `sms_reply.confirmation.sent`. See [SMS_REPLY_CRON.md](./SMS_REPLY_CRON.md).

## Common Grep Recipes

### OTP issues

```bash
# All OTP generation attempts for a masked phone
grep "otp.generate" logs | grep "***123"

# Trace a specific service operation
grep "store_<uuid-prefix>" logs
```

### Email verification issues

```bash
# Link generation attempts for a masked email
grep "email.generate_link" logs | grep "ab***@example.com"

# Validation failures (expired / invalid / already used)
grep "validate_link.validation_failed" logs
```

### Notification delivery problems

```bash
# Generic /send-notification failures
grep "notification.send.failed" logs

# Underlying Notify failures (any path)
grep "notify.*failure" logs
```

### SMS reply processing issues

```bash
# STOP failures
grep "sms_reply.stop.failure" logs

# Audit unsubscribe activity
grep "sms_reply.stop.unsubscribed" logs
```

### Database issues

```bash
# All user-contact operations
grep "user_contact" logs

# Notification audit writes
grep "user_notification_detail" logs

# Any validation failure across components
grep "validate.*failed" logs
```

## Error Categories

### Validation errors

- Invalid phone-number format
- Invalid email format
- Missing required parameters
- Invalid UUID format (Joi schema)

### Business-logic errors

- OTP / link expired
- OTP / link already used
- Contact not found
- Invalid OTP provided
- Duplicate STOP from the same phone in a batch

### External-service errors (Notify, categorised by `parseNotifyError`)

| Category       | Retriable | Notes                  |
| :------------- | :-------- | :--------------------- |
| `unauthorized` | No        | 401                    |
| `forbidden`    | No        | 403                    |
| `rate_limit`   | Yes       | `RateLimitError`       |
| `daily_limit`  | Yes       | `TooManyRequestsError` |
| `bad_request`  | No        | 400                    |
| `server_error` | Yes       | 5xx                    |
| `unknown`      | No        | Anything else          |

Also: alert-backend non-2xx (e.g. `/opt-out-sms-alert`), database connection issues, network timeouts.

### System errors

- Unexpected exceptions (`*.unexpected_error`)
- Configuration issues (e.g. missing `notify.unsubscribeConfirmationTemplateId`)
- Resource exhaustion

## Performance Monitoring

Key metrics to track:

- OTP generation time (request → notification sent)
- Email verification link generation time
- Database operation duration
- Notify API response times (the email path emits `apiResponseTime`)
- SMS reply poll-cycle duration
- Validation success/failure rates
- Error rates by operation type

## Alerting Recommendations

| Alert                                                                      | Why                                          |
| :------------------------------------------------------------------------- | :------------------------------------------- |
| Error rate > 5% in 5 min                                                   | Generic health signal                        |
| Notify non-retriable failures (`unauthorized`, `forbidden`, `bad_request`) | Almost always a config/credential regression |
| `*.error` events on any service                                            | DB / external-system failures                |
| Response times > 5s                                                        | Latency degradation                          |
| `*.validation_failed` spikes                                               | Possible upstream contract break or attack   |
| `sms_reply.poll.failure` repeating                                         | Inbound STOP processing is broken            |
| `user_notification_detail.store.error`                                     | Notification audit trail breaking            |

## Log-Analysis Tips

1. Use `requestId` to trace complete user journeys.
2. Use `operationId` to debug specific service operations.
3. Filter by log level to focus on errors/warnings.
4. Search by component: `otp`, `email_verification`, `validate_link`, `notification`, `sms_reply`, `user_contact`, `user_notification_detail`, `notify`.
5. Monitor `retriable` on `notify.*` errors to drive retry tooling.
