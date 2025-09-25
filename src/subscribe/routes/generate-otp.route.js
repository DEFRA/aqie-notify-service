import { generateOtpHandler } from '../controllers/otp.controller.js'
import { generateOtpSchema } from '../validators/otp.schema.js'

const generateOtpRoute = {
  method: 'POST',
  path: '/subscribe/generate-otp',
  options: {
    validate: {
      payload: generateOtpSchema
    }
  },
  handler: generateOtpHandler
}

export { generateOtpRoute }
