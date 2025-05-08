import '@testing-library/jest-dom';
import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock browser APIs not available in test environment
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollTo with correct function signature
window.scrollTo = vi.fn().mockImplementation((x, y) => {});

// Add missing dom types for testing-library
declare global {
  namespace Vi {
    interface JestAssertion {
      toBeInTheDocument: () => void;
      toBeVisible: () => void;
      toHaveTextContent: (text: string) => void;
      toHaveValue: (value: string | number | string[]) => void;
      toHaveAttribute: (attr: string, value?: string) => void;
      toBeDisabled: () => void;
      toBeEnabled: () => void;
      toBeChecked: () => void;
      toBePartiallyChecked: () => void;
      toHaveClass: (className: string) => void;
      toHaveFocus: () => void;
      toBeRequired: () => void;
      toBeValid: () => void;
      toBeInvalid: () => void;
      toBeEmptyDOMElement: () => void;
      toHaveDescription: (text: string) => void;
    }
  }
} 