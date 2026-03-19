import { describe, it, expect } from 'vitest'
import {
  maskMsisdn,
  maskEmail,
  maskTemplateId,
  generateOperationId
} from './masking-utils.js'

describe('masking-utils', () => {
  describe('maskMsisdn', () => {
    it('should mask MSISDN correctly', () => {
      expect(maskMsisdn('1234567890')).toBe('xxxxxxx890')
      expect(maskMsisdn('123')).toBe('123')
      expect(maskMsisdn('')).toBe(undefined)
      expect(maskMsisdn(null)).toBe(undefined)
    })
  })

  describe('maskEmail', () => {
    it('should mask email correctly', () => {
      expect(maskEmail('test@example.com')).toBe('te***@example.com')
      expect(maskEmail('a@example.com')).toBe('a***@example.com')
      expect(maskEmail('invalid-email')).toBe('invalid-email')
      expect(maskEmail('')).toBe(undefined)
      expect(maskEmail(null)).toBe(undefined)
    })
  })

  describe('maskTemplateId', () => {
    it('should mask template ID correctly', () => {
      expect(maskTemplateId('33420172-8b38-4fc8-8bc0-0390a4099e24')).toBe(
        '******************9e24'
      )
      expect(maskTemplateId('1234')).toBe('***')
      expect(maskTemplateId('12345678')).toBe('****5678')
      expect(maskTemplateId('')).toBe(undefined)
      expect(maskTemplateId(null)).toBe(undefined)
    })
  })

  describe('generateOperationId', () => {
    it('should generate operation ID with prefix and UUID', () => {
      const id = generateOperationId('test')
      expect(id).toMatch(
        /^test_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    it('should use default prefix with UUID', () => {
      const id = generateOperationId()
      expect(id).toMatch(
        /^op_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })

    it('should generate unique IDs', () => {
      const id1 = generateOperationId('test')
      const id2 = generateOperationId('test')
      expect(id1).not.toBe(id2)
    })
  })
})
