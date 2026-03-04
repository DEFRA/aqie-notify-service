# SMS Unsubscribe Confirmation Implementation

## Flow Diagram

```
User sends "STOP"
    ↓
Cron polls Notify API
    ↓
Call Backend DELETE /opt-out-sms-alert
    ↓
Backend returns 200 OK
    ↓
Save to MongoDB (status: unsubscribed)
    ↓
Send Confirmation SMS ← NEW STEP
    ↓
Log success
```

## Logging

New log events:

| Event                                | Level | Description                        |
| ------------------------------------ | ----- | ---------------------------------- |
| `sms_reply.confirmation.no_template` | warn  | Template ID not configured         |
| `sms_reply.confirmation.sent`        | info  | Confirmation SMS sent successfully |
| `sms_reply.confirmation.failed`      | error | Failed to send confirmation SMS    |

## Testing

### Manual Test

1. Send "STOP" from a test phone number
2. Wait 1 minute for cron to process
3. Check logs for `sms_reply.stop.unsubscribed`
4. Check logs for `sms_reply.confirmation.sent`
5. Verify user receives confirmation SMS
6. Verify user is deleted from backend
7. Verify MongoDB record has `status: "unsubscribed"`

### Test Without Template

1. Don't set `NOTIFY_SMS_UNSUBSCRIBE_CONFIRMATION_TEMPLATE_ID`
2. Send "STOP"
3. Verify unsubscribe still works
4. Check logs for `sms_reply.confirmation.no_template` warning
