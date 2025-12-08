import { createNotificationService } from '../services/notify-service.js'
import Boom from '@hapi/boom'

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
      .code(201)
  } catch (err) {
    request.logger.error('Failed to send notification', { error: err.message })
    return Boom.failedDependency('Failed to send notification')
  }
}
