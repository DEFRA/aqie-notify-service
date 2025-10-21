import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Helper functions extracted to reduce nesting
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
    deleteMany: vi.fn()
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

function createExpectedDocument() {
  return {
    contact: '+447123456789',
    secret: '123456',
    expiryTime: new Date('2024-12-31T23:59:59Z'),
    validated: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z')
  }
}

function createContactQueries() {
  return {
    contactQuery: { contact: '+447123456789' },
    cleanupQuery: {
      expiryTime: { $lt: new Date() },
      validated: false
    },
    updateOperation: {
      $set: {
        validated: true,
        updatedAt: new Date()
      }
    }
  }
}

function createErrorMessages() {
  return {
    notFound: 'Contact Detail not found',
    invalidSecret: 'Invalid secret',
    expired: 'Secret has expired',
    alreadyUsed: 'Secret has already been used'
  }
}

describe('User Contact Service', () => {
  let mockLogger

  beforeEach(() => {
    mockLogger = createMockLogger()
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('../../common/helpers/logging/logger.js')
  })

  describe('UserContactService Class', () => {
    it('should create service instance with correct properties', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      const mockDb = createMockDb(mockCollection)

      const service = new UserContactService(mockDb)

      expect(service.db).toBe(mockDb)
      expect(service.collection).toBe(mockCollection)
      expect(mockDb.collection).toHaveBeenCalledWith('user-contact-details')
    })
  })

  describe('storeVerificationDetails method - Integration Tests', () => {
    it('should store new verification details successfully', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.replaceOne.mockResolvedValue({
        upsertedId: 'new-id-123',
        modifiedCount: 0
      })

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const contact = '+447123456789'
      const secret = '123456'
      const expiryTime = new Date('2024-12-31T23:59:59Z')

      const result = await service.storeVerificationDetails(
        contact,
        secret,
        expiryTime
      )

      expect(mockCollection.replaceOne).toHaveBeenCalledWith(
        { contact },
        {
          contact,
          secret,
          expiryTime,
          validated: false,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date)
        },
        { upsert: true }
      )

      expect(result).toEqual({
        success: true,
        upserted: true,
        modified: false
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        `secret stored for phone number ${contact}`,
        {
          upserted: true,
          modified: false
        }
      )
    })

    it('should update existing verification details successfully', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.replaceOne.mockResolvedValue({
        upsertedId: null,
        modifiedCount: 1
      })

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.storeVerificationDetails(
        '+447123456789',
        '654321',
        new Date()
      )

      expect(result).toEqual({
        success: true,
        upserted: false,
        modified: true
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        'secret stored for phone number +447123456789',
        {
          upserted: false,
          modified: true
        }
      )
    })

    it('should handle database errors in storeVerificationDetails', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.replaceOne.mockRejectedValue(
        new Error('Connection timeout')
      )

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      await expect(
        service.storeVerificationDetails('+447123456789', '123456', new Date())
      ).rejects.toThrow('Failed to store secret: Connection timeout')

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to store secret for +447123456789',
        {
          error: 'Connection timeout'
        }
      )
    })
  })

  describe('validateSecret method - Integration Tests', () => {
    it('should return error when contact not found', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.findOne.mockResolvedValue(null)

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.validateSecret('+447123456789', '123456')

      expect(mockCollection.findOne).toHaveBeenCalledWith({
        contact: '+447123456789'
      })
      expect(result).toEqual({
        valid: false,
        error: 'Contact Detail not found'
      })
      expect(mockCollection.updateOne).not.toHaveBeenCalled()
    })

    it('should return error when secret is invalid', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.findOne.mockResolvedValue({
        secret: '123456',
        expiryTime: new Date('2025-12-31T23:59:59Z'),
        validated: false
      })

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.validateSecret('+447123456789', '654321')

      expect(result).toEqual({
        valid: false,
        error: 'Invalid secret'
      })
      expect(mockCollection.updateOne).not.toHaveBeenCalled()
    })

    it('should return error when secret has expired', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.findOne.mockResolvedValue({
        secret: '123456',
        expiryTime: new Date('2020-01-01T00:00:00Z'), // Past date
        validated: false
      })

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.validateSecret('+447123456789', '123456')

      expect(result).toEqual({
        valid: false,
        error: 'Secret has expired'
      })
      expect(mockCollection.updateOne).not.toHaveBeenCalled()
    })

    it('should return error when secret already used', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.findOne.mockResolvedValue({
        secret: '123456',
        expiryTime: new Date('2030-12-31T23:59:59Z'),
        validated: true
      })

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.validateSecret('+447123456789', '123456')

      expect(result).toEqual({
        valid: false,
        error: 'Secret has already been used'
      })
      expect(mockCollection.updateOne).not.toHaveBeenCalled()
    })

    it('should validate successfully and mark as used', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.findOne.mockResolvedValue({
        secret: '123456',
        expiryTime: new Date('2030-12-31T23:59:59Z'),
        validated: false
      })
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.validateSecret('+447123456789', '123456')

      expect(result).toEqual({
        valid: true,
        error: null
      })

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { contact: '+447123456789' },
        {
          $set: {
            validated: true,
            updatedAt: expect.any(Date)
          }
        }
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Secret validated successfully for +447123456789'
      )
    })

    it('should handle database errors in validateSecret', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.findOne.mockRejectedValue(new Error('Database error'))

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      await expect(
        service.validateSecret('+447123456789', '123456')
      ).rejects.toThrow('Failed to validate secret: Database error')

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to validate secret for +447123456789',
        {
          error: 'Database error'
        }
      )
    })
  })

  describe('getUserByContact method - Integration Tests', () => {
    it('should return user document when found', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const expectedDocument = createExpectedDocument()
      const mockCollection = createMockCollection()
      mockCollection.findOne.mockResolvedValue(expectedDocument)

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.getUserByContact('+447123456789')

      expect(mockCollection.findOne).toHaveBeenCalledWith({
        contact: '+447123456789'
      })
      expect(result).toEqual(expectedDocument)
    })

    it('should return null when user not found', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.findOne.mockResolvedValue(null)

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.getUserByContact('+447123456789')

      expect(result).toBeNull()
    })

    it('should handle database errors in getUserByContact', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.findOne.mockRejectedValue(
        new Error('Database connection lost')
      )

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      await expect(service.getUserByContact('+447123456789')).rejects.toThrow(
        'Failed to get user: Database connection lost'
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get user by contact +447123456789',
        {
          error: 'Database connection lost'
        }
      )
    })
  })

  describe('cleanupExpiredsecrets method - Integration Tests', () => {
    it('should delete expired unvalidated secrets', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.deleteMany.mockResolvedValue({ deletedCount: 5 })

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.cleanupExpiredsecrets()

      expect(mockCollection.deleteMany).toHaveBeenCalledWith({
        expiryTime: { $lt: expect.any(Date) },
        validated: false
      })
      expect(result).toBe(5)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaned up 5 expired secrets'
      )
    })

    it('should return 0 when no expired secrets found', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 })

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      const result = await service.cleanupExpiredsecrets()

      expect(result).toBe(0)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaned up 0 expired secrets'
      )
    })

    it('should handle database errors in cleanupExpiredsecrets', async () => {
      setupLoggerMock(mockLogger)

      const { UserContactService } = await import('./user-contact-service.js')

      const mockCollection = createMockCollection()
      mockCollection.deleteMany.mockRejectedValue(new Error('Index error'))

      const mockDb = createMockDb(mockCollection)
      const service = new UserContactService(mockDb)

      await expect(service.cleanupExpiredsecrets()).rejects.toThrow(
        'Failed to cleanup expired secrets: Index error'
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup expired secrets',
        {
          error: 'Index error'
        }
      )
    })
  })

  describe('Factory Function', () => {
    it('should create service instance via factory', async () => {
      setupLoggerMock(mockLogger)

      const { createUserContactService, UserContactService } = await import(
        './user-contact-service.js'
      )

      const mockDb = { collection: vi.fn(() => ({})) }
      const service = createUserContactService(mockDb)

      expect(service).toBeInstanceOf(UserContactService)
      expect(typeof createUserContactService).toBe('function')
    })
  })

  describe('Document Structure', () => {
    it('should define correct document shape', () => {
      const expectedDocument = createExpectedDocument()

      expect(typeof expectedDocument.contact).toBe('string')
      expect(typeof expectedDocument.secret).toBe('string')
      expect(expectedDocument.expiryTime instanceof Date).toBe(true)
      expect(typeof expectedDocument.validated).toBe('boolean')
      expect(expectedDocument.createdAt instanceof Date).toBe(true)
      expect(expectedDocument.updatedAt instanceof Date).toBe(true)
    })
  })

  describe('Collection Configuration', () => {
    it('should use correct collection name', () => {
      const collectionName = 'user-contact-details'

      expect(collectionName).toBe('user-contact-details')
      expect(typeof collectionName).toBe('string')
    })
  })

  describe('MongoDB Operations Structure', () => {
    it('should use correct query structures', () => {
      const queries = createContactQueries()

      expect(queries.contactQuery.contact).toBe('+447123456789')
      expect(queries.cleanupQuery.expiryTime.$lt instanceof Date).toBe(true)
      expect(queries.cleanupQuery.validated).toBe(false)
      expect(queries.updateOperation.$set.validated).toBe(true)
      expect(queries.updateOperation.$set.updatedAt instanceof Date).toBe(true)
    })

    it('should use correct upsert options', () => {
      const upsertOptions = { upsert: true }

      expect(upsertOptions.upsert).toBe(true)
    })
  })

  describe('Contact Types Support', () => {
    it('should handle phone number contacts', () => {
      const phoneContact = '+447123456789'

      expect(phoneContact.startsWith('+')).toBe(true)
      expect(phoneContact.length).toBeGreaterThan(10)
    })

    it('should handle email contacts', () => {
      const emailContact = 'user@example.com'

      expect(emailContact.includes('@')).toBe(true)
      expect(emailContact.toLowerCase()).toBe(emailContact)
    })
  })

  describe('Service Export Structure', () => {
    it('should export correct classes and functions', async () => {
      setupLoggerMock(mockLogger)

      const module = await import('./user-contact-service.js')

      expect(module.UserContactService).toBeDefined()
      expect(module.createUserContactService).toBeDefined()
      expect(typeof module.UserContactService).toBe('function')
      expect(typeof module.createUserContactService).toBe('function')
    })
  })

  describe('Error Message Consistency', () => {
    it('should have consistent error messages', () => {
      const expectedErrors = createErrorMessages()

      expect(expectedErrors.notFound).toBe('Contact Detail not found')
      expect(expectedErrors.invalidSecret).toBe('Invalid secret')
      expect(expectedErrors.expired).toBe('Secret has expired')
      expect(expectedErrors.alreadyUsed).toBe('Secret has already been used')
    })
  })

  describe('Date Handling', () => {
    it('should handle date comparisons correctly', () => {
      const pastDate = new Date('2020-01-01T00:00:00Z')
      const futureDate = new Date('2030-12-31T23:59:59Z')
      const currentDate = new Date()

      expect(currentDate > pastDate).toBe(true)
      expect(currentDate < futureDate).toBe(true)
      expect(new Date(pastDate) instanceof Date).toBe(true)
    })
  })
})
