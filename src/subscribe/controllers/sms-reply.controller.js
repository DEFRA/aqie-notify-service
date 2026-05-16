import Boom from '@hapi/boom'
import { randomUUID } from 'node:crypto'
import { createSmsReplyService } from '../services/sms-reply.service.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()
const HTTP_STATUS_OK = 200

// Manual trigger endpoint (for testing/debugging)
async function processSmsRepliesHandler(request, h) {
  const requestId =
    request.headers['x-cdp-request-id'] ||
    request.info.id ||
    `req_${randomUUID()}`

  logger.info(
    `process_sms_replies.requested ${JSON.stringify({ requestId, userAgent: request.headers['user-agent'], ip: request.info.remoteAddress })}`
  )

  try {
    const smsReplyService = createSmsReplyService(request.db, logger)
    const result = await smsReplyService.pollAndProcessReplies()

    logger.info(
      `process_sms_replies.success ${JSON.stringify({ requestId, total: result.total, processed: result.processed })}`
    )

    return h
      .response({
        success: true,
        total: result.total,
        processed: result.processed
      })
      .code(HTTP_STATUS_OK)
  } catch (err) {
    logger.error(
      `process_sms_replies.failure ${JSON.stringify({ requestId, errorName: err.name })}`
    )
    return Boom.internal('Failed to process SMS replies')
  }
}

export { processSmsRepliesHandler }
