# SMS Unsubscribe API - Technical Specification

## Document Information

| Field       | Value                            |
| ----------- | -------------------------------- |
| **Service** | AQIE Notify Service              |
| **Feature** | SMS Unsubscribe via STOP Keyword |
| **Version** | 1.0                              |
| **Date**    | February 2026                    |
| **Author**  | Development Team                 |

---

## Table of Contents

1. [Overview](#overview)
2. [Business Requirements](#business-requirements)
3. [Technical Architecture](#technical-architecture)
4. [API Specification](#api-specification)
5. [Data Models](#data-models)
6. [Configuration](#configuration)
7. [Error Handling](#error-handling)
8. [Monitoring & Logging](#monitoring--logging)
9. [Testing Strategy](#testing-strategy)
10. [Deployment](#deployment)

---

## Overview

### Purpose

Enable users to unsubscribe from air quality SMS alerts by replying "STOP" to any alert message. The system automatically processes these replies and removes users from the alert system.

### Scope

- Automated SMS reply processing via GOV.UK Notify
- Integration with Alert Backend Service for user deletion
- Audit trail of all unsubscribe requests
- Configurable polling intervals

### Key Features

- One-step unsubscribe (no confirmation required)
- Automatic deduplication of duplicate STOP messages
- Phone number normalization (+44 prefix)
- Comprehensive audit logging
- Idempotent processing (each message processed exactly once)

---

## Business Requirements

### User Story

```
As a user receiving air quality SMS alerts
I want to reply "STOP" to any alert message
So that I can immediately unsubscribe from future alerts
```

### Acceptance Criteria

1. User sends "STOP" to the SMS sender number
2. System detects the reply within 1 minute (configurable)
3. System calls backend API to delete user
4. User is removed from alert system
5. All actions are logged for audit purposes

### Regulatory Compliance

- **TCPA (US)**: Immediate opt-out required
- **GDPR (EU)**: Right to be forgotten
- **CAN-SPAM Act**: Unsubscribe within 10 business days
- **UK PECR**: Consent withdrawal mechanism

---

## Technical Architecture

### High-Level Flow

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   User      │         │  Notify Service  │         │ Alert Backend   │
│   Phone     │         │  (Service 2)     │         │  (Service 1)    │
└──────┬──────┘         └────────┬─────────┘         └────────┬────────┘
       │                         │                            │
       │ 1. Send "STOP"          │                            │
       ├────────────────────────>│                            │
       │                         │                            │
       │                         │ 2. Poll every 1 min        │
       │                         │ GET /received-texts        │
       │                         ├───────────────>            │
       │                         │                GOV.UK      │
       │                         │<───────────────┤ Notify    │
       │                         │                            │
       │                         │ 3. POST /opt-out-alert     │
       │                         ├───────────────────────────>│
       │                         │                            │
       │                         │ 4. 200 OK (deleted)        │
       │                         │<───────────────────────────┤
       │                         │                            │
       │                         │ 5. Save to MongoDB         │
       │                         │ (audit trail)              │
       │                         │                            │
```

### Components

#### 1. SMS Reply Cron Job

- **File**: `src/plugins/sms-reply-cron.js`
- **Purpose**: Scheduled polling of GOV.UK Notify API
- **Interval**: Configurable (default: 1 minute)
- **Lifecycle**: Starts with server, stops on server shutdown

#### 2. SMS Reply Service

- **File**: `src/subscribe/services/sms-reply.service.js`
- **Purpose**: Business logic for processing SMS replies
- **Responsibilities**:
  - Fetch messages from GOV.UK Notify
  - Normalize phone numbers
  - Deduplicate messages
  - Call backend API
  - Store audit records

#### 3. MongoDB Collection

- **Collection**: `sms_replies`
- **Purpose**: Audit trail and deduplication
- **Indexes**: `messageId` (unique)

---

## API Specification

### Internal API: Process SMS Replies

#### Endpoint

```
GET /process-sms-replies
```

#### Purpose

Manual trigger for SMS reply processing (testing/debugging)

#### Request

```http
GET /process-sms-replies HTTP/1.1
Host: localhost:3000
```

#### Response - Success

```json
{
  "success": true,
  "total": 10,
  "processed": 3
}
```

**Fields:**

- `success` (boolean): Operation status
- `total` (number): Total messages from GOV.UK Notify
- `processed` (number): New messages processed in this run

#### Response - Error

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Failed to process SMS replies"
}
```

#### Status Codes

| Code | Description           |
| ---- | --------------------- |
| 200  | Success               |
| 500  | Internal server error |

---

### External API: Backend Opt-Out

#### Endpoint

```
POST /opt-out-alert
```

#### Purpose

Delete user from alert system (called by Notify Service)

#### Request

```http
POST /opt-out-alert HTTP/1.1
Host: alert-backend:3001
Content-Type: application/json

{
  "phoneNumber": "+447469296586"
}
```

**Fields:**

- `phoneNumber` (string, required): User's phone number with +44 prefix

#### Response - User Deleted (200)

```json
{
  "success": true,
  "phoneNumber": "+447469296586"
}
```

#### Response - User Not Found (404)

```json
{
  "success": false,
  "error": "User not found"
}
```

#### Response - Server Error (500)

```json
{
  "success": false,
  "error": "Failed to opt-out"
}
```

#### Status Codes

| Code | Description               | Action                   |
| ---- | ------------------------- | ------------------------ |
| 200  | User successfully deleted | Mark as `unsubscribed`   |
| 404  | User not found in system  | Mark as `user_not_found` |
| 500  | Server error              | Retry on next poll       |

---

## Data Models

### MongoDB Collection: `sms_replies`

#### Schema

```javascript
{
  _id: ObjectId,
  messageId: String,        // GOV.UK Notify message ID (unique)
  phoneNumber: String,      // Normalized with +44 prefix
  content: String,          // Original message text
  receivedAt: Date,         // When user sent the message
  status: String,           // Processing status
  processedAt: Date         // When we processed it
}
```

#### Status Values

| Status           | Description                             | Backend API Called? |
| ---------------- | --------------------------------------- | ------------------- |
| `unsubscribed`   | User successfully deleted from backend  | Yes (200)           |
| `user_not_found` | User not found in backend               | Yes (404)           |
| `duplicate_stop` | Duplicate STOP in same batch            | No                  |
| `ignored`        | Non-STOP message (e.g., "YES", "HELLO") | No                  |

#### Example Records

**Successful Unsubscribe:**

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

**Duplicate STOP:**

```json
{
  "_id": "6993d2b8f14adcb3f0f6343a",
  "messageId": "445615f9-7cdd-4a66-8478-064d6f018b7a",
  "phoneNumber": "+447459418445",
  "content": "STOP",
  "receivedAt": "2026-02-13T12:19:03.415Z",
  "status": "duplicate_stop",
  "processedAt": "2026-02-17T02:30:16.070Z"
}
```

**Ignored Message:**

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

#### Indexes

```javascript
db.sms_replies.createIndex({ messageId: 1 }, { unique: true })
db.sms_replies.createIndex({ phoneNumber: 1 })
db.sms_replies.createIndex({ status: 1 })
db.sms_replies.createIndex({ processedAt: -1 })
```

---

## Configuration

### Environment Variables

| Variable                                 | Description                 | Default                    | Required |
| ---------------------------------------- | --------------------------- | -------------------------- | -------- |
| `NOTIFY_API_KEY`                         | GOV.UK Notify API key       | -                          | Yes      |
| `NOTIFY_SMS_REPLY_POLL_INTERVAL_MINUTES` | Polling interval in minutes | 1                          | No       |
| `ALERT_BACKEND_URL`                      | Alert backend service URL   | http://localhost:3001      | Yes      |
| `MONGO_URI`                              | MongoDB connection string   | mongodb://127.0.0.1:27017/ | Yes      |
| `MONGO_DATABASE`                         | MongoDB database name       | aqie-notify-service        | Yes      |

### Example Configuration

**Development:**

```bash
NOTIFY_API_KEY=team-xxx-yyy-zzz
NOTIFY_SMS_REPLY_POLL_INTERVAL_MINUTES=1
ALERT_BACKEND_URL=http://localhost:3001
MONGO_URI=mongodb://127.0.0.1:27017/
MONGO_DATABASE=aqie-notify-service
```

### Retry Strategy

| Error Type                | Retry? | Action                                           |
| ------------------------- | ------ | ------------------------------------------------ |
| GOV.UK Notify API timeout | Yes    | Retry on next poll (1 min)                       |
| Backend API 500 error     | Yes    | Message not marked as processed, retry next poll |
| Backend API 404 error     | No     | Mark as `user_not_found`, don't retry            |
| Backend API 200 success   | No     | Mark as `unsubscribed`, don't retry              |
| MongoDB connection error  | Yes    | Logged, retry on next poll                       |

## Monitoring & Logging

### Log Events

#### Info Level

```javascript
// Cron start
{ level: "info", msg: "sms_reply_cron.start" }

// Poll results
{
  level: "info",
  msg: "sms_reply.poll.complete",
  total: 10,
  newMessages: 3,
  alreadyProcessed: 7
}

// Successful unsubscribe
{
  level: "info",
  msg: "sms_reply.stop.unsubscribed",
  phoneNumber: "***586",
  messageId: "4b1429bc-7e5f-474a-..."
}

// Duplicate in batch
{
  level: "info",
  msg: "sms_reply.stop.duplicate_in_batch",
  phoneNumber: "***586",
  messageId: "445615f9-7cdd-4a66-..."
}
```

#### Warning Level

```javascript
// User not found in backend
{
  level: "warn",
  msg: "sms_reply.stop.user_not_found",
  phoneNumber: "***586",
  messageId: "65d5b371-5d1e-4fcf-..."
}
```

#### Error Level

```javascript
// Backend API failure
{
  level: "error",
  msg: "sms_reply.stop.failure",
  phoneNumber: "***586",
  error: "Backend returned 500"
}

// Cron job failure
{
  level: "error",
  msg: "sms_reply_cron.failure",
  error: "Connection refused"
}
```

### Metrics to Monitor

| Metric                           | Description               | Alert Threshold |
| -------------------------------- | ------------------------- | --------------- |
| `sms_replies_processed_total`    | Total messages processed  | -               |
| `sms_replies_unsubscribed_total` | Successful unsubscribes   | -               |
| `sms_replies_errors_total`       | Processing errors         | > 10 per hour   |
| `backend_api_latency_ms`         | Backend API response time | > 5000ms        |
| `notify_api_latency_ms`          | Notify API response time  | > 3000ms        |
| `cron_execution_duration_ms`     | Time to process batch     | > 30000ms       |

### Health Checks

```bash
# Check cron is running
curl http://localhost:3000/health

# Manual trigger to test
curl http://localhost:3000/process-sms-replies
```

---

## Testing Strategy

### Unit Tests

**Test Cases:**

1. Phone number normalization (447469296586 → +447469296586)
2. Message deduplication by messageId
3. Duplicate STOP detection in same batch
4. Backend API 200 response handling
5. Backend API 404 response handling
6. Backend API 500 error handling
7. Ignored message handling (non-STOP)

### Integration Tests

**Test Scenarios:**

1. End-to-end flow: STOP → Backend API → MongoDB
2. Multiple STOPs from same user in one batch
3. User re-subscribes and unsubscribes again
4. GOV.UK Notify API returns old messages (7-day retention)

### Manual Testing

**Test Plan:**

```
1. Send STOP from test phone number
2. Wait 1 minute for cron to run
3. Check logs for "sms_reply.stop.unsubscribed"
4. Verify user deleted from backend DB
5. Verify record in MongoDB with status="unsubscribed"
```

### Deployment Steps

#### 1. Build

```bash
npm install
npm run build  # If applicable
```

#### 2. Set Environment Variables

```bash
export NOTIFY_API_KEY=your-api-key
export ALERT_BACKEND_URL=https://aqie-alert-back-end
export MONGO_URI=mongodb://mongo:27017/
export NOTIFY_SMS_REPLY_POLL_INTERVAL_MINUTES=1
```

### C. Glossary

| Term                | Definition                                                     |
| ------------------- | -------------------------------------------------------------- |
| **messageId**       | Unique identifier assigned by GOV.UK Notify to each SMS        |
| **processedPhones** | In-memory Set to track phones processed in current batch       |
| **Idempotent**      | Processing same message multiple times has same effect as once |
| **Audit Trail**     | Complete history of all SMS replies and actions taken          |
| **Deduplication**   | Preventing duplicate processing of same message                |

---
