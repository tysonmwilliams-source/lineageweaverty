/**
 * Test Setup File
 *
 * This file runs before each test file and sets up the testing environment.
 * It configures:
 * - Jest DOM matchers for better assertions
 * - Fake IndexedDB for database testing
 * - Global mocks and utilities
 */

import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Clean up after each test (unmount React components)
afterEach(() => {
  cleanup();
});

// Set up fake IndexedDB for database tests
import 'fake-indexeddb/auto';

// Mock window.matchMedia (used by some components for responsive design)
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

// Mock ResizeObserver (used by some components)
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver (used for lazy loading)
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Suppress console errors/warnings during tests (optional)
// Uncomment if tests are too noisy:
// vi.spyOn(console, 'error').mockImplementation(() => {});
// vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock Firebase (will be set up per-test as needed)
vi.mock('../config/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn(),
  },
  db: {},
}));

// Global test utilities
global.testUtils = {
  /**
   * Wait for async operations to complete
   */
  async waitFor(callback, timeout = 1000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        await callback();
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    await callback(); // Final attempt, let it throw
  },

  /**
   * Create a mock person object
   */
  createMockPerson(overrides = {}) {
    return {
      id: Math.floor(Math.random() * 10000),
      firstName: 'Test',
      lastName: 'Person',
      dateOfBirth: '1000',
      dateOfDeath: null,
      houseId: null,
      gender: 'male',
      legitimacyStatus: 'legitimate',
      bastardStatus: null,
      notes: '',
      ...overrides,
    };
  },

  /**
   * Create a mock house object
   */
  createMockHouse(overrides = {}) {
    return {
      id: Math.floor(Math.random() * 10000),
      houseName: 'Test House',
      houseType: 'main',
      parentHouseId: null,
      colorCode: '#3B82F6',
      notes: '',
      ...overrides,
    };
  },

  /**
   * Create a mock relationship object
   */
  createMockRelationship(overrides = {}) {
    return {
      id: Math.floor(Math.random() * 10000),
      person1Id: 1,
      person2Id: 2,
      relationshipType: 'parent',
      ...overrides,
    };
  },
};
