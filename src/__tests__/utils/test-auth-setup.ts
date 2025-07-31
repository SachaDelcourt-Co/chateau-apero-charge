/**
 * Test Authentication Setup Utilities
 * Provides utilities for setting up authentication contexts for testing
 */

import { createClient } from '@supabase/supabase-js';

// Test authentication configuration
const TEST_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const TEST_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
const TEST_SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

// Create test Supabase client
export const testAuthClient = createClient(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY);

// Mock user data
export const mockAdminUser = {
  id: 'test-admin-user-id',
  email: 'admin@test.com',
  role: 'admin',
  user_metadata: {
    role: 'admin',
    name: 'Test Admin'
  },
  app_metadata: {
    role: 'admin'
  }
};

export const mockRegularUser = {
  id: 'test-regular-user-id',
  email: 'user@test.com',
  role: 'user',
  user_metadata: {
    role: 'user',
    name: 'Test User'
  },
  app_metadata: {
    role: 'user'
  }
};

// Mock JWT tokens
export const mockAdminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LWFkbWluLXVzZXItaWQiLCJlbWFpbCI6ImFkbWluQHRlc3QuY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.test-admin-signature';
export const mockUserToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXJlZ3VsYXItdXNlci1pZCIsImVtYWlsIjoidXNlckB0ZXN0LmNvbSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.test-user-signature';

// Authentication setup utilities
export class TestAuthSetup {
  private static instance: TestAuthSetup;
  private currentUser: any = null;
  private currentToken: string | null = null;

  static getInstance(): TestAuthSetup {
    if (!TestAuthSetup.instance) {
      TestAuthSetup.instance = new TestAuthSetup();
    }
    return TestAuthSetup.instance;
  }

  /**
   * Set up admin authentication context
   */
  async setupAdminAuth(): Promise<{ user: any; token: string }> {
    this.currentUser = mockAdminUser;
    this.currentToken = mockAdminToken;

    // Mock the Supabase auth state
    jest.spyOn(testAuthClient.auth, 'getUser').mockResolvedValue({
      data: { user: mockAdminUser },
      error: null
    });

    jest.spyOn(testAuthClient.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: mockAdminToken,
          refresh_token: 'mock-refresh-token',
          user: mockAdminUser,
          expires_at: 9999999999,
          expires_in: 3600,
          token_type: 'bearer'
        }
      },
      error: null
    });

    return { user: mockAdminUser, token: mockAdminToken };
  }

  /**
   * Set up regular user authentication context
   */
  async setupUserAuth(): Promise<{ user: any; token: string }> {
    this.currentUser = mockRegularUser;
    this.currentToken = mockUserToken;

    jest.spyOn(testAuthClient.auth, 'getUser').mockResolvedValue({
      data: { user: mockRegularUser },
      error: null
    });

    jest.spyOn(testAuthClient.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: mockUserToken,
          refresh_token: 'mock-refresh-token',
          user: mockRegularUser,
          expires_at: 9999999999,
          expires_in: 3600,
          token_type: 'bearer'
        }
      },
      error: null
    });

    return { user: mockRegularUser, token: mockUserToken };
  }

  /**
   * Set up unauthenticated context
   */
  async setupUnauthenticatedContext(): Promise<void> {
    this.currentUser = null;
    this.currentToken = null;

    jest.spyOn(testAuthClient.auth, 'getUser').mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' }
    });

    jest.spyOn(testAuthClient.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: { message: 'No session found' }
    });
  }

  /**
   * Get current authentication context
   */
  getCurrentAuth(): { user: any; token: string | null } {
    return {
      user: this.currentUser,
      token: this.currentToken
    };
  }

  /**
   * Create authorization headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.currentToken) {
      return {};
    }

    return {
      'Authorization': `Bearer ${this.currentToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Mock fetch requests with authentication
   */
  mockAuthenticatedFetch(mockResponse: any, status: number = 200): jest.SpyInstance {
    return jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Headers({
        'Content-Type': 'application/json'
      }),
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
      blob: async () => new Blob([JSON.stringify(mockResponse)], { type: 'application/json' })
    } as Response);
  }

  /**
   * Mock XML file download response
   */
  mockXMLDownloadResponse(xmlContent: string): jest.SpyInstance {
    return jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/xml',
        'Content-Disposition': 'attachment; filename="refunds.xml"',
        'X-Message-ID': 'TEST_MSG_001',
        'X-Transaction-Count': '2',
        'X-Total-Amount': '41.25'
      }),
      json: async () => { throw new Error('Not JSON'); },
      text: async () => xmlContent,
      blob: async () => new Blob([xmlContent], { type: 'application/xml' })
    } as Response);
  }

  /**
   * Clean up authentication mocks
   */
  cleanup(): void {
    this.currentUser = null;
    this.currentToken = null;
    jest.restoreAllMocks();
  }

  /**
   * Validate authentication setup
   */
  validateAuthSetup(): boolean {
    return this.currentUser !== null && this.currentToken !== null;
  }
}

// Export singleton instance
export const testAuthSetup = TestAuthSetup.getInstance();

// Mock authentication providers
export const mockAuthProviders = {
  supabase: {
    signIn: jest.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    getUser: jest.fn().mockResolvedValue({ data: { user: mockAdminUser }, error: null }),
    getSession: jest.fn().mockResolvedValue({
      data: {
        session: {
          access_token: mockAdminToken,
          user: mockAdminUser
        }
      },
      error: null
    })
  }
};

// Authentication test helpers
export const authTestHelpers = {
  /**
   * Assert user has admin role
   */
  assertAdminRole: (user: any) => {
    expect(user).toBeDefined();
    expect(user.role).toBe('admin');
    expect(user.user_metadata?.role).toBe('admin');
  },

  /**
   * Assert user has regular role
   */
  assertUserRole: (user: any) => {
    expect(user).toBeDefined();
    expect(user.role).toBe('user');
    expect(user.user_metadata?.role).toBe('user');
  },

  /**
   * Assert user is unauthenticated
   */
  assertUnauthenticated: (user: any) => {
    expect(user).toBeNull();
  },

  /**
   * Assert valid JWT token
   */
  assertValidToken: (token: string) => {
    expect(token).toBeDefined();
    expect(token).toMatch(/^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
  }
};

// Environment validation for authentication tests
export const validateAuthTestEnvironment = (): boolean => {
  const requiredEnvVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
  ];

  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    console.warn(`Missing auth test environment variables: ${missing.join(', ')}`);
    return false;
  }

  return true;
};