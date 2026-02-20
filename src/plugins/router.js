import { health } from '../routes/health.js'
import { example } from '../routes/example.js'
import { generateOtpRoute } from '../subscribe/routes/generate-otp.route.js'
import { validateOtpRoute } from '../subscribe/routes/validate-otp.route.js'
import { sendNotificationRoute } from '../subscribe/routes/send-notification.route.js'
import generateLinkRoute from '../subscribe/routes/generate-link.route.js'
import { validateLinkRoute } from '../subscribe/routes/validate-link.route.js'
import { processSmsRepliesRoute } from '../subscribe/routes/process-sms-replies.route.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      const subscribeRoutes = [
        generateOtpRoute,
        validateOtpRoute,
        generateLinkRoute,
        validateLinkRoute
      ]
      const notificationRoutes = [sendNotificationRoute]
      const smsReplyRoutes = [processSmsRepliesRoute]
      server.route(
        [health]
          .concat(example)
          .concat(subscribeRoutes)
          .concat(notificationRoutes)
          .concat(smsReplyRoutes)
      )
    }
  }
}

export { router }
