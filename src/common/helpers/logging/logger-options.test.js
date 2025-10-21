import { describe, it, expect, beforeAll, vi } from 'vitest'

// Mock the entire @defra/hapi-tracing module
vi.mock('@defra/hapi-tracing', () => ({
  getTraceId: vi.fn()
}))

describe('Logger Options', () => {
  let loggerModule
  let loggerOptions
  let getTraceIdMock

  beforeAll(async () => {
    // Import the mocked getTraceId function
    const { getTraceId } = await import('@defra/hapi-tracing')
    getTraceIdMock = getTraceId

    // Import the logger-options module
    loggerModule = await import('./logger-options.js')
    loggerOptions = loggerModule.loggerOptions
  })

  describe('Module Structure', () => {
    it('should export loggerOptions', () => {
      expect(loggerModule).toBeDefined()
      expect(loggerModule.loggerOptions).toBeDefined()
      expect(typeof loggerModule.loggerOptions).toBe('object')
    })
  })

  describe('Logger Options Configuration', () => {
    it('should have the correct structure', () => {
      expect(loggerOptions).toHaveProperty('enabled')
      expect(loggerOptions).toHaveProperty('ignorePaths')
      expect(loggerOptions).toHaveProperty('redact')
      expect(loggerOptions).toHaveProperty('level')
      expect(loggerOptions).toHaveProperty('nesting')
      expect(loggerOptions).toHaveProperty('mixin')
    })

    it('should have the correct types for properties', () => {
      expect(typeof loggerOptions.enabled).toBe('boolean')
      expect(Array.isArray(loggerOptions.ignorePaths)).toBe(true)
      expect(typeof loggerOptions.redact).toBe('object')
      expect(typeof loggerOptions.level).toBe('string')
      expect(typeof loggerOptions.nesting).toBe('boolean')
      expect(typeof loggerOptions.mixin).toBe('function')
    })
  })

  describe('Mixin Function', () => {
    it('should return an object', () => {
      const mixinResult = loggerOptions.mixin()
      expect(typeof mixinResult).toBe('object')
    })

    it('should include trace ID if available', () => {
      const mockTraceId = 'mock-trace-id'

      // Mock the getTraceId function to return a trace ID
      getTraceIdMock.mockReturnValue(mockTraceId)

      const mixinResult = loggerOptions.mixin()
      expect(mixinResult).toHaveProperty('trace')
      expect(mixinResult.trace).toHaveProperty('id', mockTraceId)
    })

    it('should return an empty object if trace ID is not available', () => {
      // Mock the getTraceId function to return undefined
      getTraceIdMock.mockReturnValue(undefined)

      const mixinResult = loggerOptions.mixin()
      expect(mixinResult).toEqual({})
    })
  })
})
