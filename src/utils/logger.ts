import winston from 'winston';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'grey',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(logColors);

// Define format for console logs
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info: any) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define format for file logs
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
];

// File transports (only in production or when LOG_TO_FILE is true)
if ((process.env.NODE_ENV === 'production' || process.env.LOG_TO_FILE === 'true') && process.env.VERCEL !== 'true') {
  try {
    // Error log file
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );

    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  } catch (error) {
    console.warn('File logging disabled:', error);
  }
}

// Create the logger instance
export const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Create logs directory if it doesn't exist (only if not on Vercel)
import fs from 'fs';
import path from 'path';

if (process.env.VERCEL !== 'true') {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch (error) {
    console.warn('Could not create logs directory:', error);
  }
}

// Utility methods for specific use cases
export class BotLogger {
  private botName: string;

  constructor(botName: string) {
    this.botName = botName;
  }

  error(message: string, error?: any): void {
    logger.error(`[${this.botName}] ${message}`, error);
  }

  warn(message: string): void {
    logger.warn(`[${this.botName}] ${message}`);
  }

  info(message: string): void {
    logger.info(`[${this.botName}] ${message}`);
  }

  debug(message: string): void {
    logger.debug(`[${this.botName}] ${message}`);
  }

  trade(bot: string, pair: string, side: string, size: number, price: number, pnl?: number): void {
    const pnlStr = pnl !== undefined ? ` | PnL: $${pnl}` : '';
    logger.info(`[TRADE] ${bot}: ${side.toUpperCase()} ${size} ${pair} @ $${price}${pnlStr}`);
  }

  cycle(bot: string, cycle: number, target: number, current: number): void {
    const progress = ((current / target) * 100).toFixed(2);
    logger.info(`[CYCLE] ${bot}: Cycle ${cycle} - Target: $${target} | Current: $${current} (${progress}%)`);
  }

  sentiment(mcs: number, fgi: number): void {
    logger.info(`[SENTIMENT] MCS: ${mcs} | FGI: ${fgi}`);
  }
}

// Create specific loggers for different components
export const botALogger = new BotLogger('BotA');
export const botBLogger = new BotLogger('BotB');
export const sentimentLogger = new BotLogger('Sentiment');
export const krakenLogger = new BotLogger('Kraken');

// Performance logging
export const performanceLogger = new BotLogger('Performance');

// Error logging with stack trace
export const logError = (component: string, error: Error, context?: any): void => {
  logger.error(`[${component}] Error: ${error.message}`, {
    stack: error.stack,
    context,
  });
};

// API call logging
export const logApiCall = (service: string, endpoint: string, duration: number, success: boolean): void => {
  const level = success ? 'debug' : 'warn';
  logger.log(level, `[API] ${service}: ${endpoint} - ${duration}ms - ${success ? 'SUCCESS' : 'FAILED'}`);
};

// Create a stream for Morgan (HTTP request logging)
export const httpLogStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

export default logger;