import { createLogger } from '../../common/helpers/logging/logger.js'

/**
 * Service for managing user contact details in MongoDB
 * Collection: user-contact-details
 * Document shape:
 * {
 *   contact: string,             // normalized phone (+447...) or lowercased email
 *   secret: string,              // OTP (phone) or token (email link)
 *   expiryTime: Date,
 *   validated: boolean,
 *   createdAt: Date,
 *   updatedAt: Date
 * }
 */
class UserContactService {
  /**
   * Creates a new UserContactService instance
   * @param {object} db - MongoDB database instance
   * @param {object} logger - Logger instance
   */
  constructor(db, logger) {
    this.db = db
    this.logger = logger || createLogger()
    this.collection = db.collection('user-contact-details')
  }

  /**
   * Store or update secret for a phone number
   * @param {string} contact - The normalized phone number or lowercased email
   * @param {string} secret - The generated secret
   * @param {Date} expiryTime - When the secret expires
   * @returns {Promise<object>} - Database operation result
   */
  async storeVerificationDetails(contact, secret, expiryTime) {
    const operationId = `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.logger.info('user_contact.store.start', {
      operationId,
      contact: contact ? '***' + contact.slice(-3) : 'undefined',
      expiryTime: expiryTime?.toISOString(),
      secretLength: secret?.length
    })

    try {
      const document = {
        contact,
        secret,
        expiryTime,
        validated: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      this.logger.info('user_contact.store.executing_upsert', {
        operationId,
        contact: '***' + contact.slice(-3)
      })

      // Upsert the document (update if exists, insert if not)
      const result = await this.collection.replaceOne({ contact }, document, {
        upsert: true
      })

      this.logger.info('user_contact.store.success', {
        operationId,
        contact: '***' + contact.slice(-3),
        upserted: result.upsertedId !== null,
        modified: result.modifiedCount > 0,
        matchedCount: result.matchedCount
      })

      return {
        success: true,
        upserted: result.upsertedId !== null,
        modified: result.modifiedCount > 0
      }
    } catch (error) {
      this.logger.error('user_contact.store.error', {
        operationId,
        contact: '***' + contact.slice(-3),
        error: error.message,
        errorName: error.name,
        stack: error.stack
      })
      throw new Error(`Failed to store secret: ${error.message}`)
    }
  }

  /**
   * Validate secret for a phone number
   * @param {string} contact - The normalized phone number or lowercased email
   * @param {string} secret - The secret to validate
   * @returns {Promise<object>} - Validation result
   */
  async validateSecret(contact, secret) {
    const operationId = `validate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.logger.info('user_contact.validate.start', {
      operationId,
      contact: contact ? '***' + contact.slice(-3) : 'undefined',
      secretLength: secret?.length
    })

    try {
      this.logger.info('user_contact.validate.finding_document', {
        operationId,
        contact: '***' + contact.slice(-3)
      })

      const document = await this.collection.findOne({ contact })

      if (!document) {
        this.logger.warn('user_contact.validate.document_not_found', {
          operationId,
          contact: '***' + contact.slice(-3)
        })
        return {
          valid: false,
          error: 'Contact Detail not found'
        }
      }

      this.logger.info('user_contact.validate.document_found', {
        operationId,
        contact: '***' + contact.slice(-3),
        documentCreatedAt: document.createdAt?.toISOString(),
        documentExpiryTime: document.expiryTime?.toISOString(),
        documentValidated: document.validated
      })

      if (document.secret !== secret) {
        this.logger.warn('user_contact.validate.secret_mismatch', {
          operationId,
          contact: '***' + contact.slice(-3)
        })
        return {
          valid: false,
          error: 'Invalid secret'
        }
      }

      const now = new Date()
      const expiryTime = new Date(document.expiryTime)
      if (now > expiryTime) {
        this.logger.warn('user_contact.validate.secret_expired', {
          operationId,
          contact: '***' + contact.slice(-3),
          currentTime: now.toISOString(),
          expiryTime: expiryTime.toISOString()
        })
        return {
          valid: false,
          error: 'Secret has expired'
        }
      }

      if (document.validated) {
        this.logger.warn('user_contact.validate.secret_already_used', {
          operationId,
          contact: '***' + contact.slice(-3)
        })
        return {
          valid: false,
          error: 'Secret has already been used'
        }
      }

      this.logger.info('user_contact.validate.marking_as_validated', {
        operationId,
        contact: '***' + contact.slice(-3)
      })

      // Mark secret as validated
      const updateResult = await this.collection.updateOne(
        { contact },
        {
          $set: {
            validated: true,
            updatedAt: new Date()
          }
        }
      )

      if (updateResult.modifiedCount === 0) {
        this.logger.error('user_contact.validate.failed_to_mark_validated', {
          operationId,
          contact: '***' + contact.slice(-3),
          matchedCount: updateResult.matchedCount,
          modifiedCount: updateResult.modifiedCount
        })
        throw new Error('Failed to mark secret as validated')
      }

      this.logger.info('user_contact.validate.success', {
        operationId,
        contact: '***' + contact.slice(-3)
      })

      return {
        valid: true,
        error: null
      }
    } catch (error) {
      this.logger.error('user_contact.validate.error', {
        operationId,
        contact: '***' + contact.slice(-3),
        error: error.message,
        errorName: error.name,
        stack: error.stack
      })
      throw new Error(`Failed to validate secret: ${error.message}`)
    }
  }

  /**
   * Get user contact details by phone number
   * @param {string} contact - The normalized phone number or lowercased email
   * @returns {Promise<object|null>} - User contact details or null if not found
   */
  async getUserByContact(contact) {
    const operationId = `get_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.logger.info('user_contact.get.start', {
      operationId,
      contact: contact ? '***' + contact.slice(-3) : 'undefined'
    })

    try {
      const result = await this.collection.findOne({ contact })

      this.logger.info('user_contact.get.completed', {
        operationId,
        contact: '***' + contact.slice(-3),
        found: !!result,
        documentCreatedAt: result?.createdAt?.toISOString(),
        documentValidated: result?.validated
      })

      return result
    } catch (error) {
      this.logger.error('user_contact.get.error', {
        operationId,
        contact: '***' + contact.slice(-3),
        error: error.message,
        errorName: error.name,
        stack: error.stack
      })
      throw new Error(`Failed to get user: ${error.message}`)
    }
  }

  /**
   * Delete expired secrets (cleanup job)
   * @returns {Promise<number>} - Number of deleted documents
   */
  async cleanupExpiredsecrets() {
    try {
      /**
       * TODO: Add cleanup job to your server startup:
       * In server.js or index.js
       * setInterval(async () => {
          const userContactService = createUserContactService(db)
          await userContactService.cleanupExpiredsecrets()
          }, 24 * 60 * 60 * 1000) // Daily cleanup
       */
      /**
       * const result = await this.collection.deleteMany({
       *   expiryTime: { $lt: new Date() },
       *   validated: false  // ← Only deletes expired AND unvalidated
       * })
       */
      /**
       * Alternative: Delete all expired OR validated secrets
       * const result = await this.collection.deleteMany({
       *   $or: [
       *     { expiryTime: { $lt: new Date() } }, // All expired
       *     { validated: true } // All validated (regardless of expiry)
       *   ]
       * })
       */
      const result = await this.collection.deleteMany({
        expiryTime: { $lt: new Date() },
        validated: false
      })

      this.logger.info(`Cleaned up ${result.deletedCount} expired secrets`)
      return result.deletedCount
    } catch (error) {
      this.logger.error('Failed to cleanup expired secrets', {
        error: error.message
      })
      throw new Error(`Failed to cleanup expired secrets: ${error.message}`)
    }
  }
}

/**
 * Factory function to create UserContactService instance
 * @param {object} db - MongoDB database instance
 * @param {object} logger - Logger instance
 * @returns {UserContactService} - UserContactService instance
 */
function createUserContactService(db, logger) {
  return new UserContactService(db, logger)
}

export { UserContactService, createUserContactService }
