import { processSmsRepliesHandler } from '../controllers/sms-reply.controller.js'

const processSmsRepliesRoute = {
  method: 'GET',
  path: '/process-sms-replies',
  handler: processSmsRepliesHandler
}

export { processSmsRepliesRoute }
