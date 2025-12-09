# OTP-Notification Integration Summary

## How It Works Now

### OTP Generation Flow:

1. `POST /subscribe/generate-otp` → `generateOtpHandler()`
2. `otpService.generate()` → Creates OTP, stores in DB
3. `createNotificationService().sendSms()` → Direct service call
4. Returns `{ notificationId, status: 'submitted' }`

### OTP Validation Flow:

1. `POST /subscribe/validate-otp` → `validateOtpHandler()`
2. `otpService.validate()` → Validates OTP against DB
3. Checks expiry, usage status, and marks as validated
4. Returns `{ message: 'Phone number validated successfully' }`

### Generic Notification Flow:

1. `POST /send-notification` → `sendNotificationHandler()`
2. `createNotificationService().send()` → Routes to SMS or Email
3. Uses `notifyService.sendSmsGeneric()` or `sendEmailGeneric()`
4. Returns `{ notificationId, status: 'submitted' }`

### Service Layer:

- **Controllers** use `createNotificationService()` for clean, simplified interface
- **Direct access** to `notifyService` available for advanced use cases (status checking, etc.)

## Usage Examples

### Generate OTP:

```bash
POST /subscribe/generate-otp
{
  "phoneNumber": "+447123456789"
}

# Response
{
  "notificationId": "abc123",
  "status": "submitted"
}
```

### Validate OTP:

```bash
POST /subscribe/validate-otp
{
  "phoneNumber": "+447123456789",
  "otp": "12345"
}

# Response
{
  "message": "+447123456789 has been validated successfully"
}
```

### Send Generic SMS:

```bash
POST /send-notification
{
  "phoneNumber": "+447123456789",
  "templateId": "template-id",
  "personalisation": {
    "code": "12345",
    "location": "London"
  }
}
```

### Send Email:

```bash
POST /send-notification
{
  "emailAddress": "user@example.com",
  "templateId": "email-template-id",
  "personalisation": {
    "link": "https://example.com/verify",
    "name": "John"
  }
}
```
