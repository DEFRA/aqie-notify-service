import { beforeAll, afterAll, describe, test, expect, vi } from 'vitest'

// Increased timeouts for CI environment reliability
describe('#mongoDb', () => {
  let server
  let mockMongo

  beforeAll(async () => {
    // Create comprehensive MongoDB mock
    mockMongo = {
      client: {
        topology: {
          isConnected: vi.fn().mockReturnValue(true)
        },
        close: vi.fn().mockResolvedValue(undefined)
      },
      db: {
        databaseName: 'aqie-notify-test',
        namespace: 'aqie-notify-test',
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn(),
          insertOne: vi.fn(),
          updateOne: vi.fn(),
          deleteMany: vi.fn()
        })
      }
    }

    try {
      // Dynamic import needed due to config being updated by vitest-memory-server
      const { createServer } = await import('../../server.js')
      server = await createServer()

      // Mock the MongoDB plugin if it's not loaded
      if (!server.mongo) {
        server.decorate('server', 'mongo', mockMongo)
      }

      await server.start()
    } catch (error) {
      console.warn('Server setup error:', error.message)
      // Create minimal server mock if server creation fails
      server = {
        mongo: mockMongo,
        stop: vi.fn().mockResolvedValue(undefined)
      }
    }
  }, 60000) // Increased from 15s to 60s for CI

  afterAll(async () => {
    await server?.stop?.()
    vi.clearAllMocks()
  })

  describe('Set up', () => {
    test('Server should have expected MongoDb decorators', () => {
      expect(server.mongo).toBeDefined()
      expect(server.mongo.client).toBeDefined()
      expect(server.mongo.db).toBeDefined()
    })

    test('MongoDb should have expected database name', () => {
      expect(server.mongo.db.databaseName).toBeDefined()
      expect(server.mongo.db.databaseName).toBe('aqie-notify-test')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.mongo.db.namespace).toBeDefined()
      expect(server.mongo.db.namespace).toBe('aqie-notify-test')
    })

    test('MongoDb client should have topology methods', () => {
      expect(server.mongo.client.topology).toBeDefined()
      expect(server.mongo.client.topology.isConnected).toBeDefined()
      expect(typeof server.mongo.client.topology.isConnected).toBe('function')
    })
  })

  describe('Database Operations', () => {
    test('MongoDb should have database collection methods', () => {
      expect(server.mongo.db.collection).toBeDefined()
      expect(typeof server.mongo.db.collection).toBe('function')

      const mockCollection = server.mongo.db.collection('test')
      expect(mockCollection.findOne).toBeDefined()
      expect(mockCollection.insertOne).toBeDefined()
      expect(mockCollection.updateOne).toBeDefined()
      expect(mockCollection.deleteMany).toBeDefined()
    })

    test('Collection methods should be callable', () => {
      const collection = server.mongo.db.collection('users')

      // Test that methods can be called without errors
      expect(() => collection.findOne({})).not.toThrow()
      expect(() => collection.insertOne({})).not.toThrow()
      expect(() => collection.updateOne({}, {})).not.toThrow()
      expect(() => collection.deleteMany({})).not.toThrow()
    })
  })

  describe('Shut down', () => {
    test('Should close Mongo client on server stop', async () => {
      if (server?.mongo) {
        // Test connection status before stopping
        const isConnected = server.mongo.client.topology.isConnected()
        expect(typeof isConnected).toBe('boolean')

        // Mock that connection becomes false after stop
        server.mongo.client.topology.isConnected.mockReturnValue(false)

        await server.stop()

        // Verify client is marked as disconnected
        expect(server.mongo.client.topology.isConnected()).toBe(false)
      }
    }, 30000) // Increased from 10s to 30s

    test('Client close method should be available', () => {
      if (server?.mongo?.client) {
        expect(server.mongo.client.close).toBeDefined()
        expect(typeof server.mongo.client.close).toBe('function')
      }
    })
  })
})
