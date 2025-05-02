import React from 'react';
import { useNfc } from '@/hooks/use-nfc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Scan } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function NfcTest() {
  const { isScanning, startScan, stopScan, isSupported } = useNfc({
    onScan: (id) => {
      toast({
        title: "ID scanned",
        description: `Card ID: ${id}`
      });
    }
  });
  
  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <h2 className="text-xl font-bold mb-4">NFC Test Component</h2>
        <div className="space-y-4">
          <p>NFC Supported: {isSupported ? 'Yes' : 'No'}</p>
          <p>Scanning Status: {isScanning ? 'Active' : 'Inactive'}</p>
          <Button
            onClick={isScanning ? stopScan : startScan}
            variant={isScanning ? "destructive" : "default"}
            disabled={!isSupported}
          >
            <Scan className="h-4 w-4 mr-2" />
            {isScanning ? "Stop NFC Scan" : "Start NFC Scan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 