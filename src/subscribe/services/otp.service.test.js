import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOtpService } from './otp.service.js'
import { validateAndNormalizeUKPhoneNumber } from '../../common/helpers/phone-validation.js'
import { generateOTPWithExpiry } from '../../common/helpers/otp-generator.js'

import { createUserContactService } from './user-contact-service.js'

// FIXED: Moved all vi.mock() calls to after imports
vi.mock('../../common/helpers/phone-validation.js', () => ({
  validateAndNormalizeUKPhoneNumber: vi.fn()
}))

vi.mock('../../common/helpers/otp-generator.js', () => ({
  generateOTPWithExpiry: vi.fn()
}))

// Notify service is no longer mocked here - it's called from the controller

vi.mock('./user-contact-service.js', () => ({
  createUserContactService: vi.fn()
}))

describe('OTP Service', () => {
  // Mock dependencies
  const mockDb = { collection: vi.fn() }
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }

  const mockUserContactService = {
    storeVerificationDetails: vi.fn(),
    validateSecret: vi.fn()
  }

  let otpService

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup user contact service mock
    createUserContactService.mockReturnValue(mockUserContactService)

    // Create service instance
    otpService = createOtpService(mockDb, mockLogger)
  })

  describe('createOtpService', () => {
    it('should create service with db and logger', () => {
      expect(createUserContactService).toHaveBeenCalledWith(mockDb, mockLogger)
      expect(otpService).toBeDefined()
      expect(typeof otpService.generate).toBe('function')
      expect(typeof otpService.validate).toBe('function')
    })

    it('should return service instance with correct methods', () => {
      const service = createOtpService(mockDb, mockLogger)

      expect(service).toHaveProperty('generate')
      expect(service).toHaveProperty('validate')
      expect(typeof service.generate).toBe('function')
      expect(typeof service.validate).toBe('function')
    })
  })

  describe('generate method', () => {
    const phoneNumber = '07123456789'
    const normalizedPhone = '+447123456789'
    const otp = '12345'
    const expiryTime = new Date('2024-01-02T00:00:00Z')

    describe('Success scenarios', () => {
      beforeEach(() => {
        validateAndNormalizeUKPhoneNumber.mockReturnValue({
          isValid: true,
          normalized: normalizedPhone
        })
        generateOTPWithExpiry.mockReturnValue({
          otp,
          expiryTime
        })
        mockUserContactService.storeVerificationDetails.mockResolvedValue()
      })

      it('should generate OTP successfully', async () => {
        const result = await otpService.generate(phoneNumber)

        expect(validateAndNormalizeUKPhoneNumber).toHaveBeenCalledWith(
          phoneNumber
        )
        expect(generateOTPWithExpiry).toHaveBeenCalledWith(15)
        expect(
          mockUserContactService.storeVerificationDetails
        ).toHaveBeenCalledWith(normalizedPhone, otp, expiryTime)
        expect(mockLogger.info).toHaveBeenCalledWith('OTP generated', {
          phoneNumber: normalizedPhone
        })
        expect(result).toEqual({
          normalizedPhoneNumber: normalizedPhone,
          otp
        })
      })

      it('should handle successful generation with all steps', async () => {
        const result = await otpService.generate(phoneNumber)

        expect(validateAndNormalizeUKPhoneNumber).toHaveBeenCalledWith(
          phoneNumber
        )
        expect(generateOTPWithExpiry).toHaveBeenCalledWith(15)
        expect(
          mockUserContactService.storeVerificationDetails
        ).toHaveBeenCalledWith(normalizedPhone, otp, expiryTime)
        expect(mockLogger.info).toHaveBeenCalled()

        expect(result.normalizedPhoneNumber).toBe(normalizedPhone)
        expect(result.otp).toBe(otp)
      })
    })

    describe('Error scenarios', () => {
      it('should handle invalid phone number', async () => {
        validateAndNormalizeUKPhoneNumber.mockReturnValue({
          isValid: false,
          error: 'Invalid UK phone number format'
        })

        const result = await otpService.generate('invalid-phone')

        expect(result).toEqual({
          error: 'Invalid UK phone number format'
        })
        expect(generateOTPWithExpiry).not.toHaveBeenCalled()
        expect(
          mockUserContactService.storeVerificationDetails
        ).not.toHaveBeenCalled()
      })

      it('should handle database storage failure', async () => {
        validateAndNormalizeUKPhoneNumber.mockReturnValue({
          isValid: true,
          normalized: normalizedPhone
        })
        generateOTPWithExpiry.mockReturnValue({ otp, expiryTime })
        mockUserContactService.storeVerificationDetails.mockRejectedValue(
          new Error('Database connection failed')
        )

        const result = await otpService.generate(phoneNumber)

        expect(result).toEqual({ error: 'Failed to generate OTP' })
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to generate OTP',
          {
            error: 'Database connection failed'
          }
        )
      })
    })
  })

  describe('validate method', () => {
    const phoneNumber = '07123456789'
    const normalizedPhone = '+447123456789'
    const otp = '123456'

    describe('Success scenarios', () => {
      beforeEach(() => {
        validateAndNormalizeUKPhoneNumber.mockReturnValue({
          isValid: true,
          normalized: normalizedPhone
        })
        mockUserContactService.validateSecret.mockResolvedValue({
          valid: true
        })
      })

      it('should validate OTP successfully', async () => {
        const result = await otpService.validate(phoneNumber, otp)

        expect(validateAndNormalizeUKPhoneNumber).toHaveBeenCalledWith(
          phoneNumber
        )
        expect(mockUserContactService.validateSecret).toHaveBeenCalledWith(
          normalizedPhone,
          otp
        )
        expect(mockLogger.info).toHaveBeenCalledWith('OTP validated', {
          phoneNumber: normalizedPhone
        })
        expect(result).toEqual({
          normalizedPhoneNumber: normalizedPhone
        })
      })
    })

    describe('Error scenarios', () => {
      it('should handle invalid phone number', async () => {
        validateAndNormalizeUKPhoneNumber.mockReturnValue({
          isValid: false,
          error: 'Invalid UK phone number format'
        })

        const result = await otpService.validate('invalid-phone', otp)

        expect(result).toEqual({
          error: 'Invalid UK phone number format'
        })
        expect(mockUserContactService.validateSecret).not.toHaveBeenCalled()
        expect(mockLogger.info).not.toHaveBeenCalled()
      })

      it('should handle invalid OTP', async () => {
        validateAndNormalizeUKPhoneNumber.mockReturnValue({
          isValid: true,
          normalized: normalizedPhone
        })
        mockUserContactService.validateSecret.mockResolvedValue({
          valid: false,
          error: 'OTP has expired'
        })

        const result = await otpService.validate(phoneNumber, 'wrong-otp')

        expect(result).toEqual({
          error: 'OTP has expired'
        })
        expect(mockLogger.info).not.toHaveBeenCalled()
      })

      it('should handle validation service failure', async () => {
        validateAndNormalizeUKPhoneNumber.mockReturnValue({
          isValid: true,
          normalized: normalizedPhone
        })
        mockUserContactService.validateSecret.mockRejectedValue(
          new Error('Database query failed')
        )

        const result = await otpService.validate(phoneNumber, otp)

        expect(result).toEqual({ error: 'Failed to validate OTP' })
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to validate OTP',
          {
            error: 'Database query failed'
          }
        )
      })
    })
  })

  describe('Service Integration', () => {
    it('should properly initialize user contact service', () => {
      // Test the existing service from beforeEach - don't create another one
      expect(createUserContactService).toHaveBeenCalledWith(mockDb, mockLogger)
      // Since beforeEach runs once per test, we can expect it was called at least once
      expect(createUserContactService).toHaveBeenCalled()
    })

    it('should use 15-minute expiry for OTP generation', async () => {
      validateAndNormalizeUKPhoneNumber.mockReturnValue({
        isValid: true,
        normalized: '+447123456789'
      })
      generateOTPWithExpiry.mockReturnValue({
        otp: '12345',
        expiryTime: new Date()
      })
      mockUserContactService.storeVerificationDetails.mockResolvedValue()

      await otpService.generate('07123456789')

      expect(generateOTPWithExpiry).toHaveBeenCalledWith(15) // 15 minutes
    })
  })

  describe('Method Structure', () => {
    it('should have correct async function signatures', () => {
      expect(otpService.generate.constructor.name).toBe('AsyncFunction')
      expect(otpService.validate.constructor.name).toBe('AsyncFunction')
    })

    it('should return methods with correct names', () => {
      expect(otpService.generate.name).toBe('generate')
      expect(otpService.validate.name).toBe('validate')
    })
  })
})
