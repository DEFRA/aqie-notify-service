import { validateAndNormalizeUKPhoneNumber } from '../../common/helpers/phone-validation.js'
import { generateOTPWithExpiry } from '../../common/helpers/otp-generator.js'
import { notifyService } from './notify-service.js'
import { createUserContactService } from './user-contact-service.js'

function createOtpService(db, logger) {
  const userContactService = createUserContactService(db)

  async function generate(phoneNumber) {
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
    const { notificationId } = await notifyService.sendOTPSMS(
      normalizedPhoneNumber,
      otp
    )
    logger.info('OTP generated and sent', {
      phoneNumber: normalizedPhoneNumber,
      notificationId
    })
    return { normalizedPhoneNumber, notificationId }
  }

  async function validate(phoneNumber, otp) {
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
  }

  return { generate, validate }
}

export { createOtpService }
