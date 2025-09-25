import { describe, it, expect } from 'vitest'
import { isValidUKPhoneNumber } from './phone-validation.js'

describe('Phone Validation (Standalone)', () => {
  describe('isValidUKPhoneNumber', () => {
    it('should validate UK mobile numbers', () => {
      expect(isValidUKPhoneNumber('07700900123')).toBe(true) // Standard UK mobile
      expect(isValidUKPhoneNumber('447700900123')).toBe(true) // International format
      expect(isValidUKPhoneNumber('07912345678')).toBe(true) // Another mobile
    })

    it('should validate UK landline numbers', () => {
      expect(isValidUKPhoneNumber('02012345678')).toBe(true) // London
      expect(isValidUKPhoneNumber('442012345678')).toBe(true) // London international
      expect(isValidUKPhoneNumber('01612345678')).toBe(true) // Manchester
      expect(isValidUKPhoneNumber('01512345678')).toBe(true) // Liverpool
    })

    it('should reject invalid numbers', () => {
      expect(isValidUKPhoneNumber('123456789')).toBe(false) // Too short
      expect(isValidUKPhoneNumber('08123456789')).toBe(false) // Invalid prefix for mobile
      expect(isValidUKPhoneNumber('12345678901')).toBe(false) // Non-UK format
      expect(isValidUKPhoneNumber('')).toBe(false) // Empty
      expect(isValidUKPhoneNumber(null)).toBe(false) // Null
      expect(isValidUKPhoneNumber(undefined)).toBe(false) // Undefined
    })
  })
})
