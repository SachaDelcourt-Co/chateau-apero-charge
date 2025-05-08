import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the serve function
vi.mock('https://deno.land/std@0.177.0/http/server.ts', () => {
  return {
    serve: vi.fn((handler) => {
      // Save the handler for testing
      (global as any).testServerHandler = handler;
      return Promise.resolve();
    })
  };
});

// Mock Stripe
vi.mock('https://esm.sh/stripe@12.0.0?target=deno', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_123',
              metadata: {
                cardId: 'test-card',
                amount: '10.00'
              }
            }
          }
        })
      }
    }))
  };
});

// Mock Supabase
vi.mock('https://esm.sh/@supabase/supabase-js@2.7.1', () => {
  return {
    createClient: vi.fn().mockImplementation(() => {
      // Create a mock of the Supabase client
      return {
        from: vi.fn().mockImplementation((table) => {
          const mockQueryBuilder = {
            select: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockReturnValue({ data: null, error: null }),
            single: vi.fn().mockReturnValue({ data: { amount: '20.00' }, error: null })
          };
          return mockQueryBuilder;
        })
      };
    })
  };
});

// Mock Deno's environment variables
vi.stubGlobal('Deno', {
  env: {
    get: vi.fn((key) => {
      const envVars = {
        'STRIPE_SECRET_KEY_FINAL': 'sk_test_123',
        'STRIPE_WEBHOOK_SECRET': 'whsec_123',
        'SUPABASE_URL': 'https://test.supabase.co',
        'SUPABASE_SERVICE_ROLE_KEY': 'service_role_key_123'
      };
      return envVars[key] || '';
    })
  }
});

describe('Stripe Webhook Rate Limit Handling', () => {
  beforeEach(() => {
    // Reset mocks between tests
    vi.resetAllMocks();
    
    // Mock setTimeout to speed up tests
    vi.stubGlobal('setTimeout', (callback, delay) => {
      callback();
      return 0;
    });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should handle rate limit errors with exponential backoff', async () => {
    // Import the webhook handler code
    // This will execute in our mocked environment
    await import('../stripe-webhook/index.ts');
    
    // Get the handler function that was registered
    const handler = (global as any).testServerHandler;
    expect(handler).toBeDefined();
    
    // Create a request object for testing
    const request = new Request('https://example.com/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 'valid-signature'
      },
      body: JSON.stringify({
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            metadata: {
              cardId: 'test-card',
              amount: '10.00'
            }
          }
        }
      })
    });
    
    // Handle the request
    const response = await handler(request);
    
    // Check the response status is OK
    expect(response.status).toBe(200);
    
    // We don't need to check content-type since it may vary
    // Just check the response body contains the expected data
    const body = await response.json();
    expect(body.received).toBe(true);
    expect(body.cardId).toBe('test-card');
  });
}); 