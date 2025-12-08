import { sendNotificationHandler } from '../controllers/notification.controller.js'
import { sendNotificationSchema } from '../validators/notification.schema.js'

const sendNotificationRoute = {
  method: 'POST',
  path: '/send-notification',
  options: {
    validate: {
      payload: sendNotificationSchema
    }
  },
  handler: sendNotificationHandler
}

export { sendNotificationRoute }
