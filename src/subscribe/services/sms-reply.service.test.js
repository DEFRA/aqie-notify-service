import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSmsReplyService } from '../services/sms-reply.service.js'
import { NotifyClient } from 'notifications-node-client'
import { fetch as undiciFetch } from 'undici'

// -------------------------
// Mocks
// -------------------------

vi.mock('notifications-node-client', () => {
  return {
    NotifyClient: vi.fn().mockImplementation(() => ({
      getReceivedTexts: vi.fn()
    }))
  }
})

vi.mock('undici', () => ({
  fetch: vi.fn()
}))

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'notify.apiKey') return 'fake-key'
      if (key === 'notify.alertBackend.url') return 'https://alert-backend'
      return null
    })
  }
}))

describe('createSmsReplyService', () => {
  let dbMock
  let loggerMock
  let service
  let notifyClientMock
  let fetchMock

  beforeEach(() => {
    vi.clearAllMocks()

    // DB mock
    dbMock = {
      collection: vi.fn().mockReturnValue({
        findOne: vi.fn(),
        insertOne: vi.fn()
      })
    }

    // Logger mock
    loggerMock = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    // Instantiate service
    service = createSmsReplyService(dbMock, loggerMock)

    // Access NotifyClient mock instance
    const results = vi.mocked(NotifyClient).mock.results
    notifyClientMock = results[results.length - 1]?.value

    // Fetch mock
    fetchMock = vi.mocked(undiciFetch)
  })

  // -----------------------------------------------------
  // Test: pollAndProcessReplies() — success (no messages)
  // -----------------------------------------------------
  it('pollAndProcessReplies returns zero counts when no messages found', async () => {
    notifyClientMock.getReceivedTexts.mockResolvedValue({
      data: { received_text_messages: [] }
    })

    const result = await service.pollAndProcessReplies()

    expect(result).toEqual({ total: 0, processed: 0 })
    // Updated assertion to match new logger format
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('sms_reply.poll')
    )
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('sms_reply.poll.complete')
    )
  })

  // -----------------------------------------------------
  // Test: already processed message
  // -----------------------------------------------------
  it('skips messages already processed', async () => {
    notifyClientMock.getReceivedTexts.mockResolvedValue({
      data: {
        received_text_messages: [
          {
            id: 'm1',
            user_number: '+447700900111',
            content: 'stop',
            created_at: '2024-01-01'
          }
        ]
      }
    })

    dbMock.collection().findOne.mockResolvedValue({ messageId: 'm1' }) // already processed

    const result = await service.pollAndProcessReplies()

    expect(result).toEqual({ total: 1, processed: 0 })
    // Check that poll.complete was called
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('sms_reply.poll.complete')
    )
  })

  // -----------------------------------------------------
  // Test: STOP → backend 200 → unsubscribed
  // -----------------------------------------------------
  it('processes STOP message and unsubscribes (backend 200)', async () => {
    notifyClientMock.getReceivedTexts.mockResolvedValue({
      data: {
        received_text_messages: [
          {
            id: 'm1',
            user_number: '+447700900111',
            content: 'stop',
            created_at: '2024-01-01'
          }
        ]
      }
    })

    dbMock.collection().findOne.mockResolvedValue(null) // not processed

    fetchMock.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ success: true })
    })

    const result = await service.pollAndProcessReplies()

    expect(result).toEqual({ total: 1, processed: 1 })

    expect(dbMock.collection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'm1',
        phoneNumber: '+447700900111',
        status: 'unsubscribed'
      })
    )
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('sms_reply.stop.unsubscribed')
    )
    const logCall = loggerMock.info.mock.calls.find((call) =>
      call[0].includes('sms_reply.stop.unsubscribed')
    )
    expect(logCall[0]).toContain('****0111')
    expect(logCall[0]).toContain('m1')
  })

  // -----------------------------------------------------
  // Test: STOP → backend 404 → user_not_found
  // -----------------------------------------------------
  it('processes STOP but marks user_not_found when backend returns 404', async () => {
    notifyClientMock.getReceivedTexts.mockResolvedValue({
      data: {
        received_text_messages: [
          {
            id: 'mX',
            user_number: '+447700900222',
            content: 'stop',
            created_at: '2024-01-01'
          }
        ]
      }
    })

    dbMock.collection().findOne.mockResolvedValue(null)

    fetchMock.mockResolvedValue({
      status: 404,
      json: () => Promise.resolve({ error: 'User not found' })
    })

    const result = await service.pollAndProcessReplies()

    expect(result).toEqual({ total: 1, processed: 1 })

    expect(dbMock.collection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'mX',
        phoneNumber: '+447700900222',
        status: 'user_not_found'
      })
    )
    // Check that poll.complete was called
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('sms_reply.poll.complete')
    )
  })

  // -----------------------------------------------------
  // Test: STOP → backend error → should throw
  // -----------------------------------------------------
  it('throws error when backend returns server error for STOP', async () => {
    notifyClientMock.getReceivedTexts.mockResolvedValue({
      data: {
        received_text_messages: [
          {
            id: 'mErr',
            user_number: '+447700900333',
            content: 'stop',
            created_at: '2024-01-01'
          }
        ]
      }
    })

    dbMock.collection().findOne.mockResolvedValue(null)

    fetchMock.mockResolvedValue({
      status: 500,
      json: () => Promise.resolve({ error: 'Server exploded' })
    })

    await expect(service.pollAndProcessReplies()).rejects.toThrow(
      'Server exploded'
    )

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('sms_reply.stop.failure')
    )
    const logCall = loggerMock.error.mock.calls[0][0]
    expect(logCall).toContain('****0333')
    expect(logCall).toContain('Server exploded')
  })

  // -----------------------------------------------------
  // Test: non-STOP message → ignored
  // -----------------------------------------------------
  it('marks non-STOP message as ignored', async () => {
    notifyClientMock.getReceivedTexts.mockResolvedValue({
      data: {
        received_text_messages: [
          {
            id: 'mNon',
            user_number: '+447700900444',
            content: 'hello',
            created_at: '2024-01-01'
          }
        ]
      }
    })

    dbMock.collection().findOne.mockResolvedValue(null)

    const result = await service.pollAndProcessReplies()

    expect(result).toEqual({ total: 1, processed: 1 })

    expect(dbMock.collection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'mNon',
        status: 'ignored'
      })
    )
  })

  // -----------------------------------------------------
  // Test: Duplicate STOP in same batch
  // -----------------------------------------------------
  it('detects batch duplicate STOP and marks duplicate_stop', async () => {
    notifyClientMock.getReceivedTexts.mockResolvedValue({
      data: {
        received_text_messages: [
          {
            id: 'mA',
            user_number: '+447700900999',
            content: 'stop',
            created_at: '2024-01-01'
          },
          {
            id: 'mB',
            user_number: '+447700900999',
            content: 'stop',
            created_at: '2024-01-01'
          }
        ]
      }
    })

    dbMock.collection().findOne.mockResolvedValue(null)

    fetchMock.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ success: true })
    })

    const result = await service.pollAndProcessReplies()

    expect(result).toEqual({ total: 2, processed: 2 })

    // First STOP unsubscribed
    expect(dbMock.collection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'mA', status: 'unsubscribed' })
    )
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('sms_reply.stop.unsubscribed')
    )

    // Second STOP duplicate
    expect(dbMock.collection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'mB', status: 'duplicate_stop' })
    )
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('sms_reply.stop.duplicate_in_batch')
    )
  })
})
