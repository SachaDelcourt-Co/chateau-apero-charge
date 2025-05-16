import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logger } from '@/lib/logger';
import { Download, Share, Copy, X, Trash } from 'lucide-react';

type LogTab = 'nfc' | 'payment' | 'recharge' | 'all';

export function LogViewer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [logs, setLogs] = useState<any>({ nfc: [], payment: [], recharge: [] });
  const [activeTab, setActiveTab] = useState<LogTab>('nfc');
  
  // Load logs when dialog opens
  useEffect(() => {
    if (open) {
      refreshLogs();
    }
  }, [open, activeTab]);
  
  // Refresh logs from localStorage
  const refreshLogs = () => {
    const allLogs = logger.getLogs('all');
    setLogs(allLogs);
  };
  
  // Format log entry for display
  const formatLogEntry = (entry: any) => {
    if (!entry) return '';
    
    // Use formattedTime if available, otherwise format timestamp
    const time = entry.formattedTime || new Date(entry.timestamp).toLocaleTimeString();
    
    // For payment logs or recharge logs (they have similar structure)
    if ('event' in entry) {
      return `[${time}] ${entry.event}: ${JSON.stringify(entry.data, null, 2)}`;
    }
    
    // For NFC logs
    if ('message' in entry) {
      return `[${time}] ${entry.message} ${entry.args ? JSON.stringify(entry.args, null, 2) : ''}`;
    }
    
    return JSON.stringify(entry, null, 2);
  };
  
  // Clear logs for the current tab
  const handleClearLogs = () => {
    logger.clearLogs(activeTab === 'all' ? 'all' : activeTab);
    refreshLogs();
  };
  
  // Export logs as a JSON file
  const handleExportLogs = () => {
    const logsToExport = activeTab === 'all' ? logs : logs[activeTab];
    const blob = new Blob([JSON.stringify(logsToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Copy logs to clipboard
  const handleCopyLogs = () => {
    const logsToExport = activeTab === 'all' ? logs : logs[activeTab];
    navigator.clipboard.writeText(JSON.stringify(logsToExport, null, 2))
      .then(() => {
        alert('Logs copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy logs:', err);
      });
  };
  
  // Share logs (mobile only)
  const handleShareLogs = async () => {
    const logsToExport = activeTab === 'all' ? logs : logs[activeTab];
    
    if (navigator.share) {
      try {
        const blob = new Blob([JSON.stringify(logsToExport, null, 2)], {
          type: 'application/json',
        });
        
        const file = new File([blob], `${activeTab}-logs.json`, {
          type: 'application/json',
        });
        
        await navigator.share({
          title: `${activeTab.toUpperCase()} Logs`,
          text: `Logs from Château Apéro App`,
          files: [file],
        });
      } catch (error) {
        console.error('Error sharing:', error);
        // Fallback to copy if sharing fails
        handleCopyLogs();
      }
    } else {
      // Fallback for browsers that don't support sharing
      handleCopyLogs();
    }
  };
  
  const getActiveTabContent = () => {
    switch(activeTab) {
      case 'nfc':
        return logs.nfc;
      case 'payment':
        return logs.payment;
      case 'recharge':
        return logs.recharge;
      default:
        return logs;
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Journal de logs</DialogTitle>
          <DialogDescription>
            Consultez et exportez les logs pour le dépannage
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="nfc" className="flex-grow flex flex-col" onValueChange={(value) => setActiveTab(value as LogTab)}>
          <div className="flex justify-between items-center mb-2">
            <TabsList>
              <TabsTrigger value="nfc">NFC ({logs.nfc?.length || 0})</TabsTrigger>
              <TabsTrigger value="payment">Paiements ({logs.payment?.length || 0})</TabsTrigger>
              <TabsTrigger value="recharge">Recharges ({logs.recharge?.length || 0})</TabsTrigger>
            </TabsList>
            
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={refreshLogs}>
                <span className="sr-only">Refresh</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </Button>
              <Button variant="outline" size="icon" onClick={handleClearLogs}>
                <Trash className="h-4 w-4" />
                <span className="sr-only">Clear</span>
              </Button>
            </div>
          </div>
          
          <TabsContent value="nfc" className="flex-grow mt-0">
            <ScrollArea className="h-[300px] border rounded-md p-2 bg-gray-50 dark:bg-gray-900 text-xs font-mono">
              {logs.nfc && logs.nfc.length > 0 ? (
                logs.nfc.map((entry: any, i: number) => (
                  <div key={i} className="py-1 border-b border-gray-200 dark:border-gray-800 last:border-0">
                    {formatLogEntry(entry)}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">No NFC logs found</div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="payment" className="flex-grow mt-0">
            <ScrollArea className="h-[300px] border rounded-md p-2 bg-gray-50 dark:bg-gray-900 text-xs font-mono">
              {logs.payment && logs.payment.length > 0 ? (
                logs.payment.map((entry: any, i: number) => (
                  <div key={i} className="py-1 border-b border-gray-200 dark:border-gray-800 last:border-0">
                    {formatLogEntry(entry)}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">No payment logs found</div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="recharge" className="flex-grow mt-0">
            <ScrollArea className="h-[300px] border rounded-md p-2 bg-gray-50 dark:bg-gray-900 text-xs font-mono">
              {logs.recharge && logs.recharge.length > 0 ? (
                logs.recharge.map((entry: any, i: number) => (
                  <div key={i} className="py-1 border-b border-gray-200 dark:border-gray-800 last:border-0">
                    {formatLogEntry(entry)}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">No recharge logs found</div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="flex justify-between sm:justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={handleCopyLogs}>
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportLogs}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          {navigator.share && (
            <Button variant="outline" size="sm" onClick={handleShareLogs}>
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button>
          )}
          <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 