/* eslint-disable no-magic-numbers, no-useless-escape */

import Joi from 'joi'

const generateOtpSchema = Joi.object({
  phoneNumber: Joi.string()
    .required()
    .min(10)
    .max(15)
    .pattern(/^[\+\d\s\-\(\)]+$/)
})

const validateOtpSchema = Joi.object({
  phoneNumber: Joi.string()
    .required()
    .min(10)
    .max(15)
    .pattern(/^[\+\d\s\-\(\)]+$/),
  otp: Joi.string()
    .required()
    .length(5)
    .pattern(/^\d{5}$/)
})

export { generateOtpSchema, validateOtpSchema }
