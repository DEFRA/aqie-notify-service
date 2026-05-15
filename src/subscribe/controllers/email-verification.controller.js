import Boom from '@hapi/boom'
import { createNotificationService } from '../services/notify-service.js'
import { createEmailVerificationService } from '../services/email-verification.service.js'
import { config } from '../../config.js'
import { randomUUID } from 'node:crypto'
import { maskEmail, maskUuid } from '../../common/helpers/masking-utils.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()
const HTTP_STATUS_CREATED = 201

function buildLinkResponse(uuid) {
  const body = {
    message: 'Link has been sent to email',
    timestamp: new Date().toISOString()
  }
  if (config.get('useMock')) {
    body.verificationToken = uuid
  }
  return body
}

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

    try {
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
        `email.generate_link.success ${JSON.stringify({ requestId, emailAddress: maskEmail(emailAddress), uuid: maskUuid(result.uuid), notificationId })}`
      )

      return h
        .response(buildLinkResponse(result.uuid))
        .code(HTTP_STATUS_CREATED)
    } catch (error_) {
      logger.error(
        `email.generate_link.notification_failed ${JSON.stringify({ requestId, emailAddress: maskEmail(emailAddress), errorName: error_.name })}`
      )
      return h
        .response(buildLinkResponse(result.uuid))
        .code(HTTP_STATUS_CREATED)
    }
  } catch (err) {
    logger.error(
      `email.generate_link.unexpected_error ${JSON.stringify({ requestId, error: err.message, errorName: err.name })}`
    )
    return Boom.internal('Failed to generate verification link')
  }
}

export { generateLinkHandler }
