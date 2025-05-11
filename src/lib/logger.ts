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

// Create a centralized logger with the ability to log to both console and Sentry
export const logger = {
  // Regular logging methods that go to console and in production to Sentry
  debug: (message: string, ...args: any[]) => {
    log.debug(message, ...args);
  },
  
  info: (message: string, ...args: any[]) => {
    log.info(message, ...args);
    
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
    } else {
      log.error(message, ...args);
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
  
  // Helper function to get all locally stored logs for troubleshooting
  getLogs: (type: 'nfc' | 'payment' | 'all' = 'all') => {
    try {
      if (type === 'nfc' || type === 'all') {
        const nfcLogs = JSON.parse(localStorage.getItem('nfc_logs') || '[]');
        if (type === 'nfc') return nfcLogs;
      }
      
      if (type === 'payment' || type === 'all') {
        const paymentLogs = JSON.parse(localStorage.getItem('payment_logs') || '[]');
        if (type === 'payment') return paymentLogs;
      }
      
      if (type === 'all') {
        return {
          nfc: JSON.parse(localStorage.getItem('nfc_logs') || '[]'),
          payment: JSON.parse(localStorage.getItem('payment_logs') || '[]'),
        };
      }
    } catch (error) {
      return { error: 'Failed to retrieve logs' };
    }
    
    return [];
  },
  
  // Helper to clear logs (mainly for development and testing)
  clearLogs: (type: 'nfc' | 'payment' | 'all' = 'all') => {
    try {
      if (type === 'nfc' || type === 'all') {
        localStorage.removeItem('nfc_logs');
      }
      
      if (type === 'payment' || type === 'all') {
        localStorage.removeItem('payment_logs');
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  },
  
  // Configure Sentry user identity for better error tracking
  identifyUser: (id: string, role: string) => {
    Sentry.setUser({
      id: id,
      role: role,
    });
  }
};

// Export Sentry for advanced use cases
export { Sentry }; 