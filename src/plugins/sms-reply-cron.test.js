import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { smsReplyCron } from './sms-reply-cron.js'
import { config } from '../config.js'

vi.mock('../config.js', () => ({
  config: {
    get: vi.fn()
  }
}))
vi.mock('../subscribe/services/sms-reply.service.js', () => ({
  createSmsReplyService: vi.fn(() => ({
    pollAndProcessReplies: vi.fn().mockResolvedValue(undefined)
  }))
}))
vi.mock('../common/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn()
  })
}))

describe('smsReplyCron plugin', () => {
  let server
  let events
  let clearIntervalSpy

  beforeEach(() => {
    events = { on: vi.fn() }
    server = { db: {}, events }
    clearIntervalSpy = vi.spyOn(global, 'clearInterval')
  })

  afterEach(() => {
    vi.clearAllMocks()
    clearIntervalSpy.mockRestore()
  })

  it('should not start cron if disabled in config', async () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify.smsReplyPollEnabled') return false
      return 1
    })
    await smsReplyCron.plugin.register(server, {})
    expect(events.on).not.toHaveBeenCalled()
  })

  it('should start cron if enabled in config', async () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify.smsReplyPollEnabled') return true
      if (key === 'notify.smsReplyPollIntervalMinutes') return 1
      return undefined
    })
    const setIntervalSpy = vi.spyOn(global, 'setInterval')
    await smsReplyCron.plugin.register(server, {})
    expect(events.on).toHaveBeenCalledWith('stop', expect.any(Function))
    expect(setIntervalSpy).toHaveBeenCalled()
    setIntervalSpy.mockRestore()
  })

  it('should clear interval on server stop', async () => {
    config.get.mockImplementation((key) => {
      if (key === 'notify.smsReplyPollEnabled') return true
      if (key === 'notify.smsReplyPollIntervalMinutes') return 1
      return undefined
    })
    let stopHandler
    events.on = vi.fn((event, handler) => {
      if (event === 'stop') stopHandler = handler
    })
    const setIntervalSpy = vi
      .spyOn(global, 'setInterval')
      .mockImplementation((fn, ms) => 12345)
    await smsReplyCron.plugin.register(server, {})
    stopHandler()
    expect(clearIntervalSpy).toHaveBeenCalledWith(12345)
    setIntervalSpy.mockRestore()
  })
})
