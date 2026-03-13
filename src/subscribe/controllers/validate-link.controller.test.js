import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateLinkHandler } from './validate-link.controller.js'
import { createEmailVerificationService } from '../services/email-verification.service.js'

const mockEmailVerificationService = {
  validateLink: vi.fn()
}

vi.mock('../services/email-verification.service.js', () => ({
  createEmailVerificationService: vi.fn(() => mockEmailVerificationService)
}))

describe('Validate Link Controller', () => {
  const mockH = {
    response: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis()
  }

  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }

  const mockDb = {}

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateLinkHandler', () => {
    const mockRequest = {
      params: { uuid: '123e4567-e89b-12d3-a456-426614174000' },
      headers: { 'x-cdp-request-id': 'test-request-id' },
      info: { id: 'test-request-id', remoteAddress: '127.0.0.1' },
      logger: mockLogger,
      db: mockDb
    }

    it('should be defined and have correct structure', () => {
      expect(validateLinkHandler).toBeDefined()
      expect(typeof validateLinkHandler).toBe('function')
      expect(validateLinkHandler.name).toBe('validateLinkHandler')
      expect(validateLinkHandler.length).toBe(2)
    })

    describe('Success scenarios', () => {
      it('should validate link successfully and return user data', async () => {
        const userData = {
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        }

        mockEmailVerificationService.validateLink.mockResolvedValue({
          valid: true,
          data: userData
        })

        mockH.response.mockReturnValue(mockH)
        mockH.code.mockReturnValue({
          message: 'Email validated successfully',
          ...userData
        })

        const result = await validateLinkHandler(mockRequest, mockH)

        expect(createEmailVerificationService).toHaveBeenCalledWith(
          mockDb,
          mockLogger
        )
        expect(mockEmailVerificationService.validateLink).toHaveBeenCalledWith(
          '123e4567-e89b-12d3-a456-426614174000'
        )
        expect(mockH.response).toHaveBeenCalledWith({
          message: 'Email validated successfully',
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        })
        expect(mockH.code).toHaveBeenCalledWith(200)
        expect(result).toEqual({
          message: 'Email validated successfully',
          ...userData
        })
      })
    })

    describe('Error scenarios with user data', () => {
      it('should return error with user data when link is expired', async () => {
        const userData = {
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        }

        mockEmailVerificationService.validateLink.mockResolvedValue({
          error: 'Verification link has expired',
          data: userData
        })

        mockH.response.mockReturnValue(mockH)
        mockH.code.mockReturnValue({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Verification link has expired',
          ...userData
        })

        await validateLinkHandler(mockRequest, mockH)

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringMatching(
            /validate_link\.validation_failed.*Verification link has expired/
          )
        )
        expect(mockH.response).toHaveBeenCalledWith({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Verification link has expired',
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        })
        expect(mockH.code).toHaveBeenCalledWith(400)
      })

      it('should return error with user data when link is already validated', async () => {
        const userData = {
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        }

        mockEmailVerificationService.validateLink.mockResolvedValue({
          error: 'Link has already been validated',
          data: userData
        })

        mockH.response.mockReturnValue(mockH)
        mockH.code.mockReturnValue({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Link has already been validated',
          ...userData
        })

        await validateLinkHandler(mockRequest, mockH)

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringMatching(
            /validate_link\.validation_failed.*Link has already been validated/
          )
        )
        expect(mockH.response).toHaveBeenCalledWith({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Link has already been validated',
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        })
        expect(mockH.code).toHaveBeenCalledWith(400)
      })

      it('should return error without user data when link is invalid', async () => {
        mockEmailVerificationService.validateLink.mockResolvedValue({
          error: 'Invalid verification link',
          data: null
        })

        const result = await validateLinkHandler(mockRequest, mockH)

        expect(result.isBoom).toBe(true)
        expect(result.output.statusCode).toBe(400)
        expect(result.output.payload.message).toBe('Invalid verification link')
      })
    })

    describe('Exception handling', () => {
      it('should handle service exception', async () => {
        mockEmailVerificationService.validateLink.mockRejectedValue(
          new Error('Database error')
        )

        const result = await validateLinkHandler(mockRequest, mockH)

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringMatching(
            /validate_link\.unexpected_error.*Database error/
          )
        )
        expect(result.isBoom).toBe(true)
        expect(result.output.statusCode).toBe(500)
      })
    })
  })

  describe('Handler Structure', () => {
    it('should export validateLinkHandler', () => {
      expect(validateLinkHandler).toBeDefined()
    })

    it('should have async handler', () => {
      expect(validateLinkHandler.constructor.name).toBe('AsyncFunction')
    })
  })
})
