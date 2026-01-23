import Boom from '@hapi/boom'
import { createNotificationService } from '../services/notify-service.js'
import { createEmailVerificationService } from '../services/email-verification.service.js'
import { config } from '../../config.js'

const HTTP_STATUS_CREATED = 201

async function generateLinkHandler(request, h) {
  const requestId =
    request.headers['x-cdp-request-id'] ||
    request.info.id ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  request.logger.info(
    `email.generate_link.requested [${requestId}] email=***${request.payload?.emailAddress?.slice(-10) || 'undefined'}`,
    {
      requestId,
      emailAddress: request.payload?.emailAddress
        ? '***' + request.payload.emailAddress.slice(-10)
        : 'undefined',
      alertType: request.payload?.alertType,
      location: request.payload?.location,
      userAgent: request.headers['user-agent'],
      ip: request.info.remoteAddress
    }
  )

  try {
    const { emailAddress, alertType, location, lat, long } = request.payload

    request.logger.info('email.generate_link.start', {
      requestId,
      emailAddress: '***' + emailAddress.slice(-10),
      alertType,
      location
    })

    const emailVerificationService = createEmailVerificationService(
      request.db,
      request.logger
    )
    const result = await emailVerificationService.storeVerificationDetails(
      emailAddress,
      alertType,
      location,
      lat,
      long
    )

    request.logger.info('email.generate_link.stored', {
      requestId,
      emailAddress: '***' + emailAddress.slice(-10),
      uuid: result.uuid.substring(0, 8) + '...',
      success: result.success
    })

    try {
      request.logger.info('email.generate_link.notification_start', {
        requestId,
        emailAddress: '***' + emailAddress.slice(-10),
        templateId: config.get('notify.emailTemplateId')
      })

      const notificationService = createNotificationService()
      const { notificationId } = await notificationService.sendEmail(
        emailAddress,
        config.get('notify.emailTemplateId'),
        {
          verification_link: result.verificationLink,
          location,
          alert_type: alertType
        }
      )

      request.logger.info(
        `email.generate_link.notification_success [${requestId}] email=***${emailAddress.slice(-10)} notificationId=${notificationId}`,
        {
          requestId,
          emailAddress: '***' + emailAddress.slice(-10),
          notificationId,
          uuid: result.uuid.substring(0, 8) + '...'
        }
      )

      return h
        .response({
          message: 'Link has been sent to email',
          timestamp: new Date().toISOString()
        })
        .code(HTTP_STATUS_CREATED)
    } catch (error_) {
      request.logger.error('email.generate_link.notification_failed', {
        requestId,
        emailAddress: '***' + emailAddress.slice(-10),
        error: error_.message,
        errorName: error_.name,
        stack: error_.stack
      })
      return h
        .response({
          message: 'Link has been sent to email',
          timestamp: new Date().toISOString()
        })
        .code(HTTP_STATUS_CREATED)
    }
  } catch (err) {
    request.logger.error('email.generate_link.unexpected_error', {
      requestId,
      error: err.message,
      errorName: err.name,
      stack: err.stack
    })
    return Boom.internal('Failed to generate verification link')
  }
}

export { generateLinkHandler }
