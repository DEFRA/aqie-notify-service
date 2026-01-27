/* eslint-disable curly */

import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import {
  maskMsisdn,
  maskEmail,
  maskTemplateId,
  generateOperationId
} from '../../common/helpers/masking-utils.js'
import {
  createLoggingContext,
  logError,
  logInfo,
  trackPerformance
} from '../../common/helpers/logging-context.js'

const logger = createLogger()

/**
 * Parse Notify client error safely (do not depend on message text)
 * @param {any} err
 * @returns {{statusCode:number|undefined,errorType:string|undefined,category:string,retriable:boolean,details:Array}}
 */
function parseNotifyError(err) {
  const statusCode = err?.response?.data?.status_code || err?.response?.status
  const errors = Array.isArray(err?.response?.data?.errors)
    ? err.response.data.errors
    : []
  const primary = errors[0] || {}
  const errorType = primary.error || primary.code

  const category = resolveCategory(statusCode, errorType)
  const retriable = isRetriable(statusCode, errorType)

  return {
    statusCode,
    errorType,
    category,
    retriable,
    details: errors.map((e) => ({
      error: e.error || e.code
      // intentionally exclude mutable message text per guidance
    }))
  }
}

function resolveCategory(statusCode, errorType) {
  if (statusCode === 401) return 'unauthorized'
  if (statusCode === 403) return 'forbidden'
  if (errorType === 'RateLimitError') return 'rate_limit'
  if (errorType === 'TooManyRequestsError') return 'daily_limit'
  if (errorType === 'BadRequestError' || statusCode === 400)
    return 'bad_request'
  if (statusCode && statusCode >= 500) return 'server_error'
  return 'unknown'
}

function isRetriable(statusCode, errorType) {
  return (
    (statusCode >= 500 && statusCode <= 599) ||
    errorType === 'RateLimitError' ||
    errorType === 'TooManyRequestsError'
  )
}

/**
 * Service for sending SMS via GOV.UK Notify
 */
class NotifyService {
  constructor() {
    this.apiKey = config.get('notify.apiKey')
    this.client = new NotifyClient(this.apiKey)
  }

  /**
   * Generic SMS sender
   */
  async sendSmsGeneric(
    templateId,
    phoneNumber,
    personalisation,
    requestId = null
  ) {
    const operationId = generateOperationId('sms')
    logger.info(
      {
        operationId,
        templateId: maskTemplateId(templateId),
        phoneNumberMasked: maskMsisdn(phoneNumber),
        personalisationKeys: personalisation ? Object.keys(personalisation) : []
      },
      `notify.send_sms.start [${operationId}] template=${maskTemplateId(templateId)} phone=${maskMsisdn(phoneNumber)}`
    )

    try {
      if (!templateId || !phoneNumber) {
        logger.error('notify.send_sms.missing_parameters', {
          operationId,
          hasTemplateId: !!templateId,
          hasPhoneNumber: !!phoneNumber
        })
        throw new Error(
          'Missing required parameters: templateId and phoneNumber'
        )
      }

      logger.info(
        {
          operationId,
          templateId: maskTemplateId(templateId),
          phoneNumberMasked: maskMsisdn(phoneNumber)
        },
        `notify.send_sms.calling_notify_api [${operationId}]`
      )

      const response = await this.client.sendSms(templateId, phoneNumber, {
        personalisation
      })

      const data = response?.data || {}
      logger.info(
        {
          operationId,
          hasData: !!data,
          hasId: !!data.id,
          hasUri: !!data.uri,
          responseKeys: Object.keys(data)
        },
        `notify.send_sms.api_response_received [${operationId}] id=${data.id}`
      )

      if (!data.id) {
        logger.error('notify.send_sms_generic.missing_id')
        throw new Error('MissingNotificationId')
      }

      logger.info(
        {
          operationId,
          notificationId: data.id,
          templateId: maskTemplateId(templateId)
        },
        `notify.send_sms.success [${operationId}] notificationId=${data.id}`
      )

      return {
        notificationId: data.id,
        notificationStatus: data.uri
      }
    } catch (err) {
      const parsed = parseNotifyError(err)
      logger.error('notify.send_sms_generic.failure', {
        category: parsed.category,
        errorType: parsed.errorType,
        originalError: err.message,
        phoneNumberMasked: maskMsisdn(phoneNumber),
        statusCode: parsed.statusCode,
        templateId: maskTemplateId(templateId)
      })
      throw new NotifySmsError('FailedToSendSMS', parsed)
    }
  }

  /**
   * Generic Email sender
   */
  async sendEmailGeneric(
    templateId,
    emailAddress,
    personalisation,
    requestId = null
  ) {
    const context = createLoggingContext(requestId, 'notify.send_email', {
      templateId: maskTemplateId(templateId),
      emailAddressMasked: maskEmail(emailAddress),
      personalisationKeys: personalisation ? Object.keys(personalisation) : [],
      notifyApiKey: this.apiKey ? 'present' : 'missing'
    })

    logInfo(
      logger,
      context,
      'start',
      `template=${maskTemplateId(templateId)} email=${maskEmail(emailAddress)}`
    )

    try {
      if (!templateId || !emailAddress) {
        logError(
          logger,
          context,
          'validation_failed',
          new Error('Missing required parameters'),
          {
            hasTemplateId: !!templateId,
            hasEmailAddress: !!emailAddress,
            validationErrors: [
              !templateId && 'templateId required',
              !emailAddress && 'emailAddress required'
            ].filter(Boolean)
          }
        )
        throw new Error(
          'Missing required parameters: templateId and emailAddress'
        )
      }

      const apiContext = context.createChild('api_call')
      logInfo(
        logger,
        apiContext,
        'calling_notify_api',
        'Sending Email via GOV.UK Notify'
      )

      const response = await this.client.sendEmail(templateId, emailAddress, {
        personalisation
      })

      const data = response?.data || {}
      logInfo(logger, apiContext, 'api_response_received', `id=${data.id}`, {
        hasData: !!data,
        hasId: !!data.id,
        hasUri: !!data.uri,
        responseKeys: Object.keys(data),
        apiResponseTime: apiContext.getDuration()
      })

      if (!data.id) {
        logError(
          logger,
          context,
          'missing_notification_id',
          new Error('MissingNotificationId'),
          {
            responseData: data,
            apiResponseTime: apiContext.getDuration()
          }
        )
        throw new Error('MissingNotificationId')
      }

      logInfo(logger, context, 'success', `notificationId=${data.id}`, {
        notificationId: data.id,
        apiResponseTime: apiContext.getDuration()
      })

      trackPerformance(logger, context, 'email_send', {
        notificationId: data.id,
        apiResponseTime: apiContext.getDuration()
      })

      return {
        notificationId: data.id,
        notificationStatus: data.uri
      }
    } catch (err) {
      const parsed = parseNotifyError(err)
      logError(logger, context, 'failure', err, {
        statusCode: parsed.statusCode,
        errorType: parsed.errorType,
        category: parsed.category,
        retriable: parsed.retriable,
        notifyResponse: err.response?.data,
        retryRecommended: parsed.retriable
      })
      throw new NotifySmsError('FailedToSendEmail', {
        ...parsed,
        correlationId: context.correlationId
      })
    }
  }

  /**
   * Gets the status of a sent notification
   * @param {string} notificationId - The notification ID from Notify
   * @returns {Promise<object>} - Notification status
   */
  async getNotificationStatus(notificationId) {
    const operationId = generateOperationId('status')
    logger.info('notify.get_status.start', {
      operationId,
      notificationId
    })

    try {
      logger.info('notify.get_status.calling_notify_api', {
        operationId,
        notificationId
      })

      const response = await this.client.getNotificationById(notificationId)

      logger.info('notify.get_status.success', {
        operationId,
        notificationId,
        status: response.body?.status,
        createdAt: response.body?.created_at
      })

      return response.body
    } catch (err) {
      const parsed = parseNotifyError(err)
      logger.error('notify.get_status.failure', {
        operationId,
        notificationId,
        statusCode: parsed.statusCode,
        errorType: parsed.errorType,
        category: parsed.category,
        retriable: parsed.retriable,
        originalError: err.message,
        errorName: err.name
      })
      throw new NotifySmsError('FailedToGetNotificationStatus', {
        ...parsed,
        notificationId
      })
    }
  }
}

/**
 * Domain error for SMS sending failures (structured for upstream handling)
 */
class NotifySmsError extends Error {
  constructor(message, meta) {
    super(message)
    this.name = 'NotifySmsError'
    this.statusCode = meta?.statusCode
    this.errorType = meta?.errorType

    this.category = meta?.category
    this.retriable = meta?.retriable
    this.meta = meta
  }
}

// Create singleton instance
const notifyService = new NotifyService()

/**
 * Send SMS via notification service
 */
async function sendSms(
  phoneNumber,
  templateId,
  personalisation,
  requestId = null
) {
  return notifyService.sendSmsGeneric(
    templateId,
    phoneNumber,
    personalisation,
    requestId
  )
}

/**
 * Send Email via notification service
 */
async function sendEmail(
  emailAddress,
  templateId,
  personalisation,
  requestId = null
) {
  return notifyService.sendEmailGeneric(
    templateId,
    emailAddress,
    personalisation,
    requestId
  )
}

/**
 * Send notification (SMS or Email) via /send-notification api
 */
async function send(
  phoneNumber,
  emailAddress,
  templateId,
  personalisation,
  requestId = null
) {
  if (phoneNumber) {
    return sendSms(phoneNumber, templateId, personalisation, requestId)
  } else if (emailAddress) {
    return sendEmail(emailAddress, templateId, personalisation, requestId)
  } else {
    throw new Error('Either phoneNumber or emailAddress must be provided')
  }
}

/**
 * Factory function to create notification service with simplified interface
 */
function createNotificationService() {
  return { sendSms, sendEmail, send }
}

export {
  notifyService,
  NotifyService,
  NotifySmsError,
  createNotificationService
}
