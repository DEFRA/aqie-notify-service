/* eslint-disable */
import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Mask MSISDN for logs
 */
function maskMsisdn(msisdn) {
  if (!msisdn) return undefined
  const visible = msisdn.slice(-3)
  return msisdn.slice(0, msisdn.length - 3).replace(/./g, 'x') + visible
}

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

  let category = 'unknown'
  if (statusCode === 401) category = 'unauthorized'
  else if (statusCode === 403) category = 'forbidden'
  else if (errorType === 'RateLimitError') category = 'rate_limit'
  else if (errorType === 'TooManyRequestsError') category = 'daily_limit'
  else if (errorType === 'BadRequestError' || statusCode === 400)
    category = 'bad_request'
  else if (statusCode && statusCode >= 500) category = 'server_error'

  const retriable =
    (statusCode >= 500 && statusCode <= 599) ||
    errorType === 'RateLimitError' ||
    errorType === 'TooManyRequestsError'

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
  async sendSmsGeneric(templateId, phoneNumber, personalisation) {
    try {
      if (!templateId || !phoneNumber) {
        throw new Error(
          'Missing required parameters: templateId and phoneNumber'
        )
      }

      const response = await this.client.sendSms(templateId, phoneNumber, {
        personalisation
      })
      const data = response?.data || {}
      if (!data.id) {
        logger.error('notify.send_sms_generic.missing_id')
        throw new Error('MissingNotificationId')
      }
      return {
        notificationId: data.id,
        notificationStatus: data.uri
      }
    } catch (err) {
      const parsed = parseNotifyError(err)
      logger.error('notify.send_sms_generic.failure', {
        templateId,
        phoneNumberMasked: maskMsisdn(phoneNumber),
        statusCode: parsed.statusCode,
        errorType: parsed.errorType,
        category: parsed.category,
        originalError: err.message,
        notifyResponse: err.response?.data
      })
      throw new NotifySmsError('FailedToSendSMS', parsed)
    }
  }

  /**
   * Generic Email sender
   */
  async sendEmailGeneric(templateId, emailAddress, personalisation) {
    try {
      if (!templateId || !emailAddress) {
        throw new Error(
          'Missing required parameters: templateId and emailAddress'
        )
      }

      const response = await this.client.sendEmail(templateId, emailAddress, {
        personalisation
      })
      const data = response?.data || {}
      if (!data.id) {
        logger.error('notify.send_email_generic.missing_id')
        throw new Error('MissingNotificationId')
      }
      return {
        notificationId: data.id,
        notificationStatus: data.uri
      }
    } catch (err) {
      const parsed = parseNotifyError(err)
      logger.error('notify.send_email_generic.failure', {
        templateId,
        emailAddress: emailAddress?.replace(/(.{2}).*(@.*)/, '$1***$2'),
        statusCode: parsed.statusCode,
        errorType: parsed.errorType,
        category: parsed.category
      })
      throw new NotifySmsError('FailedToSendEmail', parsed)
    }
  }

  /**
   * Gets the status of a sent notification
   * @param {string} notificationId - The notification ID from Notify
   * @returns {Promise<object>} - Notification status
   */
  async getNotificationStatus(notificationId) {
    try {
      const response = await this.client.getNotificationById(notificationId)
      return response.body
    } catch (err) {
      const parsed = parseNotifyError(err)
      logger.error('notify.get_status.failure', {
        notificationId,
        statusCode: parsed.statusCode,
        errorType: parsed.errorType,
        category: parsed.category,
        retriable: parsed.retriable
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
 * Factory function to create notification service with simplified interface
 */
function createNotificationService() {
  async function sendSms(phoneNumber, templateId, personalisation) {
    return notifyService.sendSmsGeneric(
      templateId,
      phoneNumber,
      personalisation
    )
  }

  async function sendEmail(emailAddress, templateId, personalisation) {
    return notifyService.sendEmailGeneric(
      templateId,
      emailAddress,
      personalisation
    )
  }

  async function send(phoneNumber, emailAddress, templateId, personalisation) {
    if (phoneNumber) {
      return sendSms(phoneNumber, templateId, personalisation)
    } else if (emailAddress) {
      return sendEmail(emailAddress, templateId, personalisation)
    } else {
      throw new Error('Either phoneNumber or emailAddress must be provided')
    }
  }

  return { sendSms, sendEmail, send }
}

export {
  notifyService,
  NotifyService,
  NotifySmsError,
  createNotificationService
}
