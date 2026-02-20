# SMS Reply Handling Architecture

## Overview

Service 2 (notify-service) polls GOV.UK Notify API every 1 minute to detect and process SMS replies (STOP).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Service 2 (notify-service)                │
│                                                               │
│  ┌──────────────┐         ┌─────────────────────────────┐  │
│  │  Cron Job    │────────▶│  SMS Reply Service          │  │
│  │  (1 minute)  │         │  - Poll Notify API          │  │
│  └──────────────┘         │  - Detect STOP              │  │
│                            │  - Deduplicate by msg ID    │  │
│                            └─────────────────────────────┘  │
│                                      │                       │
│                                      ▼                       │
│                            ┌─────────────────────────────┐  │
│                            │  MongoDB: sms_replies       │  │
│                            │  - messageId (unique)       │  │
│                            │  - phoneNumber              │  │
│                            │  - status                   │  │
│                            │  - processedAt              │  │
│                            └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                                      │
                                      │ STOP → POST /opt-out-alert
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Service 1 (alert-back-end)                      │
│                                                               │
│  POST /opt-out-alert { phoneNumber }                           │
│  - Delete from Users collection                              │
│  - Return 200 OK                                             │
└─────────────────────────────────────────────────────────────┘
```

## Service 2 Responsibilities

### 1. Continuous Polling

- Runs every 1 minute (configurable)
- Calls `client.getReceivedTexts()` from GOV.UK Notify

### 2. Message Processing

- **STOP**: Call Service 1's `/opt-out-alert` → Mark as `unsubscribed`
- **Other**: Mark as `ignored`

### 3. Deduplication

- Store `messageId` in MongoDB `sms_replies` collection
- Skip already processed messages

## MongoDB Schema

### Collection: `sms_replies`

```javascript
{
  messageId: String,        // Notify message ID (unique)
  phoneNumber: String,      // User's phone number
  content: String,          // Original message text
  receivedAt: Date,         // When Notify received it
  status: String,           // 'unsubscribed' | 'user_not_found' | 'ignored'
  processedAt: Date         // When we processed it
}
```

## Configuration

### Environment Variables

```bash
# GOV.UK Notify
NOTIFY_API_KEY=your-api-key
NOTIFY_SMS_STOP_CONFIRMATION_TEMPLATE_ID=template-id

# Service 1 URL
ALERT_BACKEND_URL=http://alert-backend:3001
```

## API Endpoints

### Manual Trigger (Testing/Debugging)

```
GET /process-sms-replies
```

Response:

```json
{
  "success": true,
  "total": 10,
  "processed": 3
}
```

## Flow Examples

### User sends "STOP"

1. Cron polls Notify API
2. Detects "STOP" message
3. Calls `POST http://alert-backend:3001/opt-out-alert`
4. Stores in DB: `status: 'unsubscribed'` or `'user_not_found'`

## Error Handling

- Failed Notify API calls: Logged, retry on next poll
- Failed Service 1 calls: Logged, message remains unprocessed
- Duplicate messages: Skipped via `messageId` check

## Monitoring

- Log: `sms_reply_cron.start` - Cron job started
- Log: `sms_reply.poll` - Poll results (total messages)
- Log: `sms_reply.stop.unsubscribed` - STOP processed successfully
- Log: `sms_reply.stop.user_not_found` - STOP processed but user not in backend
- Log: `sms_reply_cron.failure` - Cron job error
