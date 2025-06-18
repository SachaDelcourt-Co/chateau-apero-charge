import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface UseNfcOptions {
  onScan?: (id: string) => void;
  validateId?: (id: string) => boolean;
  getTotalAmount?: () => number; // Added this option to pass a function that returns the current total
  getCurrentOrderData?: () => {
    items: any[];
    total: number;
    isEmpty: boolean;
  };
}

export function useNfc({ onScan, validateId, getTotalAmount, getCurrentOrderData }: UseNfcOptions = {}) {
  const [isScanning, setIsScanning] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const nfcAbortController = useRef<AbortController | null>(null);
  const nfcReaderRef = useRef<any>(null); // Store reference to the NDEFReader
  
  // RACE CONDITION FIX: Add state flags to prevent overlapping NFC operations
  // These prevent multiple concurrent start/stop operations that could corrupt scanner state
  const isRestartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  
  // Check if NFC is supported
  useEffect(() => {
    // Add more detailed logging for debugging
    const hasNDEFReader = 'NDEFReader' in window;
    logger.nfc('NDEFReader in window:', hasNDEFReader);
    logger.nfc('Window object:', Object.keys(window).filter(k => k.includes('NFC') || k.includes('NDEF')));
    logger.nfc('Current environment:', {
      isSecureContext: window.isSecureContext,
      userAgent: navigator.userAgent,
      platform: navigator.platform
    });
    
    setIsSupported(hasNDEFReader);
    
    // If not supported, provide some context why
    if (!hasNDEFReader) {
      logger.warn('Web NFC API is not supported in this browser. Chrome for Android (version 89+) over HTTPS is required.');
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanInternal();
    };
  }, []);

  // Internal function to stop scanning to avoid code duplication
  const stopScanInternal = () => {
    logger.nfc('stopScanInternal called');
    
    // Prevent concurrent stop operations
    if (isStoppingRef.current) {
      logger.nfc('Stop already in progress, skipping');
      return;
    }
    
    isStoppingRef.current = true;
    
    try {
      // Safely abort the controller if it exists
      if (nfcAbortController.current) {
        try {
          nfcAbortController.current.abort();
          logger.nfc('AbortController aborted successfully');
        } catch (error) {
          logger.error('Error aborting NFC controller:', error);
        }
        nfcAbortController.current = null;
      }
      
      // Clear reader reference
      nfcReaderRef.current = null;
      
      // Reset the last scanned ID
      setLastScannedId(null);
      
      // Update state
      setIsScanning(false);
      
      // Reset restart flag in case it was set
      isRestartingRef.current = false;
    } finally {
      isStoppingRef.current = false;
    }
  };

  // Helper function to extract the ID from text content
  const extractIdFromText = (text: string): string | null => {
    // First, try to extract an exact 8-character alphanumeric ID if it exists in the text
    const idMatch = text.match(/[a-zA-Z0-9]{8}/);
    if (idMatch) {
      return idMatch[0];
    }
    
    // If the text itself is exactly 8 characters and alphanumeric, use it
    if (/^[a-zA-Z0-9]{8}$/.test(text)) {
      return text;
    }
    
    // If the text is shorter than 8 characters but alphanumeric, it might be padded
    if (text.length < 8 && /^[a-zA-Z0-9]+$/.test(text)) {
      // Pad with zeros if needed (common for some card formats)
      return text.padStart(8, '0');
    }
    
    return null;
  };
  
  const startScan = useCallback(async () => {
    logger.nfc('startScan called, isSupported:', isSupported);
    
    // Prevent concurrent start operations  
    if (isRestartingRef.current) {
      logger.nfc('Start already in progress, skipping');
      return false;
    }
    
    // Log the current order data if the function is provided
    if (getCurrentOrderData) {
      const orderData = getCurrentOrderData();
      logger.nfc('Current order data:', orderData);
    } else if (getTotalAmount) {
      const currentTotal = getTotalAmount();
      logger.nfc('Current total amount:', currentTotal);
    }
    
    if (!isSupported) {
      logger.warn('Cannot start NFC scan - API not supported');
      toast({
        title: "NFC non supporté",
        description: "Votre navigateur ne supporte pas la lecture NFC. Utilisez Chrome sur Android en HTTPS.",
        variant: "destructive"
      });
      return false;
    }
    
    isRestartingRef.current = true;
    
    try {
      // First, ensure any existing scan is stopped completely
      stopScanInternal();
      
      // Reset the last scanned ID to avoid any state being kept
      setLastScannedId(null);
      
      // Create a fresh AbortController
      nfcAbortController.current = new AbortController();
      const signal = nfcAbortController.current.signal;
      
      logger.nfc('Creating NDEFReader instance');
      // @ts-ignore - TypeScript might not have NDEFReader in its types yet
      const reader = new NDEFReader();
      nfcReaderRef.current = reader;
      
      // Add error listener first before starting the scan
      reader.addEventListener("error", (error: any) => {
        logger.error("NFC reading error:", error);
        stopScanInternal();
      });
      
      // Add reading listener
      reader.addEventListener("reading", ({ message, serialNumber }: any) => {
        try {
          logger.nfc('Reading event triggered', { serialNumber });
          
          // First priority: Try to read from NDEF message records
          if (message && message.records) {
            logger.nfc("Message records:", message.records);
            
            for (const record of message.records) {
              let extractedId = null;
              
              // Try to decode the record based on its type
              if (record.recordType === "text") {
                const textDecoder = new TextDecoder(record.encoding || 'utf-8');
                let text = textDecoder.decode(record.data);
                
                // Some text records have language codes or other metadata at the beginning
                // Remove the first character if it's not alphanumeric
                if (text.length > 0 && !/[a-zA-Z0-9]/.test(text[0])) {
                  text = text.substring(1);
                }
                
                logger.nfc("Decoded text from NFC:", text);
                extractedId = extractIdFromText(text);
              } 
              else if (record.recordType === "url") {
                const textDecoder = new TextDecoder();
                const url = textDecoder.decode(record.data);
                logger.nfc("Decoded URL from NFC:", url);
                
                // Try to extract ID from URL (it might be in the path or as a parameter)
                const urlMatch = url.match(/[a-zA-Z0-9]{8}/);
                if (urlMatch) {
                  extractedId = urlMatch[0];
                }
              }
              else if (record.recordType === "unknown" || record.recordType === "") {
                // For unknown types, try to decode as plain text
                const textDecoder = new TextDecoder();
                const data = textDecoder.decode(record.data);
                logger.nfc("Decoded unknown data from NFC:", data);
                extractedId = extractIdFromText(data);
              }
              
              // If we found a valid ID, use it
              if (extractedId && (!validateId || validateId(extractedId))) {
                logger.nfc("Valid ID extracted from NFC payload:", extractedId);
                setLastScannedId(extractedId);
                
                // Call onScan with the extracted ID if provided
                if (onScan) {
                  // Use getCurrentOrderData if available for current order context
                  if (getCurrentOrderData) {
                    const orderData = getCurrentOrderData();
                    logger.payment('nfc_scan_payment_attempt', {
                      cardId: extractedId,
                      total: orderData.total,
                      itemCount: orderData.items.length
                    });
                  } else if (getTotalAmount) {
                    // Fallback to getTotalAmount for backwards compatibility
                    logger.payment('nfc_scan_payment_attempt', {
                      cardId: extractedId,
                      total: getTotalAmount() || 'unknown'
                    });
                  } else {
                    // Likely a recharge context if no total amount function is provided
                    logger.recharge('recharge_scan_attempt', {
                      cardId: extractedId,
                      timestamp: new Date().toISOString()
                    });
                  }
                  
                  onScan(extractedId);
                }
                
                // RACE CONDITION FIX: Don't restart automatically - let the parent component manage scanning state
                // This eliminates the dangerous timeout-based restart logic that could create overlapping NFC readers
                return;
              }
            }
          }
          
          // Second priority: Try with serialNumber as fallback
          if (serialNumber) {
            logger.nfc("NFC serial number:", serialNumber);
            // Try to extract ID from serial number
            const id = serialNumber.substring(0, 8);
            if (!validateId || validateId(id)) {
              logger.nfc("Using serial number as ID:", id);
              setLastScannedId(id);
              
              // Call onScan with the ID if provided
              if (onScan) {
                // Use getCurrentOrderData if available for current order context
                if (getCurrentOrderData) {
                  const orderData = getCurrentOrderData();
                  logger.payment('nfc_serial_payment_attempt', {
                    cardId: id,
                    total: orderData.total,
                    itemCount: orderData.items.length
                  });
                } else if (getTotalAmount) {
                  // Fallback to getTotalAmount for backwards compatibility
                  logger.payment('nfc_serial_payment_attempt', {
                    cardId: id,
                    total: getTotalAmount() || 'unknown'
                  });
                } else {
                  // Likely a recharge context
                  logger.recharge('recharge_scan_attempt', {
                    cardId: id,
                    timestamp: new Date().toISOString()
                  });
                }
                
                onScan(id);
              }
              
              // RACE CONDITION FIX: Don't restart automatically - let the parent component manage scanning state
              // This eliminates the dangerous timeout-based restart logic that could create overlapping NFC readers
              return;
            }
          }
          
          // If we made it here, we couldn't find a valid ID
          logger.warn("No valid ID found in NFC tag");
          throw new Error("Format de carte non valide");
        } catch (error) {
          logger.error("Error reading NFC card:", error);
          toast({
            title: "Erreur de lecture",
            description: "La carte n'est pas au format attendu",
            variant: "destructive"
          });
        }
      });
      
      logger.nfc('Calling reader.scan() with signal');
      // Now start the scan after setting up listeners
      await reader.scan({ signal });
      setIsScanning(true);
      
      logger.nfc('NFC scan started successfully');
      
      return true;
    } catch (error) {
      logger.error("Error starting NFC scan:", error);
      stopScanInternal();
      
      // Provide user feedback
      if ((error as Error)?.message?.includes("aborted")) {
        logger.nfc("Scan was aborted by user or system");
      } else {
        logger.error("NFC error:", (error as Error)?.message);
      }
      
      return false;
    } finally {
      isRestartingRef.current = false;
    }
  }, [isSupported, onScan, validateId, getTotalAmount, getCurrentOrderData]);
  
  const stopScan = useCallback(() => {
    logger.nfc('stopScan called by user');
    stopScanInternal();
    return true;
  }, []);
  
  return {
    isScanning,
    isSupported,
    lastScannedId,
    startScan,
    stopScan
  };
}
