import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scan, Bug, AlertCircle, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { useNfc } from '@/hooks/use-nfc';

export function NfcDebugger() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastRecords, setLastRecords] = useState<any[]>([]);
  const [lastSerialNumber, setLastSerialNumber] = useState<string | null>(null);
  
  // Use the global NFC hook to avoid conflicts with other components
  const { isScanning, startScan, stopScan, isSupported, lastScannedId } = useNfc({
    componentId: 'nfc-debugger',
    onScan: (id) => {
      console.log('NFC Debugger received ID:', id);
      addLog(`Card ID scanned: ${id}`);
      // We don't need to do anything with the ID in the debugger
    }
  });
  
  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };
  
  // Custom handler for NFC reading events when this component scans
  const handleNfcReading = (event: any) => {
    console.log('NFC Debugger reading event:', event);
    addLog('NFC reading event detected');
    
    // Extract and set serial number
    if (event.serialNumber) {
      setLastSerialNumber(event.serialNumber);
      addLog(`Serial number: ${event.serialNumber}`);
    }
    
    // Process NDEF records
    if (event.message && event.message.records) {
      addLog(`Found ${event.message.records.length} record(s)`);
      
      const recordsData = event.message.records.map((record: any, index: number) => {
        try {
          let decodedData = "Cannot decode";
          if (record.data) {
            try {
              const textDecoder = new TextDecoder(record.encoding || 'utf-8');
              decodedData = textDecoder.decode(record.data);
              addLog(`Record ${index} decoded data: ${decodedData}`);
            } catch (e) {
              decodedData = "Decode error: " + (e as Error).message;
              addLog(`Record ${index} decode error: ${(e as Error).message}`);
            }
          }
          
          return {
            recordType: record.recordType,
            mediaType: record.mediaType,
            id: record.id,
            encoding: record.encoding,
            lang: record.lang,
            decodedData
          };
        } catch (error) {
          addLog(`Error processing record ${index}: ${(error as Error).message}`);
          return { error: (error as Error).message, record };
        }
      });
      
      setLastRecords(recordsData);
    }
  };
  
  // Override console.log to capture NFC-related logs
  const originalConsoleLog = console.log;
  useEffect(() => {
    if (!isOpen) return;
    
    console.log = (...args: any[]) => {
      originalConsoleLog(...args);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      if (message.includes('NFC')) {
        setLogs(prev => [...prev, message]);
      }
    };
    
    return () => {
      console.log = originalConsoleLog;
    };
  }, [isOpen]);
  
  // Add custom event handler when scanning is active
  useEffect(() => {
    if (!isScanning || !isOpen) return;
    
    // @ts-ignore - Access global NDEFReader instance
    const addHandlers = () => {
      // Add our custom event handler to capture readings
      document.addEventListener('reading', handleNfcReading);
      addLog('Registered NFC reading event handler');
    };
    
    // Small delay to ensure the reader is set up
    const timer = setTimeout(addHandlers, 500);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('reading', handleNfcReading);
    };
  }, [isScanning, isOpen]);
  
  // Display UI status updates when the lastScannedId changes
  useEffect(() => {
    if (lastScannedId && isOpen) {
      addLog(`Last scanned ID from hook: ${lastScannedId}`);
    }
  }, [lastScannedId, isOpen]);
  
  const toggleNfcScan = async () => {
    if (isScanning) {
      stopScan();
      addLog('NFC scan stopped manually');
      toast({
        title: "Scan NFC arrêté",
        description: "Le scan NFC a été arrêté"
      });
    } else {
      if (!isSupported) {
        addLog('NFC not supported by this browser/device');
        toast({
          title: "NFC non supporté",
          description: "Votre navigateur ne supporte pas la lecture NFC",
          variant: "destructive"
        });
        return;
      }
      
      try {
        // Clear previous records
        setLastRecords([]);
        setLastSerialNumber(null);
        addLog('Attempting to start NFC scan...');
        
        // Start NFC scanning
        const success = await startScan();
        
        if (success) {
          addLog('NFC scan started successfully');
          toast({
            title: "Scan NFC activé",
            description: "Approchez une carte NFC pour scanner"
          });
        } else {
          addLog('Failed to start NFC scan - in use by another component');
          toast({
            title: "NFC utilisé par une autre partie de l'application",
            description: "Impossible de démarrer le scan NFC pour le débogueur",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error("Error starting NFC scan:", error);
        addLog(`Error starting NFC scan: ${(error as Error)?.message}`);
        toast({
          title: "Erreur NFC",
          description: (error as Error)?.message || "Impossible d'activer le scan NFC",
          variant: "destructive"
        });
      }
    }
  };
  
  const clearLogs = () => {
    setLogs([]);
  };
  
  if (!isOpen) {
    return (
      <Button 
        variant="outline" 
        size="icon" 
        className="fixed bottom-4 right-4 rounded-full h-12 w-12 shadow-lg bg-white"
        onClick={() => setIsOpen(true)}
      >
        <Bug className="h-6 w-6" />
      </Button>
    );
  }
  
  return (
    <Card className="fixed bottom-4 right-4 w-[90vw] max-w-[500px] shadow-xl bg-white z-50 h-[80vh] max-h-[600px] flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg flex items-center">
            <Bug className="h-5 w-5 mr-2" />
            Débogueur NFC
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex flex-col flex-grow p-3 overflow-hidden">
        <div className="flex space-x-2 mb-3">
          <Button 
            onClick={toggleNfcScan}
            variant={isScanning ? "destructive" : "default"}
            size="sm"
            className="flex-grow"
          >
            <Scan className="h-4 w-4 mr-2" />
            {isScanning ? "Arrêter le scan" : "Scanner une carte"}
          </Button>
          <Button variant="outline" size="sm" onClick={clearLogs}>
            Effacer les logs
          </Button>
        </div>
        
        {lastSerialNumber && (
          <div className="bg-slate-100 p-2 rounded-md mb-3">
            <p className="text-sm font-medium">Numéro de série:</p>
            <code className="text-xs break-all">{lastSerialNumber}</code>
          </div>
        )}
        
        {lastRecords.length > 0 && (
          <div className="bg-slate-100 p-2 rounded-md mb-3 overflow-hidden">
            <p className="text-sm font-medium mb-1">Enregistrements NDEF:</p>
            <ScrollArea className="h-[150px]">
              {lastRecords.map((record, idx) => (
                <div key={idx} className="mb-2 pb-2 border-b border-slate-200 last:border-0">
                  <div className="flex flex-wrap gap-1 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {record.recordType || 'unknown'}
                    </Badge>
                    {record.mediaType && (
                      <Badge variant="outline" className="text-xs">
                        {record.mediaType}
                      </Badge>
                    )}
                    {record.encoding && (
                      <Badge variant="outline" className="text-xs">
                        {record.encoding}
                      </Badge>
                    )}
                  </div>
                  <code className="text-xs break-all block bg-slate-200 p-1 rounded">
                    {record.decodedData}
                  </code>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
        
        <Separator className="my-2" />
        
        <div className="flex-grow overflow-hidden">
          <p className="text-sm font-medium mb-1">Logs:</p>
          <ScrollArea className="h-[calc(100%-2rem)]">
            <div className="space-y-1">
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-[100px] text-slate-400">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <span className="text-sm">Aucun log NFC</span>
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="text-xs font-mono whitespace-pre-wrap break-all bg-slate-50 p-1 rounded">
                    {log}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
} 