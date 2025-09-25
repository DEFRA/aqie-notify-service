import { health } from '../routes/health.js'
import { example } from '../routes/example.js'
import { generateOtpRoute } from '../subscribe/routes/generate-otp.route.js'
import { validateOtpRoute } from '../subscribe/routes/validate-otp.route.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      const subscribeRoutes = [generateOtpRoute, validateOtpRoute]
      server.route([health].concat(example).concat(subscribeRoutes))
    }
  }
}

export { router }
