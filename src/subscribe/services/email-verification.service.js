import { createLogger } from '../../common/helpers/logging/logger.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Service for managing email verification details in MongoDB
 * Collection: user-email-verification-details
 */
class EmailVerificationService {
  constructor(db, logger) {
    this.db = db
    this.logger = logger || createLogger()
    this.collection = db.collection('user-email-verification-details')
    this.ensureIndexes()
  }

  /**
   * Ensure indexes exist for contact and secret fields
   */
  async ensureIndexes() {
    try {
      await this.collection.createIndex({ contact: 1 }, { unique: true })
      await this.collection.createIndex({ secret: 1 }, { unique: true })
      this.logger.info('email_verification.indexes.created')
    } catch (error) {
      this.logger.warn('email_verification.indexes.error', {
        error: error.message
      })
    }
  }

  /**
   * Normalize email address for consistent storage
   */
  normalizeEmail(emailAddress) {
    return emailAddress.toLowerCase().trim().replace(/\s+/g, '') // Remove any whitespace
  }

  /**
   * Store email verification details with UUID
   */
  async storeVerificationDetails(
    emailAddress,
    alertType,
    location,
    lat,
    long,
    expiryMinutes = 15
  ) {
    const operationId = `store_email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const uuid = uuidv4()
    const expiryTime = new Date(Date.now() + expiryMinutes * 60 * 1000)
    const cleanEmail = this.normalizeEmail(emailAddress)

    this.logger.info('email_verification.store.start', {
      operationId,
      emailAddress: '***' + cleanEmail.slice(-10),
      alertType,
      location,
      uuid: uuid.substring(0, 8) + '...'
    })

    try {
      const document = {
        contact: cleanEmail,
        secret: uuid,
        expiryTime,
        validated: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Additional verification data
        verificationData: {
          emailAddress: cleanEmail,
          alertType,
          location,
          lat,
          long
        }
      }

      const result = await this.collection.replaceOne(
        { contact: cleanEmail },
        document,
        { upsert: true }
      )

      this.logger.info('email_verification.store.success', {
        operationId,
        emailAddress: '***' + cleanEmail.slice(-10),
        uuid: uuid.substring(0, 8) + '...',
        upserted: result.upsertedId !== null,
        modified: result.modifiedCount > 0
      })

      return {
        success: true,
        uuid,
        verificationLink: `/confirm-page/${uuid}`,
        expiryTime
      }
    } catch (error) {
      this.logger.error('email_verification.store.error', {
        operationId,
        emailAddress: '***' + cleanEmail.slice(-10),
        error: error.message,
        errorName: error.name,
        stack: error.stack
      })
      throw new Error(`Failed to store email verification: ${error.message}`)
    }
  }

  /**
   * Get verification details by UUID
   */
  async getVerificationByUuid(uuid) {
    const operationId = `get_email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    this.logger.info('email_verification.get.start', {
      operationId,
      uuid: uuid.substring(0, 8) + '...'
    })

    try {
      const result = await this.collection.findOne({
        secret: uuid
      })

      this.logger.info('email_verification.get.completed', {
        operationId,
        uuid: uuid.substring(0, 8) + '...',
        found: !!result
      })

      return result
    } catch (error) {
      this.logger.error('email_verification.get.error', {
        operationId,
        uuid: uuid.substring(0, 8) + '...',
        error: error.message,
        errorName: error.name,
        stack: error.stack
      })
      throw new Error(`Failed to get verification: ${error.message}`)
    }
  }

  /**
   * Validate UUID and check expiry
   */
  async validateLink(uuid) {
    try {
      const verification = await this.getVerificationByUuid(uuid)

      if (!verification) {
        return { error: 'Invalid verification link' }
      }

      if (new Date() > verification.expiryTime) {
        return { error: 'Verification link has expired' }
      }

      // Mark as validated
      await this.collection.updateOne(
        { secret: uuid },
        {
          $set: {
            validated: true,
            updatedAt: new Date()
          }
        }
      )

      return {
        valid: true,
        data: verification.verificationData
      }
    } catch (error) {
      this.logger.error('email_verification.validate.error', {
        uuid: uuid.substring(0, 8) + '...',
        error: error.message
      })
      return { error: 'Failed to validate link' }
    }
  }
}

/**
 * Factory function to create EmailVerificationService instance
 */
function createEmailVerificationService(db, logger) {
  return new EmailVerificationService(db, logger)
}

export { EmailVerificationService, createEmailVerificationService }
