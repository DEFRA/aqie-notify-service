import Boom from '@hapi/boom'
import { randomUUID } from 'node:crypto'
import { createEmailVerificationService } from '../services/email-verification.service.js'
import { maskEmail, maskUuid } from '../../common/helpers/masking-utils.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()
const HTTP_STATUS_OK = 200
const HTTP_STATUS_VALIDATION_FAILURE = 400

async function validateLinkHandler(request, h) {
  const requestId =
    request.headers['x-cdp-request-id'] ||
    request.info.id ||
    `req_${randomUUID()}`
  const { uuid } = request.params

  logger.info(
    `validate_link.requested ${JSON.stringify({ requestId, uuid: maskUuid(uuid), userAgent: request.headers['user-agent'], ip: request.info.remoteAddress })}`
  )

  try {
    const emailVerificationService = await createEmailVerificationService(
      request.db,
      logger
    )

    const result = await emailVerificationService.validateLink(uuid)

    if (result.error) {
      logger.warn(
        `validate_link.validation_failed ${JSON.stringify({ requestId, uuid: maskUuid(uuid), error: result.error, hasData: !!result.data })}`
      )

      // Return error with user data if available
      if (result.data) {
        return h
          .response({
            statusCode: HTTP_STATUS_VALIDATION_FAILURE,
            error: 'Bad Request',
            message: result.error,
            emailAddress: result.data.emailAddress,
            alertType: result.data.alertType,
            location: result.data.location,
            lat: result.data.lat,
            long: result.data.long
          })
          .code(HTTP_STATUS_VALIDATION_FAILURE)
      }
      return Boom.badRequest(result.error)
    }

    logger.info(
      `validate_link.success ${JSON.stringify({ requestId, uuid: maskUuid(uuid), emailAddress: result.data?.emailAddress ? maskEmail(result.data.emailAddress) : undefined })}`
    )

    return h
      .response({
        message: 'Email validated successfully',
        emailAddress: result.data.emailAddress,
        alertType: result.data.alertType,
        location: result.data.location,
        lat: result.data.lat,
        long: result.data.long
      })
      .code(HTTP_STATUS_OK)
  } catch (err) {
    logger.error(
      `validate_link.unexpected_error ${JSON.stringify({ requestId, uuid: maskUuid(uuid), error: err.message, errorName: err.name })}`
    )
    return Boom.internal('Failed to validate link')
  }
}

export { validateLinkHandler }
