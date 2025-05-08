import { vi } from 'vitest';

// Mock Supabase client
export const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  data: null,
  error: null,
};

// Reset all mock implementations
export const resetMocks = () => {
  Object.values(mockSupabaseClient).forEach(
    (method) => method.mockClear && method.mockClear()
  );
};

// Helper to simulate a rate limit error
export const simulateRateLimitError = () => {
  return {
    data: null,
    error: {
      code: '429',
      message: 'Too many requests, please try again later',
    },
  };
};

// Helper to simulate a successful response
export const simulateSuccessResponse = (data = {}) => {
  return {
    data,
    error: null,
  };
};

export default mockSupabaseClient; 