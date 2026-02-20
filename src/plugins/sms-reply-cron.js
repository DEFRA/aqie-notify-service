import { createSmsReplyService } from '../subscribe/services/sms-reply.service.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { config } from '../config.js'

const logger = createLogger()

const smsReplyCron = {
  plugin: {
    name: 'sms-reply-cron',
    register: async (server, _options) => {
      const enabled = config.get('notify.smsReplyPollEnabled')
      if (!enabled) {
        logger.info('sms_reply_cron.disabled')
        return
      }
      const intervalMinutes = config.get('notify.smsReplyPollIntervalMinutes')
      const intervalMs = intervalMinutes * 60 * 1000

      const pollJob = setInterval(async () => {
        try {
          logger.info('sms_reply_cron.start')
          const smsReplyService = createSmsReplyService(server.db, logger)
          await smsReplyService.pollAndProcessReplies()
        } catch (error) {
          logger.error(
            {
              error: error.message
            },
            'sms_reply_cron.failure'
          )
        }
      }, intervalMs)

      // Cleanup on server stop
      server.events.on('stop', () => {
        clearInterval(pollJob)
        logger.info('sms_reply_cron.stopped')
      })

      logger.info(
        {
          intervalMinutes
        },
        'sms_reply_cron.registered'
      )
    }
  }
}

export { smsReplyCron }
