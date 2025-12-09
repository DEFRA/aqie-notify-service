import { beforeAll, afterAll, describe, test, expect, vi } from 'vitest'
import hapi from '@hapi/hapi'

// Comprehensive MongoDB mock with all required collection methods for LockManager
vi.mock('mongodb', () => ({
  MongoClient: {
    connect: vi.fn().mockResolvedValue({
      db: vi.fn().mockReturnValue({
        databaseName: 'aqie-notify-test',
        namespace: 'aqie-notify-test',
        collection: vi.fn().mockReturnValue({
          findOne: vi.fn(),
          insertOne: vi.fn(),
          updateOne: vi.fn(),
          deleteMany: vi.fn(),
          createIndex: vi.fn().mockResolvedValue('index_created'), // Critical for LockManager
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([])
          }),
          countDocuments: vi.fn().mockResolvedValue(0),
          deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
          insertMany: vi.fn().mockResolvedValue({ insertedCount: 0 }),
          updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 })
        })
      }),
      topology: {
        isConnected: vi.fn().mockReturnValue(true)
      },
      close: vi.fn().mockResolvedValue(undefined)
    })
  }
}))

describe('#startServer', () => {
  let createServerSpy
  let hapiServerSpy
  let startServerImport
  let createServerImport

  beforeAll(async () => {
    vi.stubEnv('PORT', '3098')
    createServerImport = await import('../../server.js')
    startServerImport = await import('./start-server.js')

    createServerSpy = vi.spyOn(createServerImport, 'createServer')
    hapiServerSpy = vi.spyOn(hapi, 'server')
  }, 60000)

  afterAll(() => {
    vi.resetAllMocks()
  })

  describe('When server starts', () => {
    test('Should start up server as expected', async () => {
      await startServerImport.startServer()

      expect(createServerSpy).toHaveBeenCalled()
      expect(hapiServerSpy).toHaveBeenCalled()
    }, 45000)
  })

  describe('When server start fails', () => {
    test('Should log failed startup message', async () => {
      createServerSpy.mockRejectedValue(new Error('Server failed to start'))

      await expect(startServerImport.startServer()).rejects.toThrow(
        'Server failed to start'
      )
    }, 30000)
  })
})
