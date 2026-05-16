import { createNotificationService } from '../services/notify-service.js'
import Boom from '@hapi/boom'
import {
  maskTemplateId,
  generateOperationId,
  maskPhoneNumber,
  maskEmail
} from '../../common/helpers/masking-utils.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { createUserNotificationDetailService } from '../services/user-notification-detail.service.js'

const logger = createLogger()
const HTTP_STATUS_CREATED = 201

export async function sendNotificationHandler(request, h) {
  const requestId =
    request.headers['x-cdp-request-id'] ||
    request.info.id ||
    generateOperationId('req')
  const { phoneNumber, emailAddress, templateId, personalisation, alertId } =
    request.payload

  logger.info(
    `notification.send.requested ${JSON.stringify({ requestId, contactType: maskPhoneNumber(phoneNumber) ? 'sms' : 'email' + maskEmail(emailAddress), templateId: maskTemplateId(templateId) })}`
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

    const userNotificationDetailService = createUserNotificationDetailService(
      request.db,
      logger
    )
    const persistResult =
      await userNotificationDetailService.storeNotificationDetail({
        notificationId: response.notificationId,
        alertId,
        notifyStatus: 'submitted'
      })

    logger.info(
      `notification.send.success ${JSON.stringify({ requestId, notificationId: response.notificationId, contactType: phoneNumber ? 'sms' : 'email', alertId, insertedId: persistResult?.insertedId })}`
    )

    return h
      .response({
        notificationId: response.notificationId,
        status: 'submitted'
      })
      .code(HTTP_STATUS_CREATED)
  } catch (err) {
    logger.error(
      `notification.send.failed ${JSON.stringify({ requestId, contactType: phoneNumber ? 'sms' : 'email', templateId: maskTemplateId(templateId), errorName: err.name })}`
    )
    return Boom.failedDependency('Failed to send notification')
  }
}
