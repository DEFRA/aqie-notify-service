import { validateOtpHandler } from '../controllers/otp.controller.js'
import { validateOtpSchema } from '../validators/otp.schema.js'

const validateOtpRoute = {
  method: 'POST',
  path: '/subscribe/validate-otp',
  options: {
    validate: {
      payload: validateOtpSchema
    }
  },
  handler: validateOtpHandler
}

export { validateOtpRoute }
