import { describe, it, expect } from 'vitest'
import { validateOtpRoute } from './validate-otp.route.js'
import { validateOtpHandler } from '../controllers/otp.controller.js'
import { validateOtpSchema } from '../validators/otp.schema.js'

describe('Validate OTP Route', () => {
  describe('Route Configuration', () => {
    it('should have correct HTTP method', () => {
      expect(validateOtpRoute.method).toBe('POST')
    })

    it('should have correct path', () => {
      expect(validateOtpRoute.path).toBe('/subscribe/validate-otp')
    })

    it('should have handler configured', () => {
      expect(validateOtpRoute.handler).toBeDefined()
      expect(validateOtpRoute.handler).toBe(validateOtpHandler)
    })

    it('should have validation options configured', () => {
      expect(validateOtpRoute.options).toBeDefined()
      expect(validateOtpRoute.options.validate).toBeDefined()
    })

    it('should have payload validation schema', () => {
      expect(validateOtpRoute.options.validate.payload).toBeDefined()
      expect(validateOtpRoute.options.validate.payload).toBe(validateOtpSchema)
    })
  })

  describe('Route Structure', () => {
    it('should be a valid Hapi.js route object', () => {
      expect(validateOtpRoute).toBeTypeOf('object')
      expect(validateOtpRoute).toHaveProperty('method')
      expect(validateOtpRoute).toHaveProperty('path')
      expect(validateOtpRoute).toHaveProperty('handler')
      expect(validateOtpRoute).toHaveProperty('options')
    })

    it('should have all required properties', () => {
      const requiredProperties = ['method', 'path', 'handler', 'options']
      requiredProperties.forEach((prop) => {
        expect(validateOtpRoute).toHaveProperty(prop)
      })
    })
  })

  describe('Route Exports', () => {
    it('should export validateOtpRoute correctly', () => {
      expect(validateOtpRoute).toBeDefined()
      expect(typeof validateOtpRoute).toBe('object')
    })
  })

  describe('Route Differences from Generate OTP', () => {
    it('should have different path than generate-otp route', () => {
      expect(validateOtpRoute.path).not.toBe('/subscribe/generate-otp')
      expect(validateOtpRoute.path).toBe('/subscribe/validate-otp')
    })

    it('should use different handler than generate-otp route', () => {
      expect(validateOtpRoute.handler).toBe(validateOtpHandler)
      expect(validateOtpRoute.handler.name).toBe('validateOtpHandler')
    })

    it('should use different schema than generate-otp route', () => {
      expect(validateOtpRoute.options.validate.payload).toBe(validateOtpSchema)
    })
  })
})
