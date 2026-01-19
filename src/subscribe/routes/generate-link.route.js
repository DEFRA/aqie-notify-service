import { generateLinkHandler } from '../controllers/email-verification.controller.js'
import { generateLinkSchema } from '../validators/link.schema.js'

export default {
  method: 'POST',
  path: '/subscribe/generate-link',
  options: {
    validate: {
      payload: generateLinkSchema
    }
  },
  handler: generateLinkHandler
}
