import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface UseNfcOptions {
  onScan?: (id: string) => void;
  validateId?: (id: string) => boolean;
  getTotalAmount?: () => number; // Added this option to pass a function that returns the current total
}

export function useNfc({ onScan, validateId, getTotalAmount }: UseNfcOptions = {}) {
  const [isScanning, setIsScanning] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const nfcAbortController = useRef<AbortController | null>(null);
  const nfcReaderRef = useRef<any>(null); // Store reference to the NDEFReader
  
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
    
    // Log the current total amount if the function is provided
    if (getTotalAmount) {
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
    
    // First, ensure any existing scan is stopped completely
    stopScanInternal();
    
    // Reset the last scanned ID to avoid any state being kept
    setLastScannedId(null);
    
    try {
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
                
                // Temporarily pause scanning but don't stop completely
                // This prevents multiple rapid reads of the same card
                const currentController = nfcAbortController.current;
                if (currentController) {
                  try {
                    currentController.abort();
                    logger.nfc("NFC scanning temporarily paused after card read");
                  } catch (error) {
                    logger.error('Error pausing NFC scan:', error);
                  }
                }
                
                // Call onScan with the extracted ID if provided
                if (onScan) {
                  // Log the payment attempt
                  logger.payment('nfc_scan_payment_attempt', {
                    cardId: extractedId,
                    total: getTotalAmount ? getTotalAmount() : 'unknown'
                  });
                  
                  onScan(extractedId);
                }
                
                // Restart scan after a short delay to prevent multiple reads
                setTimeout(async () => {
                  try {
                    // Only restart if we're still in scanning mode
                    if (isScanning) {
                      logger.nfc("Restarting scan after card read");
                      
                      // IMPORTANT: Stop completely first to ensure proper cleanup
                      stopScanInternal();
                      
                      // Small delay to ensure everything is cleaned up
                      await new Promise(resolve => setTimeout(resolve, 100));
                      
                      // Now create fresh instances
                      nfcAbortController.current = new AbortController();
                      const signal = nfcAbortController.current.signal;
                      
                      // @ts-ignore - TypeScript might not have NDEFReader in its types yet
                      const newReader = new NDEFReader();
                      nfcReaderRef.current = newReader;
                      
                      // Add minimal error handler
                      newReader.addEventListener("error", (err: any) => {
                        logger.error("NFC reading error in restarted scan:", err);
                        stopScanInternal();
                      });
                      
                      // Start the scan with the fresh reader
                      await newReader.scan({ signal });
                      setIsScanning(true);
                      logger.nfc('NFC scanning successfully restarted');
                    }
                  } catch (error) {
                    logger.error("Error restarting NFC scan:", error);
                    stopScanInternal(); // Ensure we clean up
                  }
                }, 2000); // Wait 2 seconds before restarting scan
                
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
              
              // Temporarily pause scanning but don't stop completely
              // This prevents multiple rapid reads of the same card
              const currentController = nfcAbortController.current;
              if (currentController) {
                try {
                  currentController.abort();
                  logger.nfc("NFC scanning temporarily paused after card read");
                } catch (error) {
                  logger.error('Error pausing NFC scan:', error);
                }
              }
              
              // Log the payment attempt
              if (onScan) {
                logger.payment('nfc_serial_payment_attempt', {
                  cardId: id,
                  total: getTotalAmount ? getTotalAmount() : 'unknown'
                });
              }
              
              // Call onScan with the ID if provided
              if (onScan) {
                onScan(id);
              }
              
              // Restart scan after a short delay to prevent multiple reads
              setTimeout(async () => {
                try {
                  // Only restart if we're still in scanning mode
                  if (isScanning) {
                    logger.nfc("Restarting scan after card read");
                    
                    // IMPORTANT: Stop completely first to ensure proper cleanup
                    stopScanInternal();
                    
                    // Small delay to ensure everything is cleaned up
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Now create fresh instances
                    nfcAbortController.current = new AbortController();
                    const signal = nfcAbortController.current.signal;
                    
                    // @ts-ignore - TypeScript might not have NDEFReader in its types yet
                    const newReader = new NDEFReader();
                    nfcReaderRef.current = newReader;
                    
                    // Add minimal error handler
                    newReader.addEventListener("error", (err: any) => {
                      logger.error("NFC reading error in restarted scan:", err);
                      stopScanInternal();
                    });
                    
                    // Start the scan with the fresh reader
                    await newReader.scan({ signal });
                    setIsScanning(true);
                    logger.nfc('NFC scanning successfully restarted');
                  }
                } catch (error) {
                  logger.error("Error restarting NFC scan:", error);
                  stopScanInternal(); // Ensure we clean up
                }
              }, 2000); // Wait 2 seconds before restarting scan
              
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
    }
  }, [isSupported, onScan, validateId, getTotalAmount]); // Added getTotalAmount to dependencies
  
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
