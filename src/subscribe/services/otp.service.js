import { validateAndNormalizeUKPhoneNumber } from '../../common/helpers/phone-validation.js'
import { generateOTPWithExpiry } from '../../common/helpers/otp-generator.js'
import { createUserContactService } from './user-contact-service.js'

// Define constants for clarity
const OTP_EXPIRY_MINUTES = 15 // 15 minutes expiry

function createOtpService(db, logger) {
  const userContactService = createUserContactService(db, logger)

  async function generate(phoneNumber) {
    try {
      const phoneValidation = validateAndNormalizeUKPhoneNumber(phoneNumber)

      if (!phoneValidation.isValid) {
        return { error: phoneValidation.error }
      }

      const normalizedPhoneNumber = phoneValidation.normalized
      const { otp, expiryTime } = generateOTPWithExpiry(OTP_EXPIRY_MINUTES)

      await userContactService.storeVerificationDetails(
        normalizedPhoneNumber,
        otp,
        expiryTime
      )

      logger.info('OTP generated', {
        phoneNumber: normalizedPhoneNumber
      })

      return { normalizedPhoneNumber, otp }
    } catch (error) {
      logger.error('Failed to generate OTP', {
        error: error.message
      })
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

      logger.info('OTP validated', {
        phoneNumber: normalizedPhoneNumber
      })

      return { normalizedPhoneNumber }
    } catch (error) {
      logger.error('Failed to validate OTP', {
        error: error.message
      })
      return { error: 'Failed to validate OTP' }
    }
  }

  return { generate, validate }
}

export { createOtpService }
