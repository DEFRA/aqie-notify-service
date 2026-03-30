import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    insertOne: vi.fn()
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

describe('UserNotificationDetailService', () => {
  let mockLogger
  let mockCollection
  let mockDb

  beforeEach(() => {
    vi.resetModules()
    mockLogger = createMockLogger()
    mockCollection = createMockCollection()
    mockDb = createMockDb(mockCollection)
    setupLoggerMock(mockLogger)
  })

  async function loadService() {
    const {
      createUserNotificationDetailService,
      UserNotificationDetailService
    } = await import('./user-notification-detail.service.js')
    return {
      createUserNotificationDetailService,
      UserNotificationDetailService
    }
  }

  describe('createUserNotificationDetailService', () => {
    it('should create an instance of UserNotificationDetailService', async () => {
      const {
        createUserNotificationDetailService,
        UserNotificationDetailService
      } = await loadService()

      const service = createUserNotificationDetailService(mockDb, mockLogger)

      expect(service).toBeInstanceOf(UserNotificationDetailService)
    })
  })

  describe('constructor', () => {
    it('should use provided logger', async () => {
      const { createUserNotificationDetailService } = await loadService()

      const service = createUserNotificationDetailService(mockDb, mockLogger)

      expect(service.logger).toBe(mockLogger)
    })

    it('should use default logger when none provided', async () => {
      const { createUserNotificationDetailService } = await loadService()

      const service = createUserNotificationDetailService(mockDb)

      expect(service.logger).toBeDefined()
    })

    it('should initialise collection as user-notification-details', async () => {
      const { createUserNotificationDetailService } = await loadService()

      createUserNotificationDetailService(mockDb, mockLogger)

      expect(mockDb.collection).toHaveBeenCalledWith(
        'user-notification-details'
      )
    })
  })

  describe('storeNotificationDetail', () => {
    const validParams = {
      notificationId: 'notif-123',
      alertId: 'alert-456',
      notifyStatus: 'submitted'
    }

    it('should insert document with correct fields', async () => {
      const { createUserNotificationDetailService } = await loadService()
      const service = createUserNotificationDetailService(mockDb, mockLogger)
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'abc-123' })

      await service.storeNotificationDetail(validParams)

      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notif-123',
          alertId: 'alert-456',
          notifyStatus: 'submitted',
          createdAt: expect.any(Date)
        })
      )
    })

    it('should return success with insertedId', async () => {
      const { createUserNotificationDetailService } = await loadService()
      const service = createUserNotificationDetailService(mockDb, mockLogger)
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'abc-123' })

      const result = await service.storeNotificationDetail(validParams)

      expect(result).toEqual({ success: true, insertedId: 'abc-123' })
    })

    it('should log start and success messages', async () => {
      const { createUserNotificationDetailService } = await loadService()
      const service = createUserNotificationDetailService(mockDb, mockLogger)
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'abc-123' })

      await service.storeNotificationDetail(validParams)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('user_notification_detail.store.start')
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('user_notification_detail.store.success')
      )
    })

    it('should throw and log error when insertOne fails', async () => {
      const { createUserNotificationDetailService } = await loadService()
      const service = createUserNotificationDetailService(mockDb, mockLogger)
      mockCollection.insertOne.mockRejectedValue(
        new Error('DB connection lost')
      )

      await expect(
        service.storeNotificationDetail(validParams)
      ).rejects.toThrow(
        'Failed to store notification detail: DB connection lost'
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('user_notification_detail.store.error')
      )
    })
  })
})
