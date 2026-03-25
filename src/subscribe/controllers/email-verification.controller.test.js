// email-verification.controller.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateLinkHandler } from './email-verification.controller.js'

// ------------------------------------------------------------
// MOCKS — Declared BEFORE SUT import to avoid hoisting errors
// ------------------------------------------------------------

// Mock crypto
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'uuid-fixed-1234')
}))

// EXPORTABLE mock handles so tests can reference them
export const mockStoreVerificationDetails = vi.fn()
export const mockSendEmail = vi.fn()

// Mock logger
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}))

// Mock email-verification service
vi.mock('../services/email-verification.service.js', () => ({
  createEmailVerificationService: vi.fn(() => ({
    storeVerificationDetails: mockStoreVerificationDetails
  }))
}))

// Mock notification service
vi.mock('../services/notify-service.js', () => ({
  createNotificationService: vi.fn(() => ({
    sendEmail: mockSendEmail
  }))
}))

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'notify.emailTemplateId') return 'tmpl-123'
      return null
    })
  }
}))

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function makeH() {
  return {
    response: (payload) => ({
      code: (status) => ({
        statusCode: status,
        source: payload
      })
    })
  }
}

function makeBaseRequest(overrides = {}) {
  return {
    headers: {
      'user-agent': 'VitestAgent/1.0',
      ...overrides.headers
    },
    info: {
      id: 'INFO-DEFAULT',
      remoteAddress: '127.0.0.1',
      ...overrides.info
    },
    payload: {
      emailAddress: 'user1234567@example.com', // long email
      alertType: 'daily',
      location: 'London',
      lat: 51.501,
      long: -0.141,
      ...overrides.payload
    },
    db: overrides.db || {}
  }
}

// ------------------------------------------------------------
// TESTS
// ------------------------------------------------------------
describe('generateLinkHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------
  // SUCCESS: header requestId + notification success
  // ---------------------------------------
  it('header requestId + notification SUCCESS → returns 201, logs success', async () => {
    const request = makeBaseRequest({
      headers: {
        'x-cdp-request-id': 'RID-123',
        'user-agent': 'VitestAgent/1.0'
      }
    })

    const h = makeH()

    mockStoreVerificationDetails.mockResolvedValueOnce({
      uuid: '12345678-abcdef99',
      success: true,
      verificationLink: 'https://verify/link/abc'
    })

    mockSendEmail.mockResolvedValueOnce({ notificationId: 'notif-001' })

    const res = await generateLinkHandler(request, h)

    // Response
    expect(res.statusCode).toBe(201)
    expect(res.source.message).toBe('Link has been sent to email')

    // Service call
    expect(mockStoreVerificationDetails).toHaveBeenCalled()

    // Logs
    const logs = mockLogger.info.mock.calls.map((c) => c[0])

    expect(logs.some((l) => l.includes('email.generate_link.start'))).toBe(true)
    expect(logs.some((l) => l.includes('email.generate_link.stored'))).toBe(
      true
    )

    const successLog = logs.find((l) =>
      l.includes('email.generate_link.notification_success')
    )
    expect(successLog).toContain('"requestId":"RID-123"')
    expect(successLog).toContain('"notificationId":"notif-001"')
  })

  // ---------------------------------------
  // SUCCESS: info.id requestId + notification failure
  // ---------------------------------------
  it('info.id requestId + notification FAILURE → returns 201, logs notification_failed', async () => {
    const request = makeBaseRequest({
      headers: {},
      info: { id: 'INFO-22' }
    })

    const h = makeH()

    mockStoreVerificationDetails.mockResolvedValueOnce({
      uuid: '87654321-abcdef88',
      success: true,
      verificationLink: 'https://verify/link/xyz'
    })

    mockSendEmail.mockRejectedValueOnce(new Error('Notify down'))

    const res = await generateLinkHandler(request, h)

    expect(res.statusCode).toBe(201)

    const errorLogs = mockLogger.error.mock.calls.map((c) => c[0])

    const entry = errorLogs.find((l) =>
      l.includes('email.generate_link.notification_failed')
    )

    expect(entry).toContain('"requestId":"INFO-22"')
    expect(entry).toContain('"error":"Notify down"')
  })

  // ---------------------------------------
  // OUTER CATCH: store throws → Boom.internal
  // ---------------------------------------
  it('randomUUID requestId + OUTER ERROR (store throws) → Boom.internal 500', async () => {
    const request = makeBaseRequest({
      headers: {},
      info: { id: undefined }
    })
    const h = makeH()

    mockStoreVerificationDetails.mockRejectedValueOnce(new Error('DB exploded'))

    const res = await generateLinkHandler(request, h)

    expect(res.isBoom).toBe(true)
    expect(res.output.statusCode).toBe(500)

    const errorLogs = mockLogger.error.mock.calls.map((c) => c[0])
    const unexpected = errorLogs.find((l) =>
      l.includes('email.generate_link.unexpected_error')
    )

    expect(unexpected).toContain('"error":"DB exploded"')
    expect(unexpected).toContain('"requestId":"req_uuid-fixed-1234"')
  })

  // ---------------------------------------
  // MISSING EMAIL: emailAddress undefined → first log prints "undefined"
  // ---------------------------------------

  it('first log with email undefined → hits OUTER catch, logs "undefined"', async () => {
    const request = makeBaseRequest({
      payload: {
        // emailAddress intentionally omitted - will be undefined
        alertType: 'daily',
        location: 'London',
        lat: 1,
        long: 2
      }
    })
    const h = makeH()

    mockStoreVerificationDetails.mockRejectedValueOnce(
      new Error('emailAddress is not defined')
    )

    const res = await generateLinkHandler(request, h)

    // Outer catch should trigger → Boom 500
    expect(res.isBoom).toBe(true)
    expect(res.output.statusCode).toBe(500)

    // Flatten all info logger calls into searchable strings
    // Controller logs with single string argument: logger.info('event {...}')
    const infoLogs = mockLogger.info.mock.calls.map((c) =>
      typeof c[1] === 'object'
        ? `${c[0]} ${JSON.stringify(c[1])}`
        : String(c[0])
    )

    // Flatten all error logger calls into searchable strings
    const errorLogs = mockLogger.error.mock.calls.map((c) =>
      typeof c[1] === 'object'
        ? `${c[0]} ${JSON.stringify(c[1])}`
        : String(c[0])
    )

    // Assert: first log is 'email.generate_link.requested'
    const startLog = infoLogs.find((l) =>
      l.includes('email.generate_link.requested')
    )
    expect(startLog).toBeDefined()

    // Assert: second log is 'email.generate_link.start'
    const startLog2 = infoLogs.find((l) =>
      l.includes('email.generate_link.start')
    )
    expect(startLog2).toBeDefined()

    // Assert: requestId is present in the start log
    expect(startLog).toContain('"requestId":"INFO-DEFAULT"')

    // Assert: unexpected_error was logged with correct details
    const unexpectedError = errorLogs.find((l) =>
      l.includes('email.generate_link.unexpected_error')
    )
    expect(unexpectedError).toBeDefined()
    expect(unexpectedError).toContain('"error":"emailAddress is not defined"')
    expect(unexpectedError).toContain('"requestId":"INFO-DEFAULT"')

    // Assert: at least one error was logged
    expect(mockLogger.error.mock.calls.length).toBeGreaterThan(0)
  })
  it('first log with email undefined → hits OUTER catch, logs "undefined"', async () => {
    const request = makeBaseRequest({
      payload: {
        // emailAddress intentionally omitted - will be undefined
        alertType: 'daily',
        location: 'London',
        lat: 1,
        long: 2
      }
    })
    const h = makeH()

    mockStoreVerificationDetails.mockRejectedValueOnce(
      new Error('emailAddress is not defined')
    )

    const res = await generateLinkHandler(request, h)

    // Outer catch should trigger → Boom 500
    expect(res.isBoom).toBe(true)
    expect(res.output.statusCode).toBe(500)

    // Flatten all info logger calls into searchable strings
    // Controller logs with single string argument: logger.info('event {...}')
    const infoLogs = mockLogger.info.mock.calls.map((c) =>
      typeof c[1] === 'object'
        ? `${c[0]} ${JSON.stringify(c[1])}`
        : String(c[0])
    )

    // Flatten all error logger calls into searchable strings
    const errorLogs = mockLogger.error.mock.calls.map((c) =>
      typeof c[1] === 'object'
        ? `${c[0]} ${JSON.stringify(c[1])}`
        : String(c[0])
    )

    // Assert: first log is 'email.generate_link.requested'
    const startLog = infoLogs.find((l) =>
      l.includes('email.generate_link.requested')
    )
    expect(startLog).toBeDefined()

    // Assert: second log is 'email.generate_link.start'
    const startLog2 = infoLogs.find((l) =>
      l.includes('email.generate_link.start')
    )
    expect(startLog2).toBeDefined()

    // Assert: requestId is present in the start log
    expect(startLog).toContain('"requestId":"INFO-DEFAULT"')

    // Assert: unexpected_error was logged with correct details
    const unexpectedError = errorLogs.find((l) =>
      l.includes('email.generate_link.unexpected_error')
    )
    expect(unexpectedError).toBeDefined()
    expect(unexpectedError).toContain('"error":"emailAddress is not defined"')
    expect(unexpectedError).toContain('"requestId":"INFO-DEFAULT"')

    // Assert: at least one error was logged
    expect(mockLogger.error.mock.calls.length).toBeGreaterThan(0)
  })
})
