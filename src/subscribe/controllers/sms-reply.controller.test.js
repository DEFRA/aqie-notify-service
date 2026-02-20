import { describe, it, expect, vi, beforeEach } from 'vitest'

import { processSmsRepliesHandler } from './sms-reply.controller.js'
import { createSmsReplyService } from '../services/sms-reply.service.js'

// Mock the service factory
vi.mock('../services/sms-reply.service.js', () => ({
  createSmsReplyService: vi.fn()
}))

describe('processSmsRepliesHandler', () => {
  let request
  let h
  let loggerMock
  let pollAndProcessRepliesMock

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    pollAndProcessRepliesMock = vi.fn()

    // Fake logger
    loggerMock = {
      error: vi.fn(),
      info: vi.fn()
    }

    // Mock request object
    request = {
      db: {},
      logger: loggerMock,
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
    expect(createSmsReplyService).toHaveBeenCalledWith(
      request.db,
      request.logger
    )

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
  it('logs error and returns Boom.internal when service throws', async () => {
    pollAndProcessRepliesMock.mockRejectedValue(
      new Error('Something bad happened')
    )

    const result = await processSmsRepliesHandler(request, h)

    // Should log properly
    expect(loggerMock.error).toHaveBeenCalledWith(
      'process_sms_replies.failure',
      expect.objectContaining({
        error: 'Something bad happened',
        requestId: 'req-123',
        userAgent: 'vitest-agent',
        ip: '127.0.0.1'
      })
    )

    // Should return Boom.internal
    expect(result.isBoom).toBe(true)
    expect(result.output.statusCode).toBe(500)
    expect(result.message).toBe('Failed to process SMS replies')
  })
})
