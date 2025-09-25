/* eslint-disable */
import { NotifyClient } from 'notifications-node-client'
import { config } from '../../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

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
    this.templateId = config.get('notify.templateId')
    this.otpPersonalisationKey = config.get('notify.otpPersonalisationKey')
    this.timeoutMs = config.get('notify.timeoutMs')
    this.client = new NotifyClient(this.apiKey)
  }

  /**
   * Sends an OTP SMS to the specified phone number
   * @param {string} phoneNumber - The phone number to send SMS to (E.164 format)
   * @param {string} otp - The 5-digit OTP code
   * @returns {Promise<object>} - Notify API response
   */
  async sendOTPSMS(phoneNumber, otp) {
    try {
      logger.info('notify.send_sms.start', {
        phoneNumberMasked: maskMsisdn(phoneNumber)
      })

      const personalisation = { [this.otpPersonalisationKey]: otp }

      const response = await this.client.sendSms(this.templateId, phoneNumber, {
        personalisation
      })

      const data = response?.data || {}
      if (!data.id) {
        logger.error('notify.send_sms.missing_id')
        throw new Error('MissingNotificationId')
      }

      logger.info('notify.send_sms.success', {
        notificationId: data.id
      })

      return {
        success: true,
        notificationId: data.id,
        notificationStatus: data.uri
      }
    } catch (err) {
      const parsed = parseNotifyError(err)

      logger.error('notify.send_sms.failure', {
        statusCode: parsed.statusCode,
        errorType: parsed.errorType,
        category: parsed.category,
        retriable: parsed.retriable,
        details: parsed.details
      })

      // Upstream can inspect .retriable to implement backoff / retry
      throw new NotifySmsError('FailedToSendSMS', parsed)
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
 * Mask MSISDN for logs
 */
function maskMsisdn(msisdn) {
  if (!msisdn) return undefined
  const visible = msisdn.slice(-3)
  return msisdn.slice(0, msisdn.length - 3).replace(/./g, 'x') + visible
}

// Create singleton instance
const notifyService = new NotifyService()

export { notifyService, NotifyService, NotifySmsError }
