/**
 * UK Phone Number Validation Utility
 * Validates UK mobile and landline numbers according to Ofcom numbering plan
 */

/**
 * Validates if a phone number is a valid UK format
 * @param {string} phoneNumber - The phone number to validate
 * @returns {boolean} - True if valid UK phone number, false otherwise
 */
function isValidUKPhoneNumber(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false
  }

  // Remove all spaces, hyphens, parentheses, and plus signs
  const cleanNumber = phoneNumber.replace(/[\s\-()+]/g, '')

  // UK phone number patterns (only mobile and landline numbers)
  const ukPatterns = [
    // Mobile numbers starting with 07 (11 digits total: 07xxxxxxxxx)
    /^(?:0|44)7\d{9}$/,
    // London 020 (11 digits total: 020xxxxxxxx)
    /^(?:0|44)20\d{8}$/,
    // Other geographic numbers starting with 01 (11 digits total: 01xxx xxxxxx)
    /^(?:0|44)1\d{9}$/
  ]

  return ukPatterns.some((pattern) => pattern.test(cleanNumber))
}

/**
 * Normalizes a UK phone number to E.164 format (+44...)
 * @param {string} phoneNumber - The phone number to normalize
 * @returns {string} - Normalized phone number in E.164 format
 */
function normalizeUKPhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    throw new Error('Phone number is required')
  }

  // Remove all spaces, hyphens, parentheses, and plus signs
  let cleanNumber = phoneNumber.replace(/[\s\-()+]/g, '')

  // If it starts with 44, add +
  if (cleanNumber.startsWith('44')) {
    cleanNumber = '+' + cleanNumber
  }
  // If it starts with 0, replace with +44
  else if (cleanNumber.startsWith('0')) {
    cleanNumber = '+44' + cleanNumber.substring(1)
  }
  // If it doesn't start with + or 44, assume it's UK number without prefix
  else if (!cleanNumber.startsWith('+')) {
    cleanNumber = '+44' + cleanNumber
  }
  // Add the missing else clause to handle unexpected cases
  else {
    throw new Error('Invalid phone number format')
  }

  return cleanNumber
}

/**
 * Validates and normalizes a UK phone number
 * @param {string} phoneNumber - The phone number to validate and normalize
 * @returns {object} - Object containing isValid boolean and normalized number
 */
function validateAndNormalizeUKPhoneNumber(phoneNumber) {
  const operationId = `validate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Simple console logging to avoid circular dependencies
  console.log(`[${new Date().toISOString()}] phone.validate.start`, {
    operationId,
    phoneNumber: phoneNumber ? '***' + phoneNumber.slice(-3) : 'undefined',
    phoneNumberLength: phoneNumber?.length
  })

  const isValid = isValidUKPhoneNumber(phoneNumber)

  console.log(
    `[${new Date().toISOString()}] phone.validate.validation_result`,
    {
      operationId,
      isValid
    }
  )

  if (!isValid) {
    console.log(`[${new Date().toISOString()}] phone.validate.invalid_format`, {
      operationId,
      phoneNumber: phoneNumber ? '***' + phoneNumber.slice(-3) : 'undefined'
    })
    return {
      isValid: false,
      normalized: null,
      error: 'Invalid UK phone number format'
    }
  }

  try {
    console.log(`[${new Date().toISOString()}] phone.validate.normalizing`, {
      operationId
    })
    const normalized = normalizeUKPhoneNumber(phoneNumber)

    console.log(`[${new Date().toISOString()}] phone.validate.success`, {
      operationId,
      normalized: '***' + normalized.slice(-3)
    })

    return {
      isValid: true,
      normalized,
      error: null
    }
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] phone.validate.normalization_error`,
      {
        operationId,
        error: error.message,
        errorName: error.name
      }
    )
    return {
      isValid: false,
      normalized: null,
      error: error.message
    }
  }
}

export {
  isValidUKPhoneNumber,
  normalizeUKPhoneNumber,
  validateAndNormalizeUKPhoneNumber
}
