import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSmsReplyService } from '../services/sms-reply.service.js'
import { processSmsRepliesHandler } from './sms-reply.controller.js'

// Mock logger
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    error: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('../../common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => mockLogger)
}))

// Mock the service factory
vi.mock('../services/sms-reply.service.js', () => ({
  createSmsReplyService: vi.fn()
}))

describe('processSmsRepliesHandler', () => {
  let request
  let h
  let pollAndProcessRepliesMock

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    pollAndProcessRepliesMock = vi.fn()

    // Mock request object
    request = {
      db: {},
      headers: {
        'x-cdp-request-id': 'req-123',
        'user-agent': 'vitest-agent'
      },
      info: {
        id: 'info-456',
        remoteAddress: '127.0.0.1'
      }
    }

    // Fake h toolkit
    const responseObj = {
      code: vi.fn().mockReturnThis()
    }

    h = {
      response: vi.fn().mockReturnValue(responseObj)
    }

    // Wire the mock service factory
    createSmsReplyService.mockReturnValue({
      pollAndProcessReplies: pollAndProcessRepliesMock
    })
  })

  // ────────────────────────────────────────────────
  // SUCCESS CASE
  // ────────────────────────────────────────────────
  it('returns 200 with success=true and processed results', async () => {
    pollAndProcessRepliesMock.mockResolvedValue({
      total: 5,
      processed: 3
    })

    const result = await processSmsRepliesHandler(request, h)

    // Should have created the service correctly
    expect(createSmsReplyService).toHaveBeenCalledWith(request.db, mockLogger)

    // Response formation
    expect(h.response).toHaveBeenCalledWith({
      success: true,
      total: 5,
      processed: 3
    })

    // Should return a 200
    const responseObj = h.response.mock.results[0].value
    expect(responseObj.code).toHaveBeenCalledWith(200)

    expect(result).toBeTruthy()
  })

  // ────────────────────────────────────────────────
  // ERROR CASE
  // ────────────────────────────────────────────────
  it('should use request.info.id as fallback when x-cdp-request-id is missing in error log', async () => {
    const requestNoHeader = {
      db: {},
      headers: {
        'user-agent': 'vitest-agent'
      },
      info: {
        id: 'fallback-info-id',
        remoteAddress: '127.0.0.1'
      }
    }
    pollAndProcessRepliesMock.mockRejectedValue(
      new Error('Fallback test error')
    )

    const result = await processSmsRepliesHandler(requestNoHeader, h)

    const logCall = mockLogger.error.mock.calls[0][0]
    expect(logCall).toContain('fallback-info-id')
    expect(result.isBoom).toBe(true)
  })

  it('logs error and returns Boom.internal when service throws', async () => {
    pollAndProcessRepliesMock.mockRejectedValue(
      new Error('Something bad happened')
    )

    const result = await processSmsRepliesHandler(request, h)

    // Should log properly
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('process_sms_replies.failure')
    )
    const logCall = mockLogger.error.mock.calls[0][0]
    expect(logCall).toContain('Something bad happened')
    expect(logCall).toContain('req-123')

    // Should return Boom.internal
    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(500)
    expect(result.message).toBe('Failed to process SMS replies')
  })
})
