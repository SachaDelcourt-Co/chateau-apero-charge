import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface UseNfcOptions {
  onScan?: (id: string) => void;
  validateId?: (id: string) => boolean;
}

export function useNfc({ onScan, validateId }: UseNfcOptions = {}) {
  const [isScanning, setIsScanning] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const nfcAbortController = useRef<AbortController | null>(null);
  
  // Check if NFC is supported
  useEffect(() => {
    setIsSupported('NDEFReader' in window);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (nfcAbortController.current) {
        nfcAbortController.current.abort();
      }
    };
  }, []);
  
  const startScan = useCallback(async () => {
    if (!isSupported) {
      toast({
        title: "NFC non supporté",
        description: "Votre navigateur ne supporte pas la lecture NFC",
        variant: "destructive"
      });
      return false;
    }
    
    try {
      setIsScanning(true);
      
      // Create a new abort controller to be able to stop scanning
      nfcAbortController.current = new AbortController();
      const signal = nfcAbortController.current.signal;
      
      // @ts-ignore - TypeScript might not have NDEFReader in its types yet
      const reader = new NDEFReader();
      
      await reader.scan({ signal });
      
      toast({
        title: "Scan NFC activé",
        description: "Approchez une carte NFC pour scanner"
      });
      
      reader.addEventListener("reading", ({ message, serialNumber }: any) => {
        try {
          // Try to read from serialNumber first if available
          if (serialNumber) {
            const id = serialNumber.substring(0, 8);
            if (!validateId || validateId(id)) {
              setLastScannedId(id);
              if (onScan) onScan(id);
              return;
            }
          }
          
          // Try to read from NDEF records if serialNumber didn't work
          if (message && message.records) {
            for (const record of message.records) {
              if (record.recordType === "text") {
                const textDecoder = new TextDecoder();
                const text = textDecoder.decode(record.data);
                
                if (!validateId || validateId(text)) {
                  setLastScannedId(text);
                  if (onScan) onScan(text);
                  return;
                }
              }
            }
          }
          
          throw new Error("Format de carte non valide");
        } catch (error) {
          console.error("Error reading NFC card:", error);
          toast({
            title: "Erreur de lecture",
            description: "La carte n'est pas au format attendu",
            variant: "destructive"
          });
        }
      });
      
      reader.addEventListener("error", (error: any) => {
        console.error("NFC reading error:", error);
        toast({
          title: "Erreur NFC",
          description: error.message || "Une erreur est survenue lors de la lecture NFC",
          variant: "destructive"
        });
        setIsScanning(false);
      });
      
      return true;
    } catch (error) {
      console.error("Error starting NFC scan:", error);
      toast({
        title: "Erreur NFC",
        description: (error as Error)?.message || "Impossible d'activer le scan NFC",
        variant: "destructive"
      });
      setIsScanning(false);
      return false;
    }
  }, [isSupported, onScan, validateId]);
  
  const stopScan = useCallback(() => {
    if (nfcAbortController.current) {
      nfcAbortController.current.abort();
      nfcAbortController.current = null;
      setIsScanning(false);
      return true;
    }
    return false;
  }, []);
  
  return {
    isScanning,
    isSupported,
    lastScannedId,
    startScan,
    stopScan
  };
} 