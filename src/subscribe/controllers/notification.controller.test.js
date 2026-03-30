import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks (MUST be at top level - vi.mock is hoisted) ────────────────────────

const mockSend = vi.fn()
const mockCreateNotificationService = vi.fn(() => ({ send: mockSend }))
const mockStoreNotificationDetail = vi.fn()
const mockCreateUserNotificationDetailService = vi.fn(() => ({
  storeNotificationDetail: mockStoreNotificationDetail
}))
const mockMaskTemplateId = vi.fn((id) =>
  id ? `***${String(id).slice(-4)}` : 'null'
)
const mockGenerateOperationId = vi.fn((prefix) => `${prefix}_test_op_id`)
const mockMaskPhoneNumber = vi.fn((phone) =>
  phone ? `***${String(phone).slice(-3)}` : null
)
const mockMaskEmail = vi.fn((email) => (email ? `us***@example.com` : null))

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}

vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}))

vi.mock('../services/notify-service.js', () => ({
  createNotificationService: mockCreateNotificationService
}))

vi.mock('../services/user-notification-detail.service.js', () => ({
  createUserNotificationDetailService: mockCreateUserNotificationDetailService
}))

vi.mock('../../common/helpers/masking-utils.js', () => ({
  maskTemplateId: mockMaskTemplateId,
  generateOperationId: mockGenerateOperationId,
  maskPhoneNumber: mockMaskPhoneNumber,
  maskEmail: mockMaskEmail
}))

// ─── Import controller AFTER mocks ────────────────────────────────────────────

const { sendNotificationHandler } = await import('./notification.controller.js')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest({
  phoneNumber = undefined,
  emailAddress = undefined,
  templateId = 'template-uuid-1234',
  personalisation = { name: 'Test User' },
  alertId = 'alert-123',
  requestId = undefined,
  infoId = undefined
} = {}) {
  return {
    headers: {
      'x-cdp-request-id': requestId,
      'user-agent': 'VitestAgent/1.0'
    },
    info: { id: infoId },
    payload: {
      phoneNumber,
      emailAddress,
      templateId,
      personalisation,
      alertId
    },
    db: { collection: vi.fn() }
  }
}

function makeH() {
  const response = {
    code: vi.fn().mockReturnThis()
  }
  return {
    response: vi.fn(() => response),
    _response: response
  }
}

function flattenLogCalls(mockFn) {
  return mockFn.mock.calls.map((c) =>
    typeof c[1] === 'object' && c[1] !== null
      ? `${c[0]} ${JSON.stringify(c[1])}`
      : String(c[0])
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sendNotificationHandler', () => {
  beforeEach(() => {
    // Only clear mocks - do NOT call vi.resetModules() as it breaks hoisted mocks
    vi.clearAllMocks()

    // Re-attach mock implementations after clearAllMocks
    mockCreateNotificationService.mockImplementation(() => ({ send: mockSend }))
    mockCreateUserNotificationDetailService.mockImplementation(() => ({
      storeNotificationDetail: mockStoreNotificationDetail
    }))
    mockStoreNotificationDetail.mockResolvedValue({ success: true })
    mockMaskTemplateId.mockImplementation((id) =>
      id ? `***${String(id).slice(-4)}` : 'null'
    )
    mockGenerateOperationId.mockImplementation(
      (prefix) => `${prefix}_test_op_id`
    )
    mockMaskPhoneNumber.mockImplementation((phone) =>
      phone ? `***${String(phone).slice(-3)}` : null
    )
    mockMaskEmail.mockImplementation((email) =>
      email ? `us***@example.com` : null
    )
  })

  // ─── RequestId Resolution ──────────────────────────────────────────────────

  describe('requestId resolution', () => {
    it('should use x-cdp-request-id header when present', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'HEADER-REQUEST-ID',
        infoId: 'INFO-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'notif-123' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      expect(infoLogs.some((l) => l.includes('HEADER-REQUEST-ID'))).toBe(true)
    })

    it('should fall back to request.info.id when x-cdp-request-id header is absent', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: undefined,
        infoId: 'INFO-FALLBACK-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'notif-456' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      expect(infoLogs.some((l) => l.includes('INFO-FALLBACK-ID'))).toBe(true)
    })

    it('should fall back to generateOperationId when both header and info.id are absent', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: undefined,
        infoId: undefined
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'notif-789' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      expect(infoLogs.some((l) => l.includes('req_test_op_id'))).toBe(true)
    })
  })

  // ─── SMS Success ───────────────────────────────────────────────────────────

  describe('SMS notification - success', () => {
    it('should call send with correct args and return 201', async () => {
      const request = makeRequest({
        phoneNumber: '+447123456789',
        requestId: 'SMS-REQUEST-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'sms-notif-001' })

      await sendNotificationHandler(request, h)

      expect(mockSend).toHaveBeenCalledWith(
        '+447123456789',
        undefined,
        'template-uuid-1234',
        { name: 'Test User' },
        'SMS-REQUEST-ID'
      )
      expect(h.response).toHaveBeenCalledWith({
        notificationId: 'sms-notif-001',
        status: 'submitted'
      })
      expect(h._response.code).toHaveBeenCalledWith(201)
    })

    it('should log notification.send.requested and notification.send.success with contactType sms', async () => {
      const request = makeRequest({
        phoneNumber: '+447123456789',
        requestId: 'SMS-LOG-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'sms-notif-002' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)

      const requestedLog = infoLogs.find((l) =>
        l.includes('notification.send.requested')
      )
      expect(requestedLog).toBeDefined()
      expect(requestedLog).toContain('SMS-LOG-ID')

      const successLog = infoLogs.find((l) =>
        l.includes('notification.send.success')
      )
      expect(successLog).toBeDefined()
      expect(successLog).toContain('"contactType":"sms"')
      expect(successLog).toContain('"notificationId":"sms-notif-002"')
    })

    it('should mask phone number in requested log - not expose raw phone', async () => {
      const request = makeRequest({
        phoneNumber: '+447123456789',
        requestId: 'MASK-SMS-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'sms-notif-003' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      const requestedLog = infoLogs.find((l) =>
        l.includes('notification.send.requested')
      )
      expect(requestedLog).toBeDefined()
      expect(requestedLog).not.toContain('+447123456789')
    })
  })

  // ─── Email Success ─────────────────────────────────────────────────────────

  describe('Email notification - success', () => {
    it('should call send with correct args and return 201', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'EMAIL-REQUEST-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'email-notif-001' })

      await sendNotificationHandler(request, h)

      expect(mockSend).toHaveBeenCalledWith(
        undefined,
        'user@example.com',
        'template-uuid-1234',
        { name: 'Test User' },
        'EMAIL-REQUEST-ID'
      )
      expect(h.response).toHaveBeenCalledWith({
        notificationId: 'email-notif-001',
        status: 'submitted'
      })
      expect(h._response.code).toHaveBeenCalledWith(201)
    })

    it('should log notification.send.success with contactType email', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'EMAIL-LOG-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'email-notif-002' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      const successLog = infoLogs.find((l) =>
        l.includes('notification.send.success')
      )
      expect(successLog).toBeDefined()
      expect(successLog).toContain('"contactType":"email"')
      expect(successLog).toContain('"notificationId":"email-notif-002"')
    })

    it('should mask email address in requested log - not expose raw email', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'MASK-EMAIL-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'email-notif-003' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      const requestedLog = infoLogs.find((l) =>
        l.includes('notification.send.requested')
      )
      expect(requestedLog).toBeDefined()
      expect(requestedLog).not.toContain('user@example.com')
    })

    it('should mask templateId in requested log - not expose raw templateId', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'MASK-TEMPLATE-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'email-notif-004' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      const requestedLog = infoLogs.find((l) =>
        l.includes('notification.send.requested')
      )
      expect(requestedLog).toBeDefined()
      expect(requestedLog).not.toContain('template-uuid-1234')
    })
  })

  // ─── SMS Failure ───────────────────────────────────────────────────────────

  describe('SMS notification - failure', () => {
    it('should return Boom 424 when SMS send fails', async () => {
      const request = makeRequest({
        phoneNumber: '+447123456789',
        requestId: 'SMS-FAIL-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('SMS gateway timeout'))

      const res = await sendNotificationHandler(request, h)

      expect(res.isBoom).toBe(true)
      expect(res.output.statusCode).toBe(424)
    })

    it('should log notification.send.failed with contactType sms and error details', async () => {
      const request = makeRequest({
        phoneNumber: '+447123456789',
        requestId: 'SMS-FAIL-LOG-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('SMS gateway timeout'))

      await sendNotificationHandler(request, h)

      const errorLogs = flattenLogCalls(mockLogger.error)
      const failedLog = errorLogs.find((l) =>
        l.includes('notification.send.failed')
      )
      expect(failedLog).toBeDefined()
      expect(failedLog).toContain('"contactType":"sms"')
      expect(failedLog).toContain('"error":"SMS gateway timeout"')
      expect(failedLog).toContain('SMS-FAIL-LOG-ID')
    })

    it('should mask templateId in SMS error log', async () => {
      const request = makeRequest({
        phoneNumber: '+447123456789',
        requestId: 'SMS-MASK-ERR-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('SMS failed'))

      await sendNotificationHandler(request, h)

      const errorLogs = flattenLogCalls(mockLogger.error)
      const failedLog = errorLogs.find((l) =>
        l.includes('notification.send.failed')
      )
      expect(failedLog).toBeDefined()
      expect(failedLog).not.toContain('template-uuid-1234')
    })
  })

  // ─── Email Failure ─────────────────────────────────────────────────────────

  describe('Email notification - failure', () => {
    it('should return Boom 424 when email send fails', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'EMAIL-FAIL-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('Email service unavailable'))

      const res = await sendNotificationHandler(request, h)

      expect(res.isBoom).toBe(true)
      expect(res.output.statusCode).toBe(424)
    })

    it('should log notification.send.failed with contactType email and error details', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'EMAIL-FAIL-LOG-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('Email service unavailable'))

      await sendNotificationHandler(request, h)

      const errorLogs = flattenLogCalls(mockLogger.error)
      const failedLog = errorLogs.find((l) =>
        l.includes('notification.send.failed')
      )
      expect(failedLog).toBeDefined()
      expect(failedLog).toContain('"contactType":"email"')
      expect(failedLog).toContain('"error":"Email service unavailable"')
      expect(failedLog).toContain('EMAIL-FAIL-LOG-ID')
    })
  })

  // ─── Log Structure Validation ──────────────────────────────────────────────

  describe('Log structure validation', () => {
    it('should log notification.send.requested BEFORE notification.send.success', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'LOG-ORDER-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'log-order-notif' })

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      const requestedIndex = infoLogs.findIndex((l) =>
        l.includes('notification.send.requested')
      )
      const successIndex = infoLogs.findIndex((l) =>
        l.includes('notification.send.success')
      )

      expect(requestedIndex).toBeGreaterThanOrEqual(0)
      expect(successIndex).toBeGreaterThan(requestedIndex)
    })

    it('should log notification.send.requested BEFORE notification.send.failed', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'LOG-ORDER-FAIL-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('fail'))

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      const errorLogs = flattenLogCalls(mockLogger.error)

      expect(
        infoLogs.find((l) => l.includes('notification.send.requested'))
      ).toBeDefined()
      expect(
        errorLogs.find((l) => l.includes('notification.send.failed'))
      ).toBeDefined()
    })

    it('should NOT log any errors on the success path', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'NO-ERROR-LOG-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'no-err-notif' })

      await sendNotificationHandler(request, h)

      expect(mockLogger.error.mock.calls.length).toBe(0)
    })

    it('should NOT log success on the failure path', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'NO-SUCCESS-LOG-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('fail'))

      await sendNotificationHandler(request, h)

      const infoLogs = flattenLogCalls(mockLogger.info)
      expect(
        infoLogs.find((l) => l.includes('notification.send.success'))
      ).toBeUndefined()
    })
  })

  // ─── Notification Detail Storage ──────────────────────────────────────────

  describe('Notification detail storage', () => {
    it('should store notification detail with correct fields after successful SMS send', async () => {
      const request = makeRequest({
        phoneNumber: '+447123456789',
        alertId: 'alert-sms-001',
        requestId: 'STORE-SMS-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'sms-notif-store' })

      await sendNotificationHandler(request, h)

      expect(mockCreateUserNotificationDetailService).toHaveBeenCalledWith(
        request.db,
        expect.anything()
      )
      expect(mockStoreNotificationDetail).toHaveBeenCalledWith({
        notificationId: 'sms-notif-store',
        alertId: 'alert-sms-001',
        notifyStatus: 'submitted'
      })
    })

    it('should store notification detail with email as userContact after successful email send', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        alertId: 'alert-email-001',
        requestId: 'STORE-EMAIL-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'email-notif-store' })

      await sendNotificationHandler(request, h)

      expect(mockStoreNotificationDetail).toHaveBeenCalledWith({
        notificationId: 'email-notif-store',
        alertId: 'alert-email-001',
        notifyStatus: 'submitted'
      })
    })

    it('should NOT store notification detail when send fails', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'STORE-FAIL-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('send failed'))

      await sendNotificationHandler(request, h)

      expect(mockStoreNotificationDetail).not.toHaveBeenCalled()
    })
  })

  // ─── Response Structure ────────────────────────────────────────────────────

  describe('Response structure', () => {
    it('should return correct body and 201 status on success', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'RESPONSE-BODY-ID'
      })
      const h = makeH()
      mockSend.mockResolvedValueOnce({ notificationId: 'resp-notif-001' })

      await sendNotificationHandler(request, h)

      expect(h.response).toHaveBeenCalledWith({
        notificationId: 'resp-notif-001',
        status: 'submitted'
      })
      expect(h._response.code).toHaveBeenCalledWith(201)
    })

    it('should return Boom 424 with message containing "Failed to send notification"', async () => {
      const request = makeRequest({
        emailAddress: 'user@example.com',
        requestId: 'BOOM-MSG-ID'
      })
      const h = makeH()
      mockSend.mockRejectedValueOnce(new Error('notify down'))

      const res = await sendNotificationHandler(request, h)

      expect(res.isBoom).toBe(true)
      expect(res.output.statusCode).toBe(424)
      expect(res.message).toContain('Failed to send notification')
    })
  })
})
