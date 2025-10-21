import { describe, it, expect } from 'vitest'
import {
  isValidUKPhoneNumber,
  normalizeUKPhoneNumber,
  validateAndNormalizeUKPhoneNumber
} from './phone-validation.js'

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

    // ADD THESE MISSING TESTS:
    it('should validate formatted numbers', () => {
      expect(isValidUKPhoneNumber('07700 900 123')).toBe(true)
      expect(isValidUKPhoneNumber('0161-234-5678')).toBe(true)
      expect(isValidUKPhoneNumber('(020) 1234-5678')).toBe(true)
      expect(isValidUKPhoneNumber('+447700900123')).toBe(true)
    })

    it('should reject edge cases', () => {
      expect(isValidUKPhoneNumber(123456789)).toBe(false) // Number
      expect(isValidUKPhoneNumber(true)).toBe(false) // Boolean
      expect(isValidUKPhoneNumber({})).toBe(false) // Object
      expect(isValidUKPhoneNumber([])).toBe(false) // Array
      expect(isValidUKPhoneNumber('077009001234')).toBe(false) // Too long
      expect(isValidUKPhoneNumber('0770abc0123')).toBe(false) // Invalid chars
    })
  })

  // ADD THESE MISSING FUNCTION TESTS:
  describe('normalizeUKPhoneNumber', () => {
    it('should normalize UK numbers to E.164 format', () => {
      expect(normalizeUKPhoneNumber('07700900123')).toBe('+447700900123')
      expect(normalizeUKPhoneNumber('447700900123')).toBe('+447700900123')
      expect(normalizeUKPhoneNumber('02012345678')).toBe('+442012345678')
    })

    it('should handle formatted numbers', () => {
      expect(normalizeUKPhoneNumber('07700 900 123')).toBe('+447700900123')
      expect(normalizeUKPhoneNumber('0161-234-5678')).toBe('+441612345678')
    })

    it('should throw errors for invalid input', () => {
      expect(() => normalizeUKPhoneNumber(null)).toThrow()
      expect(() => normalizeUKPhoneNumber('')).toThrow()
    })
  })

  describe('validateAndNormalizeUKPhoneNumber', () => {
    it('should return valid result for valid numbers', () => {
      const result = validateAndNormalizeUKPhoneNumber('07700900123')
      expect(result.isValid).toBe(true)
      expect(result.normalized).toBe('+447700900123')
      expect(result.error).toBe(null)
    })

    it('should return invalid result for invalid numbers', () => {
      const result = validateAndNormalizeUKPhoneNumber('invalid')
      expect(result.isValid).toBe(false)
      expect(result.normalized).toBe(null)
      expect(result.error).toBeTruthy()
    })
  })
})
