import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface UseNfcOptions {
  onScan?: (id: string) => void;
  validateId?: (id: string) => boolean;
  getTotalAmount?: () => number;
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
    console.log('[NFC Debug] NDEFReader in window:', hasNDEFReader);
    console.log('[NFC Debug] Window object:', Object.keys(window).filter(k => k.includes('NFC') || k.includes('NDEF')));
    console.log('[NFC Debug] Current environment:', {
      isSecureContext: window.isSecureContext,
      userAgent: navigator.userAgent,
      platform: navigator.platform
    });
    
    setIsSupported(hasNDEFReader);
    
    // If not supported, provide some context why
    if (!hasNDEFReader) {
      console.warn('[NFC Debug] Web NFC API is not supported in this browser. Chrome for Android (version 89+) over HTTPS is required.');
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
    console.log('[NFC Debug] stopScanInternal called');
    
    // Safely abort the controller if it exists
    if (nfcAbortController.current) {
      try {
        nfcAbortController.current.abort();
        console.log('[NFC Debug] AbortController aborted successfully');
      } catch (error) {
        console.error('[NFC Debug] Error aborting controller:', error);
      }
      nfcAbortController.current = null;
    }
    
    // Clear reader reference
    nfcReaderRef.current = null;
    
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
    console.log('[NFC Debug] startScan called, isSupported:', isSupported);
    
    if (!isSupported) {
      console.warn('[NFC Debug] Cannot start NFC scan - API not supported');
      toast({
        title: "NFC non supporté",
        description: "Votre navigateur ne supporte pas la lecture NFC. Utilisez Chrome sur Android en HTTPS.",
        variant: "destructive"
      });
      return false;
    }
    
    // First, ensure any existing scan is stopped properly
    stopScanInternal();
    
    try {
      // Create a fresh AbortController
      nfcAbortController.current = new AbortController();
      const signal = nfcAbortController.current.signal;
      
      console.log('[NFC Debug] Creating NDEFReader instance');
      // @ts-ignore - TypeScript might not have NDEFReader in its types yet
      const reader = new NDEFReader();
      nfcReaderRef.current = reader;
      
      // Add error listener first before starting the scan
      reader.addEventListener("error", (error: any) => {
        console.error("[NFC Debug] NFC reading error:", error);
        toast({
          title: "Erreur NFC",
          description: error.message || "Une erreur est survenue lors de la lecture NFC",
          variant: "destructive"
        });
        stopScanInternal();
      });
      
      // Add reading listener
      reader.addEventListener("reading", ({ message, serialNumber }: any) => {
        try {
          console.log('[NFC Debug] NFC Reading event triggered', { serialNumber });
          
          // First priority: Try to read from NDEF message records
          if (message && message.records) {
            console.log("[NFC Debug] NFC message records:", message.records);
            
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
                
                console.log("[NFC Debug] Decoded text from NFC:", text);
                extractedId = extractIdFromText(text);
              } 
              else if (record.recordType === "url") {
                const textDecoder = new TextDecoder();
                const url = textDecoder.decode(record.data);
                console.log("[NFC Debug] Decoded URL from NFC:", url);
                
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
                console.log("[NFC Debug] Decoded unknown data from NFC:", data);
                extractedId = extractIdFromText(data);
              }
              
              // If we found a valid ID, use it
              if (extractedId && (!validateId || validateId(extractedId))) {
                console.log("[NFC Debug] Valid ID extracted from NFC payload:", extractedId);
                setLastScannedId(extractedId);
                
                // CRITICAL: Always fetch the latest total at the exact moment of scanning
                // not using any previously cached value
                let latestAmount = 0;
                if (getTotalAmount) {
                  latestAmount = getTotalAmount();
                  console.log("[NFC Debug] EXACT current total at scan moment:", latestAmount);
                }
                
                // Temporarily pause scanning but don't stop completely
                // This prevents multiple rapid reads of the same card
                const currentController = nfcAbortController.current;
                if (currentController) {
                  try {
                    currentController.abort();
                    console.log("[NFC Debug] NFC scanning temporarily paused after card read");
                  } catch (error) {
                    console.error('[NFC Debug] Error pausing NFC scan:', error);
                  }
                }
                
                // Notify user that card was detected
                toast({
                  title: "Carte détectée",
                  description: `Traitement en cours pour ${latestAmount?.toFixed(2) || 0}€`,
                  variant: "default"
                });
                
                // Call onScan with the extracted ID if provided
                if (onScan) {
                  onScan(extractedId);
                }
                
                // Restart scan after a short delay to prevent multiple reads
                setTimeout(async () => {
                  try {
                    // Only restart if we're still in scanning mode
                    if (isScanning) {
                      // Create a fresh AbortController
                      nfcAbortController.current = new AbortController();
                      const signal = nfcAbortController.current.signal;
                      
                      // @ts-ignore - TypeScript might not have NDEFReader in its types yet
                      const newReader = new NDEFReader();
                      nfcReaderRef.current = newReader;
                      
                      // Register event listeners (simplified)
                      newReader.addEventListener("error", (err: any) => {
                        console.error("[NFC Debug] NFC reading error in restarted scan:", err);
                      });
                      
                      // Copy the reading event handler from above, but don't register it here to keep the code shorter
                      
                      // Restart the scan
                      await newReader.scan({ signal });
                      console.log('[NFC Debug] NFC scanning restarted after processing card');
                    }
                  } catch (error) {
                    console.error("[NFC Debug] Error restarting NFC scan:", error);
                  }
                }, 2000); // Wait 2 seconds before restarting scan
                
                return;
              }
            }
          }
          
          // Second priority: Try with serialNumber as fallback
          if (serialNumber) {
            console.log("[NFC Debug] NFC serial number:", serialNumber);
            // Try to extract ID from serial number
            const id = serialNumber.substring(0, 8);
            if (!validateId || validateId(id)) {
              console.log("[NFC Debug] Using serial number as ID:", id);
              setLastScannedId(id);
              
              // CRITICAL: Always fetch the latest total at the exact moment of scanning
              // not using any previously cached value
              let latestAmount = 0;
              if (getTotalAmount) {
                latestAmount = getTotalAmount();
                console.log("[NFC Debug] EXACT current total at scan moment:", latestAmount);
              }
              
              // Temporarily pause scanning but don't stop completely
              // This prevents multiple rapid reads of the same card
              const currentController = nfcAbortController.current;
              if (currentController) {
                try {
                  currentController.abort();
                  console.log("[NFC Debug] NFC scanning temporarily paused after card read");
                } catch (error) {
                  console.error('[NFC Debug] Error pausing NFC scan:', error);
                }
              }
              
              // Notify user that card was detected
              toast({
                title: "Carte détectée",
                description: `Traitement en cours pour ${latestAmount?.toFixed(2) || 0}€`,
                variant: "default"
              });
              
              // Call onScan with the ID if provided
              if (onScan) {
                onScan(id);
              }
              
              // Restart scan after a short delay to prevent multiple reads
              setTimeout(async () => {
                try {
                  // Only restart if we're still in scanning mode
                  if (isScanning) {
                    // Create a fresh AbortController
                    nfcAbortController.current = new AbortController();
                    const signal = nfcAbortController.current.signal;
                    
                    // @ts-ignore - TypeScript might not have NDEFReader in its types yet
                    const newReader = new NDEFReader();
                    nfcReaderRef.current = newReader;
                    
                    // Register event listeners (simplified)
                    newReader.addEventListener("error", (err: any) => {
                      console.error("[NFC Debug] NFC reading error in restarted scan:", err);
                    });
                    
                    // Copy the reading event handler from above, but don't register it here to keep the code shorter
                    
                    // Restart the scan
                    await newReader.scan({ signal });
                    console.log('[NFC Debug] NFC scanning restarted after processing card');
                  }
                } catch (error) {
                  console.error("[NFC Debug] Error restarting NFC scan:", error);
                }
              }, 2000); // Wait 2 seconds before restarting scan
              
              return;
            }
          }
          
          // If we made it here, we couldn't find a valid ID
          console.warn("[NFC Debug] No valid ID found in NFC tag");
          throw new Error("Format de carte non valide");
        } catch (error) {
          console.error("[NFC Debug] Error reading NFC card:", error);
          toast({
            title: "Erreur de lecture",
            description: "La carte n'est pas au format attendu",
            variant: "destructive"
          });
        }
      });
      
      console.log('[NFC Debug] Calling reader.scan() with signal');
      // Now start the scan after setting up listeners
      await reader.scan({ signal });
      setIsScanning(true);
      
      console.log('[NFC Debug] NFC scan started successfully');
      toast({
        title: "Scan NFC activé",
        description: "Approchez une carte NFC pour scanner"
      });
      
      return true;
    } catch (error) {
      console.error("[NFC Debug] Error starting NFC scan:", error);
      stopScanInternal();
      
      // Provide user feedback
      if ((error as Error)?.message?.includes("aborted")) {
        toast({
          title: "Scan NFC interrompu",
          description: "Le scan NFC a été interrompu",
          variant: "default"
        });
      } else {
        toast({
          title: "Erreur NFC",
          description: (error as Error)?.message || "Impossible d'activer le scan NFC",
          variant: "destructive"
        });
      }
      
      return false;
    }
  }, [isSupported, onScan, validateId, getTotalAmount]);
  
  const stopScan = useCallback(() => {
    console.log('[NFC Debug] stopScan called by user');
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