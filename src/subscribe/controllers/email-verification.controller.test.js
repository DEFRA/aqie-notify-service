// email-verification.controller.test.js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateLinkHandler } from './email-verification.controller.js'
import { config } from '../../config.js'

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

// Hoisted so it can be referenced inside vi.mock factories below.
// Returns a config.get implementation with a single return statement
// (avoids sonarqube javascript:S3800 on branched mixed-type returns).
const { mockConfigGet } = vi.hoisted(() => ({
  mockConfigGet(useMockValue = false) {
    const values = {
      'notify.emailTemplateId': 'tmpl-123',
      useMock: useMockValue
    }
    return (key) => values[key] ?? null
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
    get: vi.fn(mockConfigGet(false))
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

const STATUS_CODE_201 = 201
const ERROR_CODE_500 = 500
const SOURCE_MSG = 'Link has been sent to email'
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
    expect(res.statusCode).toBe(STATUS_CODE_201)
    expect(res.source.message).toBe(SOURCE_MSG)

    // Service call
    expect(mockStoreVerificationDetails).toHaveBeenCalled()

    // Logs
    const logs = mockLogger.info.mock.calls.map((c) => c[0])

    expect(logs.some((l) => l.includes('email.generate_link.requested'))).toBe(
      true
    )

    const successLog = logs.find((l) =>
      l.includes('email.generate_link.success')
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

    expect(res.statusCode).toBe(STATUS_CODE_201)

    const errorLogs = mockLogger.error.mock.calls.map((c) => c[0])

    const entry = errorLogs.find((l) =>
      l.includes('email.generate_link.notification_failed')
    )

    expect(entry).toContain('"requestId":"INFO-22"')
    expect(entry).toContain('"errorName":"Error"')
  })

  // ---------------------------------------
  // OUTER CATCH: store throws → Boom.internal
  // ---------------------------------------
  it('randomUUID requestId + OUTER ERROR (store throws) → Boom.internal 500', async () => {
    const request = makeBaseRequest({
      headers: {},
      info: { id: null }
    })
    const h = makeH()

    mockStoreVerificationDetails.mockRejectedValueOnce(new Error('DB exploded'))

    const res = await generateLinkHandler(request, h)

    expect(res.isBoom).toBe(true)
    expect(res.output.statusCode).toBe(ERROR_CODE_500)

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
    expect(res.output.statusCode).toBe(ERROR_CODE_500)

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

    // Assert: requestId is present in the entry log
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

  // ---------------------------------------
  // useMock=false (default) → response body excludes verificationToken
  // ---------------------------------------
  it('useMock=false → response body does NOT include verificationToken', async () => {
    config.get.mockImplementation(mockConfigGet(false))

    const request = makeBaseRequest({
      headers: { 'x-cdp-request-id': 'RID-NO-MOCK' }
    })
    const h = makeH()

    mockStoreVerificationDetails.mockResolvedValueOnce({
      uuid: 'uuid-real-9999',
      success: true,
      verificationLink: 'https://verify/link/real'
    })
    mockSendEmail.mockResolvedValueOnce({ notificationId: 'notif-002' })

    const res = await generateLinkHandler(request, h)

    expect(res.statusCode).toBe(STATUS_CODE_201)
    expect(res.source.message).toBe(SOURCE_MSG)
    expect(res.source.timestamp).toBeDefined()
    expect(res.source.verificationToken).toBeUndefined()
  })

  // ---------------------------------------
  // useMock=true → response body includes verificationToken (the raw uuid)
  // ---------------------------------------
  it('useMock=true + notification SUCCESS → response includes verificationToken', async () => {
    config.get.mockImplementation(mockConfigGet(true))

    const request = makeBaseRequest({
      headers: { 'x-cdp-request-id': 'RID-MOCK' }
    })
    const h = makeH()

    mockStoreVerificationDetails.mockResolvedValueOnce({
      uuid: 'uuid-mock-1111',
      success: true,
      verificationLink: 'https://verify/link/mock'
    })
    mockSendEmail.mockResolvedValueOnce({ notificationId: 'notif-003' })

    const res = await generateLinkHandler(request, h)

    expect(res.statusCode).toBe(STATUS_CODE_201)
    expect(res.source.message).toBe(SOURCE_MSG)
    expect(res.source.verificationToken).toBe('uuid-mock-1111')
  })

  // ---------------------------------------
  // useMock=true + notification FAILURE → still 201 and verificationToken present
  // ---------------------------------------
  it('useMock=true + notification FAILURE → still returns 201 with verificationToken', async () => {
    config.get.mockImplementation(mockConfigGet(true))

    const request = makeBaseRequest({
      headers: { 'x-cdp-request-id': 'RID-MOCK-FAIL' }
    })
    const h = makeH()

    mockStoreVerificationDetails.mockResolvedValueOnce({
      uuid: 'uuid-mock-2222',
      success: true,
      verificationLink: 'https://verify/link/mock-fail'
    })
    mockSendEmail.mockRejectedValueOnce(new Error('Notify down'))

    const res = await generateLinkHandler(request, h)

    expect(res.statusCode).toBe(STATUS_CODE_201)
    expect(res.source.message).toBe(SOURCE_MSG)
    expect(res.source.verificationToken).toBe('uuid-mock-2222')

    const errorLogs = mockLogger.error.mock.calls.map((c) => c[0])
    expect(
      errorLogs.some((l) =>
        l.includes('email.generate_link.notification_failed')
      )
    ).toBe(true)
  })
})
