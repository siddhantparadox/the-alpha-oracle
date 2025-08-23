/**
 * Centralized Logger Utility for The Alpha Oracle
 * Provides comprehensive logging for all backend operations
 */

import fs from 'fs';
import path from 'path';

type LogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | 'API' | 'DATA';

interface LogContext {
  service?: string;
  method?: string;
  timestamp?: string;
  duration?: number;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

class Logger {
  private colors = {
    INFO: '\x1b[36m',    // Cyan
    DEBUG: '\x1b[35m',   // Magenta
    WARN: '\x1b[33m',    // Yellow
    ERROR: '\x1b[31m',   // Red
    API: '\x1b[32m',     // Green
    DATA: '\x1b[34m',    // Blue
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m',
  };

  private logStream: fs.WriteStream | null = null;
  private logFilePath: string;
  private isClient: boolean;

  constructor() {
    // Check if we're in a Node.js environment
    this.isClient = typeof window !== 'undefined';
    
    if (!this.isClient) {
      // Only set up file logging on the server
      const logsDir = path.join(process.cwd(), 'logs');
      
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      this.logFilePath = path.join(logsDir, `alpha-oracle-${timestamp}.log`);
      
      // Create write stream for log file
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
      
      console.log(`[LOGGER] Log file created at: ${this.logFilePath}`);
    } else {
      this.logFilePath = '';
    }
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  private formatData(data: unknown): string {
    try {
      if (data === null || data === undefined) return 'null';
      if (typeof data === 'string') return data;
      if (data instanceof Error) {
        return `Error: ${data.message}\nStack: ${data.stack}`;
      }
      // For sensitive data, mask it
      const sanitized = this.sanitizeData(data);
      return JSON.stringify(sanitized, null, 2);
    } catch (error) {
      return `[Unable to stringify data: ${error}]`;
    }
  }

  private sanitizeData(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;
    
    const cloned = Array.isArray(data) ? [...data] : { ...data as Record<string, unknown> };
    const sensitiveKeys = ['apikey', 'api_key', 'key', 'token', 'password', 'secret', 'authorization'];
    
    if (Array.isArray(cloned)) {
      return cloned.map(item => this.sanitizeData(item));
    }
    
    const obj = cloned as Record<string, unknown>;
    for (const key in obj) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        obj[key] = this.sanitizeData(obj[key]);
      }
    }
    
    return obj;
  }

  private writeToFile(message: string, context?: unknown) {
    if (this.logStream && !this.isClient && this.logStream.writable) {
       const timestamp = this.getTimestamp();
       let logEntry = `[${timestamp}] ${message}`;
       
       if (context) {
         const sanitized = this.sanitizeData(context);
         logEntry += ` | Context: ${JSON.stringify(sanitized)}`;
       }
       
      this.logStream.write(logEntry + '\n', (error) => {
        if (error) {
          console.error(`[LOGGER] Failed to write to log file: ${error}`);
        }
      });
     }
  }
  private log(level: LogLevel, message: string, context?: LogContext | unknown) {
    const timestamp = this.getTimestamp();
    const color = this.colors[level];
    const reset = this.colors.RESET;
    const bold = this.colors.BOLD;
    const dim = this.colors.DIM;

    // Format the main log line
    let logLine = `${color}[${level}]${reset} ${dim}${timestamp}${reset}`;
    
    const ctx = context as LogContext | undefined;
    
    if (ctx?.service) {
      logLine += ` ${bold}[${ctx.service}]${reset}`;
    }
    
    if (ctx?.method) {
      logLine += ` ${dim}${ctx.method}${reset}`;
    }
    
    logLine += ` - ${message}`;
    
    if (ctx?.duration !== undefined) {
      logLine += ` ${dim}(${this.formatDuration(ctx.duration)})${reset}`;
    }

    // Write to console
    console.log(logLine);

    // Write to file (without color codes)
    const plainLogLine = `[${level}] ${timestamp}${ctx?.service ? ` [${ctx.service}]` : ''}${ctx?.method ? ` ${ctx.method}` : ''} - ${message}${ctx?.duration !== undefined ? ` (${this.formatDuration(ctx.duration)})` : ''}`;
    this.writeToFile(plainLogLine, context);

    // Log additional context if provided
    if (context) {
      const contextObj = typeof context === 'object' && context !== null && !Array.isArray(context)
        ? context as Record<string, unknown>
        : { data: context };
      
      const { service, method, timestamp: ts, duration, ...additionalContext } = contextObj;
      
      if (Object.keys(additionalContext).length > 0) {
        const formattedContext = this.formatData(additionalContext);
        console.log(`${dim}Context:${reset}`, formattedContext);
      }
    }

    // Add separator for better readability
    if (level === 'ERROR' || level === 'API') {
      console.log(`${dim}${'─'.repeat(80)}${reset}`);
    }
  }

  // Main logging methods
  info(message: string, context?: LogContext | unknown) {
    this.log('INFO', message, context);
  }

  debug(message: string, context?: LogContext | unknown) {
    this.log('DEBUG', message, context);
  }

  warn(message: string, context?: LogContext | unknown) {
    this.log('WARN', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
    };
    this.log('ERROR', message, errorContext);
  }

  // API-specific logging
  api(message: string, context?: LogContext | unknown) {
    this.log('API', message, context);
  }

  apiRequest(service: string, method: string, endpoint: string, params?: unknown) {
    this.api(`→ ${method} ${endpoint}`, {
      service,
      method,
      endpoint,
      params: params || {},
      type: 'REQUEST',
    });
  }

  apiResponse(service: string, method: string, endpoint: string, status: number, data?: unknown, duration?: number) {
    const statusEmoji = status >= 200 && status < 300 ? '✓' : '✗';
    this.api(`← ${statusEmoji} ${method} ${endpoint} (${status})`, {
      service,
      method,
      endpoint,
      status,
      type: 'RESPONSE',
      duration,
      dataSize: data ? JSON.stringify(data).length : 0,
      preview: this.getDataPreview(data),
    });
  }

  // Data logging
  data(message: string, data: unknown, context?: LogContext) {
    this.log('DATA', message, { ...context, data });
  }

  // Helper methods
  private getDataPreview(data: unknown, maxLength = 200): string {
    if (!data) return 'null';
    
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    if (str.length <= maxLength) return str;
    
    return str.substring(0, maxLength) + '... [truncated]';
  }

  // Specialized loggers for different services
  openRouter(action: string, details: unknown) {
    this.api(`OpenRouter: ${action}`, {
      service: 'OpenRouter',
      ...(typeof details === 'object' && details !== null ? details : { details }),
    });
  }

  braveSearch(action: string, details: unknown) {
    this.api(`Brave Search: ${action}`, {
      service: 'BraveSearch',
      ...(typeof details === 'object' && details !== null ? details : { details }),
    });
  }

  fmp(action: string, details: unknown) {
    this.api(`FMP: ${action}`, {
      service: 'FMP',
      ...(typeof details === 'object' && details !== null ? details : { details }),
    });
  }

  agent(agentName: string, action: string, details: unknown) {
    this.info(`${agentName}: ${action}`, {
      service: `Agent:${agentName}`,
      ...(typeof details === 'object' && details !== null ? details : { details }),
    });
  }

  // SSE Event logging
  sse(event: string, data: unknown, context?: LogContext) {
    this.debug(`SSE Event: ${event}`, {
      ...context,
      event,
      data: this.getDataPreview(data, 100),
    });
  }

  // Performance tracking
  startTimer(label: string): () => number {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`Timer: ${label}`, { duration });
      return duration;
    };
  }

  // Group logging for related operations
  group(label: string) {
    const groupLine = `\n${this.colors.BOLD}═══ ${label} ═══${this.colors.RESET}`;
    console.group(groupLine);
    this.writeToFile(`═══ ${label} ═══`);
  }

  groupEnd() {
    console.groupEnd();
    const separator = `${this.colors.DIM}${'─'.repeat(80)}${this.colors.RESET}\n`;
    console.log(separator);
    this.writeToFile('─'.repeat(80));
  }

  // Get the current log file path
  getLogFilePath(): string {
    return this.logFilePath;
  }

  // Close the log stream
  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Ensure cleanup on process exit
if (typeof process !== 'undefined' && process.on) {
  process.on('exit', () => {
    logger.close();
  });
  
  process.on('SIGINT', () => {
    logger.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    logger.close();
    process.exit(0);
  });
}
// Export both default and named for flexibility
export default logger;
export { logger };
export type { LogLevel, LogContext };

// Convenience exports for quick logging
export const logInfo = logger.info.bind(logger);
export const logDebug = logger.debug.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logError = logger.error.bind(logger);
export const logApi = logger.api.bind(logger);
export const logData = logger.data.bind(logger);