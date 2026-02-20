import Boom from '@hapi/boom'
import { createSmsReplyService } from '../services/sms-reply.service.js'

const HTTP_STATUS_OK = 200

// Manual trigger endpoint (for testing/debugging)
async function processSmsRepliesHandler(request, h) {
  try {
    const smsReplyService = createSmsReplyService(request.db, request.logger)
    const result = await smsReplyService.pollAndProcessReplies()

    return h
      .response({
        success: true,
        total: result.total,
        processed: result.processed
      })
      .code(HTTP_STATUS_OK)
  } catch (err) {
    // request.logger.error('process_sms_replies.failure', {
    //   error: err.message
    // })
    request.logger.error('process_sms_replies.failure', {
      error: err.message,
      requestId: request.headers['x-cdp-request-id'] || request.info.id,
      userAgent: request.headers['user-agent'],
      ip: request.info.remoteAddress
    })
    return Boom.internal('Failed to process SMS replies')
  }
}

export { processSmsRepliesHandler }
