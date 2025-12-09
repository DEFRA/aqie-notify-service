import { describe, it, expect, vi } from 'vitest'
import { health } from './health.js'

// Helper functions to reduce nesting
function createMockResponse(returnValue) {
  return {
    response: vi.fn((data) => returnValue || data)
  }
}

function createMockResponseWithCode() {
  return {
    response: vi.fn((data) => ({
      code: vi.fn(() => data),
      data
    }))
  }
}

function createMockRequest(info = {}) {
  return { info }
}

describe('Health Route', () => {
  describe('Route Configuration', () => {
    it('should have correct route structure', () => {
      expect(health).toBeDefined()
      expect(health.method).toBe('GET')
      expect(health.path).toBe('/health')
      expect(health.handler).toBeInstanceOf(Function)
    })
  })

  describe('Handler Function', () => {
    it('should return success message', () => {
      const mockRequest = createMockRequest()
      const mockH = createMockResponseWithCode()

      const result = health.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({ message: 'success' })
      expect(result.data).toEqual({ message: 'success' })
    })

    it('should handle request and h parameters', () => {
      const mockRequest = createMockRequest({ id: 'test-123' })
      const mockH = createMockResponse()

      const result = health.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ message: 'success' })
    })
  })
})
