import Boom from '@hapi/boom'
import { createOtpService } from '../services/otp.service.js'

async function generateOtpHandler(request, h) {
  try {
    const { phoneNumber } = request.payload
    const otpService = createOtpService(request.db, request.logger)
    const result = await otpService.generate(phoneNumber)
    if (result.error) {
      return Boom.badRequest(result.error)
    }
    // Expect otpService.generate to supply a notificationId (ensure service returns it)
    const { notificationId } = result

    if (!notificationId) {
      // Fallback if service not yet returning id
      request.logger.warn('OTP generated but notificationId missing')
      return h.response({ status: 'submitted' }).code(201)
    }
    // return h.response().code(204)
    return h.response({ notificationId, status: 'submitted' }).code(201)
  } catch (err) {
    request.logger.error('Failed to generate OTP', { error: err.message })
    if (err.message.includes('Failed to send SMS')) {
      return Boom.failedDependency('Failed to send SMS')
    }
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
      .code(200)
  } catch (err) {
    request.logger.error('Failed to validate OTP', { error: err.message })
    return Boom.internal('Failed to validate OTP')
  }
}

export { generateOtpHandler, validateOtpHandler }
