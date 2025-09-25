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
  const cleanNumber = phoneNumber.replace(/[\s\-()+-]/g, '')

  // UK phone number patterns (only mobile and landline numbers)
  const ukPatterns = [
    // Mobile numbers starting with 07 (11 digits total: 07xxxxxxxxx)
    /^(?:0|44)7[0-9]{9}$/,
    // London 020 (11 digits total: 020xxxxxxxx)
    /^(?:0|44)20[0-9]{8}$/,
    // Other geographic numbers starting with 01 (11 digits total: 01xxx xxxxxx)
    /^(?:0|44)1[0-9]{1}[0-9]{8}$/
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
  let cleanNumber = phoneNumber.replace(/[\s\-()+-]/g, '')

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

  return cleanNumber
}

/**
 * Validates and normalizes a UK phone number
 * @param {string} phoneNumber - The phone number to validate and normalize
 * @returns {object} - Object containing isValid boolean and normalized number
 */
function validateAndNormalizeUKPhoneNumber(phoneNumber) {
  const isValid = isValidUKPhoneNumber(phoneNumber)

  if (!isValid) {
    return {
      isValid: false,
      normalized: null,
      error: 'Invalid UK phone number format'
    }
  }

  try {
    const normalized = normalizeUKPhoneNumber(phoneNumber)
    return {
      isValid: true,
      normalized,
      error: null
    }
  } catch (error) {
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
