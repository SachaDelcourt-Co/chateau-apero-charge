import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';

// Mock environment variables for testing
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.VITE_ALLOWED_ORIGINS = 'https://localhost:3000,http://localhost:3000';
  
  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  vi.clearAllTimers();
});

// Global test utilities
global.testUtils = {
  createMockRequest: (overrides = {}) => ({
    method: 'GET',
    url: '/api/test',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'test-agent',
      'x-forwarded-for': '192.168.1.1',
    },
    body: {},
    ip: '192.168.1.1',
    ...overrides,
  }),
  
  createMockResponse: () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    end: vi.fn(),
  }),
  
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  generateTestData: {
    cardId: () => `CARD${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    requestId: () => `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-test`,
    ipAddress: () => `192.168.1.${Math.floor(Math.random() * 255)}`,
    amount: () => Math.round((Math.random() * 100 + 1) * 100) / 100,
  },
};

// Extend global types
declare global {
  var testUtils: {
    createMockRequest: (overrides?: any) => any;
    createMockResponse: () => any;
    sleep: (ms: number) => Promise<void>;
    generateTestData: {
      cardId: () => string;
      requestId: () => string;
      ipAddress: () => string;
      amount: () => number;
    };
  };
}