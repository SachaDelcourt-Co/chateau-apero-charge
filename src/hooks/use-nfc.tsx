import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';

interface UseNfcOptions {
  validateId?: (id: string) => boolean;
  onScan?: (id: string) => void;
}

export const useNfc = (options: UseNfcOptions = {}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  
  // Use refs to avoid dependency issues with useCallback
  const nfcReaderRef = useRef<any>(null);
  const onScanRef = useRef(options.onScan);
  const validateIdRef = useRef(options.validateId);
  
  // Update refs when options change
  useEffect(() => {
    onScanRef.current = options.onScan;
    validateIdRef.current = options.validateId;
  }, [options.onScan, options.validateId]);

  // Check if Web NFC is supported
  useEffect(() => {
    const checkSupport = async () => {
      try {
        // @ts-ignore - NDEFReader may not be recognized by TypeScript
        if ('NDEFReader' in window) {
          setIsSupported(true);
        } else {
          console.log('Web NFC not supported in this browser');
          setIsSupported(false);
        }
      } catch (error) {
        console.error('Error checking NFC support:', error);
        setIsSupported(false);
      }
    };

    checkSupport();
  }, []);

  // Handle NFC reading event
  const handleNfcReading = useCallback((event: any) => {
    console.log('NFC read event:', event);
    
    try {
      const decoder = new TextDecoder();
      let id = '';
      
      // Extract the payload from the NFC tag - this is a Buffer
      for (const record of event.message.records) {
        if (record.recordType === 'text') {
          const textDecoder = new TextDecoder(record.encoding || 'utf-8');
          id = textDecoder.decode(record.data);
        } else {
          // Try to decode the data as a string
          id = decoder.decode(record.data);
        }
        
        console.log('Decoded NFC data:', id);
        
        // Normalize and validate the ID
        id = id.trim();
        
        if (id && (!validateIdRef.current || validateIdRef.current(id))) {
          setLastScannedId(id);
          if (onScanRef.current) {
            onScanRef.current(id);
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error processing NFC data:', error);
    }
  }, []);

  // Handle NFC errors
  const handleNfcError = useCallback((error: any) => {
    console.error('NFC Error:', error);
    // Only stop scanning on critical errors, not just on abort
    if (error.name !== 'AbortError') {
      setIsScanning(false);
    }
  }, []);

  // Start NFC scanning
  const startScan = useCallback(async () => {
    // Prevent starting if already scanning or not supported
    if (isScanning || !isSupported) {
      return;
    }
    
    try {
      // @ts-ignore - NDEFReader may not be recognized by TypeScript
      const reader = new NDEFReader();
      nfcReaderRef.current = reader;
      
      await reader.scan();
      console.log('NFC scan started');
      setIsScanning(true);
      
      // Add event listeners
      reader.addEventListener('reading', handleNfcReading);
      reader.addEventListener('error', handleNfcError);
      
    } catch (error) {
      console.error('Error starting NFC scan:', error);
      setIsScanning(false);
    }
  }, [isScanning, isSupported, handleNfcReading, handleNfcError]);

  // Stop NFC scanning
  const stopScan = useCallback(() => {
    if (nfcReaderRef.current) {
      try {
        // Remove event listeners
        nfcReaderRef.current.removeEventListener('reading', handleNfcReading);
        nfcReaderRef.current.removeEventListener('error', handleNfcError);
        
        // Attempt to abort the scan (may not be possible in all browsers)
        if (nfcReaderRef.current.abort) {
          nfcReaderRef.current.abort();
        }
        
        nfcReaderRef.current = null;
      } catch (error) {
        console.error('Error stopping NFC scan:', error);
      }
    }
    setIsScanning(false);
  }, [handleNfcReading, handleNfcError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  return {
    isScanning,
    isSupported,
    startScan,
    stopScan,
    lastScannedId
  };
}; 