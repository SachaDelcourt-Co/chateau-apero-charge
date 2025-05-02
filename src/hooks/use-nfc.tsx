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
          // First priority: Try to read from NDEF message records
          if (message && message.records) {
            console.log("NFC message records:", message.records);
            
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
                
                console.log("Decoded text from NFC:", text);
                extractedId = extractIdFromText(text);
              } 
              else if (record.recordType === "url") {
                const textDecoder = new TextDecoder();
                const url = textDecoder.decode(record.data);
                console.log("Decoded URL from NFC:", url);
                
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
                console.log("Decoded unknown data from NFC:", data);
                extractedId = extractIdFromText(data);
              }
              
              // If we found a valid ID, use it
              if (extractedId && (!validateId || validateId(extractedId))) {
                console.log("Valid ID extracted from NFC payload:", extractedId);
                setLastScannedId(extractedId);
                if (onScan) onScan(extractedId);
                return;
              }
            }
          }
          
          // Second priority: Try with serialNumber as fallback
          if (serialNumber) {
            console.log("NFC serial number:", serialNumber);
            // Try to extract ID from serial number
            const id = serialNumber.substring(0, 8);
            if (!validateId || validateId(id)) {
              console.log("Using serial number as ID:", id);
              setLastScannedId(id);
              if (onScan) onScan(id);
              return;
            }
          }
          
          // If we made it here, we couldn't find a valid ID
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