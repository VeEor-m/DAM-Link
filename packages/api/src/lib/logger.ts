import pino, { type LoggerOptions } from 'pino';
import { loadConfig } from '../config.js';

const config = loadConfig();

const options: LoggerOptions = {
  level: config.LOG_LEVEL,
  base: { service: 'dam-link-api' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.token',
      '*.sessionToken',
    ],
    censor: '[REDACTED]',
  },
};

export const logger =
  config.NODE_ENV === 'development'
    ? pino(options, pino.transport({ target: 'pino-pretty', options: { colorize: true } }))
    : pino(options);
