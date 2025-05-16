import React, { useState } from 'react';
import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogViewer } from '@/components/LogViewer';

export function DebugPanel() {
  const [showLogs, setShowLogs] = useState(false);
  
  // Check if we're on a touch device (likely mobile)
  const isTouchDevice = typeof window !== 'undefined' && 
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  
  return (
    <>
      {/* Floating debug button positioned at bottom right corner */}
      <div className="fixed bottom-4 right-4 z-50">
        <Button 
          variant="outline" 
          size="icon" 
          className="bg-background/80 backdrop-blur-sm shadow-lg border-gray-300 dark:border-gray-700 h-10 w-10 rounded-full hover:scale-110 transition-transform"
          onClick={() => setShowLogs(true)}
        >
          <Bug className="h-4 w-4" />
          <span className="sr-only">Debug Logs</span>
        </Button>
      </div>
      
      {/* Log viewer dialog */}
      <LogViewer 
        open={showLogs} 
        onOpenChange={setShowLogs} 
      />
    </>
  );
} 