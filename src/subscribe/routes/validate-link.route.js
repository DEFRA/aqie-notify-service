import { validateLinkHandler } from '../controllers/validate-link.controller.js'
import Joi from 'joi'

const validateLinkRoute = {
  method: 'GET',
  path: '/subscribe/validate-link/{uuid}',
  options: {
    validate: {
      params: Joi.object({
        uuid: Joi.string().uuid().required()
      })
    }
  },
  handler: validateLinkHandler
}

export { validateLinkRoute }
