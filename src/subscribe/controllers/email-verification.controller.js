import Boom from '@hapi/boom'
import { createNotificationService } from '../services/notify-service.js'
import { createEmailVerificationService } from '../services/email-verification.service.js'
import { config } from '../../config.js'
import { randomUUID } from 'node:crypto'
import { maskEmail, maskUuid } from '../../common/helpers/masking-utils.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()
const HTTP_STATUS_CREATED = 201

async function generateLinkHandler(request, h) {
  const requestId =
    request.headers['x-cdp-request-id'] ||
    request.info.id ||
    `req_${randomUUID()}`

  logger.info(
    `email.generate_link.requested ${JSON.stringify({ requestId, emailAddress: request.payload?.emailAddress ? maskEmail(request.payload.emailAddress) : 'undefined', alertType: request.payload?.alertType, location: request.payload?.location, userAgent: request.headers['user-agent'], ip: request.info.remoteAddress })}`
  )

  try {
    const { emailAddress, alertType, location, lat, long } = request.payload

    logger.info(
      `email.generate_link.start ${JSON.stringify({ requestId, emailAddress: maskEmail(emailAddress), alertType, location })}`
    )

    const emailVerificationService = await createEmailVerificationService(
      request.db,
      logger
    )
    const result = await emailVerificationService.storeVerificationDetails(
      emailAddress,
      alertType,
      location,
      lat,
      long
    )

    logger.info(
      `email.generate_link.stored ${JSON.stringify({ requestId, emailAddress: maskEmail(emailAddress), uuid: maskUuid(result.uuid), success: result.success })}`
    )

    try {
      logger.info(
        `email.generate_link.notification_start ${JSON.stringify({ requestId, emailAddress: maskEmail(emailAddress), templateId: config.get('notify.emailTemplateId') })}`
      )

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

      logger.info(
        `email.generate_link.notification_success ${JSON.stringify({ requestId, emailAddress: maskEmail(emailAddress), notificationId, uuid: maskUuid(result.uuid) })}`
      )

      return h
        .response({
          message: 'Link has been sent to email',
          timestamp: new Date().toISOString()
        })
        .code(HTTP_STATUS_CREATED)
    } catch (error_) {
      logger.error(
        `email.generate_link.notification_failed ${JSON.stringify({ requestId, emailAddress: maskEmail(emailAddress), error: error_.message, errorName: error_.name, stack: error_.stack })}`
      )
      return h
        .response({
          message: 'Link has been sent to email',
          timestamp: new Date().toISOString()
        })
        .code(HTTP_STATUS_CREATED)
    }
  } catch (err) {
    logger.error(
      `email.generate_link.unexpected_error ${JSON.stringify({ requestId, error: err.message, errorName: err.name, stack: err.stack })}`
    )
    return Boom.internal('Failed to generate verification link')
  }
}

export { generateLinkHandler }
