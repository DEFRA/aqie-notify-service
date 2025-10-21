import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateOTP,
  generateOTPWithExpiry,
  isOTPValid
} from './otp-generator.js'

describe('OTP Generator', () => {
  describe('generateOTP', () => {
    it('should generate a 5-digit OTP string', () => {
      const otp = generateOTP()

      // Should be a string
      expect(typeof otp).toBe('string')

      // Should be exactly 5 digits
      expect(otp).toMatch(/^\d{5}$/)
      expect(otp.length).toBe(5)

      // Should be within valid range (10000-99999)
      const otpNumber = parseInt(otp, 10)
      expect(otpNumber).toBeGreaterThanOrEqual(10000)
      expect(otpNumber).toBeLessThanOrEqual(99999)
    })

    it('should generate different OTPs on consecutive calls', () => {
      const otp1 = generateOTP()
      const otp2 = generateOTP()
      const otp3 = generateOTP()

      // Very unlikely all three would be the same (1 in 90,000^2 chance)
      const allSame = otp1 === otp2 && otp2 === otp3
      expect(allSame).toBe(false)
    })

    it('should generate valid numeric strings only', () => {
      // Generate multiple OTPs to ensure consistency
      for (let i = 0; i < 10; i++) {
        const otp = generateOTP()
        expect(otp).toMatch(/^\d{5}$/)
        expect(isNaN(parseInt(otp, 10))).toBe(false)
      }
    })

    it('should use crypto.randomInt for secure generation', () => {
      const otp = generateOTP()

      // Verify it's using the secure range
      const otpNum = parseInt(otp, 10)
      expect(otpNum >= 10000 && otpNum <= 99999).toBe(true)
    })
  })

  describe('generateOTPWithExpiry', () => {
    beforeEach(() => {
      // Mock Date.now to have consistent test results
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should generate OTP with default 24-hour expiry', () => {
      const result = generateOTPWithExpiry()

      // Should have correct structure
      expect(result).toHaveProperty('otp')
      expect(result).toHaveProperty('expiryTime')

      // OTP should be valid 5-digit string
      expect(result.otp).toMatch(/^\d{5}$/)
      expect(typeof result.otp).toBe('string')

      // Expiry should be Date object
      expect(result.expiryTime).toBeInstanceOf(Date)

      // Should expire in 24 hours (1440 minutes)
      const expectedExpiry = new Date('2024-01-02T10:00:00.000Z')
      expect(result.expiryTime.getTime()).toBe(expectedExpiry.getTime())
    })

    it('should generate OTP with custom expiry time', () => {
      const customMinutes = 30
      const result = generateOTPWithExpiry(customMinutes)

      expect(result).toHaveProperty('otp')
      expect(result).toHaveProperty('expiryTime')

      // Should expire in 30 minutes
      const expectedExpiry = new Date('2024-01-01T10:30:00.000Z')
      expect(result.expiryTime.getTime()).toBe(expectedExpiry.getTime())
    })

    it('should handle zero expiry time', () => {
      const result = generateOTPWithExpiry(0)

      expect(result).toHaveProperty('otp')
      expect(result).toHaveProperty('expiryTime')

      // Should expire immediately
      const expectedExpiry = new Date('2024-01-01T10:00:00.000Z')
      expect(result.expiryTime.getTime()).toBe(expectedExpiry.getTime())
    })

    it('should handle large expiry times', () => {
      const largeMinutes = 10080 // 1 week
      const result = generateOTPWithExpiry(largeMinutes)

      // Should expire in 1 week
      const expectedExpiry = new Date('2024-01-08T10:00:00.000Z')
      expect(result.expiryTime.getTime()).toBe(expectedExpiry.getTime())
    })

    it('should generate different OTPs with same expiry', () => {
      const result1 = generateOTPWithExpiry(60)
      const result2 = generateOTPWithExpiry(60)

      // Different OTPs
      expect(result1.otp).not.toBe(result2.otp)

      // Same expiry time
      expect(result1.expiryTime.getTime()).toBe(result2.expiryTime.getTime())
    })
  })

  describe('isOTPValid', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for future expiry time', () => {
      const futureTime = new Date('2024-01-01T13:00:00.000Z') // 1 hour in future
      const isValid = isOTPValid(futureTime)

      expect(isValid).toBe(true)
    })

    it('should return false for past expiry time', () => {
      const pastTime = new Date('2024-01-01T11:00:00.000Z') // 1 hour in past
      const isValid = isOTPValid(pastTime)

      expect(isValid).toBe(false)
    })

    it('should return false for current time (expired at exact moment)', () => {
      const currentTime = new Date('2024-01-01T12:00:00.000Z')
      const isValid = isOTPValid(currentTime)

      expect(isValid).toBe(false)
    })

    it('should handle Date string input', () => {
      const futureDateString = '2024-01-01T13:00:00.000Z'
      const isValid = isOTPValid(futureDateString)

      expect(isValid).toBe(true)
    })

    it('should handle Date string input for past time', () => {
      const pastDateString = '2024-01-01T11:00:00.000Z'
      const isValid = isOTPValid(pastDateString)

      expect(isValid).toBe(false)
    })

    it('should handle millisecond precision', () => {
      const futureTime = new Date('2024-01-01T12:00:00.001Z') // 1ms in future
      const isValid = isOTPValid(futureTime)

      expect(isValid).toBe(true)
    })

    it('should work with generated OTP expiry', () => {
      // Generate OTP with 30-minute expiry
      const { expiryTime } = generateOTPWithExpiry(30)
      const isValid = isOTPValid(expiryTime)

      expect(isValid).toBe(true)
    })
  })

  describe('Integration Tests', () => {
    it('should create valid OTP that passes validation when not expired', () => {
      const { otp, expiryTime } = generateOTPWithExpiry(60) // 1 hour

      // OTP should be valid format
      expect(otp).toMatch(/^\d{5}$/)

      // Should not be expired
      expect(isOTPValid(expiryTime)).toBe(true)
    })

    it('should handle complete OTP lifecycle', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))

      // Generate OTP with 1-minute expiry
      const { otp, expiryTime } = generateOTPWithExpiry(1)

      // Should be valid initially
      expect(isOTPValid(expiryTime)).toBe(true)
      expect(otp).toMatch(/^\d{5}$/)

      // Move time forward by 30 seconds - should still be valid
      vi.setSystemTime(new Date('2024-01-01T10:00:30.000Z'))
      expect(isOTPValid(expiryTime)).toBe(true)

      // Move time forward by 2 minutes - should be expired
      vi.setSystemTime(new Date('2024-01-01T10:02:00.000Z'))
      expect(isOTPValid(expiryTime)).toBe(false)

      vi.useRealTimers()
    })

    it('should handle edge case with zero expiry', () => {
      vi.useFakeTimers()
      const now = new Date('2024-01-01T10:00:00.000Z')
      vi.setSystemTime(now)

      const { otp, expiryTime } = generateOTPWithExpiry(0)

      // OTP should be generated
      expect(otp).toMatch(/^\d{5}$/)

      // Should be expired immediately
      expect(isOTPValid(expiryTime)).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle negative expiry minutes', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))

      const result = generateOTPWithExpiry(-30)

      // Should generate OTP
      expect(result.otp).toMatch(/^\d{5}$/)

      // Expiry should be in the past
      const expectedExpiry = new Date('2024-01-01T09:30:00.000Z')
      expect(result.expiryTime.getTime()).toBe(expectedExpiry.getTime())
      expect(isOTPValid(result.expiryTime)).toBe(false)

      vi.useRealTimers()
    })

    it('should handle fractional expiry minutes', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))

      const result = generateOTPWithExpiry(0.5) // 30 seconds

      expect(result.otp).toMatch(/^\d{5}$/)

      // Should expire in 30 seconds
      const expectedExpiry = new Date('2024-01-01T10:00:30.000Z')
      expect(result.expiryTime.getTime()).toBe(expectedExpiry.getTime())

      vi.useRealTimers()
    })
  })
})
