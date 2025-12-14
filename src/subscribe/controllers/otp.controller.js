import Boom from '@hapi/boom'
import { createOtpService } from '../services/otp.service.js'
import { createNotificationService } from '../services/notify-service.js'
import { config } from '../../config.js'

// Define HTTP status codes as constants
const HTTP_STATUS_CREATED = 201
const HTTP_STATUS_OK = 200

async function generateOtpHandler(request, h) {
  const requestId =
    request.headers['x-cdp-request-id'] ||
    request.info.id ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  request.logger.info(
    `otp.generate.requested [${requestId}] phone=***${request.payload?.phoneNumber?.slice(-3) || 'undefined'}`,
    {
      requestId,
      phoneNumber: request.payload?.phoneNumber
        ? '***' + request.payload.phoneNumber.slice(-3)
        : 'undefined',
      userAgent: request.headers['user-agent'],
      ip: request.info.remoteAddress
    }
  )

  try {
    const { phoneNumber } = request.payload
    request.logger.info('otp.generate.start', {
      requestId,
      phoneNumber: '***' + phoneNumber.slice(-3)
    })

    const otpService = createOtpService(request.db, request.logger)
    const result = await otpService.generate(phoneNumber)

    request.logger.info('otp.generate.service_result', {
      requestId,
      phoneNumber: '***' + phoneNumber.slice(-3),
      success: !result.error,
      hasNormalizedNumber: !!result.normalizedPhoneNumber
    })

    if (result.error) {
      request.logger.warn('otp.generate.validation_failed', {
        requestId,
        phoneNumber: '***' + phoneNumber.slice(-3),
        error: result.error
      })
      return Boom.badRequest(result.error)
    }

    const { normalizedPhoneNumber, otp } = result
    request.logger.info('otp.generate.otp_created', {
      requestId,
      normalizedPhoneNumber: '***' + normalizedPhoneNumber.slice(-3),
      otpLength: otp?.length
    })

    // Send notification via service
    try {
      request.logger.info('otp.generate.notification_start', {
        requestId,
        normalizedPhoneNumber: '***' + normalizedPhoneNumber.slice(-3),
        templateId: config.get('notify.templateId')
      })

      const notificationService = createNotificationService()
      const { notificationId } = await notificationService.sendSms(
        normalizedPhoneNumber,
        config.get('notify.templateId'),
        { [config.get('notify.otpPersonalisationKey')]: otp }
      )

      request.logger.info(
        `otp.generate.notification_success [${requestId}] phone=***${normalizedPhoneNumber.slice(-3)} notificationId=${notificationId}`,
        {
          requestId,
          normalizedPhoneNumber: '***' + normalizedPhoneNumber.slice(-3),
          notificationId
        }
      )

      return h
        .response({ notificationId, status: 'submitted' })
        .code(HTTP_STATUS_CREATED)
    } catch (error_) {
      request.logger.error('otp.generate.notification_failed', {
        requestId,
        normalizedPhoneNumber: '***' + normalizedPhoneNumber.slice(-3),
        error: error_.message,
        errorName: error_.name,
        stack: error_.stack
      })
      return h
        .response({ status: 'otp_generated_notification_failed' })
        .code(HTTP_STATUS_CREATED)
    }
  } catch (err) {
    request.logger.error('otp.generate.unexpected_error', {
      requestId,
      error: err.message,
      errorName: err.name,
      stack: err.stack
    })
    return Boom.internal('Failed to generate OTP')
  }
}

async function validateOtpHandler(request, h) {
  const requestId =
    request.headers['x-cdp-request-id'] ||
    request.info.id ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  request.logger.info(
    `otp.validate.requested [${requestId}] phone=***${request.payload?.phoneNumber?.slice(-3) || 'undefined'} otpProvided=${!!request.payload?.otp}`,
    {
      requestId,
      phoneNumber: request.payload?.phoneNumber
        ? '***' + request.payload.phoneNumber.slice(-3)
        : 'undefined',
      otpProvided: !!request.payload?.otp,
      userAgent: request.headers['user-agent'],
      ip: request.info.remoteAddress
    }
  )

  try {
    const { phoneNumber, otp } = request.payload
    request.logger.info('otp.validate.start', {
      requestId,
      phoneNumber: '***' + phoneNumber.slice(-3),
      otpLength: otp?.length
    })

    const otpService = createOtpService(request.db, request.logger)
    const result = await otpService.validate(phoneNumber, otp)

    request.logger.info('otp.validate.service_result', {
      requestId,
      phoneNumber: '***' + phoneNumber.slice(-3),
      success: !result.error,
      hasNormalizedNumber: !!result.normalizedPhoneNumber
    })

    if (result.error) {
      request.logger.warn('otp.validate.validation_failed', {
        requestId,
        phoneNumber: '***' + phoneNumber.slice(-3),
        error: result.error
      })
      return Boom.badRequest(result.error)
    }

    request.logger.info(
      `otp.validate.success [${requestId}] phone=***${result.normalizedPhoneNumber.slice(-3)}`,
      {
        requestId,
        normalizedPhoneNumber: '***' + result.normalizedPhoneNumber.slice(-3)
      }
    )

    return h
      .response({
        message: `${result.normalizedPhoneNumber} has been validated successfully`
      })
      .code(HTTP_STATUS_OK)
  } catch (err) {
    request.logger.error('otp.validate.unexpected_error', {
      requestId,
      error: err.message,
      errorName: err.name,
      stack: err.stack
    })
    return Boom.internal('Failed to validate OTP')
  }
}

export { generateOtpHandler, validateOtpHandler }
