# Subscribe Folder Logging

This document describes the logging strategy used across the `src/subscribe` folder. The strategy is **minimal in steady state, rich on failure** — keeping the CDP log portal lean while preserving everything an on-call needs to diagnose an incident.

## Logging Strategy

The rule applied across every handler and service:

| Layer          | Success path                                                                 | Failure path                                 |
| :------------- | :--------------------------------------------------------------------------- | :------------------------------------------- |
| **Controller** | 1× INFO at entry (`*.requested`) + 1× INFO at terminal outcome (`*.success`) | Entry INFO + 1× ERROR/WARN                   |
| **Service**    | All step-by-step traces at **DEBUG** (not emitted to CDP by default)         | All `warn`/`error` retained at full richness |

**Why:**

- INFO is the floor that CDP receives. Keeping it to two lines per request keeps the portal cheap to query and read.
- DEBUG is opt-in. When you genuinely need step-by-step traces during a live investigation, flip the log level — the events are still there.
- `warn`/`error` are rare (they only fire when something is wrong) so cost is negligible, and they carry full context (operationId, masked contact, error category, etc.).

## Per-endpoint Logs

### `POST /subscribe/generate-otp` — [otp.controller.js](src/subscribe/controllers/otp.controller.js)

**Success (2 INFO):**

```
INFO otp.generate.requested { requestId, phoneNumber, userAgent, ip }
INFO otp.generate.success   { requestId, normalizedPhoneNumber, notificationId, status: "submitted" }
```

**Failure events:**

- `WARN otp.generate.validation_failed` — invalid phone number
- `ERROR otp.generate.notification_failed` — Notify call failed (rich detail logged at service level — see `notify.send_sms_generic.failure`)
- `ERROR otp.generate.unexpected_error` — uncaught exception

### `POST /subscribe/validate-otp` — [otp.controller.js](src/subscribe/controllers/otp.controller.js)

**Success (2 INFO):**

```
INFO otp.validate.requested { requestId, phoneNumber, otpProvided, userAgent, ip }
INFO otp.validate.success   { requestId, normalizedPhoneNumber }
```

**Failure events:**

- `WARN user_contact.validate.document_not_found` — phone not registered
- `WARN user_contact.validate.secret_mismatch` — wrong OTP
- `WARN user_contact.validate.secret_expired` — OTP past expiry
- `WARN user_contact.validate.secret_already_used` — OTP already validated
- `WARN otp.validate.validation_failed` — surfaced from service
- `ERROR otp.validate.unexpected_error` — uncaught exception

### `POST /send-notification` — [notification.controller.js](src/subscribe/controllers/notification.controller.js)

**Success (2 INFO):**

```
INFO notification.send.requested { requestId, contactType, templateId }
INFO notification.send.success   { requestId, notificationId, contactType, alertId, insertedId }
```

The success log fires _after_ the notification detail is persisted to the `user-notification-details` collection, so `insertedId` is captured for audit.

**Failure events:**

- `ERROR notification.send.failed` — lean controller log (`requestId`, `contactType`, `templateId`, `errorName`); rich detail at `notify.send_sms_generic.failure` / `notify.send_email.failure`

HTTP response on failure: **424 Failed Dependency**.

### `POST /subscribe/generate-link` — [email-verification.controller.js](src/subscribe/controllers/email-verification.controller.js)

**Success (2 INFO):**

```
INFO email.generate_link.requested { requestId, emailAddress, alertType, location, userAgent, ip }
INFO email.generate_link.success   { requestId, emailAddress, uuid, notificationId }
```

**Failure events:**

- `ERROR email.generate_link.notification_failed` — Notify call failed (controller still returns 201, so check this log if a user reports a missing email)
- `ERROR email.generate_link.unexpected_error` — uncaught exception

### `GET /subscribe/validate-link/{uuid}` — [validate-link.controller.js](src/subscribe/controllers/validate-link.controller.js)

**Success (2 INFO):**

```
INFO validate_link.requested { requestId, uuid, userAgent, ip }
INFO validate_link.success   { requestId, uuid, emailAddress }
```

**Failure events:**

- `WARN validate_link.validation_failed` — invalid / expired / already-validated UUID (includes `hasData` flag for UI re-prompt logic)
- `ERROR validate_link.unexpected_error` — uncaught exception

### `GET /process-sms-replies` — [sms-reply.controller.js](src/subscribe/controllers/sms-reply.controller.js)

**Success (3 INFO — controller entry/success + service terminal summary):**

```
INFO process_sms_replies.requested { requestId, userAgent, ip }
INFO sms_reply.poll.complete       { total, newMessages, alreadyProcessed }
INFO process_sms_replies.success   { requestId, total, processed }
```

Per-message processing is at DEBUG. Two business events stay at INFO because they are state changes with audit value and very low volume:

- `INFO sms_reply.stop.unsubscribed` — a user was unsubscribed
- `INFO sms_reply.confirmation.sent` — unsubscribe confirmation SMS sent

**Failure events:**

- `WARN sms_reply.stop.user_not_found` — STOP from a phone the backend doesn't know
- `WARN sms_reply.confirmation.no_template` — confirmation template not configured
- `ERROR sms_reply.stop.failure` — backend `/opt-out-sms-alert` returned non-2xx
- `ERROR sms_reply.confirmation.failed` — confirmation SMS dispatch failed
- `ERROR sms_reply.poll.failure` — poll cycle threw
- `ERROR process_sms_replies.failure` — controller-level catch

## Notify-service Error Logging

When the Notify API rejects a request, the rich detail goes to **one log line at the service layer**. The controller-layer error log is intentionally lean — correlate by `requestId`.

**Service-layer events** ([notify-service.js](src/subscribe/services/notify-service.js)):

```
ERROR notify.send_sms.missing_parameters       { operationId, hasTemplateId, hasPhoneNumber }
ERROR notify.send_sms_generic.missing_id       { operationId }
ERROR notify.send_sms_generic.failure          { category, errorType, statusCode, originalError, phoneNumberMasked, templateId }
ERROR notify.send_email.validation_failed      { hasTemplateId, hasEmailAddress, validationErrors }
ERROR notify.send_email.missing_notification_id
ERROR notify.send_email.failure                { statusCode, errorType, category, retriable, notifyResponse, retryRecommended }
ERROR notify.get_status.failure                { operationId, notificationId, statusCode, errorType, category, retriable, originalError }
```

**Error categories** (from `parseNotifyError`):

| Category       | Notify trigger         | Retriable |
| :------------- | :--------------------- | :-------- |
| `unauthorized` | 401                    | No        |
| `forbidden`    | 403                    | No        |
| `rate_limit`   | `RateLimitError`       | Yes       |
| `daily_limit`  | `TooManyRequestsError` | Yes       |
| `bad_request`  | 400                    | No        |
| `server_error` | 5xx                    | Yes       |
| `unknown`      | Anything else          | No        |

## Service-layer DEBUG Events

These are emitted at DEBUG only. To see them in CDP, set the log level to `debug` temporarily for an active investigation. They are not normally visible.

**[otp.service.js](src/subscribe/services/otp.service.js):** `otp.generate.success`, `otp.validate.success`

**[user-contact-service.js](src/subscribe/services/user-contact-service.js):** `user_contact.store.start`, `user_contact.store.executing_upsert`, `user_contact.store.success`, `user_contact.validate.start`, `user_contact.validate.finding_document`, `user_contact.validate.document_found`, `user_contact.validate.marking_as_validated`, `user_contact.validate.success`, `user_contact.get.start`, `user_contact.get.completed`

**[email-verification.service.js](src/subscribe/services/email-verification.service.js):** `email_verification.indexes.created`, `email_verification.store.start`, `email_verification.store.success`, `email_verification.get.start`, `email_verification.get.completed`

**[user-notification-detail.service.js](src/subscribe/services/user-notification-detail.service.js):** `user_notification_detail.store.start`, `user_notification_detail.store.success`

**[notify-service.js](src/subscribe/services/notify-service.js):** `notify.send_sms.start`, `notify.send_sms.calling_notify_api`, `notify.send_sms.api_response_received`, `notify.send_sms.success`, `notify.send_email.start`, `notify.send_email.api_call.calling_notify_api`, `notify.send_email.api_call.api_response_received`, `notify.send_email.success`, `notify.get_status.start`, `notify.get_status.calling_notify_api`, `notify.get_status.success`

**[sms-reply.service.js](src/subscribe/services/sms-reply.service.js):** `sms_reply.poll` (start), `sms_reply.process`, `sms_reply.ignored`, `sms_reply.stop.duplicate_in_batch`

Service-layer INFO events kept (low volume, business audit value):

- `user_contact.cleanup.success` — periodic cleanup result
- `sms_reply.poll.complete` — per-cycle summary (terminal log)
- `sms_reply.stop.unsubscribed` — state change
- `sms_reply.confirmation.sent` — state change

## Security: Data Masking

All sensitive data is masked via [common/helpers/masking-utils.js](src/common/helpers/masking-utils.js):

- **Phone Numbers**: `maskPhoneNumber()` / `maskMsisdn()` — show only last 3 digits (`***123`)
- **Email Addresses**: `maskEmail()` — first 2 chars + domain (`ab***@example.com`)
- **Generic Contacts**: `maskContact()` (auto-detects phone vs email)
- **Template IDs**: `maskTemplateId()`
- **UUIDs**: `maskUuid()` or truncated to first 8 chars
- **OTP Codes**: Never logged

## Request and Operation IDs

- Every controller log carries `requestId` (`x-cdp-request-id` header → `request.info.id` → generated `req_<uuid>`)
- Every service log carries an `operationId` (`store_<uuid>`, `validate_<uuid>`, `gen_<uuid>`, etc.)
- A controller-level `requestId` correlates with the rich service-level error log for the same request

## Debugging Workflows

### OTP request that failed

1. Filter CDP by `requestId`
2. `otp.generate.requested` shows what came in
3. Either `otp.generate.success` (success — done), or one of:
   - `WARN otp.generate.validation_failed` (bad phone)
   - `ERROR otp.generate.notification_failed` (Notify rejected) — then look for `notify.send_sms_generic.failure` with the same `requestId` for `statusCode` / `category` / `errorType`
   - `ERROR otp.generate.unexpected_error` (bug)

### Email link that wasn't received

1. `email.generate_link.requested` → confirms the request reached us
2. `email.generate_link.success` → confirms we asked Notify to send (with `notificationId`)
3. Missing `success` log? → look for `email.generate_link.notification_failed` and the paired `notify.send_email.failure`

### User claims they were not unsubscribed after sending STOP

1. Filter for masked phone number
2. `sms_reply.poll` cycles show the message was seen
3. `sms_reply.stop.unsubscribed` confirms backend opt-out succeeded
4. Absence of this log + presence of `sms_reply.stop.failure` → backend failure
5. `sms_reply.confirmation.sent` confirms we acknowledged to the user

### Notify outage

1. Filter for `notify.*.failure` events
2. Group by `category` (`server_error` / `rate_limit` / `unauthorized`) to triage
3. `retriable: true` events should self-heal; `retriable: false` need code/config fix

## Alerting Recommendations

| Signal             | Condition                                                           | Action                    |
| :----------------- | :------------------------------------------------------------------ | :------------------------ |
| Notify outage      | `notify.*.failure` with `category: server_error` count > N          | Page                      |
| Auth break         | Any `notify.*.failure` with `category: unauthorized` or `forbidden` | Page                      |
| Rate limit hit     | `notify.*.failure` with `category: rate_limit` or `daily_limit`     | Notify, don't page        |
| Persistence broken | Any `user_notification_detail.store.error`                          | Page (audit trail broken) |
| Validation spike   | `*.validation_failed` rate > baseline × 5                           | Investigate               |
| SMS reply broken   | `sms_reply.poll.failure` repeating                                  | Investigate               |
| Generic            | Error rate > 5% in 5min window across `subscribe.*`                 | Investigate               |
