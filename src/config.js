import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

import { convictValidateMongoUri } from './common/helpers/convict/validate-mongo-uri.js'

convict.addFormat(convictValidateMongoUri)
convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3000,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'aqie-notify-service'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  mongo: {
    mongoUrl: {
      doc: 'URI for mongodb',
      format: String,
      default: 'mongodb://127.0.0.1:27017/',
      env: 'MONGO_URI'
    },
    databaseName: {
      doc: 'database for mongodb',
      format: String,
      default: 'aqie-notify-service',
      env: 'MONGO_DATABASE'
    },
    mongoOptions: {
      retryWrites: {
        doc: 'enable mongo write retries',
        format: Boolean,
        default: false
      },
      readPreference: {
        doc: 'mongo read preference',
        format: [
          'primary',
          'primaryPreferred',
          'secondary',
          'secondaryPreferred',
          'nearest'
        ],
        default: 'secondary'
      }
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  notify: {
    apiKey: {
      doc: 'GOV.UK Notify API Key',
      format: String,
      default:
        'team-7536f7da-f08e-46ed-8693-dada56a5eb7b-0aad529b-f8ac-4395-886f-c283cb2b3ab2',
      env: 'NOTIFY_API_KEY'
    },
    templateId: {
      doc: 'GOV.UK Notify SMS Template ID for OTP',
      format: String,
      default: '33420172-8b38-4fc8-8bc0-0390a4099e24',
      env: 'NOTIFY_SMS_VERIFY_OTP_TEMPLATE_ID'
    },
    otpPersonalisationKey: {
      doc: 'Personalisation field name in the Notify template for the OTP code',
      format: String,
      default: 'code',
      env: 'NOTIFY_OTP_PERSONALISATION_KEY'
    },
    emailTemplateId: {
      doc: 'GOV.UK Notify Email Template ID for verification link',
      format: String,
      default: '315e1284-ff70-4ee5-b9fb-9c36596da4a3',
      env: 'NOTIFY_EMAIL_VERIFY_LINK_TEMPLATE_ID'
    },
    timeoutMs: {
      doc: 'Timeout (ms) for sending Notify SMS before failing',
      format: 'nat',
      default: 15000,
      env: 'NOTIFY_TIMEOUT_MS'
    }
  }
})

config.validate({ allowed: 'strict' })

export { config }
