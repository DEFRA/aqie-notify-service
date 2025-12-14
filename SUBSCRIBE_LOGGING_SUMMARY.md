# Subscribe Folder Logging Enhancements

This document summarizes the comprehensive logging enhancements added to all files in the `src/subscribe` folder for better debugging and root cause analysis.

## Enhanced Files

### Controllers

#### 1. `controllers/otp.controller.js`

**Enhanced Functions:**

- `generateOtpHandler()` - OTP generation endpoint
- `validateOtpHandler()` - OTP validation endpoint

**Logging Added:**

- Request entry with masked phone numbers and request metadata
- Service operation tracking with success/failure states
- OTP creation confirmation (length only, not the actual OTP)
- Notification sending attempts and results
- Validation failures with specific error reasons
- Comprehensive error handling with stack traces

**Key Log Events:**

```
otp.generate.requested - Initial request received
otp.generate.start - Processing begins
otp.generate.service_result - Service operation result
otp.generate.otp_created - OTP successfully created
otp.generate.notification_start - Notification sending begins
otp.generate.notification_success - Notification sent successfully
otp.generate.notification_failed - Notification sending failed
otp.generate.validation_failed - Phone validation failed
otp.generate.unexpected_error - Unexpected error occurred

otp.validate.requested - Validation request received
otp.validate.start - Validation processing begins
otp.validate.service_result - Service validation result
otp.validate.success - OTP validated successfully
otp.validate.validation_failed - OTP validation failed
otp.validate.unexpected_error - Unexpected error occurred
```

#### 2. `controllers/notification.controller.js`

**Enhanced Functions:**

- `sendNotificationHandler()` - Generic notification sending endpoint

**Logging Added:**

- Request tracking with masked contact details
- Contact type detection (SMS vs Email)
- Template ID and personalisation key tracking
- Success/failure states with notification IDs
- Comprehensive error information

**Key Log Events:**

```
notification.send.requested - Notification request received
notification.send.start - Processing begins
notification.send.success - Notification sent successfully
notification.send.failed - Notification sending failed
```

#### 3. `controllers/link.controller.js`

**Enhanced Functions:**

- `generateLinkHandler()` - Email verification link generation

**Logging Added:**

- Request tracking with masked email addresses
- Email validation results
- Verification email sending attempts
- Location name and verification URL tracking
- Error handling with detailed context

**Key Log Events:**

```
link.generate.requested - Link generation requested
link.generate.start - Processing begins
link.generate.validation_result - Email validation result
link.generate.sending_email - Email sending attempt
link.generate.email_sent - Email sent successfully
link.generate.email_failed - Email sending failed
link.generate.validation_failed - Email validation failed
link.generate.unexpected_error - Unexpected error occurred
```

### Services

#### 1. `services/otp.service.js`

**Enhanced Functions:**

- `generate()` - OTP generation service
- `validate()` - OTP validation service

**Logging Added:**

- Operation ID tracking for each service call
- Phone number validation steps
- OTP creation and storage operations
- Database interaction results
- Detailed error tracking with stack traces

**Key Log Events:**

```
otp.service.generate.start - Service generation begins
otp.service.generate.validating_phone - Phone validation step
otp.service.generate.phone_normalized - Phone number normalized
otp.service.generate.creating_otp - OTP creation step
otp.service.generate.storing_otp - Database storage step
otp.service.generate.success - Service operation successful
otp.service.generate.error - Service operation failed

otp.service.validate.start - Service validation begins
otp.service.validate.validating_phone - Phone validation step
otp.service.validate.phone_normalized - Phone number normalized
otp.service.validate.checking_otp - OTP verification step
otp.service.validate.success - Service operation successful
otp.service.validate.error - Service operation failed
```

#### 2. `services/user-contact-service.js`

**Enhanced Functions:**

- `storeVerificationDetails()` - Store OTP in database
- `validateSecret()` - Validate stored OTP
- `getUserByContact()` - Retrieve user by contact

**Logging Added:**

- Operation ID tracking for database operations
- Document upsert/update tracking
- Validation step-by-step logging
- Expiry time checking
- Already-used OTP detection
- Database operation results

**Key Log Events:**

```
user_contact.store.start - Storage operation begins
user_contact.store.executing_upsert - Database upsert operation
user_contact.store.success - Storage successful
user_contact.store.error - Storage failed

user_contact.validate.start - Validation begins
user_contact.validate.finding_document - Document lookup
user_contact.validate.document_found - Document retrieved
user_contact.validate.document_not_found - Document not found
user_contact.validate.secret_mismatch - Invalid OTP provided
user_contact.validate.secret_expired - OTP has expired
user_contact.validate.secret_already_used - OTP already used
user_contact.validate.marking_as_validated - Marking OTP as used
user_contact.validate.success - Validation successful
user_contact.validate.error - Validation failed

user_contact.get.start - User lookup begins
user_contact.get.completed - User lookup completed
user_contact.get.error - User lookup failed
```

#### 3. `services/notify-service.js`

**Enhanced Functions:**

- `sendSmsGeneric()` - Generic SMS sending
- `sendEmailGeneric()` - Generic email sending
- `getNotificationStatus()` - Check notification status

**Logging Added:**

- Operation ID tracking for external API calls
- Masked contact details for security
- GOV.UK Notify API request/response tracking
- Error categorization and retry information
- Performance and timing information

**Key Log Events:**

```
notify.send_sms.start - SMS sending begins
notify.send_sms.calling_notify_api - API call to Notify service
notify.send_sms.api_response_received - Response received from API
notify.send_sms.success - SMS sent successfully
notify.send_sms.failure - SMS sending failed
notify.send_sms.missing_parameters - Required parameters missing
notify.send_sms.missing_notification_id - Notification ID missing

notify.send_email.start - Email sending begins
notify.send_email.calling_notify_api - API call to Notify service
notify.send_email.api_response_received - Response received from API
notify.send_email.success - Email sent successfully
notify.send_email.failure - Email sending failed

notify.get_status.start - Status check begins
notify.get_status.calling_notify_api - API call to Notify service
notify.get_status.success - Status retrieved successfully
notify.get_status.failure - Status check failed
```

#### 4. `services/link.service.js`

**Enhanced Functions:**

- `validateEmail()` - Email format validation

**Logging Added:**

- Operation ID tracking
- Email format validation steps
- Masked email addresses for security
- Validation results and error handling

**Key Log Events:**

```
link.service.validate_email.start - Email validation begins
link.service.validate_email.checking_format - Format validation step
link.service.validate_email.success - Email validation successful
link.service.validate_email.invalid_format - Invalid email format
link.service.validate_email.error - Validation error occurred
```

## Security Features

### Data Masking

All sensitive data is automatically masked in logs:

- **Phone Numbers**: Show only last 3 digits (`***123`)
- **Email Addresses**: Show first 2 characters and domain (`ab***@example.com`)
- **OTP Codes**: Never logged, only length is shown

### Request Tracking

Every request includes:

- `requestId` from `x-cdp-request-id` header
- User agent and IP address
- Timestamp and operation context

### Operation Tracking

Each service operation includes:

- Unique `operationId` for tracing
- Step-by-step execution logging
- Success/failure states
- Performance timing information

## Debugging Workflows

### Trace a Complete OTP Flow

1. Search for `requestId` in logs to see the complete request flow
2. Use `operationId` to trace service-level operations
3. Follow the sequence: request → validation → generation → storage → notification

### Common Debug Scenarios

#### OTP Generation Issues

```bash
# Find all OTP generation attempts for a phone number
grep "otp.generate" logs | grep "***123"

# Trace a specific operation
grep "gen_1234567890_abc123" logs
```

#### Notification Delivery Problems

```bash
# Find notification failures
grep "notification.*failed" logs

# Check Notify API issues
grep "notify.*failure" logs
```

#### Database Issues

```bash
# Find user contact operations
grep "user_contact" logs

# Check validation failures
grep "validate.*failed" logs
```

## Performance Monitoring

Key metrics to track:

- OTP generation time (from request to notification sent)
- Database operation duration
- Notify API response times
- Validation success/failure rates
- Error rates by operation type

## Error Categories

### Validation Errors

- Invalid phone number format
- Invalid email format
- Missing required parameters

### Business Logic Errors

- OTP expired
- OTP already used
- Contact not found
- Invalid OTP provided

### External Service Errors

- Notify API failures
- Database connection issues
- Network timeouts

### System Errors

- Unexpected exceptions
- Configuration issues
- Resource exhaustion

## Log Analysis Tips

1. **Use Request IDs** to trace complete user journeys
2. **Use Operation IDs** to debug specific service operations
3. **Filter by log levels** to focus on errors or warnings
4. **Search by component** (otp, notification, user_contact, etc.)
5. **Monitor error patterns** to identify systemic issues

## Alerting Recommendations

Set up alerts for:

- High error rates (>5% in 5 minutes)
- Notify API failures
- Database operation failures
- Long response times (>5 seconds)
- Validation failure spikes

This comprehensive logging implementation provides full visibility into the OTP and notification flow, enabling quick identification and resolution of issues through detailed, structured logs.
