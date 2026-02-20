import { describe, it, expect } from 'vitest'

// Import the handler separately so we can compare references
import { processSmsRepliesHandler } from '../controllers/sms-reply.controller.js'

// Import the route definition
import { processSmsRepliesRoute } from './process-sms-replies.route.js'

describe('processSmsRepliesRoute', () => {
  it('should export a valid Hapi route definition', () => {
    // Validate route object exists
    expect(processSmsRepliesRoute).toBeDefined()

    // Check HTTP method
    expect(processSmsRepliesRoute.method).toBe('GET')

    // Check path
    expect(processSmsRepliesRoute.path).toBe('/process-sms-replies')

    // Handler should be the same function reference
    expect(processSmsRepliesRoute.handler).toBe(processSmsRepliesHandler)
  })
})
