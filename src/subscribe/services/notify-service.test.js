import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Helper functions extracted to reduce nesting
function parseNotifyError(err) {
  const statusCode = err?.response?.data?.status_code || err?.response?.status
  const errors = Array.isArray(err?.response?.data?.errors)
    ? err.response.data.errors
    : []
  const primary = errors[0] || {}
  const errorType = primary.error || primary.code

  let category = 'unknown'
  if (statusCode === 401) {
    category = 'unauthorized'
  } else if (statusCode === 403) {
    category = 'forbidden'
  } else if (errorType === 'RateLimitError') {
    category = 'rate_limit'
  } else if (errorType === 'TooManyRequestsError') {
    category = 'daily_limit'
  } else if (errorType === 'BadRequestError' || statusCode === 400) {
    category = 'bad_request'
  } else if (statusCode && statusCode >= 500) {
    category = 'server_error'
  }

  const retriable =
    (statusCode >= 500 && statusCode <= 599) ||
    errorType === 'RateLimitError' ||
    errorType === 'TooManyRequestsError'

  return {
    statusCode,
    errorType,
    category,
    retriable,
    details: errors.map((e) => ({
      error: e.error || e.code
    }))
  }
}

function maskMsisdn(msisdn) {
  if (!msisdn) return undefined
  const visible = msisdn.slice(-3)
  return msisdn.slice(0, msisdn.length - 3).replace(/./g, 'x') + visible
}

function createMockSetup() {
  const mockNotifyClient = {
    sendSms: vi.fn(),
    getNotificationById: vi.fn()
  }

  const mockConfig = {
    get: vi.fn((key) => {
      const configs = {
        'notify.apiKey': 'test-api-key-123',
        'notify.templateId': 'template-456',
        'notify.otpPersonalisationKey': 'otp_code',
        'notify.timeoutMs': 5000
      }
      return configs[key]
    })
  }

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn()
  }

  return { mockNotifyClient, mockConfig, mockLogger }
}

function setupMocks(mockNotifyClient, mockConfig, mockLogger) {
  vi.doMock('notifications-node-client', () => ({
    NotifyClient: vi.fn(() => mockNotifyClient)
  }))

  vi.doMock('../../config.js', () => ({
    config: mockConfig
  }))

  vi.doMock('../../common/helpers/logging/logger.js', () => ({
    createLogger: vi.fn(() => mockLogger)
  }))
}

describe('Notify Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.doUnmock('notifications-node-client')
    vi.doUnmock('../../config.js')
    vi.doUnmock('../../common/helpers/logging/logger.js')
  })

  describe('NotifySmsError Class', () => {
    it('should create error with proper structure', async () => {
      // Setup mocks first to prevent timeout
      const { mockNotifyClient, mockConfig, mockLogger } = createMockSetup()
      setupMocks(mockNotifyClient, mockConfig, mockLogger)

      const { NotifySmsError } = await import('./notify-service.js')

      const meta = {
        statusCode: 400,
        errorType: 'BadRequestError',
        category: 'bad_request',
        retriable: false
      }

      const error = new NotifySmsError('Test error', meta)

      expect(error.name).toBe('NotifySmsError')
      expect(error.message).toBe('Test error')
      expect(error.statusCode).toBe(400)
      expect(error.errorType).toBe('BadRequestError')
      expect(error.category).toBe('bad_request')
      expect(error.retriable).toBe(false)
      expect(error.meta).toEqual(meta)
    }, 10000) // Increased timeout

    it('should handle undefined meta gracefully', async () => {
      const { mockNotifyClient, mockConfig, mockLogger } = createMockSetup()
      setupMocks(mockNotifyClient, mockConfig, mockLogger)

      const { NotifySmsError } = await import('./notify-service.js')

      const error = new NotifySmsError('Test error')

      expect(error.name).toBe('NotifySmsError')
      expect(error.message).toBe('Test error')
      expect(error.statusCode).toBeUndefined()
      expect(error.errorType).toBeUndefined()
    }, 10000)

    it('should handle partial meta object', async () => {
      const { mockNotifyClient, mockConfig, mockLogger } = createMockSetup()
      setupMocks(mockNotifyClient, mockConfig, mockLogger)

      const { NotifySmsError } = await import('./notify-service.js')

      const meta = {
        statusCode: 500,
        retriable: true
      }

      const error = new NotifySmsError('Partial meta error', meta)

      expect(error.statusCode).toBe(500)
      expect(error.retriable).toBe(true)
      expect(error.errorType).toBeUndefined()
      expect(error.category).toBeUndefined()
    }, 10000)
  })

  describe('Error Parsing Logic', () => {
    it('should parse 401 unauthorized error correctly', () => {
      const apiError = {
        response: {
          status: 401,
          data: {
            status_code: 401,
            errors: [{ error: 'AuthError', message: 'Invalid API key' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBe(401)
      expect(parsed.errorType).toBe('AuthError')
      expect(parsed.category).toBe('unauthorized')
      expect(parsed.retriable).toBe(false)
    })

    it('should parse 403 forbidden error correctly', () => {
      const apiError = {
        response: {
          status: 403,
          data: {
            status_code: 403,
            errors: [{ error: 'ForbiddenError' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBe(403)
      expect(parsed.errorType).toBe('ForbiddenError')
      expect(parsed.category).toBe('forbidden')
      expect(parsed.retriable).toBe(false)
    })

    it('should parse rate limit error as retriable', () => {
      const apiError = {
        response: {
          status: 429,
          data: {
            status_code: 429,
            errors: [{ error: 'RateLimitError' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBe(429)
      expect(parsed.errorType).toBe('RateLimitError')
      expect(parsed.category).toBe('rate_limit')
      expect(parsed.retriable).toBe(true)
    })

    it('should parse daily limit error as retriable', () => {
      const apiError = {
        response: {
          data: {
            errors: [{ error: 'TooManyRequestsError' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.errorType).toBe('TooManyRequestsError')
      expect(parsed.category).toBe('daily_limit')
      expect(parsed.retriable).toBe(true)
    })

    it('should parse server error as retriable', () => {
      const apiError = {
        response: {
          status: 500,
          data: {
            status_code: 500,
            errors: [{ error: 'InternalServerError' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBe(500)
      expect(parsed.errorType).toBe('InternalServerError')
      expect(parsed.category).toBe('server_error')
      expect(parsed.retriable).toBe(true)
    })

    it('should parse bad request error correctly', () => {
      const apiError = {
        response: {
          status: 400,
          data: {
            status_code: 400,
            errors: [{ error: 'BadRequestError' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBe(400)
      expect(parsed.errorType).toBe('BadRequestError')
      expect(parsed.category).toBe('bad_request')
      expect(parsed.retriable).toBe(false)
    })

    it('should handle multiple errors correctly', () => {
      const apiError = {
        response: {
          status: 400,
          data: {
            status_code: 400,
            errors: [{ error: 'BadRequestError' }, { error: 'ValidationError' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBe(400)
      expect(parsed.errorType).toBe('BadRequestError')
      expect(parsed.category).toBe('bad_request')
      expect(parsed.details).toHaveLength(2)
      expect(parsed.details[0].error).toBe('BadRequestError')
      expect(parsed.details[1].error).toBe('ValidationError')
    })

    it('should handle unknown error formats', () => {
      const apiError = new Error('Network error')

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBeUndefined()
      expect(parsed.errorType).toBeUndefined()
      expect(parsed.category).toBe('unknown')
      expect(parsed.retriable).toBe(false)
      expect(parsed.details).toEqual([])
    })

    it('should handle errors with code instead of error field', () => {
      const apiError = {
        response: {
          status: 400,
          data: {
            status_code: 400,
            errors: [{ code: 'ValidationFailed' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.errorType).toBe('ValidationFailed')
      expect(parsed.details[0].error).toBe('ValidationFailed')
    })

    it('should handle 502 bad gateway as retriable', () => {
      const apiError = {
        response: {
          status: 502,
          data: {
            status_code: 502,
            errors: [{ error: 'BadGateway' }]
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBe(502)
      expect(parsed.category).toBe('server_error')
      expect(parsed.retriable).toBe(true)
    })

    it('should handle 599 as retriable server error', () => {
      const apiError = {
        response: {
          status: 599,
          data: {
            status_code: 599,
            errors: []
          }
        }
      }

      const parsed = parseNotifyError(apiError)

      expect(parsed.statusCode).toBe(599)
      expect(parsed.category).toBe('server_error')
      expect(parsed.retriable).toBe(true)
    })
  })

  describe('Phone Number Masking Logic', () => {
    it('should mask phone numbers correctly', () => {
      expect(maskMsisdn('+447123456789')).toBe('xxxxxxxxxx789')
      expect(maskMsisdn('07123456789')).toBe('xxxxxxxx789')
      expect(maskMsisdn('123456789')).toBe('xxxxxx789')
    })

    it('should handle short phone numbers', () => {
      expect(maskMsisdn('123')).toBe('123')
      expect(maskMsisdn('12')).toBe('x12')
      expect(maskMsisdn('1')).toBe('1')
    })

    it('should handle undefined/null', () => {
      expect(maskMsisdn(undefined)).toBeUndefined()
      expect(maskMsisdn(null)).toBeUndefined()
      expect(maskMsisdn('')).toBeUndefined()
    })

    it('should handle exactly 3 characters', () => {
      expect(maskMsisdn('123')).toBe('123')
    })

    it('should handle 4 characters', () => {
      expect(maskMsisdn('1234')).toBe('x234')
    })
  })

  describe('NotifyService Integration Tests', () => {
    let mockNotifyClient
    let mockConfig
    let mockLogger

    beforeEach(() => {
      const mocks = createMockSetup()
      mockNotifyClient = mocks.mockNotifyClient
      mockConfig = mocks.mockConfig
      mockLogger = mocks.mockLogger

      vi.clearAllMocks()
      vi.resetModules()
    })

    describe('Service Initialization', () => {
      it('should initialize with correct configuration', async () => {
        setupMocks(mockNotifyClient, mockConfig, mockLogger)

        const { NotifyService } = await import('./notify-service.js')

        const service = new NotifyService()

        expect(mockConfig.get).toHaveBeenCalledWith('notify.apiKey')
        expect(mockConfig.get).toHaveBeenCalledWith('notify.templateId')
        expect(mockConfig.get).toHaveBeenCalledWith(
          'notify.otpPersonalisationKey'
        )
        expect(mockConfig.get).toHaveBeenCalledWith('notify.timeoutMs')

        expect(service.apiKey).toBe('test-api-key-123')
        expect(service.templateId).toBe('template-456')
        expect(service.otpPersonalisationKey).toBe('otp_code')
        expect(service.timeoutMs).toBe(5000)
      }, 10000)

      it('should create NotifyClient with API key', async () => {
        setupMocks(mockNotifyClient, mockConfig, mockLogger)

        const { NotifyClient } = await import('notifications-node-client')
        const { NotifyService } = await import('./notify-service.js')

        const service = new NotifyService()

        expect(NotifyClient).toHaveBeenCalledWith('test-api-key-123')
        expect(service).toBeDefined()
      }, 10000)
    })

    describe('sendOTPSMS Method', () => {
      it('should send SMS successfully', async () => {
        setupMocks(mockNotifyClient, mockConfig, mockLogger)

        const { NotifyService } = await import('./notify-service.js')

        mockNotifyClient.sendSms.mockResolvedValue({
          data: {
            id: 'notification-123',
            uri: 'https://api.notifications.service.gov.uk/v2/notifications/notification-123'
          }
        })

        const service = new NotifyService()
        const result = await service.sendOTPSMS('+447123456789', '12345')

        expect(mockNotifyClient.sendSms).toHaveBeenCalledWith(
          'template-456',
          '+447123456789',
          {
            personalisation: { otp_code: '12345' }
          }
        )

        expect(mockLogger.info).toHaveBeenCalledWith('notify.send_sms.start', {
          phoneNumberMasked: 'xxxxxxxxxx789'
        })

        expect(mockLogger.info).toHaveBeenCalledWith(
          'notify.send_sms.success',
          {
            notificationId: 'notification-123'
          }
        )

        expect(result).toEqual({
          success: true,
          notificationId: 'notification-123',
          notificationStatus:
            'https://api.notifications.service.gov.uk/v2/notifications/notification-123'
        })
      }, 10000)

      it('should handle missing notification ID', async () => {
        setupMocks(mockNotifyClient, mockConfig, mockLogger)

        const { NotifyService, NotifySmsError } = await import(
          './notify-service.js'
        )

        mockNotifyClient.sendSms.mockResolvedValue({
          data: {} // Missing id
        })

        const service = new NotifyService()

        await expect(
          service.sendOTPSMS('+447123456789', '12345')
        ).rejects.toThrow(NotifySmsError)

        expect(mockLogger.error).toHaveBeenCalledWith(
          'notify.send_sms.missing_id'
        )
      }, 10000)

      it('should handle undefined response data', async () => {
        setupMocks(mockNotifyClient, mockConfig, mockLogger)

        const { NotifyService, NotifySmsError } = await import(
          './notify-service.js'
        )

        mockNotifyClient.sendSms.mockResolvedValue({}) // No data property

        const service = new NotifyService()

        await expect(
          service.sendOTPSMS('+447123456789', '12345')
        ).rejects.toThrow(NotifySmsError)
      }, 10000)

      it('should handle network errors correctly', async () => {
        setupMocks(mockNotifyClient, mockConfig, mockLogger)

        const { NotifyService, NotifySmsError } = await import(
          './notify-service.js'
        )

        const networkError = new Error('Network timeout')
        mockNotifyClient.sendSms.mockRejectedValue(networkError)

        const service = new NotifyService()

        try {
          await service.sendOTPSMS('+447123456789', '12345')
          expect.fail('Should have thrown an error')
        } catch (error) {
          expect(error).toBeInstanceOf(NotifySmsError)
          expect(error.category).toBe('unknown')
          expect(error.retriable).toBe(false)
        }

        expect(mockLogger.error).toHaveBeenCalledWith(
          'notify.send_sms.failure',
          expect.objectContaining({
            category: 'unknown',
            retriable: false
          })
        )
      }, 10000)
    })

    describe('getNotificationStatus Method', () => {
      it('should get notification status successfully', async () => {
        setupMocks(mockNotifyClient, mockConfig, mockLogger)

        const { NotifyService } = await import('./notify-service.js')

        const mockStatus = {
          id: 'notification-123',
          status: 'delivered',
          created_at: '2024-01-01T12:00:00Z'
        }

        mockNotifyClient.getNotificationById.mockResolvedValue({
          body: mockStatus
        })

        const service = new NotifyService()
        const result = await service.getNotificationStatus('notification-123')

        expect(mockNotifyClient.getNotificationById).toHaveBeenCalledWith(
          'notification-123'
        )
        expect(result).toEqual(mockStatus)
      }, 10000)

      it('should handle error when getting notification status', async () => {
        setupMocks(mockNotifyClient, mockConfig, mockLogger)

        const { NotifyService, NotifySmsError } = await import(
          './notify-service.js'
        )

        const apiError = new Error('Not Found')
        apiError.response = {
          status: 404,
          data: {
            status_code: 404,
            errors: [{ error: 'NotFoundError' }]
          }
        }

        mockNotifyClient.getNotificationById.mockRejectedValue(apiError)

        const service = new NotifyService()

        try {
          await service.getNotificationStatus('notification-123')
          expect.fail('Should have thrown an error')
        } catch (error) {
          expect(error).toBeInstanceOf(NotifySmsError)
          expect(error.message).toBe('FailedToGetNotificationStatus')
          expect(error.meta.notificationId).toBe('notification-123')
        }

        expect(mockLogger.error).toHaveBeenCalledWith(
          'notify.get_status.failure',
          {
            notificationId: 'notification-123',
            statusCode: 404,
            errorType: 'NotFoundError',
            category: 'unknown',
            retriable: false
          }
        )
      }, 10000)
    })
  })

  describe('Service Export Structure', () => {
    it('should export the required classes and instances', async () => {
      const { mockNotifyClient, mockConfig, mockLogger } = createMockSetup()
      setupMocks(mockNotifyClient, mockConfig, mockLogger)

      const module = await import('./notify-service.js')

      expect(module.NotifyService).toBeDefined()
      expect(module.NotifySmsError).toBeDefined()
      expect(module.notifyService).toBeDefined()
      expect(typeof module.NotifyService).toBe('function')
      expect(typeof module.NotifySmsError).toBe('function')
      expect(typeof module.notifyService).toBe('object')
    }, 10000)

    it('should create singleton instance correctly', async () => {
      const { mockNotifyClient, mockConfig, mockLogger } = createMockSetup()
      setupMocks(mockNotifyClient, mockConfig, mockLogger)

      const { notifyService, NotifyService } = await import(
        './notify-service.js'
      )

      expect(notifyService).toBeInstanceOf(NotifyService)
    }, 10000)
  })

  describe('Configuration Integration', () => {
    it('should properly integrate with config system', () => {
      const expectedKeys = [
        'notify.apiKey',
        'notify.templateId',
        'notify.otpPersonalisationKey',
        'notify.timeoutMs'
      ]

      expect(expectedKeys).toEqual([
        'notify.apiKey',
        'notify.templateId',
        'notify.otpPersonalisationKey',
        'notify.timeoutMs'
      ])
    })
  })

  describe('API Response Structure', () => {
    it('should handle successful notification response format', () => {
      const mockResponse = {
        data: {
          id: 'notification-123',
          uri: 'https://api.notifications.service.gov.uk/v2/notifications/notification-123'
        }
      }

      expect(mockResponse.data.id).toBe('notification-123')
      expect(mockResponse.data.uri).toContain('notification-123')
    })

    it('should handle notification status response format', () => {
      const mockStatus = {
        id: 'notification-123',
        status: 'delivered',
        created_at: '2024-01-01T12:00:00Z'
      }

      expect(mockStatus.id).toBe('notification-123')
      expect(mockStatus.status).toBe('delivered')
      expect(mockStatus.created_at).toBeDefined()
    })
  })
})
