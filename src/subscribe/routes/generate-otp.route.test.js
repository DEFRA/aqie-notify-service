import { describe, it, expect } from 'vitest'
import { generateOtpRoute } from './generate-otp.route.js'
import { generateOtpHandler } from '../controllers/otp.controller.js'
import { generateOtpSchema } from '../validators/otp.schema.js'

describe('Generate OTP Route', () => {
  describe('Route Configuration', () => {
    it('should have correct HTTP method', () => {
      expect(generateOtpRoute.method).toBe('POST')
    })

    it('should have correct path', () => {
      expect(generateOtpRoute.path).toBe('/subscribe/generate-otp')
    })

    it('should have handler configured', () => {
      expect(generateOtpRoute.handler).toBeDefined()
      expect(generateOtpRoute.handler).toBe(generateOtpHandler)
    })

    it('should have validation options configured', () => {
      expect(generateOtpRoute.options).toBeDefined()
      expect(generateOtpRoute.options.validate).toBeDefined()
    })

    it('should have payload validation schema', () => {
      expect(generateOtpRoute.options.validate.payload).toBeDefined()
      expect(generateOtpRoute.options.validate.payload).toBe(generateOtpSchema)
    })
  })

  describe('Route Structure', () => {
    it('should be a valid Hapi.js route object', () => {
      expect(generateOtpRoute).toBeTypeOf('object')
      expect(generateOtpRoute).toHaveProperty('method')
      expect(generateOtpRoute).toHaveProperty('path')
      expect(generateOtpRoute).toHaveProperty('handler')
      expect(generateOtpRoute).toHaveProperty('options')
    })

    it('should have all required properties', () => {
      const requiredProperties = ['method', 'path', 'handler', 'options']
      requiredProperties.forEach((prop) => {
        expect(generateOtpRoute).toHaveProperty(prop)
      })
    })
  })

  describe('Route Exports', () => {
    it('should export generateOtpRoute correctly', () => {
      expect(generateOtpRoute).toBeDefined()
      expect(typeof generateOtpRoute).toBe('object')
    })
  })
})
