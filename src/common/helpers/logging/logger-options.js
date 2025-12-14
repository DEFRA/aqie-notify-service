import { ecsFormat } from '@elastic/ecs-pino-format'
import { config } from '../../../config.js'
import { getTraceId } from '@defra/hapi-tracing'

const logConfig = config.get('log') || {
  isEnabled: false,
  level: 'info',
  format: 'pino-pretty',
  redact: []
}
const serviceName = config.get('serviceName') || 'aqie-notify-service'
const serviceVersion = config.get('serviceVersion') || '0.0.0'

const formatters = {
  ecs: {
    ...ecsFormat({
      serviceVersion,
      serviceName
    })
  },
  'pino-pretty': {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        includeLevel: true,
        levelFirst: false,
        messageFormat: '{msg} {if req.method}| {req.method} {req.url}{end}',
        errorLikeObjectKeys: ['err', 'error'],
        singleLine: false
      }
    }
  }
}

export const loggerOptions = {
  enabled: logConfig?.isEnabled ?? false,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  ...formatters[logConfig.format],
  nesting: true,
  mixin() {
    const mixinValues = {}
    const traceId = getTraceId()
    if (traceId) {
      mixinValues.trace = { id: traceId }
    }
    return mixinValues
  }
}
