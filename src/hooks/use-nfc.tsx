import { useState, useEffect, useCallback, useRef } from 'react';

// Global NFC state to prevent multiple instances
const globalNfcState = {
  isActive: false,
  activeComponentId: null,
  reader: null as any
};

interface UseNfcOptions {
  validateId?: (id: string) => boolean;
  onScan?: (id: string) => void;
  componentId?: string; // Unique ID for the component using NFC
}

export const useNfc = (options: UseNfcOptions = {}) => {
  // Generate a component ID if not provided
  const componentIdRef = useRef(options.componentId || `nfc-${Math.random().toString(36).substr(2, 9)}`);
  const [isScanning, setIsScanning] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  
  // Use refs to avoid dependency issues with useCallback
  const onScanRef = useRef(options.onScan);
  const validateIdRef = useRef(options.validateId);
  
  // Update refs when options change
  useEffect(() => {
    onScanRef.current = options.onScan;
    validateIdRef.current = options.validateId;
  }, [options.onScan, options.validateId]);

  // Check if Web NFC is supported only once
  useEffect(() => {
    // @ts-ignore - NDEFReader may not be recognized by TypeScript
    setIsSupported('NDEFReader' in window);
  }, []);

  // Handle NFC reading event
  const handleNfcReading = useCallback((event: any) => {
    try {
      const decoder = new TextDecoder();
      let id = '';
      
      // Extract the payload from the NFC tag
      for (const record of event.message.records) {
        if (record.recordType === 'text') {
          const textDecoder = new TextDecoder(record.encoding || 'utf-8');
          id = textDecoder.decode(record.data);
        } else {
          // Try to decode the data as a string
          id = decoder.decode(record.data);
        }
        
        // Normalize and validate the ID
        id = id.trim();
        
        // Check if this ID is valid and call the onScan callback
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
    if (error.name !== 'AbortError') {
      setIsScanning(false);
      
      // Only clear global state if this component is the active one
      if (globalNfcState.activeComponentId === componentIdRef.current) {
        globalNfcState.isActive = false;
        globalNfcState.activeComponentId = null;
        globalNfcState.reader = null;
      }
    }
  }, []);

  // Start NFC scanning with global manager
  const startScan = useCallback(async () => {
    // If NFC is not supported, don't try to start
    if (!isSupported) {
      return false;
    }
    
    // If already scanning from this component, do nothing
    if (isScanning && globalNfcState.activeComponentId === componentIdRef.current) {
      return true;
    }
    
    // If another component is scanning, don't interrupt
    if (globalNfcState.isActive && globalNfcState.activeComponentId !== componentIdRef.current) {
      console.log(`NFC already in use by component ${globalNfcState.activeComponentId}`);
      return false;
    }
    
    try {
      // Clean up any existing reader first
      await stopScan();
      
      // @ts-ignore - NDEFReader may not be recognized by TypeScript
      const reader = new NDEFReader();
      
      await reader.scan();
      
      // Set global state
      globalNfcState.isActive = true;
      globalNfcState.activeComponentId = componentIdRef.current;
      globalNfcState.reader = reader;
      
      setIsScanning(true);
      
      // Add event listeners
      reader.addEventListener('reading', handleNfcReading);
      reader.addEventListener('error', handleNfcError);
      
      return true;
    } catch (error) {
      console.error('Error starting NFC scan:', error);
      setIsScanning(false);
      
      // Clear global state on error
      globalNfcState.isActive = false;
      globalNfcState.activeComponentId = null;
      globalNfcState.reader = null;
      
      return false;
    }
  }, [isSupported, isScanning, handleNfcReading, handleNfcError]);

  // Stop NFC scanning
  const stopScan = useCallback(() => {
    // Only stop if this component is the active one
    if (globalNfcState.activeComponentId !== componentIdRef.current && globalNfcState.isActive) {
      // This component doesn't own the NFC reader, so just update local state
      setIsScanning(false);
      return true;
    }
    
    if (globalNfcState.reader) {
      try {
        // Remove event listeners
        globalNfcState.reader.removeEventListener('reading', handleNfcReading);
        globalNfcState.reader.removeEventListener('error', handleNfcError);
        
        // Attempt to abort the scan
        if (globalNfcState.reader.abort) {
          globalNfcState.reader.abort();
        }
      } catch (error) {
        console.error('Error stopping NFC scan:', error);
      }
      
      // Clear global state
      globalNfcState.isActive = false;
      globalNfcState.activeComponentId = null;
      globalNfcState.reader = null;
    }
    
    setIsScanning(false);
    return true;
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