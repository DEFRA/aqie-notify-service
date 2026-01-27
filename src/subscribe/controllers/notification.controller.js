import { createNotificationService } from '../services/notify-service.js'
import Boom from '@hapi/boom'
import {
  maskMsisdn,
  maskEmail,
  maskTemplateId,
  generateOperationId
} from '../../common/helpers/masking-utils.js'

const HTTP_STATUS_CREATED = 201

export async function sendNotificationHandler(request, h) {
  const requestId =
    request.headers['x-cdp-request-id'] ||
    request.info.id ||
    generateOperationId('req')
  const { phoneNumber, emailAddress, templateId, personalisation } =
    request.payload

  request.logger.info(
    {
      requestId,
      contactType: phoneNumber ? 'sms' : 'email',
      templateId: maskTemplateId(templateId)
    },
    `notification.send.requested [${requestId}] ${phoneNumber ? 'SMS to ' + maskMsisdn(phoneNumber) : 'EMAIL to ' + (emailAddress ? maskEmail(emailAddress) : 'unknown')} template=${maskTemplateId(templateId)}`
  )

  try {
    const notificationService = createNotificationService()
    const response = await notificationService.send(
      phoneNumber,
      emailAddress,
      templateId,
      personalisation,
      requestId
    )

    request.logger.info(
      {
        requestId,
        notificationId: response.notificationId,
        contactType: phoneNumber ? 'sms' : 'email'
      },
      `notification.send.success [${requestId}] notificationId=${response.notificationId}`
    )

    return h
      .response({
        notificationId: response.notificationId,
        status: 'submitted'
      })
      .code(HTTP_STATUS_CREATED)
  } catch (err) {
    request.logger.error(`notification.send.failed [${requestId}]`, {
      requestId,
      error: err.message,
      contactType: phoneNumber ? 'sms' : 'email',
      templateId: maskTemplateId(templateId)
    })
    return Boom.failedDependency('Failed to send notification')
  }
}
