import Boom from '@hapi/boom'
import { createOtpService } from '../services/otp.service.js'
import { createNotificationService } from '../services/notify-service.js'
import { config } from '../../config.js'

// Define HTTP status codes as constants
const HTTP_STATUS_CREATED = 201
const HTTP_STATUS_OK = 200

async function generateOtpHandler(request, h) {
  try {
    const { phoneNumber } = request.payload
    const otpService = createOtpService(request.db, request.logger)
    const result = await otpService.generate(phoneNumber)
    if (result.error) {
      return Boom.badRequest(result.error)
    }

    const { normalizedPhoneNumber, otp } = result

    // Send notification via service
    try {
      const notificationService = createNotificationService()
      const { notificationId } = await notificationService.sendSms(
        normalizedPhoneNumber,
        config.get('notify.templateId'),
        { [config.get('notify.otpPersonalisationKey')]: otp }
      )
      return h
        .response({ notificationId, status: 'submitted' })
        .code(HTTP_STATUS_CREATED)
    } catch (notifyErr) {
      request.logger.error('Failed to send notification', {
        error: notifyErr.message
      })
      return h
        .response({ status: 'otp_generated_notification_failed' })
        .code(HTTP_STATUS_CREATED)
    }
  } catch (err) {
    request.logger.error('Failed to generate OTP', { error: err.message })
    return Boom.internal('Failed to generate OTP')
  }
}

async function validateOtpHandler(request, h) {
  try {
    const { phoneNumber, otp } = request.payload
    const otpService = createOtpService(request.db, request.logger)
    const result = await otpService.validate(phoneNumber, otp)
    if (result.error) {
      return Boom.badRequest(result.error)
    }
    return h
      .response({
        message: `${result.normalizedPhoneNumber} has been validated successfully`
      })
      .code(HTTP_STATUS_OK)
  } catch (err) {
    request.logger.error('Failed to validate OTP', { error: err.message })
    return Boom.internal('Failed to validate OTP')
  }
}

export { generateOtpHandler, validateOtpHandler }
