import { randomUUID } from 'node:crypto'

/**
 * Utility functions for masking sensitive data in logs
 */
const SLICING_THREE_DIGITS = -3
const SLICING_FOUR_DIGITS = -4

/**
 * Mask MSISDN for logs
 */
function maskMsisdn(msisdn) {
  if (!msisdn) {
    return undefined
  }
  const visible = msisdn.slice(SLICING_THREE_DIGITS)
  return (
    msisdn
      .slice(0, msisdn.length + SLICING_THREE_DIGITS)
      .replaceAll(/./g, 'x') + visible
  )
}

/**
 * Mask email address for logs (safe from ReDoS)
 */
function maskEmail(email) {
  if (!email) {
    return undefined
  }
  const atIndex = email.indexOf('@')
  if (atIndex <= 0) {
    return email
  }
  const localPart = email.substring(0, atIndex)
  const domain = email.substring(atIndex)
  const visibleChars = Math.min(2, localPart.length)
  return localPart.substring(0, visibleChars) + '***' + domain
}

/**
 * Mask template ID for logs
 */
function maskTemplateId(templateId) {
  if (!templateId) {
    return undefined
  }
  if (templateId.length <= 4) {
    return '***'
  }
  const lastFour = templateId.slice(SLICING_FOUR_DIGITS)
  const firstHalf = templateId.slice(0, Math.floor(templateId.length / 2))
  return firstHalf.replace(/./g, '*') + lastFour
}

/**
 * Generate operation ID for tracking using cryptographically secure random UUID
 */
function generateOperationId(prefix = 'op') {
  return `${prefix}_${randomUUID()}`
}

function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return null
  }
  return phoneNumber.length > 4
    ? `****${phoneNumber.slice(SLICING_FOUR_DIGITS)}`
    : '****'
}

function maskUuid(uuid) {
  if (!uuid) {
    return undefined
  }
  const last4 = uuid.slice(SLICING_FOUR_DIGITS)
  return '****' + last4
}

/**
 * Mask contact (phone or email) for logs
 */
function maskContact(contact) {
  if (!contact) {
    return undefined
  }
  // Check if it's an email (contains @)
  if (contact.includes('@')) {
    return maskEmail(contact)
  }
  // Otherwise treat as phone number
  return contact ? '***' + contact.slice(SLICING_THREE_DIGITS) : undefined
}

export {
  maskMsisdn,
  maskEmail,
  maskTemplateId,
  generateOperationId,
  maskPhoneNumber,
  maskContact,
  maskUuid
}
