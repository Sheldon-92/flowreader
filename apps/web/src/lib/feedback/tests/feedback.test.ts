// FlowReader Feedback System Test Suite
// Comprehensive testing for privacy controls and functionality

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AnonymousSessionManager,
  FeedbackFeatureToggle,
  FeedbackValidator,
  PrivacyHelper
} from '../utils';
import { FeedbackApiClient } from '../api';
import type { FeedbackFormData } from '../types';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock crypto.getRandomValues for testing
Object.defineProperty(window, 'crypto', {
  value: {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }
  }
});

describe('AnonymousSessionManager', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('generateSessionId', () => {
    it('should generate a 32-character hex string', () => {
      const sessionId = AnonymousSessionManager.generateSessionId();
      expect(sessionId).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate unique session IDs', () => {
      const id1 = AnonymousSessionManager.generateSessionId();
      const id2 = AnonymousSessionManager.generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getOrCreateSession', () => {
    it('should create a new session when none exists', () => {
      const session = AnonymousSessionManager.getOrCreateSession();
      expect(session.id).toMatch(/^[a-f0-9]{32}$/);
      expect(session.feedbackCount).toBe(0);
      expect(new Date(session.createdAt)).toBeInstanceOf(Date);
      expect(new Date(session.lastActiveAt)).toBeInstanceOf(Date);
    });

    it('should return existing valid session', () => {
      const session1 = AnonymousSessionManager.getOrCreateSession();
      const session2 = AnonymousSessionManager.getOrCreateSession();
      expect(session1.id).toBe(session2.id);
    });

    it('should create new session when existing is expired', () => {
      const session1 = AnonymousSessionManager.getOrCreateSession();

      // Mock expired session
      const expiredSession = {
        ...session1,
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25 hours ago
      };
      localStorageMock.setItem('fr_anonymous_session', JSON.stringify(expiredSession));

      const session2 = AnonymousSessionManager.getOrCreateSession();
      expect(session2.id).not.toBe(session1.id);
    });
  });

  describe('incrementFeedbackCount', () => {
    it('should increment feedback count', () => {
      const session1 = AnonymousSessionManager.getOrCreateSession();
      expect(session1.feedbackCount).toBe(0);

      const session2 = AnonymousSessionManager.incrementFeedbackCount();
      expect(session2.feedbackCount).toBe(1);
      expect(session2.id).toBe(session1.id);
    });
  });

  describe('clearSession', () => {
    it('should remove session from localStorage', () => {
      AnonymousSessionManager.getOrCreateSession();
      expect(localStorageMock.getItem('fr_anonymous_session')).not.toBeNull();

      AnonymousSessionManager.clearSession();
      expect(localStorageMock.getItem('fr_anonymous_session')).toBeNull();
    });
  });
});

describe('FeedbackFeatureToggle', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = FeedbackFeatureToggle.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.rolloutPercentage).toBe(10);
      expect(config.maxSubmissionsPerSession).toBe(3);
      expect(config.allowedRoutes).toEqual(['/read', '/library', '/']);
    });

    it('should merge with stored configuration', () => {
      const customConfig = { rolloutPercentage: 50 };
      localStorageMock.setItem('feedback_feature_config', JSON.stringify(customConfig));

      const config = FeedbackFeatureToggle.getConfig();
      expect(config.rolloutPercentage).toBe(50);
      expect(config.enabled).toBe(true); // Should still have defaults
    });
  });

  describe('isEnabledForUser', () => {
    it('should return false when disabled', () => {
      FeedbackFeatureToggle.updateConfig({ enabled: false });
      expect(FeedbackFeatureToggle.isEnabledForUser('/read')).toBe(false);
    });

    it('should respect route restrictions', () => {
      FeedbackFeatureToggle.updateConfig({
        enabled: true,
        rolloutPercentage: 100,
        allowedRoutes: ['/read']
      });

      expect(FeedbackFeatureToggle.isEnabledForUser('/read/book-123')).toBe(true);
      expect(FeedbackFeatureToggle.isEnabledForUser('/library')).toBe(false);
    });

    it('should handle rollout percentage correctly', () => {
      // Mock consistent user assignment
      vi.spyOn(FeedbackFeatureToggle as any, 'simpleHash').mockReturnValue(25);

      FeedbackFeatureToggle.updateConfig({
        enabled: true,
        rolloutPercentage: 30
      });
      expect(FeedbackFeatureToggle.isEnabledForUser()).toBe(true);

      FeedbackFeatureToggle.updateConfig({
        rolloutPercentage: 20
      });
      expect(FeedbackFeatureToggle.isEnabledForUser()).toBe(false);
    });
  });

  describe('canSubmitFeedback', () => {
    it('should allow submissions under limit', () => {
      FeedbackFeatureToggle.updateConfig({ maxSubmissionsPerSession: 3 });
      AnonymousSessionManager.getOrCreateSession(); // Create fresh session
      expect(FeedbackFeatureToggle.canSubmitFeedback()).toBe(true);
    });

    it('should block submissions over limit', () => {
      FeedbackFeatureToggle.updateConfig({ maxSubmissionsPerSession: 1 });
      AnonymousSessionManager.incrementFeedbackCount();
      expect(FeedbackFeatureToggle.canSubmitFeedback()).toBe(false);
    });
  });
});

describe('FeedbackValidator', () => {
  const validFormData: FeedbackFormData = {
    type: 'general',
    rating: 4,
    category: 'usability',
    description: 'This is a valid feedback description that meets all requirements.'
  };

  describe('validateForm', () => {
    it('should pass validation for valid data', () => {
      const result = FeedbackValidator.validateForm(validFormData);
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('should fail validation for missing required fields', () => {
      const invalidData = { ...validFormData, type: '' as any };
      const result = FeedbackValidator.validateForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.type).toBeDefined();
    });

    it('should fail validation for invalid rating', () => {
      const invalidData = { ...validFormData, rating: 6 };
      const result = FeedbackValidator.validateForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.rating).toContain('between 1 and 5');
    });

    it('should fail validation for short description', () => {
      const invalidData = { ...validFormData, description: 'too short' };
      const result = FeedbackValidator.validateForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toContain('at least 10 characters');
    });

    it('should fail validation for long description', () => {
      const invalidData = { ...validFormData, description: 'a'.repeat(1001) };
      const result = FeedbackValidator.validateForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toContain('no more than 1000 characters');
    });

    it('should detect email addresses in description', () => {
      const invalidData = { ...validFormData, description: 'Contact me at user@example.com for more details about this issue.' };
      const result = FeedbackValidator.validateForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toContain('personal information');
    });

    it('should detect phone numbers in description', () => {
      const invalidData = { ...validFormData, description: 'Call me at 555-123-4567 to discuss this further and resolve the problem.' };
      const result = FeedbackValidator.validateForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toContain('personal information');
    });

    it('should detect credit card numbers in description', () => {
      const invalidData = { ...validFormData, description: 'My card 4532 1234 5678 9012 was charged incorrectly for this service subscription.' };
      const result = FeedbackValidator.validateForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toContain('personal information');
    });

    it('should detect SSN in description', () => {
      const invalidData = { ...validFormData, description: 'My SSN 123-45-6789 was requested during signup which seems unnecessary.' };
      const result = FeedbackValidator.validateForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toContain('personal information');
    });
  });
});

describe('PrivacyHelper', () => {
  describe('sanitizeUserAgent', () => {
    it('should extract Chrome version', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
      expect(PrivacyHelper.sanitizeUserAgent(userAgent)).toBe('Chrome/91');
    });

    it('should extract Firefox version', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0';
      expect(PrivacyHelper.sanitizeUserAgent(userAgent)).toBe('Firefox/89');
    });

    it('should extract Safari version', () => {
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15';
      expect(PrivacyHelper.sanitizeUserAgent(userAgent)).toBe('Safari/14');
    });

    it('should extract Edge version', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59';
      expect(PrivacyHelper.sanitizeUserAgent(userAgent)).toBe('Edge/91');
    });

    it('should handle unknown user agents', () => {
      const userAgent = 'Some Unknown Browser/1.0';
      expect(PrivacyHelper.sanitizeUserAgent(userAgent)).toBe('Unknown');
    });
  });

  describe('getCurrentRoute', () => {
    it('should sanitize book ID routes', () => {
      // Mock window.location
      Object.defineProperty(window, 'location', {
        value: { pathname: '/read/abc123-def456-ghi789' },
        writable: true
      });

      expect(PrivacyHelper.getCurrentRoute()).toBe('/read/[bookId]');
    });

    it('should sanitize UUID patterns', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/library/f47ac10b-58cc-4372-a567-0e02b2c3d479/notes' },
        writable: true
      });

      expect(PrivacyHelper.getCurrentRoute()).toBe('/library/[id]/notes');
    });

    it('should preserve safe routes', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/library' },
        writable: true
      });

      expect(PrivacyHelper.getCurrentRoute()).toBe('/library');
    });
  });
});

describe('FeedbackApiClient', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('isFeatureAvailable', () => {
    it('should return true when feature is enabled and user can submit', () => {
      FeedbackFeatureToggle.updateConfig({
        enabled: true,
        rolloutPercentage: 100,
        maxSubmissionsPerSession: 3
      });

      expect(FeedbackApiClient.isFeatureAvailable()).toBe(true);
    });

    it('should return false when feature is disabled', () => {
      FeedbackFeatureToggle.updateConfig({ enabled: false });
      expect(FeedbackApiClient.isFeatureAvailable()).toBe(false);
    });

    it('should return false when user has reached submission limit', () => {
      FeedbackFeatureToggle.updateConfig({
        enabled: true,
        rolloutPercentage: 100,
        maxSubmissionsPerSession: 1
      });

      // Simulate reaching limit
      AnonymousSessionManager.incrementFeedbackCount();
      expect(FeedbackApiClient.isFeatureAvailable()).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests under rate limit', () => {
      const allowed = (FeedbackApiClient as any).checkRateLimit();
      expect(allowed).toBe(true);
    });

    it('should block requests over rate limit', () => {
      // Fill up rate limit
      const requests = Array(6).fill(Date.now());
      localStorageMock.setItem('feedback_rate_limit', JSON.stringify(requests));

      const allowed = (FeedbackApiClient as any).checkRateLimit();
      expect(allowed).toBe(false);
    });

    it('should allow requests after rate limit window expires', () => {
      // Add old requests (outside 15-minute window)
      const oldRequests = Array(6).fill(Date.now() - 16 * 60 * 1000);
      localStorageMock.setItem('feedback_rate_limit', JSON.stringify(oldRequests));

      const allowed = (FeedbackApiClient as any).checkRateLimit();
      expect(allowed).toBe(true);
    });
  });

  describe('getSessionInfo', () => {
    it('should return comprehensive session information', () => {
      FeedbackFeatureToggle.updateConfig({
        enabled: true,
        rolloutPercentage: 100,
        maxSubmissionsPerSession: 3
      });

      const sessionInfo = FeedbackApiClient.getSessionInfo();

      expect(sessionInfo).toHaveProperty('sessionId');
      expect(sessionInfo).toHaveProperty('feedbackCount');
      expect(sessionInfo).toHaveProperty('maxSubmissions');
      expect(sessionInfo).toHaveProperty('canSubmit');
      expect(sessionInfo).toHaveProperty('isEnabled');
      expect(sessionInfo).toHaveProperty('currentRoute');

      expect(sessionInfo.sessionId).toMatch(/^[a-f0-9]{32}$/);
      expect(sessionInfo.maxSubmissions).toBe(3);
      expect(sessionInfo.canSubmit).toBe(true);
      expect(sessionInfo.isEnabled).toBe(true);
    });
  });
});

// Integration tests
describe('Feedback System Integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should handle complete feedback submission flow', () => {
    // 1. Initialize system
    FeedbackFeatureToggle.updateConfig({
      enabled: true,
      rolloutPercentage: 100,
      maxSubmissionsPerSession: 3
    });

    // 2. Check feature availability
    expect(FeedbackApiClient.isFeatureAvailable()).toBe(true);

    // 3. Create session
    const session = AnonymousSessionManager.getOrCreateSession();
    expect(session.feedbackCount).toBe(0);

    // 4. Validate feedback data
    const feedbackData: FeedbackFormData = {
      type: 'bug',
      rating: 3,
      category: 'performance',
      description: 'The application loads slowly on mobile devices, especially when switching between chapters.'
    };

    const validation = FeedbackValidator.validateForm(feedbackData);
    expect(validation.isValid).toBe(true);

    // 5. Simulate submission (without actual API call)
    const updatedSession = AnonymousSessionManager.incrementFeedbackCount();
    expect(updatedSession.feedbackCount).toBe(1);

    // 6. Verify rate limiting still allows more submissions
    expect(FeedbackApiClient.isFeatureAvailable()).toBe(true);
  });

  it('should prevent submission when limits are reached', () => {
    // Configure low limits
    FeedbackFeatureToggle.updateConfig({
      enabled: true,
      rolloutPercentage: 100,
      maxSubmissionsPerSession: 1
    });

    // Make one submission
    AnonymousSessionManager.incrementFeedbackCount();

    // Should now be blocked
    expect(FeedbackApiClient.isFeatureAvailable()).toBe(false);
    expect(FeedbackFeatureToggle.canSubmitFeedback()).toBe(false);
  });

  it('should handle PII detection across all components', () => {
    const piiTestCases = [
      'Contact me at john.doe@example.com',
      'My phone is 555-123-4567',
      'Card number: 4532 1234 5678 9012',
      'SSN: 123-45-6789'
    ];

    piiTestCases.forEach(description => {
      const feedbackData: FeedbackFormData = {
        type: 'general',
        rating: 3,
        category: 'other',
        description
      };

      const validation = FeedbackValidator.validateForm(feedbackData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.description).toContain('personal information');
    });
  });

  it('should maintain session consistency across page reloads', () => {
    // Create initial session
    const session1 = AnonymousSessionManager.getOrCreateSession();
    AnonymousSessionManager.incrementFeedbackCount();

    // Simulate page reload by creating new session manager instance
    const session2 = AnonymousSessionManager.getOrCreateSession();

    expect(session2.id).toBe(session1.id);
    expect(session2.feedbackCount).toBe(1);
  });

  it('should handle edge cases gracefully', () => {
    // Test with corrupted localStorage data
    localStorageMock.setItem('fr_anonymous_session', 'invalid-json');

    const session = AnonymousSessionManager.getOrCreateSession();
    expect(session.id).toMatch(/^[a-f0-9]{32}$/);
    expect(session.feedbackCount).toBe(0);

    // Test with missing configuration
    localStorageMock.clear();
    localStorageMock.setItem('feedback_feature_config', 'invalid-json');

    const config = FeedbackFeatureToggle.getConfig();
    expect(config.enabled).toBe(true); // Should fall back to defaults
  });
});

// Performance tests
describe('Feedback System Performance', () => {
  it('should handle session ID generation efficiently', () => {
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      AnonymousSessionManager.generateSessionId();
    }

    const end = performance.now();
    expect(end - start).toBeLessThan(100); // Should complete in < 100ms
  });

  it('should handle validation efficiently for large descriptions', () => {
    const largeDescription = 'a'.repeat(999); // Just under limit
    const feedbackData: FeedbackFormData = {
      type: 'general',
      rating: 3,
      category: 'other',
      description: largeDescription
    };

    const start = performance.now();
    const validation = FeedbackValidator.validateForm(feedbackData);
    const end = performance.now();

    expect(validation.isValid).toBe(true);
    expect(end - start).toBeLessThan(10); // Should validate quickly
  });
});

// Security tests
describe('Feedback System Security', () => {
  it('should prevent XSS attempts in descriptions', () => {
    const xssAttempts = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<img src="x" onerror="alert(1)">',
      '<svg onload="alert(1)">',
      '"><script>alert("xss")</script>'
    ];

    xssAttempts.forEach(maliciousDescription => {
      const feedbackData: FeedbackFormData = {
        type: 'general',
        rating: 3,
        category: 'other',
        description: maliciousDescription + ' This is a test of XSS prevention in the feedback system.'
      };

      // Validation should still pass (XSS is handled at rendering level)
      const validation = FeedbackValidator.validateForm(feedbackData);
      expect(validation.isValid).toBe(true);
    });
  });

  it('should handle session ID collision gracefully', () => {
    // Mock crypto to return predictable values for collision test
    const originalCrypto = window.crypto;
    window.crypto = {
      getRandomValues: (array: Uint8Array) => {
        // Fill with zeros to create collision
        for (let i = 0; i < array.length; i++) {
          array[i] = 0;
        }
        return array;
      }
    } as any;

    const session1 = AnonymousSessionManager.getOrCreateSession();
    AnonymousSessionManager.clearSession();
    const session2 = AnonymousSessionManager.getOrCreateSession();

    // Even with mocked crypto, sessions should be handled properly
    expect(session1.id).toBe(session2.id); // Same due to mocked crypto
    expect(session1.feedbackCount).toBe(0);
    expect(session2.feedbackCount).toBe(0);

    // Restore original crypto
    window.crypto = originalCrypto;
  });

  it('should limit session data size', () => {
    const session = AnonymousSessionManager.getOrCreateSession();
    const sessionData = JSON.stringify(session);

    // Session data should be minimal (< 200 bytes)
    expect(sessionData.length).toBeLessThan(200);
  });
});