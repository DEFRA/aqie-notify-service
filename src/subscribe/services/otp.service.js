import { validateAndNormalizeUKPhoneNumber } from '../../common/helpers/phone-validation.js'
import { generateOTPWithExpiry } from '../../common/helpers/otp-generator.js'
import { createUserContactService } from './user-contact-service.js'
import { config } from '../../config.js'

// Define constants for clarity
const OTP_EXPIRY_MINUTES = 15 // 15 minutes expiry in production
const MOCK_OTP_EXPIRY_MINUTES = 180 // 3 hours expiry when useMock=true, so automation scripts have a longer window
const MOCK_OTP = '12345'

function createOtpService(db, logger) {
  const userContactService = createUserContactService(db, logger)

  async function generate(phoneNumber) {
    try {
      const phoneValidation = validateAndNormalizeUKPhoneNumber(phoneNumber)

      if (!phoneValidation.isValid) {
        return { error: phoneValidation.error }
      }

      const normalizedPhoneNumber = phoneValidation.normalized
      const expiryMinutes = config.get('useMock')
        ? MOCK_OTP_EXPIRY_MINUTES
        : OTP_EXPIRY_MINUTES
      const { otp, expiryTime } = generateOTPWithExpiry(expiryMinutes)

      // When useMock=true, persist a fixed OTP so automation scripts can validate
      // against a known value. The real OTP is still returned and sent via Notify.
      const storedOtp = config.get('useMock') ? MOCK_OTP : otp

      await userContactService.storeVerificationDetails(
        normalizedPhoneNumber,
        storedOtp,
        expiryTime
      )
      return { normalizedPhoneNumber, otp }
    } catch (error) {
      logger.error(
        `otp.generate.failed ${JSON.stringify({ error: error.message })}`
      )
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
      return { normalizedPhoneNumber }
    } catch (error) {
      logger.error(
        `otp.validate.failed ${JSON.stringify({ error: error.message })}`
      )
      return { error: 'Failed to validate OTP' }
    }
  }

  return { generate, validate }
}

export { createOtpService }
