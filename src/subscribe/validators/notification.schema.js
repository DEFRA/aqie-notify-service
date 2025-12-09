import Joi from 'joi'

export const sendNotificationSchema = Joi.object({
  phoneNumber: Joi.string().optional(),
  emailAddress: Joi.string().email().optional(),
  templateId: Joi.string().required(),
  personalisation: Joi.object().required()
}).or('phoneNumber', 'emailAddress')
