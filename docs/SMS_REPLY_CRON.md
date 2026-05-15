# SMS Reply Cron

End-to-end design and operations reference for the cron job that polls GOV.UK Notify for inbound SMS replies, unsubscribes users who reply `STOP`, and sends them a confirmation SMS.

> All HTTP endpoints exposed by this service (including the manual cron trigger `GET /process-sms-replies`) are documented in [API_SPECIFICATION.md](./API_SPECIFICATION.md). Every log event mentioned below is catalogued in [LOGGING.md](./LOGGING.md).

## Table of Contents

- [Overview](#overview)
- [Why this exists](#why-this-exists)
- [Architecture](#architecture)
- [Components](#components)
- [Poll Cycle Flow](#poll-cycle-flow)
- [Configuration](#configuration)
- [Data Model](#data-model)
- [API Contracts](#api-contracts)
- [Error Handling & Retry Strategy](#error-handling--retry-strategy)
- [Log Events](#log-events)
- [Monitoring & Alerts](#monitoring--alerts)
- [Testing](#testing)

## Overview

GOV.UK Notify lets recipients reply to SMS messages. This service polls Notify on a schedule, detects replies of `STOP`, removes the user from the alert-backend (Service 1) and sends a confirmation SMS back.

| Trigger        | Default | Configurable via                         |
| :------------- | :------ | :--------------------------------------- |
| Poll interval  | 1 min   | `NOTIFY_SMS_REPLY_POLL_INTERVAL_MINUTES` |
| Cron enabled   | true    | `NOTIFY_SMS_REPLY_POLL_ENABLED`          |
| Manual trigger | n/a     | `GET /process-sms-replies`               |

## Why this exists

Regulatory compliance for transactional SMS:

- **UK PECR** — consent withdrawal mechanism
- **GDPR** — right to be forgotten
- **TCPA / CAN-SPAM** (if any US/cross-border recipients) — immediate opt-out

Functional requirements:

- Detect `STOP` within the configured polling window (default 1 minute)
- Remove the user from the alert system (call backend service)
- Send confirmation SMS so the user knows the unsubscribe succeeded
- Maintain an audit trail of every inbound SMS the service has processed
- Be idempotent — Notify returns 7 days of replies on every poll, so the same message will be seen many times

## Architecture

```
┌─────────────┐         ┌──────────────────────────────┐         ┌─────────────────┐
│   User      │         │  aqie-notify-service         │         │ alert-back-end  │
│   Phone     │         │  (this service)              │         │  (Service 1)    │
└──────┬──────┘         └────────┬─────────────────────┘         └────────┬────────┘
       │                         │                                        │
       │ 1. Send "STOP"          │                                        │
       ├────────────────────────▶│                                        │
       │                         │                                        │
       │                         │ 2. Poll Notify every 1 min             │
       │                         │    client.getReceivedTexts()           │
       │                         │  ───────────────▶ GOV.UK Notify        │
       │                         │  ◀───────────────                      │
       │                         │                                        │
       │                         │ 3. For each STOP (new, deduped):       │
       │                         │    DELETE /opt-out-sms-alert           │
       │                         │  ─────────────────────────────────────▶│
       │                         │  ◀───────────────────────────────  200 │
       │                         │                                        │
       │                         │ 4. Persist to MongoDB                  │
       │                         │    (sms_replies — audit + dedup)       │
       │                         │                                        │
       │  5. Confirmation SMS    │                                        │
       │◀────────────────────────│                                        │
       │  "You've unsubscribed"  │                                        │
```

## Components

### Cron plugin

- **File**: [src/plugins/sms-reply-cron.js](../src/plugins/sms-reply-cron.js)
- Registered as a Hapi plugin; starts when the server starts.
- Disabled by setting `NOTIFY_SMS_REPLY_POLL_ENABLED=false` — useful for local dev or running automation tests against a clean service.
- Cleans up the `setInterval` handle on Hapi's `stop` event.

### Service

- **File**: [src/subscribe/services/sms-reply.service.js](../src/subscribe/services/sms-reply.service.js)
- Pure business logic. Exposed methods:
  - `pollAndProcessReplies()` — one poll cycle
  - `processMessage(msg)` — route a single inbound SMS
  - `handleStop(msg)` — call backend opt-out, persist outcome, send confirmation
  - `isProcessed(messageId)` / `markProcessed(...)` — dedup via `sms_replies`
  - `sendUnsubscribeConfirmation(phoneNumber)` — confirmation SMS

### Manual trigger controller

- **File**: [src/subscribe/controllers/sms-reply.controller.js](../src/subscribe/controllers/sms-reply.controller.js)
- Backs `GET /process-sms-replies` — runs one iteration of the same logic for testing/debugging.

## Poll Cycle Flow

1. Fetch up to N most recent received messages from Notify (`client.getReceivedTexts()`).
2. For each message: check `sms_replies.messageId` — if already present, skip.
3. Normalise the phone number to E.164 (`+44...`).
4. Classify:
   - `STOP` (case-insensitive, trimmed) → handle as opt-out.
   - Anything else → mark as `ignored` and persist for audit.
5. For STOPs:
   - If this batch already processed the same number, mark as `duplicate_stop` and skip the backend call.
   - Otherwise call `DELETE {ALERT_BACKEND_URL}/opt-out-sms-alert` with `{ phoneNumber }`.
   - Persist outcome (see [Status Values](#status-values)).
   - If `unsubscribed`, send the confirmation SMS using `NOTIFY_SMS_UNSUBSCRIBE_CONFIRMATION_TEMPLATE_ID`. If the template id is not configured the confirmation is skipped with a `sms_reply.confirmation.no_template` warning — the unsubscribe itself still succeeds.

## Configuration

### Environment Variables

| Variable                                          | Description                                                         | Default                 | Required    |
| :------------------------------------------------ | :------------------------------------------------------------------ | :---------------------- | :---------- |
| `NOTIFY_API_KEY`                                  | GOV.UK Notify API key                                               | —                       | Yes         |
| `NOTIFY_SMS_REPLY_POLL_ENABLED`                   | Enable/disable the cron job                                         | `true`                  | No          |
| `NOTIFY_SMS_REPLY_POLL_INTERVAL_MINUTES`          | Poll interval                                                       | `1`                     | No          |
| `NOTIFY_SMS_UNSUBSCRIBE_CONFIRMATION_TEMPLATE_ID` | Notify SMS template id for the unsubscribe confirmation             | (default test template) | Recommended |
| `ALERT_BACKEND_URL`                               | Base URL of the alert backend (Service 1) that owns subscriber data | `http://localhost:3001` | Yes         |
| `MONGO_URI` / `MONGO_DATABASE`                    | MongoDB connection                                                  | service defaults        | Yes         |

If the confirmation template id is unset, unsubscribes still complete; only the confirmation SMS is skipped.

### Example Local Configuration

```bash
NOTIFY_API_KEY=team-xxx-yyy-zzz
NOTIFY_SMS_REPLY_POLL_ENABLED=true
NOTIFY_SMS_REPLY_POLL_INTERVAL_MINUTES=1
NOTIFY_SMS_UNSUBSCRIBE_CONFIRMATION_TEMPLATE_ID=6cd8b976-cd8b-4249-951a-edf4b5dbdc53
ALERT_BACKEND_URL=http://localhost:3001
MONGO_URI=mongodb://127.0.0.1:27017/
MONGO_DATABASE=aqie-notify-service
```

## Data Model

### Collection: `sms_replies`

```javascript
{
  _id: ObjectId,
  messageId: String,        // GOV.UK Notify message id — unique
  phoneNumber: String,      // normalized with +44 prefix
  content: String,          // original message body
  receivedAt: Date,         // when Notify received the message
  status: String,           // see Status Values below
  processedAt: Date         // when this service processed it
}
```

### Status Values

| Status           | Meaning                                      | Backend opt-out call? | Confirmation SMS? |
| :--------------- | :------------------------------------------- | :-------------------- | :---------------- |
| `unsubscribed`   | User successfully removed from the backend   | Yes — returned 200    | Yes               |
| `user_not_found` | Backend returned 404 (user already gone)     | Yes — returned 404    | No                |
| `duplicate_stop` | Same phone number processed earlier in batch | No                    | No                |
| `ignored`        | Non-STOP message (e.g. "YES", "HELLO")       | No                    | No                |

### Indexes

```javascript
db.sms_replies.createIndex({ messageId: 1 }, { unique: true })
db.sms_replies.createIndex({ phoneNumber: 1 })
db.sms_replies.createIndex({ status: 1 })
db.sms_replies.createIndex({ processedAt: -1 })
```

### Example Records

**Successful unsubscribe**

```json
{
  "_id": "6993d2b8f14adcb3f0f63439",
  "messageId": "4b1429bc-7e5f-474a-8ad8-a1f92c2bf061",
  "phoneNumber": "+447459418445",
  "content": "STOP",
  "receivedAt": "2026-02-16T18:37:34.676Z",
  "status": "unsubscribed",
  "processedAt": "2026-02-17T02:30:16.062Z"
}
```

**Ignored message**

```json
{
  "_id": "6993d4cc7584038a31184c54",
  "messageId": "65d5b371-5d1e-4fcf-b0e1-fd9f6f8be516",
  "phoneNumber": "+447469296586",
  "content": "YES",
  "receivedAt": "2026-02-17T00:36:32.149Z",
  "status": "ignored",
  "processedAt": "2026-02-17T02:39:08.036Z"
}
```

## API Contracts

### External call — Alert Backend Opt-Out

The service calls the alert backend to remove a user:

```http
DELETE {ALERT_BACKEND_URL}/opt-out-sms-alert
Content-Type: application/json

{ "phoneNumber": "+447469296586" }
```

| Backend status | Local action                          | Final `sms_replies.status` |
| :------------- | :------------------------------------ | :------------------------- |
| 200 OK         | Send confirmation SMS                 | `unsubscribed`             |
| 404 Not Found  | Skip confirmation                     | `user_not_found`           |
| 5xx            | Do NOT mark processed; retry next run | (no row written)           |

### Internal trigger — `GET /process-sms-replies`

See [API_SPECIFICATION.md → 6. Process SMS Replies](./API_SPECIFICATION.md#6-process-sms-replies-manual-trigger).

## Error Handling & Retry Strategy

| Failure                  | Retried? | How                                                               |
| :----------------------- | :------- | :---------------------------------------------------------------- |
| Notify API down/timeout  | Yes      | Whole poll cycle fails; next cron tick re-fetches                 |
| Backend 5xx              | Yes      | Message not written to `sms_replies` — next cycle re-processes    |
| Backend 404              | No       | Recorded as `user_not_found`; treated as terminal state           |
| Confirmation SMS failure | No       | Unsubscribe itself is durable; failure logged, no retry attempted |
| MongoDB connection error | Yes      | Cycle fails, next cron tick re-attempts                           |
| Duplicate `messageId`    | No       | Unique index prevents double-processing                           |

A poll cycle is idempotent: re-running it produces the same end state. The only externally visible side-effects from a duplicate run are extra `sms_reply.poll.complete` log lines.

## Log Events

| Event                                | Level | Meaning                                                          |
| :----------------------------------- | :---- | :--------------------------------------------------------------- |
| `sms_reply_cron.registered`          | info  | Plugin registered, cron started                                  |
| `sms_reply_cron.disabled`            | info  | `NOTIFY_SMS_REPLY_POLL_ENABLED=false`, cron not started          |
| `sms_reply_cron.start`               | info  | A poll tick has begun                                            |
| `sms_reply_cron.stopped`             | info  | Server stopped; interval cleared                                 |
| `sms_reply_cron.failure`             | error | A poll tick threw an error                                       |
| `sms_reply.poll`                     | info  | Polled Notify; includes `totalMessages`                          |
| `sms_reply.poll.complete`            | info  | Cycle finished — `total`, `newMessages`, `alreadyProcessed`      |
| `sms_reply.poll.failure`             | error | Poll cycle failed inside the service                             |
| `sms_reply.process`                  | info  | Processing a single message                                      |
| `sms_reply.ignored`                  | info  | Non-STOP message recorded as `ignored`                           |
| `sms_reply.stop.duplicate_in_batch`  | info  | STOP from a number already processed earlier in the same batch   |
| `sms_reply.stop.unsubscribed`        | info  | User unsubscribed; confirmation SMS will be attempted            |
| `sms_reply.stop.user_not_found`      | warn  | Backend returned 404 — user not in subscriber list               |
| `sms_reply.stop.failure`             | error | Backend call or DB write failed                                  |
| `sms_reply.confirmation.no_template` | warn  | Confirmation template id not configured                          |
| `sms_reply.confirmation.sent`        | info  | Confirmation SMS sent                                            |
| `sms_reply.confirmation.failed`      | error | Confirmation SMS send failed (unsubscribe itself was successful) |

All events mask the phone number (`***586`). See [LOGGING.md → Data Masking](./LOGGING.md#data-masking).

## Monitoring & Alerts

Recommended alerts:

- `sms_reply_cron.failure` or `sms_reply.poll.failure` repeating — inbound STOP processing is broken
- `sms_reply.stop.failure` rate spike — backend or Notify regression
- `sms_reply.confirmation.failed` rate spike — separate from unsubscribe failure; safer-to-defer
- `sms_reply.stop.user_not_found` rate spike — possible drift between backend and Notify

Metrics worth tracking:

| Metric                           | Description                 | Alert threshold |
| :------------------------------- | :-------------------------- | :-------------- |
| `sms_replies_processed_total`    | Total messages processed    | —               |
| `sms_replies_unsubscribed_total` | Successful unsubscribes     | —               |
| `sms_replies_errors_total`       | Processing errors           | > 10 per hour   |
| `backend_api_latency_ms`         | Alert-backend response time | > 5000ms        |
| `notify_api_latency_ms`          | Notify response time        | > 3000ms        |
| `cron_execution_duration_ms`     | Time to process one batch   | > 30000ms       |

### Health checks

```bash
# Service alive
curl http://localhost:3001/health

# Manually trigger one cycle (useful in tests)
curl http://localhost:3001/process-sms-replies
```

## Testing

### Manual

1. Send `STOP` from a test phone number registered with Notify.
2. Wait up to one minute (or hit `GET /process-sms-replies`).
3. Confirm logs: `sms_reply.poll.complete` → `sms_reply.stop.unsubscribed` → `sms_reply.confirmation.sent`.
4. Confirm the user is removed from the alert backend.
5. Confirm `sms_replies` has a row with `status: "unsubscribed"`.
6. Confirm the user receives the confirmation SMS.

### Without a confirmation template

1. Unset `NOTIFY_SMS_UNSUBSCRIBE_CONFIRMATION_TEMPLATE_ID`.
2. Send `STOP`.
3. Confirm unsubscribe still succeeds and `sms_reply.confirmation.no_template` is logged.

### Unit / integration coverage

Covered scenarios in [src/subscribe/services/sms-reply.service.test.js](../src/subscribe/services/sms-reply.service.test.js):

- Phone normalisation
- Dedup by `messageId`
- Duplicate STOP within a single batch
- Backend 200 / 404 / 500 handling
- Ignored non-STOP messages

Cron plugin coverage lives in [src/plugins/sms-reply-cron.test.js](../src/plugins/sms-reply-cron.test.js) — interval registration, disable flag, cleanup on `stop` event.

## Glossary

| Term                | Definition                                                    |
| :------------------ | :------------------------------------------------------------ |
| **messageId**       | Unique identifier assigned by GOV.UK Notify to each SMS       |
| **processedPhones** | In-memory `Set` used to detect duplicate STOPs within a batch |
| **Idempotent**      | Re-running the cycle has the same effect as running it once   |
| **Audit Trail**     | Complete history of inbound SMS in `sms_replies` collection   |
| **Deduplication**   | Skipping messages whose `messageId` is already in MongoDB     |
