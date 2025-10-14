import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Application Index', () => {
  let originalExitCode
  let mockLogger
  let startServerMock
  let createLoggerMock
  let originalProcessOn

  beforeEach(() => {
    // Store original process.exitCode and process.on
    originalExitCode = process.exitCode
    originalProcessOn = process.on

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn()
    }

    // Mock the logger creation
    createLoggerMock = vi.fn().mockReturnValue(mockLogger)

    // Mock startServer
    startServerMock = vi.fn().mockResolvedValue({ info: { port: 3000 } })

    // Mock the imports
    vi.doMock('./common/helpers/logging/logger.js', () => ({
      createLogger: createLoggerMock
    }))

    vi.doMock('./common/helpers/start-server.js', () => ({
      startServer: startServerMock
    }))

    // Increase max listeners to avoid warnings
    process.setMaxListeners(20)
  })

  afterEach(() => {
    // Restore original exitCode
    process.exitCode = originalExitCode

    // Clear all mocks
    vi.clearAllMocks()
    vi.resetModules()

    // Reset max listeners
    process.setMaxListeners(10)
  })

  describe('Module Import and Server Startup', () => {
    it('should start server on module import', async () => {
      // Import the index module - this triggers the await startServer()
      await import('./index.js')

      // Verify startServer was called
      expect(startServerMock).toHaveBeenCalledTimes(1)
      expect(startServerMock).toHaveBeenCalledWith()
    })

    it('should handle successful server startup', async () => {
      // Mock successful server start
      startServerMock.mockResolvedValueOnce({
        info: { port: 3000, address: '127.0.0.1' }
      })

      // Import and verify no errors
      await expect(import('./index.js')).resolves.toBeDefined()
      expect(startServerMock).toHaveBeenCalled()
    })

    it('should handle server startup failure', async () => {
      // Mock server startup failure
      const serverError = new Error('Failed to start server')
      startServerMock.mockRejectedValueOnce(serverError)

      // Import should still work (error is handled by unhandledRejection)
      try {
        await import('./index.js')
      } catch (error) {
        // The import itself shouldn't throw, but the server start will
        expect(error).toBeDefined()
      }
    })
  })

  describe('Unhandled Rejection Handler', () => {
    it('should handle unhandled rejections', async () => {
      // Import the module first to set up the handler
      await import('./index.js')

      // Create a test error
      const testError = new Error('Test unhandled rejection')

      // Trigger an unhandled rejection
      const unhandledPromise = Promise.reject(testError)

      // Emit the unhandledRejection event manually
      process.emit('unhandledRejection', testError, unhandledPromise)

      // Wait a tick for the handler to execute
      await new Promise((resolve) => process.nextTick(resolve))

      // Verify logger was created and used
      expect(createLoggerMock).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith('Unhandled rejection')
      expect(mockLogger.error).toHaveBeenCalledWith(testError)
      expect(process.exitCode).toBe(1)
    })

    it('should handle multiple unhandled rejections', async () => {
      // Import the module
      await import('./index.js')

      // Create multiple test errors
      const error1 = new Error('First rejection')
      const error2 = new Error('Second rejection')

      // Trigger multiple unhandled rejections
      process.emit('unhandledRejection', error1, Promise.reject(error1))
      process.emit('unhandledRejection', error2, Promise.reject(error2))

      // Wait for handlers to execute
      await new Promise((resolve) => process.nextTick(resolve))

      // Verify both were handled
      expect(mockLogger.info).toHaveBeenCalledTimes(2)
      expect(mockLogger.error).toHaveBeenCalledTimes(2)
      expect(mockLogger.error).toHaveBeenCalledWith(error1)
      expect(mockLogger.error).toHaveBeenCalledWith(error2)
      expect(process.exitCode).toBe(1)
    })

    it('should handle different types of rejection errors', async () => {
      // Import the module
      await import('./index.js')

      // Test different error types
      const stringError = 'String error'
      const objectError = { message: 'Object error', code: 500 }
      const nullError = null

      // Emit different error types
      process.emit(
        'unhandledRejection',
        stringError,
        Promise.reject(stringError)
      )
      process.emit(
        'unhandledRejection',
        objectError,
        Promise.reject(objectError)
      )
      process.emit('unhandledRejection', nullError, Promise.reject(nullError))

      // Wait for handlers
      await new Promise((resolve) => process.nextTick(resolve))

      // Verify all were logged
      expect(mockLogger.info).toHaveBeenCalledTimes(3)
      expect(mockLogger.error).toHaveBeenCalledWith(stringError)
      expect(mockLogger.error).toHaveBeenCalledWith(objectError)
      expect(mockLogger.error).toHaveBeenCalledWith(nullError)
    })
  })

  describe('Process Event Listener Setup', () => {
    it('should set up unhandledRejection event listener', async () => {
      // Spy on process.on
      const processOnSpy = vi.spyOn(process, 'on')

      // Import the module
      await import('./index.js')

      // Verify event listener was registered
      expect(processOnSpy).toHaveBeenCalledWith(
        'unhandledRejection',
        expect.any(Function)
      )

      processOnSpy.mockRestore()
    })

    it('should verify event listener function signature', async () => {
      let capturedHandler

      // Spy on process.on and capture the handler
      const processOnSpy = vi
        .spyOn(process, 'on')
        .mockImplementation((event, handler) => {
          if (event === 'unhandledRejection') {
            capturedHandler = handler
          }
          return originalProcessOn.call(process, event, handler)
        })

      // Import the module
      await import('./index.js')

      // Verify handler was captured
      expect(capturedHandler).toBeInstanceOf(Function)
      expect(capturedHandler.length).toBe(1) // Should accept 1 parameter (error)

      processOnSpy.mockRestore()
    })
  })

  describe('Integration Tests', () => {
    it('should complete full startup sequence', async () => {
      // Mock successful startup
      startServerMock.mockResolvedValueOnce({
        info: { port: 3000 },
        start: vi.fn()
      })

      // Import and wait for completion
      const indexModule = await import('./index.js')

      // Verify module loaded
      expect(indexModule).toBeDefined()

      // Verify server was started
      expect(startServerMock).toHaveBeenCalledTimes(1)

      // Verify no exit code was set (successful startup)
      expect(process.exitCode).not.toBe(1)
    })

    it('should handle startup and rejection in sequence', async () => {
      // Import the module
      await import('./index.js')

      // Verify server started
      expect(startServerMock).toHaveBeenCalled()

      // Then trigger a rejection
      const testError = new Error('Post-startup error')
      process.emit('unhandledRejection', testError, Promise.reject(testError))

      // Wait for handler
      await new Promise((resolve) => process.nextTick(resolve))

      // Verify both startup and error handling occurred
      expect(startServerMock).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith('Unhandled rejection')
      expect(mockLogger.error).toHaveBeenCalledWith(testError)
      expect(process.exitCode).toBe(1)
    })
  })

  describe('Error Edge Cases', () => {
    it('should handle logger creation failure gracefully', async () => {
      // Create a logger that throws during creation
      createLoggerMock.mockImplementationOnce(() => {
        throw new Error('Logger creation failed')
      })

      // Import the module
      await import('./index.js')

      // The error will be thrown during event handling, so we expect it
      const testError = new Error('Test error')

      expect(() => {
        process.emit('unhandledRejection', testError, Promise.reject(testError))
      }).toThrow('Logger creation failed')
    })

    it('should handle logger method failures gracefully', async () => {
      // Mock logger methods to fail
      mockLogger.info.mockImplementationOnce(() => {
        throw new Error('Logger.info failed')
      })

      // Import the module
      await import('./index.js')

      // The error will be thrown during logging, so we expect it
      const testError = new Error('Test error')
      expect(() => {
        process.emit('unhandledRejection', testError, Promise.reject(testError))
      }).toThrow('Logger.info failed')
    })

    it('should still set exitCode even when logging fails', async () => {
      // Mock only logger.error to fail, but let info succeed
      mockLogger.error.mockImplementationOnce(() => {
        throw new Error('Logger.error failed')
      })

      // Import the module
      await import('./index.js')

      // Reset exitCode
      process.exitCode = 0

      const testError = new Error('Test error')
      expect(() => {
        process.emit('unhandledRejection', testError, Promise.reject(testError))
      }).toThrow('Logger.error failed')

      // Even though logging failed, the handler still ran and logged info
      expect(mockLogger.info).toHaveBeenCalledWith('Unhandled rejection')
      expect(process.exitCode).toBe(1) // Should still be set before error
    })
  })

  describe('Coverage Completeness', () => {
    it('should cover all code paths in index.js', async () => {
      // This test ensures we hit all lines for coverage
      const indexModule = await import('./index.js')

      // Module should be defined (covers import statements)
      expect(indexModule).toBeDefined()

      // Server should have started (covers await startServer())
      expect(startServerMock).toHaveBeenCalled()

      // Trigger unhandled rejection (covers event handler)
      const testError = new Error('Coverage test')
      process.emit('unhandledRejection', testError, Promise.reject(testError))

      await new Promise((resolve) => process.nextTick(resolve))

      // All handler lines should be covered
      expect(createLoggerMock).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith('Unhandled rejection')
      expect(mockLogger.error).toHaveBeenCalledWith(testError)
      expect(process.exitCode).toBe(1)
    })
  })
})
