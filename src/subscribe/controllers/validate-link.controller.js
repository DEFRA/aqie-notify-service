import Boom from '@hapi/boom'
import { createEmailVerificationService } from '../services/email-verification.service.js'
import { maskEmail } from '../../common/helpers/masking-utils.js'

const HTTP_STATUS_OK = 200

async function validateLinkHandler(request, h) {
  try {
    const { uuid } = request.params
    const emailVerificationService = createEmailVerificationService(
      request.db,
      request.logger
    )

    const result = await emailVerificationService.validateLink(uuid)

    if (result.error) {
      request.logger.warn(
        `validate_link.validation_failed ${JSON.stringify({ error: result.error, hasData: !!result.data })}`
      )

      // Return error with user data if available
      if (result.data) {
        return h
          .response({
            statusCode: 400,
            error: 'Bad Request',
            message: result.error,
            emailAddress: result.data.emailAddress,
            alertType: result.data.alertType,
            location: result.data.location,
            lat: result.data.lat,
            long: result.data.long
          })
          .code(400)
      }
      return Boom.badRequest(result.error)
    }

    request.logger.info(
      `validate_link.success ${JSON.stringify({ emailAddress: result.data?.emailAddress ? maskEmail(result.data.emailAddress) : undefined })}`
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
    request.logger.error(
      `validate_link.unexpected_error ${JSON.stringify({ error: err.message, errorName: err.name })}`
    )
    return Boom.internal('Failed to validate link')
  }
}

export { validateLinkHandler }
