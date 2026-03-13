import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}

function createMockCollection() {
  return {
    replaceOne: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
    createIndex: vi.fn()
  }
}

function createMockDb(mockCollection) {
  return {
    collection: vi.fn(() => mockCollection)
  }
}

function setupLoggerMock(mockLogger) {
  vi.doMock('../../common/helpers/logging/logger.js', () => ({
    createLogger: vi.fn(() => mockLogger)
  }))
}

describe('Email Verification Service', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = createMockLogger()
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('../../common/helpers/logging/logger.js')
    vi.doUnmock('uuid')
    vi.doUnmock('../../config.js')
  })

  describe('EmailVerificationService Class', () => {
    it('should create service instance with correct properties', async () => {
      setupLoggerMock(mockLogger)

      const { EmailVerificationService } = await import(
        './email-verification.service.js'
      )

      const mockCollection = createMockCollection()
      mockCollection.createIndex.mockResolvedValue()
      const mockDb = createMockDb(mockCollection)

      const service = new EmailVerificationService(mockDb, mockLogger)

      expect(service.db).toBe(mockDb)
      expect(service.collection).toBe(mockCollection)
      expect(mockDb.collection).toHaveBeenCalledWith(
        'user-email-verification-details'
      )
    })
  })

  describe('storeVerificationDetails method', () => {
    it('should store verification details successfully', async () => {
      setupLoggerMock(mockLogger)

      vi.doMock('uuid', () => ({
        v4: vi.fn(() => '123e4567-e89b-12d3-a456-426614174000')
      }))

      vi.doMock('../../config.js', () => ({
        config: {
          get: vi.fn(() => 'https://example.com/')
        }
      }))

      const { EmailVerificationService } = await import(
        './email-verification.service.js'
      )

      const mockCollection = createMockCollection()
      mockCollection.createIndex.mockResolvedValue()
      mockCollection.replaceOne.mockResolvedValue({
        upsertedId: 'new-id-123',
        modifiedCount: 0
      })

      const mockDb = createMockDb(mockCollection)
      const service = new EmailVerificationService(mockDb, mockLogger)

      const result = await service.storeVerificationDetails(
        'user@example.com',
        'email',
        'staines',
        0.789,
        -0.876,
        15
      )

      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        { contact: 'user@example.com' },
        expect.objectContaining({
          contact: 'user@example.com',
          secret: '123e4567-e89b-12d3-a456-426614174000',
          validated: false,
          verificationData: {
            emailAddress: 'user@example.com',
            alertType: 'email',
            location: 'staines',
            lat: 0.789,
            long: -0.876
          }
        }),
        { upsert: true }
      )

      expect(result.success).toBe(true)
      expect(result.uuid).toBe('123e4567-e89b-12d3-a456-426614174000')
      expect(result.verificationLink).toContain(
        '123e4567-e89b-12d3-a456-426614174000'
      )
    }, 10000)
  })

  describe('validateLink method', () => {
    it('should validate link successfully', async () => {
      setupLoggerMock(mockLogger)

      const { EmailVerificationService } = await import(
        './email-verification.service.js'
      )

      const mockCollection = createMockCollection()
      mockCollection.createIndex.mockResolvedValue()
      mockCollection.findOne.mockResolvedValue({
        secret: '123e4567-e89b-12d3-a456-426614174000',
        expiryTime: new Date(Date.now() + 60000),
        validated: false,
        verificationData: {
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        }
      })
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const mockDb = createMockDb(mockCollection)
      const service = new EmailVerificationService(mockDb, mockLogger)

      const result = await service.validateLink(
        '123e4567-e89b-12d3-a456-426614174000'
      )

      expect(result.valid).toBe(true)
      expect(result.data).toEqual({
        emailAddress: 'user@example.com',
        alertType: 'email',
        location: 'staines',
        lat: 0.789,
        long: -0.876
      })
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { secret: '123e4567-e89b-12d3-a456-426614174000' },
        {
          $set: {
            validated: true,
            updatedAt: expect.any(Date)
          }
        }
      )
    }, 10000)

    it('should return error with user data when link is expired', async () => {
      setupLoggerMock(mockLogger)

      const { EmailVerificationService } = await import(
        './email-verification.service.js'
      )

      const mockCollection = createMockCollection()
      mockCollection.createIndex.mockResolvedValue()
      mockCollection.findOne.mockResolvedValue({
        secret: '123e4567-e89b-12d3-a456-426614174000',
        expiryTime: new Date(Date.now() - 60000), // Expired
        validated: false,
        verificationData: {
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        }
      })

      const mockDb = createMockDb(mockCollection)
      const service = new EmailVerificationService(mockDb, mockLogger)

      const result = await service.validateLink(
        '123e4567-e89b-12d3-a456-426614174000'
      )

      expect(result.error).toBe('Verification link has expired')
      expect(result.data).toEqual({
        emailAddress: 'user@example.com',
        alertType: 'email',
        location: 'staines',
        lat: 0.789,
        long: -0.876
      })
      expect(mockCollection.updateOne).not.toHaveBeenCalled()
    }, 10000)

    it('should return error with user data when link is already validated', async () => {
      setupLoggerMock(mockLogger)

      const { EmailVerificationService } = await import(
        './email-verification.service.js'
      )

      const mockCollection = createMockCollection()
      mockCollection.createIndex.mockResolvedValue()
      mockCollection.findOne.mockResolvedValue({
        secret: '123e4567-e89b-12d3-a456-426614174000',
        expiryTime: new Date(Date.now() + 60000),
        validated: true, // Already validated
        verificationData: {
          emailAddress: 'user@example.com',
          alertType: 'email',
          location: 'staines',
          lat: 0.789,
          long: -0.876
        }
      })

      const mockDb = createMockDb(mockCollection)
      const service = new EmailVerificationService(mockDb, mockLogger)

      const result = await service.validateLink(
        '123e4567-e89b-12d3-a456-426614174000'
      )

      expect(result.error).toBe('Link has already been validated')
      expect(result.data).toEqual({
        emailAddress: 'user@example.com',
        alertType: 'email',
        location: 'staines',
        lat: 0.789,
        long: -0.876
      })
      expect(mockCollection.updateOne).not.toHaveBeenCalled()
    }, 10000)

    it('should return error without user data when link is invalid', async () => {
      setupLoggerMock(mockLogger)

      const { EmailVerificationService } = await import(
        './email-verification.service.js'
      )

      const mockCollection = createMockCollection()
      mockCollection.createIndex.mockResolvedValue()
      mockCollection.findOne.mockResolvedValue(null)

      const mockDb = createMockDb(mockCollection)
      const service = new EmailVerificationService(mockDb, mockLogger)

      const result = await service.validateLink(
        '123e4567-e89b-12d3-a456-426614174000'
      )

      expect(result.error).toBe('Invalid verification link')
      expect(result.data).toBeNull()
    }, 10000)

    it('should handle database errors gracefully', async () => {
      setupLoggerMock(mockLogger)

      const { EmailVerificationService } = await import(
        './email-verification.service.js'
      )

      const mockCollection = createMockCollection()
      mockCollection.createIndex.mockResolvedValue()
      mockCollection.findOne.mockRejectedValue(new Error('Database error'))

      const mockDb = createMockDb(mockCollection)
      const service = new EmailVerificationService(mockDb, mockLogger)

      const result = await service.validateLink(
        '123e4567-e89b-12d3-a456-426614174000'
      )

      expect(result.error).toBe('Failed to validate link')
      expect(result.data).toBeNull()
      expect(mockLogger.error).toHaveBeenCalled()
    }, 10000)
  })

  describe('Factory Function', () => {
    it('should create service instance via factory', async () => {
      setupLoggerMock(mockLogger)

      const { createEmailVerificationService, EmailVerificationService } =
        await import('./email-verification.service.js')

      const mockCollection = createMockCollection()
      mockCollection.createIndex.mockResolvedValue()
      const mockDb = createMockDb(mockCollection)
      const service = createEmailVerificationService(mockDb, mockLogger)

      expect(service).toBeInstanceOf(EmailVerificationService)
      expect(typeof createEmailVerificationService).toBe('function')
    }, 10000)
  })
})
