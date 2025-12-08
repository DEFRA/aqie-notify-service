import { health } from '../routes/health.js'
import { example } from '../routes/example.js'
import { generateOtpRoute } from '../subscribe/routes/generate-otp.route.js'
import { validateOtpRoute } from '../subscribe/routes/validate-otp.route.js'
import { sendNotificationRoute } from '../subscribe/routes/send-notification.route.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      const subscribeRoutes = [generateOtpRoute, validateOtpRoute]
      const notificationRoutes = [sendNotificationRoute]
      server.route(
        [health]
          .concat(example)
          .concat(subscribeRoutes)
          .concat(notificationRoutes)
      )
    }
  }
}

export { router }
