import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BarPaymentForm } from '../BarPaymentForm';
import * as supabaseModule from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

// Mock the supabase module
vi.mock('@/lib/supabase', () => ({
  getTableCardById: vi.fn(),
  createBarOrder: vi.fn(),
}));

// Mock the toast function
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock the NFC hook
vi.mock('@/hooks/use-nfc', () => ({
  useNfc: () => ({
    isScanning: false,
    startScan: vi.fn(),
    stopScan: vi.fn(),
    isSupported: true,
  }),
}));

// Mock the useIsMobile hook
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false, // Always return desktop view for tests
  MOBILE_BREAKPOINT: 768,
}));

// Stub global setTimeout to make it synchronous for testing
const originalSetTimeout = global.setTimeout;

describe('BarPaymentForm Rate Limit Handling', () => {
  const mockOrder = {
    id: 'order-123',
    card_id: '',
    items: [
      { 
        id: 'item-1', 
        product_name: 'Beer', 
        price: 5, 
        quantity: 2, 
        is_return: false,
        is_deposit: false,
        product_id: 'prod-1',
        product_category: 'drinks'
      },
    ],
    total_amount: 10,
    created_at: new Date().toISOString(),
  };
  
  const mockCard = {
    id: 'test-card',
    amount: '50.00',
  };
  
  beforeEach(() => {
    // Setup fake timers
    vi.useFakeTimers();
    vi.resetAllMocks();
    
    // Mock card retrieval success
    vi.mocked(supabaseModule.getTableCardById).mockResolvedValue(mockCard);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle rate limit errors with exponential backoff', async () => {
    // Mock the createBarOrder function to simulate rate limit errors
    let callCount = 0;
    vi.mocked(supabaseModule.createBarOrder).mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        console.error('Error processing payment:', { status: 429, message: 'Too many requests' });
        return Promise.reject({ status: 429, message: 'Too many requests' });
      } else {
        return Promise.resolve({ success: true, orderId: 'order-123' });
      }
    });

    // Render the component with order
    render(<BarPaymentForm order={mockOrder} onBack={vi.fn()} onComplete={vi.fn()} />);

    // Fill the card ID 
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/ID de la carte/i), {
        target: { value: 'test-card' },
      });
    });

    // Submit the form
    await act(async () => {
      fireEvent.submit(screen.getByText(/Payer maintenant/i));
    });

    // Verify first call happens
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(1);

    // Run the first retry
    await act(async () => {
      vi.advanceTimersByTime(1100); // Just past the 1000ms first retry delay
    });

    // Verify second call happens
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(2);

    // Run the second retry (which will succeed)
    await act(async () => {
      vi.advanceTimersByTime(2100); // Just past the 2000ms second retry delay
    });

    // Verify all three calls were made
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(3);

    // Success should show
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Paiement réussi",
      description: expect.stringContaining("Nouveau solde: 40.00€"),
    }));
  });

  it('should display an error after exceeding max retries', async () => {
    // Mock createBarOrder to always fail with rate limit
    vi.mocked(supabaseModule.createBarOrder).mockRejectedValue({ 
      status: 429, 
      message: 'Too many requests' 
    });

    // Render the component with order
    render(<BarPaymentForm order={mockOrder} onBack={vi.fn()} onComplete={vi.fn()} />);

    // Fill the card ID
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/ID de la carte/i), {
        target: { value: 'test-card' },
      });
    });

    // Submit the form
    await act(async () => {
      fireEvent.submit(screen.getByText(/Payer maintenant/i));
    });

    // Run all retries one by one
    await act(async () => {
      vi.advanceTimersByTime(1100); // First retry
    });
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(2100); // Second retry
    });
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(4100); // Third retry
    });
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(4);

    await act(async () => {
      vi.advanceTimersByTime(8100); // Fourth retry
    });
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(5);

    await act(async () => {
      vi.advanceTimersByTime(10100); // Fifth retry
    });
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(6);
    
    // Verify the error message shows up
    expect(screen.getByText(/momentanément surchargé/i)).toBeTruthy();
    
    // Verify all retries were attempted (1 initial + 5 retries = 6 total)
    expect(supabaseModule.createBarOrder).toHaveBeenCalledTimes(6);
  });
}); 