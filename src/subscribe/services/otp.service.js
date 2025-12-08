import { validateAndNormalizeUKPhoneNumber } from '../../common/helpers/phone-validation.js'
import { generateOTPWithExpiry } from '../../common/helpers/otp-generator.js'
import { createUserContactService } from './user-contact-service.js'

function createOtpService(db, logger) {
  const userContactService = createUserContactService(db)

  async function generate(phoneNumber) {
    try {
      const phoneValidation = validateAndNormalizeUKPhoneNumber(phoneNumber)
      if (!phoneValidation.isValid) {
        return { error: phoneValidation.error }
      }
      const normalizedPhoneNumber = phoneValidation.normalized
      const { otp, expiryTime } = generateOTPWithExpiry(1440) // 24 hours expiry
      await userContactService.storeVerificationDetails(
        normalizedPhoneNumber,
        otp,
        expiryTime
      )
      logger.info('OTP generated', { phoneNumber: normalizedPhoneNumber })
      return { normalizedPhoneNumber, otp }
    } catch (error) {
      logger.error('Failed to generate OTP', { error: error.message })
      return { error: 'Failed to generate OTP' }
    }
  }

  async function validate(phoneNumber, otp) {
    try {
      const phoneValidation = validateAndNormalizeUKPhoneNumber(phoneNumber)
      if (!phoneValidation.isValid) {
        return { error: phoneValidation.error }
      }
      const normalizedPhoneNumber = phoneValidation.normalized
      const validationResult = await userContactService.validateSecret(
        normalizedPhoneNumber,
        otp
      )
      if (!validationResult.valid) {
        return { error: validationResult.error }
      }
      logger.info('OTP validated', { phoneNumber: normalizedPhoneNumber })
      return { normalizedPhoneNumber }
    } catch (error) {
      logger.error('Failed to validate OTP', { error: error.message })
      return { error: 'Failed to validate OTP' }
    }
  }

  return { generate, validate }
}

export { createOtpService }
