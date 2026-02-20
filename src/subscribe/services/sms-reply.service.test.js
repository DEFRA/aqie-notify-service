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
    expect(loggerMock.info).toHaveBeenCalledWith(
      { totalMessages: 0 },
      'sms_reply.poll'
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

    expect(loggerMock.error).toHaveBeenCalled()
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

    // Second STOP duplicate
    expect(dbMock.collection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'mB', status: 'duplicate_stop' })
    )
  })
})
