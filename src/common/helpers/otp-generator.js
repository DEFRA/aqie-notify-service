import crypto from 'node:crypto'

/**
 * Generates a secure 5-digit OTP
 * @returns {string} - 5-digit OTP string
 */
function generateOTP() {
  // Generate a random number between 10000 and 99999
  const min = 10000
  const max = 99999

  // Use crypto.randomInt for cryptographically secure random number
  return crypto.randomInt(min, max + 1).toString()
}

/**
 * Generates OTP with expiry time
 * @param {number} expiryMinutes - OTP expiry time in minutes (default: 1440 = 24 hours)
 * @returns {object} - Object containing OTP and expiry timestamp
 */
function generateOTPWithExpiry(expiryMinutes = 24 * 60) {
  const otp = generateOTP()
  const expiryTime = new Date(Date.now() + expiryMinutes * 60 * 1000)

  return {
    otp,
    expiryTime
  }
}

/**
 * Validates if OTP is still valid (not expired)
 * @param {Date} expiryTime - The expiry time of the OTP
 * @returns {boolean} - True if OTP is still valid, false if expired
 */
function isOTPValid(expiryTime) {
  return Date.now() < new Date(expiryTime).getTime()
}

export { generateOTP, generateOTPWithExpiry, isOTPValid }
