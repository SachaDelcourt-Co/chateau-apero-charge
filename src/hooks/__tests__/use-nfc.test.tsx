import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNfc } from '../use-nfc';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

// Mock dependencies
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    nfc: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    payment: vi.fn(),
    recharge: vi.fn(),
  },
}));

// Mock global fetch for backend coordination
global.fetch = vi.fn();

// Mock NDEFReader
class MockNDEFReader {
  private listeners: { [key: string]: Function[] } = {};
  
  addEventListener(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  removeEventListener(event: string, callback: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }
  
  async scan(options?: { signal?: AbortSignal }) {
    // Simulate successful scan start
    return Promise.resolve();
  }
  
  // Helper method to simulate NFC events
  simulateReading(data: any) {
    if (this.listeners['reading']) {
      this.listeners['reading'].forEach(callback => callback(data));
    }
  }
  
  simulateError(error: any) {
    if (this.listeners['error']) {
      this.listeners['error'].forEach(callback => callback(error));
    }
  }
}

// Mock window.NDEFReader
Object.defineProperty(window, 'NDEFReader', {
  writable: true,
  value: MockNDEFReader,
});

describe('useNfc Hook - Phase 3 State Machine Tests', () => {
  let mockReader: MockNDEFReader;
  
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    
    // Reset fetch mock
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'success' }),
    } as Response);
    
    // Mock NDEFReader constructor to return our mock
    vi.mocked(window.NDEFReader).mockImplementation(() => {
      mockReader = new MockNDEFReader();
      return mockReader as any;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe('State Machine Transitions', () => {
    it('should initialize in IDLE state', () => {
      const { result } = renderHook(() => useNfc());
      
      expect(result.current.state).toBe('IDLE');
      expect(result.current.isIdle).toBe(true);
      expect(result.current.isScanning).toBe(false);
      expect(result.current.isValidating).toBe(false);
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isInCooldown).toBe(false);
    });

    it('should transition IDLE → SCANNING when startScan is called', async () => {
      const { result } = renderHook(() => useNfc());
      
      await act(async () => {
        const success = await result.current.startScan();
        expect(success).toBe(true);
      });
      
      expect(result.current.state).toBe('SCANNING');
      expect(result.current.isScanning).toBe(true);
      expect(logger.nfc).toHaveBeenCalledWith('State transition', expect.objectContaining({
        from: 'IDLE',
        to: 'SCANNING',
        reason: 'NFC scan started successfully'
      }));
    });

    it('should transition SCANNING → VALIDATING_CARD → PROCESSING_OPERATION → COOLDOWN → SCANNING', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ onScan }));
      
      // Start scanning
      await act(async () => {
        await result.current.startScan();
      });
      expect(result.current.state).toBe('SCANNING');
      
      // Simulate NFC card scan
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode('12345678'),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      // Should transition to VALIDATING_CARD
      expect(result.current.state).toBe('VALIDATING_CARD');
      
      // Wait for backend coordination and processing
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      // Should eventually reach COOLDOWN
      expect(result.current.state).toBe('COOLDOWN');
      expect(result.current.isInCooldown).toBe(true);
      expect(onScan).toHaveBeenCalledWith('12345678');
      
      // Wait for cooldown to complete
      await act(async () => {
        vi.advanceTimersByTime(3000); // Default cooldown time
      });
      
      // Should return to SCANNING
      expect(result.current.state).toBe('SCANNING');
    });

    it('should not allow startScan when not in IDLE state', async () => {
      const { result } = renderHook(() => useNfc());
      
      // Start first scan
      await act(async () => {
        await result.current.startScan();
      });
      expect(result.current.state).toBe('SCANNING');
      
      // Try to start another scan
      await act(async () => {
        const success = await result.current.startScan();
        expect(success).toBe(false);
      });
      
      expect(result.current.state).toBe('SCANNING'); // Should remain in SCANNING
    });

    it('should handle state transitions during error conditions', async () => {
      const { result } = renderHook(() => useNfc({
        validateId: () => false // Always fail validation
      }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      // Simulate card scan with invalid ID
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode('invalid'),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      // Should transition back to SCANNING after validation failure
      expect(result.current.state).toBe('SCANNING');
      expect(result.current.error).toBe('Format de carte non valide');
    });
  });

  describe('Debouncing and Duplicate Detection', () => {
    it('should prevent duplicate scans within the duplicate window', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ 
        onScan,
        duplicateWindow: 5000 
      }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      const cardId = '12345678';
      
      // First scan
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode(cardId),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(onScan).toHaveBeenCalledTimes(1);
      
      // Wait for cooldown to complete and return to scanning
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      
      // Second scan with same card ID (should be blocked)
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode(cardId),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      // Should still be only 1 call (duplicate blocked)
      expect(onScan).toHaveBeenCalledTimes(1);
      expect(logger.nfc).toHaveBeenCalledWith('Duplicate scan detected, ignoring', { cardId });
    });

    it('should allow scans after duplicate window expires', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ 
        onScan,
        duplicateWindow: 2000 
      }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      const cardId = '12345678';
      
      // First scan
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode(cardId),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(onScan).toHaveBeenCalledTimes(1);
      
      // Wait for cooldown + duplicate window to expire
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      
      // Second scan with same card ID (should be allowed now)
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode(cardId),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(onScan).toHaveBeenCalledTimes(2);
    });

    it('should clean up expired scan records', async () => {
      const { result } = renderHook(() => useNfc({ duplicateWindow: 1000 }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      // Scan multiple cards
      const cardIds = ['12345678', '87654321', 'abcdefgh'];
      
      for (const cardId of cardIds) {
        await act(async () => {
          mockReader.simulateReading({
            message: {
              records: [{
                recordType: 'text',
                data: new TextEncoder().encode(cardId),
                encoding: 'utf-8'
              }]
            }
          });
        });
        
        await act(async () => {
          vi.advanceTimersByTime(3500); // Wait for cooldown
        });
      }
      
      // Check scan history
      const scanHistory = result.current.getScanHistory();
      expect(scanHistory.length).toBe(3);
      
      // Wait for cleanup timer (30 seconds + double duplicate window)
      await act(async () => {
        vi.advanceTimersByTime(32000);
      });
      
      expect(logger.nfc).toHaveBeenCalledWith('Cleaned up expired scan records', expect.objectContaining({
        expiredCount: expect.any(Number)
      }));
    });
  });

  describe('Backend Coordination', () => {
    it('should send NFC scan data to backend when enabled', async () => {
      const getTotalAmount = vi.fn(() => 15.50);
      const { result } = renderHook(() => useNfc({ 
        getTotalAmount,
        enableBackendCoordination: true 
      }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode('12345678'),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(global.fetch).toHaveBeenCalledWith('/functions/v1/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"card_id_scanned":"12345678"')
      });
      
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      
      expect(requestBody.nfc_scans[0]).toMatchObject({
        card_id_scanned: '12345678',
        scan_status: 'success',
        operation_id: expect.any(String),
        metadata: expect.objectContaining({
          total_amount: 15.50
        })
      });
    });

    it('should continue operation even if backend coordination fails', async () => {
      const onScan = vi.fn();
      
      // Mock fetch to fail
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));
      
      const { result } = renderHook(() => useNfc({ 
        onScan,
        enableBackendCoordination: true 
      }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode('12345678'),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      // Operation should still complete successfully
      expect(onScan).toHaveBeenCalledWith('12345678');
      expect(result.current.state).toBe('COOLDOWN');
      expect(logger.error).toHaveBeenCalledWith('Backend coordination failed', expect.any(Error), expect.any(Object));
    });

    it('should skip backend coordination when disabled', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ 
        onScan,
        enableBackendCoordination: false 
      }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode('12345678'),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(global.fetch).not.toHaveBeenCalled();
      expect(onScan).toHaveBeenCalledWith('12345678');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle NFC reading errors gracefully', async () => {
      const { result } = renderHook(() => useNfc());
      
      await act(async () => {
        await result.current.startScan();
      });
      
      // Simulate NFC error
      await act(async () => {
        mockReader.simulateError(new Error('NFC read failed'));
      });
      
      expect(result.current.error).toBe('Erreur de lecture NFC');
      expect(result.current.state).toBe('IDLE');
      expect(logger.error).toHaveBeenCalledWith('NFC reading error:', expect.any(Error));
    });

    it('should handle invalid card data gracefully', async () => {
      const { result } = renderHook(() => useNfc());
      
      await act(async () => {
        await result.current.startScan();
      });
      
      // Simulate scan with no valid data
      await act(async () => {
        mockReader.simulateReading({
          message: null,
          serialNumber: null
        });
      });
      
      expect(result.current.error).toBe('Format de carte non valide');
      expect(logger.warn).toHaveBeenCalledWith('No valid ID found in NFC tag', expect.any(Object));
    });

    it('should recover from error states', async () => {
      const { result } = renderHook(() => useNfc());
      
      await act(async () => {
        await result.current.startScan();
      });
      
      // Cause an error
      await act(async () => {
        mockReader.simulateError(new Error('Test error'));
      });
      
      expect(result.current.state).toBe('IDLE');
      expect(result.current.error).toBe('Erreur de lecture NFC');
      
      // Should be able to start scanning again
      await act(async () => {
        const success = await result.current.startScan();
        expect(success).toBe(true);
      });
      
      expect(result.current.state).toBe('SCANNING');
      expect(result.current.error).toBe(null);
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should clean up all resources when stopScan is called', async () => {
      const { result } = renderHook(() => useNfc());
      
      await act(async () => {
        await result.current.startScan();
      });
      
      expect(result.current.state).toBe('SCANNING');
      
      await act(async () => {
        const success = result.current.stopScan();
        expect(success).toBe(true);
      });
      
      expect(result.current.state).toBe('IDLE');
      expect(result.current.error).toBe(null);
      expect(logger.nfc).toHaveBeenCalledWith('stopScan called by user', expect.any(Object));
    });

    it('should clean up resources on unmount', () => {
      const { result, unmount } = renderHook(() => useNfc());
      
      act(() => {
        result.current.startScan();
      });
      
      unmount();
      
      expect(logger.nfc).toHaveBeenCalledWith('useNfc hook unmounting, performing cleanup');
    });

    it('should reset all state when reset is called', async () => {
      const { result } = renderHook(() => useNfc());
      
      await act(async () => {
        await result.current.startScan();
      });
      
      // Simulate a scan to populate state
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode('12345678'),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(result.current.lastScannedId).toBe('12345678');
      expect(result.current.getScanHistory().length).toBeGreaterThan(0);
      
      // Reset
      await act(async () => {
        result.current.reset();
      });
      
      expect(result.current.state).toBe('IDLE');
      expect(result.current.lastScannedId).toBe(null);
      expect(result.current.error).toBe(null);
      expect(result.current.getScanHistory().length).toBe(0);
    });
  });

  describe('NFC Support Detection', () => {
    it('should detect NFC support correctly', () => {
      const { result } = renderHook(() => useNfc());
      
      expect(result.current.isSupported).toBe(true);
    });

    it('should handle unsupported browsers', async () => {
      // Temporarily remove NDEFReader
      const originalNDEFReader = window.NDEFReader;
      delete (window as any).NDEFReader;
      
      const { result } = renderHook(() => useNfc());
      
      await act(async () => {
        const success = await result.current.startScan();
        expect(success).toBe(false);
      });
      
      expect(toast).toHaveBeenCalledWith({
        title: "NFC non supporté",
        description: "Votre navigateur ne supporte pas la lecture NFC. Utilisez Chrome sur Android en HTTPS.",
        variant: "destructive"
      });
      
      // Restore NDEFReader
      window.NDEFReader = originalNDEFReader;
    });
  });

  describe('Card ID Extraction', () => {
    it('should extract 8-character alphanumeric IDs correctly', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ onScan }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      const testCases = [
        'ABC12345',
        '12345678',
        'abcd1234'
      ];
      
      for (const cardId of testCases) {
        await act(async () => {
          mockReader.simulateReading({
            message: {
              records: [{
                recordType: 'text',
                data: new TextEncoder().encode(cardId),
                encoding: 'utf-8'
              }]
            }
          });
        });
        
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        
        // Wait for cooldown
        await act(async () => {
          vi.advanceTimersByTime(3000);
        });
      }
      
      expect(onScan).toHaveBeenCalledTimes(3);
      expect(onScan).toHaveBeenNthCalledWith(1, 'ABC12345');
      expect(onScan).toHaveBeenNthCalledWith(2, '12345678');
      expect(onScan).toHaveBeenNthCalledWith(3, 'abcd1234');
    });

    it('should pad short alphanumeric IDs', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ onScan }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'text',
              data: new TextEncoder().encode('123'),
              encoding: 'utf-8'
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(onScan).toHaveBeenCalledWith('00000123');
    });

    it('should handle URL records', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ onScan }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      await act(async () => {
        mockReader.simulateReading({
          message: {
            records: [{
              recordType: 'url',
              data: new TextEncoder().encode('https://example.com/card/ABC12345'),
            }]
          }
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(onScan).toHaveBeenCalledWith('ABC12345');
    });

    it('should fallback to serial number when NDEF fails', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ onScan }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      await act(async () => {
        mockReader.simulateReading({
          message: null,
          serialNumber: '1234567890ABCDEF'
        });
      });
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      expect(onScan).toHaveBeenCalledWith('12345678'); // First 8 characters
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle rapid successive scan attempts', async () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useNfc({ 
        onScan,
        cooldownTime: 100 // Short cooldown for testing
      }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      // Simulate rapid scans
      const rapidScans = Array.from({ length: 10 }, (_, i) => `1234567${i}`);
      
      for (const cardId of rapidScans) {
        await act(async () => {
          mockReader.simulateReading({
            message: {
              records: [{
                recordType: 'text',
                data: new TextEncoder().encode(cardId),
                encoding: 'utf-8'
              }]
            }
          });
        });
        
        // Small delay between scans
        await act(async () => {
          vi.advanceTimersByTime(10);
        });
      }
      
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      // Only the first scan should be processed due to state machine protection
      expect(onScan).toHaveBeenCalledTimes(1);
      expect(onScan).toHaveBeenCalledWith('12345670');
    });

    it('should maintain performance with large scan history', async () => {
      const { result } = renderHook(() => useNfc({ duplicateWindow: 1000 }));
      
      await act(async () => {
        await result.current.startScan();
      });
      
      // Generate many unique card scans
      for (let i = 0; i < 100; i++) {
        const cardId = `card${i.toString().padStart(4, '0')}`;
        
        await act(async () => {
          mockReader.simulateReading({
            message: {
              records: [{
                recordType: 'text',
                data: new TextEncoder().encode(cardId),
                encoding: 'utf-8'
              }]
            }
          });
        });
        
        await act(async () => {
          vi.advanceTimersByTime(150); // Wait for cooldown
        });
      }
      
      const scanHistory = result.current.getScanHistory();
      expect(scanHistory.length).toBe(100);
      
      // Test duplicate detection performance
      const startTime = performance.now();
      const isDuplicate = result.current.isDuplicateScan('card0050');
      const endTime = performance.now();
      
      expect(isDuplicate).toBe(true);
      expect(endTime - startTime).toBeLessThan(10); // Should be very fast
    });
  });
});