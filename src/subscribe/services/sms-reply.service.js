import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'
import { fetch } from 'undici'

function createSmsReplyService(db, logger) {
  const client = new NotifyClient(config.get('notify.apiKey'))
  const alertBackendUrl = config.get('notify.alertBackend.url')

  return {
    async pollAndProcessReplies() {
      try {
        const response = await client.getReceivedTexts()
        const messages = response.data.received_text_messages || []

        logger.info(
          {
            totalMessages: messages.length
          },
          'sms_reply.poll'
        )

        let newMessages = 0
        let alreadyProcessed = 0
        const processedPhones = new Set()

        for (const msg of messages) {
          const exists = await this.isProcessed(msg.id)
          if (exists) {
            alreadyProcessed++
            continue
          }

          await this.processMessage(msg, processedPhones)
          newMessages++
        }

        logger.info(
          {
            total: messages.length,
            newMessages,
            alreadyProcessed
          },
          'sms_reply.poll.complete'
        )

        return { total: messages.length, processed: newMessages }
      } catch (error) {
        logger.error(
          {
            error: error.message
          },
          'sms_reply.poll.failure'
        )
        throw error
      }
    },

    async processMessage(msg, processedPhones = new Set()) {
      const phoneNumber = msg.user_number.startsWith('+')
        ? msg.user_number
        : `+${msg.user_number}`
      const content = msg.content.trim().toLowerCase()

      logger.info(
        {
          messageId: msg.id,
          phoneNumber: '***' + phoneNumber.slice(-3),
          content
        },
        'sms_reply.process'
      )

      if (content === 'stop') {
        await this.handleStop(phoneNumber, msg, processedPhones)
      } else {
        await this.markProcessed(
          msg.id,
          phoneNumber,
          msg.content,
          msg.created_at,
          'ignored'
        )
        logger.info(
          {
            messageId: msg.id,
            phoneNumber: '***' + phoneNumber.slice(-3)
          },
          'sms_reply.ignored'
        )
      }
    },

    async handleStop(phoneNumber, msg, processedPhones) {
      try {
        // Check if already processed in this batch
        if (processedPhones.has(phoneNumber)) {
          await this.markProcessed(
            msg.id,
            phoneNumber,
            msg.content,
            msg.created_at,
            'duplicate_stop'
          )
          logger.info(
            {
              phoneNumber: '***' + phoneNumber.slice(-3),
              messageId: msg.id
            },
            'sms_reply.stop.duplicate_in_batch'
          )
          return
        }

        // Call backend to unsubscribe
        const response = await fetch(`${alertBackendUrl}/opt-out-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber })
        })

        const result = await response.json()

        if (response.status === 200) {
          // Successfully unsubscribed
          await db.collection('sms_replies').insertOne({
            messageId: msg.id,
            phoneNumber,
            content: msg.content,
            receivedAt: new Date(msg.created_at),
            status: 'unsubscribed',
            processedAt: new Date()
          })

          // Track this phone number in current batch
          processedPhones.add(phoneNumber)

          logger.info(
            {
              phoneNumber: '***' + phoneNumber.slice(-3),
              messageId: msg.id
            },
            'sms_reply.stop.unsubscribed'
          )
        } else if (response.status === 404) {
          // User not found
          await db.collection('sms_replies').insertOne({
            messageId: msg.id,
            phoneNumber,
            content: msg.content,
            receivedAt: new Date(msg.created_at),
            status: 'user_not_found',
            processedAt: new Date()
          })

          processedPhones.add(phoneNumber)

          logger.warn(
            {
              phoneNumber: '***' + phoneNumber.slice(-3),
              messageId: msg.id
            },
            'sms_reply.stop.user_not_found'
          )
        } else {
          // Server error - don't mark as processed, will retry
          throw new Error(result.error || `Backend returned ${response.status}`)
        }
      } catch (error) {
        logger.error(
          {
            phoneNumber: '***' + phoneNumber.slice(-3),
            error: error.message
          },
          'sms_reply.stop.failure'
        )
        throw error
      }
    },

    async isProcessed(messageId) {
      const record = await db.collection('sms_replies').findOne({ messageId })
      return !!record
    },

    async markProcessed(messageId, phoneNumber, content, createdAt, status) {
      await db.collection('sms_replies').insertOne({
        messageId,
        phoneNumber,
        content,
        receivedAt: new Date(createdAt),
        status,
        processedAt: new Date()
      })
    }
  }
}

export { createSmsReplyService }
