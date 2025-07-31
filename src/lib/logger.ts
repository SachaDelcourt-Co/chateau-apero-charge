import * as Sentry from '@sentry/browser';
import log from 'loglevel';

// Initialize Sentry with a DSN from your Sentry.io account
// For now using a test DSN - replace with your actual DSN
Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0', // Replace with actual DSN
  environment: import.meta.env.MODE, // 'development' or 'production'
  tracesSampleRate: 0.5, // Adjust sample rate as needed
  beforeSend(event) {
    // Don't send events in development mode
    if (import.meta.env.DEV) {
      return null;
    }
    return event;
  },
});

// Set up log levels based on environment
if (import.meta.env.DEV) {
  log.setLevel('debug');
} else {
  log.setLevel('info');
}

// Define payment event types for better type safety
export type PaymentEventType =
  | 'payment_started'
  | 'card_validated'
  | 'insufficient_balance'
  | 'submitting_order'
  | 'payment_success'
  | 'nfc_scan_payment_attempt'
  | 'nfc_serial_payment_attempt'
  | 'cash_transaction_initiated'
  | 'cash_transaction_insufficient_funds'
  | 'cash_transaction_success';

// Define recharge event types
export type RechargeEventType =
  | 'recharge_started'
  | 'recharge_card_validated'
  | 'recharge_scan_attempt'
  | 'recharge_success'
  | 'recharge_error'
  | 'recharge_pending'
  | 'recharge_cancelled'
  | 'recharge_topup_attempt'
  | 'recharge_retry'
  | 'recharge_rate_limited'
  | 'recharge_payment_log_error'
  | 'recharge_update_failed'
  | 'recharge_max_retries_exceeded';

// Remote logging configuration
const REMOTE_LOGGING_ENABLED = true; // Can be toggled in production
const SUPABASE_LOG_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log`;
const LOG_LEVEL_THRESHOLD = 'info'; // Changed from 'debug' to 'info' to reduce log volume
const LOG_BATCH_SIZE = 10; // Number of logs to batch before sending
const LOG_BATCH_INTERVAL = 5000; // Milliseconds between batch sends

// Set of patterns to filter out from logging to reduce noise
const LOG_FILTER_PATTERNS = [
  'Download chunk',
  'chunk loaded',
  'mousemove',
  '[HMR]',
  '[vite]',
  'Download the React DevTools',
  '@material-ui/core/esm',
  'webpack-internal',
  'chunkLoad',
  'Asset',
  'vendor.js',
  'Reassigning hot update',
  'hmr update',
  'socket.io',
  'useLayoutEffect does nothing on the server',
  'Warning: unstable_flushDiscreteUpdates',
  'Warning: Using UNSAFE',
  'react-jsx-dev-runtime',
  'prop-types',
  'warnAboutDeprecatedESMImport',
  'non-boolean',
  'useEffect must not return',
  'onLoad',
  'EventEmitter',
  'react-refresh',
  'react-dom.development'
];

// Additional filter conditions
const shouldIncludeLog = (level: string, message: string, args: any[]): boolean => {
  // Always include error logs
  if (level === 'error') return true;
  
  // Always include logs with these critical keywords
  const criticalKeywords = ['edge function', 'supabase', 'payment', 'transaction', 'nfc', 'card', 'empty body', 'error', 'fetch', 'json'];
  if (criticalKeywords.some(keyword => message.toLowerCase().includes(keyword))) return true;
  
  // Include if it's a payment or NFC related log
  if (message.includes('[PAYMENT]') || message.includes('[NFC]') || message.includes('[RECHARGE]')) return true;
  
  // Check if any of the args contain the string "edge function" or "json"
  const argString = JSON.stringify(args).toLowerCase();
  if (argString.includes('edge function') || argString.includes('json') || 
      argString.includes('payload') || argString.includes('order')) return true;
  
  // For info logs, only include custom application logs, not framework/library logs
  if (level === 'info') {
    // Skip very common React logs
    if (message.startsWith('render') || 
        message.includes('React') || 
        message.includes('component') ||
        message.includes('hook')) return false;
  }
  
  // For info level, randomly sample to reduce volume (only include ~30% of remaining logs)
  if (level === 'info' && Math.random() > 0.3) return false;
  
  return true;
}

// Queue to store logs for batching
let logQueue: any[] = [];
let batchTimeout: number | null = null;

// Get current route from window.location
const getCurrentRoute = () => {
  return window.location.pathname;
};

// Get metadata for logs
const getLogMetadata = () => {
  return {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    route: getCurrentRoute(),
    appVersion: import.meta.env.VITE_APP_VERSION || 'unknown',
    environment: import.meta.env.MODE,
    // User ID could be added here once you have auth context
    // userId: 'placeholder' 
  };
};

// Function to send logs to Supabase Edge Function
const sendLogsToEdgeFunction = async (logs: any[]) => {
  if (!REMOTE_LOGGING_ENABLED || logs.length === 0) return;
  
  try {
    // Quick sanity check to avoid sending sensitive data like auth tokens
    // This is a simple check and should be enhanced based on your needs
    const sanitizedLogs = logs.map(log => {
      const { args, ...rest } = log;
      // Basic sanitization of potential sensitive data in args
      // Creates a deep copy to avoid modifying the original
      let sanitizedArgs = JSON.parse(JSON.stringify(args || {}));
      
      // Keywords to look for in arguments
      const sensitiveKeys = ['token', 'password', 'auth', 'key', 'secret', 'credentials'];
      
      // Function to recursively sanitize objects
      const sanitizeObject = (obj: any) => {
        if (!obj || typeof obj !== 'object') return obj;
        
        Object.keys(obj).forEach(key => {
          // If key contains sensitive information
          if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
            obj[key] = '[REDACTED]';
          } else if (typeof obj[key] === 'object') {
            sanitizeObject(obj[key]);
          }
        });
        
        return obj;
      };
      
      return { ...rest, args: sanitizeObject(sanitizedArgs) };
    });

    await fetch(SUPABASE_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        logs: sanitizedLogs,
        metadata: getLogMetadata(),
        batchId: Date.now().toString()
      }),
      // Use keepalive to ensure the request completes even if page navigates away
      keepalive: true
    });
  } catch (error) {
    // Silently fail to avoid crashing the app
    // Only log to console in development
    if (import.meta.env.DEV) {
      const originalConsoleError = console.error;
      originalConsoleError('Failed to send logs to Edge Function:', error);
    }
  }
};

// Process the log queue and send to Edge Function
const processLogQueue = () => {
  if (logQueue.length === 0) return;
  
  // Take the current queue items and reset the queue
  const logsToSend = [...logQueue];
  logQueue = [];
  
  // Clear timeout
  if (batchTimeout !== null) {
    window.clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  
  // Send logs
  sendLogsToEdgeFunction(logsToSend);
};

// Schedule a batch send
const scheduleBatchSend = () => {
  if (batchTimeout !== null) return;
  
  batchTimeout = window.setTimeout(() => {
    processLogQueue();
    batchTimeout = null;
  }, LOG_BATCH_INTERVAL);
};

// Add a log to the queue
const queueLog = (level: string, message: string, args: any[] = []) => {
  // Skip filtered log patterns to reduce noise
  if (LOG_FILTER_PATTERNS.some(pattern => 
      (typeof message === 'string' && message.includes(pattern)) || 
      (args.some(arg => typeof arg === 'string' && arg.includes(pattern)))
  )) {
    return;
  }

  // Only queue logs above our threshold and that pass the custom filter
  const levels = ['debug', 'info', 'warn', 'error'];
  const thresholdIndex = levels.indexOf(LOG_LEVEL_THRESHOLD);
  const logLevelIndex = levels.indexOf(level);
  
  if (logLevelIndex >= thresholdIndex && shouldIncludeLog(level, message, args)) {
    // Extract file and function name from stack trace if possible
    let fileFunction = 'unknown-unknown';
    try {
      // Create an error to get the stack trace
      const err = new Error();
      // Parse the stack trace to find caller information
      const stackLines = err.stack?.split('\n') || [];
      
      // Look for the actual caller (skipping this function and the logger functions)
      let callerLine = '';
      for (let i = 1; i < stackLines.length; i++) {
        const line = stackLines[i];
        // Skip internal logger methods
        if (line.includes('at queueLog') || 
            line.includes('at Object.debug') || 
            line.includes('at Object.info') || 
            line.includes('at Object.warn') || 
            line.includes('at Object.error') ||
            line.includes('at console.') ||
            line.includes('at logger.')) {
          continue;
        }
        callerLine = line;
        break;
      }
      
      if (callerLine) {
        // Extract file and function name from the stack line
        // Stack line typically looks like: "at FunctionName (path/to/File.tsx:123:45)"
        let funcName = 'unknown';
        let fileName = 'unknown';
        
        // Try to extract function name
        const funcMatch = callerLine.match(/at ([^ ]+)/);
        if (funcMatch && funcMatch[1]) {
          funcName = funcMatch[1].trim();
          // Clean up anonymous functions
          if (funcName === 'Object.<anonymous>') funcName = 'anonymous';
          // Remove Object. prefix
          funcName = funcName.replace('Object.', '');
        }
        
        // Try to extract file name
        const fileMatch = callerLine.match(/\(([^:]+)/);
        if (fileMatch && fileMatch[1]) {
          // Get just the file name without the path
          const fullPath = fileMatch[1].trim();
          const parts = fullPath.split('/');
          fileName = parts[parts.length - 1];
        } else {
          // Alternative format without parentheses
          const altFileMatch = callerLine.match(/at [^(]+ ([^:]+)/);
          if (altFileMatch && altFileMatch[1]) {
            const fullPath = altFileMatch[1].trim();
            const parts = fullPath.split('/');
            fileName = parts[parts.length - 1];
          }
        }
        
        fileFunction = `[${fileName}-${funcName}]`;
      }
    } catch (e) {
      // If anything goes wrong, just use a fallback
      fileFunction = '[unknown-unknown]';
    }
    
    // Add file-function context to the message
    const contextualMessage = `${fileFunction} ${message}`;
    
    logQueue.push({
      level,
      message: contextualMessage,
      originalMessage: message,
      args,
      timestamp: new Date().toISOString(),
      fileFunction
    });
    
    // If we've reached batch size, process immediately
    if (logQueue.length >= LOG_BATCH_SIZE) {
      processLogQueue();
    } else {
      // Otherwise schedule a batch send
      scheduleBatchSend();
    }
  }
};

// Create a centralized logger with the ability to log to both console and Sentry
export const logger = {
  // Regular logging methods that go to console and in production to Sentry
  debug: (message: string, ...args: any[]) => {
    log.debug(message, ...args);
    queueLog('debug', message, args);
  },
  
  info: (message: string, ...args: any[]) => {
    log.info(message, ...args);
    queueLog('info', message, args);
    
    // In production, log important info to Sentry breadcrumbs
    if (import.meta.env.PROD) {
      Sentry.addBreadcrumb({
        category: 'info',
        message: args.length ? `${message} ${JSON.stringify(args)}` : message,
        level: 'info',
      });
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    log.warn(message, ...args);
    queueLog('warn', message, args);
    
    // Log warnings to Sentry breadcrumbs
    Sentry.addBreadcrumb({
      category: 'warning',
      message: args.length ? `${message} ${JSON.stringify(args)}` : message,
      level: 'warning',
    });
  },
  
  error: (message: string | Error, ...args: any[]) => {
    // Log to console
    if (message instanceof Error) {
      log.error(message.message, message.stack, ...args);
      queueLog('error', message.message, [message.stack, ...args]);
    } else {
      log.error(message, ...args);
      queueLog('error', message, args);
    }
    
    // Send to Sentry
    if (message instanceof Error) {
      Sentry.captureException(message, {
        extra: args.length > 0 ? { extraArgs: args } : undefined,
      });
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        extra: args.length > 0 ? { extraArgs: args } : undefined,
      });
    }
  },
  
  // Special NFC logging for the bar components
  nfc: (message: string, ...args: any[]) => {
    log.info(`[NFC] ${message}`, ...args);
    queueLog('info', `[NFC] ${message}`, args);
    
    // In production, log NFC operations to Sentry breadcrumbs
    if (import.meta.env.PROD) {
      Sentry.addBreadcrumb({
        category: 'nfc',
        message: args.length ? `${message} ${JSON.stringify(args)}` : message,
        level: 'info',
      });
    }
    
    // Persist NFC logs to localStorage for debugging in production
    try {
      const nfcLogs = JSON.parse(localStorage.getItem('nfc_logs') || '[]');
      nfcLogs.push({
        timestamp: new Date().toISOString(),
        message: message,
        args: args.length > 0 ? args : undefined,
      });
      
      // Keep only the last 100 logs to avoid storage issues
      if (nfcLogs.length > 100) {
        nfcLogs.shift(); // Remove oldest log
      }
      
      localStorage.setItem('nfc_logs', JSON.stringify(nfcLogs));
    } catch (error) {
      // Ignore localStorage errors
    }
  },
  
  // Payment tracking logs - very important events to track
  payment: (event: PaymentEventType, data: Record<string, any>) => {
    log.info(`[PAYMENT] ${event}`, data);
    queueLog('info', `[PAYMENT] ${event}`, [data]);
    
    // Always log payment events to Sentry breadcrumbs
    Sentry.addBreadcrumb({
      category: 'payment',
      message: `${event} ${JSON.stringify(data)}`,
      level: 'info',
    });
    
    // For critical payment events, capture them as Sentry events
    const criticalEvents: PaymentEventType[] = [
      'payment_success',
      'insufficient_balance',
      'cash_transaction_success',
      'cash_transaction_insufficient_funds'
    ];
    
    if (criticalEvents.includes(event)) {
      Sentry.captureMessage(`Payment Event: ${event}`, {
        level: 'info',
        extra: { paymentData: data }
      });
    }
    
    // Persist payment logs to localStorage with enhanced timestamp
    try {
      const paymentLogs = JSON.parse(localStorage.getItem('payment_logs') || '[]');
      const timestamp = new Date();
      paymentLogs.push({
        timestamp: timestamp.toISOString(),
        formattedTime: timestamp.toLocaleTimeString(),
        event,
        data,
      });
      
      // Keep only the last 50 payment logs
      if (paymentLogs.length > 50) {
        paymentLogs.shift();
      }
      
      localStorage.setItem('payment_logs', JSON.stringify(paymentLogs));
    } catch (error) {
      // Ignore localStorage errors
    }
    
    // Return the event data for chaining if needed
    return { event, data, timestamp: new Date().toISOString() };
  },
  
  // Recharge tracking logs - for card recharge operations
  recharge: (event: RechargeEventType, data: Record<string, any>) => {
    log.info(`[RECHARGE] ${event}`, data);
    queueLog('info', `[RECHARGE] ${event}`, [data]);
    
    // Log recharge events to Sentry breadcrumbs
    Sentry.addBreadcrumb({
      category: 'recharge',
      message: `${event} ${JSON.stringify(data)}`,
      level: 'info',
    });
    
    // Capture important recharge events in Sentry
    const importantEvents: RechargeEventType[] = [
      'recharge_success',
      'recharge_error',
      'recharge_rate_limited',
      'recharge_max_retries_exceeded'
    ];
    
    if (importantEvents.includes(event)) {
      Sentry.captureMessage(`Recharge Event: ${event}`, {
        level: event.includes('error') ? 'error' : 'info',
        extra: { rechargeData: data }
      });
    }
    
    // Add unique transaction ID if missing
    const dataWithId = { ...data };
    if (!dataWithId.transactionId) {
      // Generate simple ID if none was provided
      dataWithId.transactionId = `auto-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    }
    
    // Persist recharge logs to localStorage with enhanced timestamp
    try {
      const rechargeLogs = JSON.parse(localStorage.getItem('recharge_logs') || '[]');
      const timestamp = new Date();
      rechargeLogs.push({
        timestamp: timestamp.toISOString(),
        formattedTime: timestamp.toLocaleTimeString(),
        event,
        data: dataWithId,
      });
      
      // Keep only the last 50 recharge logs
      if (rechargeLogs.length > 50) {
        rechargeLogs.shift();
      }
      
      localStorage.setItem('recharge_logs', JSON.stringify(rechargeLogs));
    } catch (error) {
      // Ignore localStorage errors
      console.error('Failed to save recharge log to localStorage', error);
    }
    
    // Return the event data for chaining if needed
    return { event, data: dataWithId, timestamp: new Date().toISOString() };
  },
  
  // Helper function to get all locally stored logs for troubleshooting
  getAllLogs: () => {
    try {
      return {
        nfc: JSON.parse(localStorage.getItem('nfc_logs') || '[]'),
        payment: JSON.parse(localStorage.getItem('payment_logs') || '[]'),
        recharge: JSON.parse(localStorage.getItem('recharge_logs') || '[]'),
      };
    } catch (error) {
      return { error: 'Failed to retrieve logs', details: String(error) };
    }
  },
  
  // Function to flush all pending logs - useful before page unload
  flushLogs: () => {
    processLogQueue();
  },
  
  // Console.log replacement for components that want to use the enhanced logger
  log: (message: string, ...args: any[]) => {
    log.info(message, ...args);
    queueLog('info', message, args);
  }
};

// Install global error handler to catch unhandled errors
window.addEventListener('error', (event) => {
  logger.error(event.error || new Error(event.message), { 
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

// Install unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  logger.error(event.reason || new Error('Unhandled Promise rejection'), { 
    promise: event.promise
  });
});

// Flush logs when page is being unloaded
window.addEventListener('beforeunload', () => {
  logger.flushLogs();
});

// Set up console interceptors to capture all console logs
if (typeof window !== 'undefined') {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  // Helper to safely stringify the first argument
  const safeToString = (arg: any): string => {
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg instanceof Error) return arg.message || 'Error';
    
    try {
      return String(arg);
    } catch (e) {
      return '[Object]';
    }
  };

  // Override console methods with more efficient implementations
  console.log = function(...args) {
    // Call original method
    originalConsole.log.apply(console, args);
    // Only log if we have actual content
    if (args.length > 0) {
      const firstArg = safeToString(args[0]);
      // Skip empty or very short messages
      if (firstArg && firstArg.length > 1) {
        queueLog('info', firstArg, args.slice(1));
      }
    }
  };

  console.info = function(...args) {
    originalConsole.info.apply(console, args);
    if (args.length > 0) {
      queueLog('info', safeToString(args[0]), args.slice(1));
    }
  };

  console.warn = function(...args) {
    originalConsole.warn.apply(console, args);
    if (args.length > 0) {
      queueLog('warn', safeToString(args[0]), args.slice(1));
    }
  };

  console.error = function(...args) {
    originalConsole.error.apply(console, args);
    if (args.length > 0) {
      queueLog('error', safeToString(args[0]), args.slice(1));
    }
  };

  console.debug = function(...args) {
    originalConsole.debug.apply(console, args);
    if (args.length > 0) {
      queueLog('debug', safeToString(args[0]), args.slice(1));
    }
  };
}

export default logger; 