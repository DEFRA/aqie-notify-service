import Joi from 'joi'

const generateLinkSchema = Joi.object({
  emailAddress: Joi.string().email().required(),
  alertType: Joi.string().required(),
  location: Joi.string().required(),
  lat: Joi.number().required(),
  long: Joi.number().required()
})

export { generateLinkSchema }
