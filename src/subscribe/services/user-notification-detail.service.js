import { createLogger } from '../../common/helpers/logging/logger.js'

class UserNotificationDetailService {
  constructor(db, logger) {
    this.db = db
    this.logger = logger || createLogger()
    this.collection = db.collection('user-notification-details')
  }

  async storeNotificationDetail({ notificationId, alertId, notifyStatus }) {
    this.logger.info(
      `user_notification_detail.store.start ${JSON.stringify({ notificationId, alertId, notifyStatus })}`
    )

    try {
      const document = {
        notificationId,
        alertId,
        notifyStatus,
        createdAt: new Date()
      }

      const result = await this.collection.insertOne(document)

      this.logger.info(
        `user_notification_detail.store.success ${JSON.stringify({ notificationId, alertId, insertedId: result.insertedId })}`
      )

      return { success: true, insertedId: result.insertedId }
    } catch (error) {
      this.logger.error(
        `user_notification_detail.store.error ${JSON.stringify({ notificationId, alertId, error: error.message })}`
      )
      throw new Error(`Failed to store notification detail: ${error.message}`)
    }
  }
}

function createUserNotificationDetailService(db, logger) {
  return new UserNotificationDetailService(db, logger)
}

export { UserNotificationDetailService, createUserNotificationDetailService }
