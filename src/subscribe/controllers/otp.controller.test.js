import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateOtpHandler, validateOtpHandler } from './otp.controller.js'
import { createOtpService } from '../services/otp.service.js'
import { createNotificationService } from '../services/notify-service.js'

const mockOtpService = {
  generate: vi.fn(),
  validate: vi.fn()
}

const mockNotificationService = {
  sendSms: vi.fn()
}

vi.mock('../services/otp.service.js', () => ({
  createOtpService: vi.fn(() => mockOtpService)
}))

vi.mock('../services/notify-service.js', () => ({
  createNotificationService: vi.fn(() => mockNotificationService)
}))

vi.mock('../../config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'notify.templateId') return 'template-123'
      if (key === 'notify.otpPersonalisationKey') return 'code'
      return null
    })
  }
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
      it('should generate OTP and send SMS successfully', async () => {
        mockOtpService.generate.mockResolvedValue({
          normalizedPhoneNumber: '+447123456789',
          otp: '12345'
        })

        mockNotificationService.sendSms.mockResolvedValue({
          notificationId: 'notification-123'
        })

        mockH.response.mockReturnValue(mockH)
        mockH.code.mockReturnValue({
          notificationId: 'notification-123',
          status: 'submitted'
        })

        const result = await generateOtpHandler(mockRequest, mockH)

        expect(createOtpService).toHaveBeenCalledWith(mockDb, mockLogger)
        expect(mockOtpService.generate).toHaveBeenCalledWith('07123456789')
        expect(createNotificationService).toHaveBeenCalled()
        expect(mockNotificationService.sendSms).toHaveBeenCalledWith(
          '+447123456789',
          'template-123',
          { code: '12345' }
        )
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

      it('should handle notification failure gracefully', async () => {
        mockOtpService.generate.mockResolvedValue({
          normalizedPhoneNumber: '+447123456789',
          otp: '12345'
        })

        mockNotificationService.sendSms.mockRejectedValue(
          new Error('Notify service unavailable')
        )

        mockH.response.mockReturnValue(mockH)
        mockH.code.mockReturnValue({
          status: 'otp_generated_notification_failed'
        })

        await generateOtpHandler(mockRequest, mockH)

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to send notification',
          { error: 'Notify service unavailable' }
        )
        expect(mockH.response).toHaveBeenCalledWith({
          status: 'otp_generated_notification_failed'
        })
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

      it('should handle OTP generation exception', async () => {
        mockOtpService.generate.mockRejectedValue(new Error('Database error'))

        const result = await generateOtpHandler(mockRequest, mockH)

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to generate OTP',
          { error: 'Database error' }
        )
        expect(result.isBoom).toBe(true)
        expect(result.output.statusCode).toBe(500)
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
