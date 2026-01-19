import Boom from '@hapi/boom'
import { createEmailVerificationService } from '../services/email-verification.service.js'

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
      return Boom.badRequest(result.error)
    }

    return h
      .response({
        message: 'Email validated successfully',
        ...result.data
      })
      .code(HTTP_STATUS_OK)
  } catch (err) {
    request.logger.error('Failed to validate link', { error: err.message })
    return Boom.internal('Failed to validate link')
  }
}

export { validateLinkHandler }
