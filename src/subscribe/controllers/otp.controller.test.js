import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateOtpHandler, validateOtpHandler } from './otp.controller.js'
import { createOtpService } from '../services/otp.service.js'

// Mock the service factory - moved after imports
const mockOtpService = {
  generate: vi.fn(),
  validate: vi.fn()
}

vi.mock('../services/otp.service.js', () => ({
  createOtpService: vi.fn(() => mockOtpService) //  Factory returns service instance
}))

describe('OTP Controller', () => {
  // Mock Hapi.js response toolkit
  const mockH = {
    response: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis()
  }

  // Mock logger
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }

  // Mock database
  const mockDb = {}

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateOtpHandler', () => {
    const mockRequest = {
      payload: { phoneNumber: '07123456789' },
      logger: mockLogger,
      db: mockDb // 👈 Controller needs db
    }

    it('should be defined and have correct structure', () => {
      expect(generateOtpHandler).toBeDefined()
      expect(typeof generateOtpHandler).toBe('function')
      expect(generateOtpHandler.name).toBe('generateOtpHandler')
      expect(generateOtpHandler.length).toBe(2)
    })

    describe('Success scenarios', () => {
      it('should generate OTP successfully with notificationId', async () => {
        // Mock successful service response
        mockOtpService.generate.mockResolvedValue({
          notificationId: 'notification-123',
          success: true
        })

        mockH.response.mockReturnValue(mockH)
        mockH.code.mockReturnValue({
          notificationId: 'notification-123',
          status: 'submitted'
        })

        const result = await generateOtpHandler(mockRequest, mockH)

        expect(createOtpService).toHaveBeenCalledWith(mockDb, mockLogger)
        expect(mockOtpService.generate).toHaveBeenCalledWith('07123456789')
        expect(mockH.response).toHaveBeenCalledWith({
          notificationId: 'notification-123',
          status: 'submitted'
        })
        expect(mockH.code).toHaveBeenCalledWith(201)
        expect(result).toEqual({
          notificationId: 'notification-123',
          status: 'submitted'
        })
      })

      it('should handle missing notificationId gracefully', async () => {
        // Mock service response without notificationId
        mockOtpService.generate.mockResolvedValue({
          success: true
          // no notificationId
        })

        mockH.response.mockReturnValue(mockH)
        mockH.code.mockReturnValue({ status: 'submitted' })

        // FIXED: Removed unused result assignment (was line 90)
        await generateOtpHandler(mockRequest, mockH)

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'OTP generated but notificationId missing'
        )
        expect(mockH.response).toHaveBeenCalledWith({ status: 'submitted' })
        expect(mockH.code).toHaveBeenCalledWith(201)
      })
    })

    describe('Error scenarios', () => {
      it('should handle service error response', async () => {
        mockOtpService.generate.mockResolvedValue({
          error: 'Invalid phone number'
        })

        const result = await generateOtpHandler(mockRequest, mockH)

        expect(result.isBoom).toBe(true)
        expect(result.output.statusCode).toBe(400) // badRequest
      })

      it('should handle SMS failure exception', async () => {
        mockOtpService.generate.mockRejectedValue(
          new Error('Failed to send SMS')
        )

        const result = await generateOtpHandler(mockRequest, mockH)

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to generate OTP',
          { error: 'Failed to send SMS' }
        )
        expect(result.isBoom).toBe(true)
        expect(result.output.statusCode).toBe(424) // failedDependency
      })

      it('should handle general exception', async () => {
        mockOtpService.generate.mockRejectedValue(new Error('Database error'))

        const result = await generateOtpHandler(mockRequest, mockH)

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to generate OTP',
          { error: 'Database error' }
        )
        expect(result.isBoom).toBe(true)
        expect(result.output.statusCode).toBe(500) // internal
      })
    })
  })

  describe('validateOtpHandler', () => {
    const mockRequest = {
      payload: {
        phoneNumber: '07123456789',
        otp: '12345'
      },
      logger: mockLogger,
      db: mockDb // Controller needs db
    }

    it('should be defined and have correct structure', () => {
      expect(validateOtpHandler).toBeDefined()
      expect(typeof validateOtpHandler).toBe('function')
      expect(validateOtpHandler.name).toBe('validateOtpHandler')
      expect(validateOtpHandler.length).toBe(2)
    })

    describe('Success scenarios', () => {
      it('should validate OTP successfully', async () => {
        mockOtpService.validate.mockResolvedValue({
          normalizedPhoneNumber: '+447123456789',
          success: true
        })

        mockH.response.mockReturnValue(mockH)
        mockH.code.mockReturnValue({
          message: '+447123456789 has been validated successfully'
        })

        // Fixed: Removed unused result assignment (line 168)
        await validateOtpHandler(mockRequest, mockH)

        expect(createOtpService).toHaveBeenCalledWith(mockDb, mockLogger)
        expect(mockOtpService.validate).toHaveBeenCalledWith(
          '07123456789',
          '12345'
        )
        expect(mockH.response).toHaveBeenCalledWith({
          message: '+447123456789 has been validated successfully'
        })
        expect(mockH.code).toHaveBeenCalledWith(200)
      })
    })

    describe('Error scenarios', () => {
      it('should handle service error response', async () => {
        mockOtpService.validate.mockResolvedValue({
          error: 'Invalid OTP'
        })

        const result = await validateOtpHandler(mockRequest, mockH)

        expect(result.isBoom).toBe(true)
        expect(result.output.statusCode).toBe(400) // badRequest
      })

      it('should handle validation exception', async () => {
        mockOtpService.validate.mockRejectedValue(new Error('Database error'))

        const result = await validateOtpHandler(mockRequest, mockH)

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to validate OTP',
          { error: 'Database error' }
        )
        expect(result.isBoom).toBe(true)
        expect(result.output.statusCode).toBe(500) // internal
      })
    })
  })

  describe('Handler Structure', () => {
    it('should export both handlers', () => {
      expect(generateOtpHandler).toBeDefined()
      expect(validateOtpHandler).toBeDefined()
    })

    it('should have async handlers', () => {
      expect(generateOtpHandler.constructor.name).toBe('AsyncFunction')
      expect(validateOtpHandler.constructor.name).toBe('AsyncFunction')
    })
  })
})
