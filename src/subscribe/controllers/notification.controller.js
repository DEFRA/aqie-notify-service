import { createNotificationService } from '../services/notify-service.js'
import Boom from '@hapi/boom'

const HTTP_STATUS_CREATED = 201

export async function sendNotificationHandler(request, h) {
  const { phoneNumber, emailAddress, templateId, personalisation } =
    request.payload

  try {
    const notificationService = createNotificationService()
    const response = await notificationService.send(
      phoneNumber,
      emailAddress,
      templateId,
      personalisation
    )

    return h
      .response({
        notificationId: response.notificationId,
        status: 'submitted'
      })
      .code(HTTP_STATUS_CREATED)
  } catch (err) {
    request.logger.error('Failed to send notification', { error: err.message })
    return Boom.failedDependency('Failed to send notification')
  }
}
