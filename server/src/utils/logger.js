/**
 * Winston logger — structured, levelled, colourised in dev.
 */

const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const msg = stack || message;
      return `${timestamp} [${level.toUpperCase().padEnd(5)}] ${msg}`;
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
    new transports.File({
      filename: 'logs/tuxpanel.log',
      maxsize: 5_242_880,    // 5 MB
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
