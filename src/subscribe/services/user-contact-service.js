import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

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
   */
  constructor(db) {
    this.db = db
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
    try {
      const document = {
        contact,
        secret,
        expiryTime,
        validated: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // Upsert the document (update if exists, insert if not)
      const result = await this.collection.replaceOne({ contact }, document, {
        upsert: true
      })

      logger.info(`secret stored for phone number ${contact}`, {
        upserted: result.upsertedId !== null,
        modified: result.modifiedCount > 0
      })

      return {
        success: true,
        upserted: result.upsertedId !== null,
        modified: result.modifiedCount > 0
      }
    } catch (error) {
      logger.error(`Failed to store secret for ${contact}`, {
        error: error.message
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
    try {
      const document = await this.collection.findOne({ contact })

      if (!document) {
        return {
          valid: false,
          error: 'Contact Detail not found'
        }
      }

      if (document.secret !== secret) {
        return {
          valid: false,
          error: 'Invalid secret'
        }
      }

      if (new Date() > new Date(document.expiryTime)) {
        return {
          valid: false,
          error: 'Secret has expired'
        }
      }

      if (document.validated) {
        return {
          valid: false,
          error: 'Secret has already been used'
        }
      }

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
        throw new Error('Failed to mark secret as validated')
      }

      logger.info(`Secret validated successfully for ${contact}`)

      return {
        valid: true,
        error: null
      }
    } catch (error) {
      logger.error(`Failed to validate secret for ${contact}`, {
        error: error.message
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
    try {
      logger.info(`Retrieving user by contact ${contact}`)
      const result = await this.collection.findOne({ contact })
      logger.info(`User lookup completed for ${contact}`, { found: !!result })
      return result
    } catch (error) {
      logger.error(`Failed to get user by contact ${contact}`, {
        error: error.message
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

      logger.info(`Cleaned up ${result.deletedCount} expired secrets`)
      return result.deletedCount
    } catch (error) {
      logger.error('Failed to cleanup expired secrets', {
        error: error.message
      })
      throw new Error(`Failed to cleanup expired secrets: ${error.message}`)
    }
  }
}

/**
 * Factory function to create UserContactService instance
 * @param {object} db - MongoDB database instance
 * @returns {UserContactService} - UserContactService instance
 */
function createUserContactService(db) {
  return new UserContactService(db)
}

export { UserContactService, createUserContactService }
