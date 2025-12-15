/**
 * Enhanced logging context utilities for better tracking
 */

/**
 * Create enhanced logging context with timing and correlation
 */
function createLoggingContext(
  requestId,
  operationType,
  additionalContext = {}
) {
  const startTime = Date.now()
  const correlationId =
    requestId ||
    `${operationType}_${startTime}_${Math.random().toString(36).substr(2, 9)}`

  return {
    correlationId,
    operationType,
    startTime,
    ...additionalContext,

    // Helper to calculate duration
    getDuration() {
      return Date.now() - startTime
    },

    // Helper to create child context
    createChild(childType) {
      return createLoggingContext(
        correlationId,
        `${operationType}.${childType}`,
        {
          parentOperation: operationType,
          ...additionalContext
        }
      )
    },

    // Helper to get base log fields
    getBaseFields() {
      return {
        correlationId,
        operationType,
        duration: this.getDuration(),
        timestamp: new Date().toISOString(),
        ...additionalContext
      }
    }
  }
}

/**
 * Enhanced error logging with context
 */
function logError(logger, context, errorType, error, additionalFields = {}) {
  logger.error(`${context.operationType}.${errorType}`, {
    ...context.getBaseFields(),
    error: error.message,
    errorName: error.name,
    errorStack: error.stack,
    ...additionalFields
  })
}

/**
 * Enhanced info logging with context
 */
function logInfo(logger, context, eventType, message, additionalFields = {}) {
  logger.info(
    `${context.operationType}.${eventType} [${context.correlationId}] ${message}`,
    {
      ...context.getBaseFields(),
      ...additionalFields
    }
  )
}

/**
 * Performance tracking helper
 */
function trackPerformance(logger, context, operation, additionalMetrics = {}) {
  const duration = context.getDuration()

  logger.info(`${context.operationType}.performance`, {
    ...context.getBaseFields(),
    operation,
    duration,
    performanceCategory:
      duration > 5000 ? 'slow' : duration > 2000 ? 'medium' : 'fast',
    ...additionalMetrics
  })
}

export { createLoggingContext, logError, logInfo, trackPerformance }
