// FlowReader Feedback System Utilities
// Privacy-first utilities for anonymous session tracking and feature toggles

import type {
  AnonymousSession,
  FeedbackFeatureConfig,
  FeedbackFormData,
  ValidationResult,
  ValidationRule
} from './types';

// Anonymous session management
export class AnonymousSessionManager {
  private static readonly SESSION_KEY = 'fr_anonymous_session';
  private static readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  static generateSessionId(): string {
    // Generate cryptographically secure anonymous ID
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  static getOrCreateSession(): AnonymousSession {
    if (typeof window === 'undefined') {
      // Server-side: return minimal session
      return {
        id: this.generateSessionId(),
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        feedbackCount: 0
      };
    }

    const stored = localStorage.getItem(this.SESSION_KEY);
    const now = new Date().toISOString();

    if (stored) {
      try {
        const session: AnonymousSession = JSON.parse(stored);
        const sessionAge = Date.now() - new Date(session.createdAt).getTime();

        // Check if session is still valid
        if (sessionAge < this.SESSION_DURATION) {
          // Update last active time
          session.lastActiveAt = now;
          this.saveSession(session);
          return session;
        }
      } catch (error) {
        console.warn('Invalid session data, creating new session');
      }
    }

    // Create new session
    const newSession: AnonymousSession = {
      id: this.generateSessionId(),
      createdAt: now,
      lastActiveAt: now,
      feedbackCount: 0
    };

    this.saveSession(newSession);
    return newSession;
  }

  static incrementFeedbackCount(): AnonymousSession {
    const session = this.getOrCreateSession();
    session.feedbackCount += 1;
    session.lastActiveAt = new Date().toISOString();
    this.saveSession(session);
    return session;
  }

  private static saveSession(session: AnonymousSession): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    }
  }

  static clearSession(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.SESSION_KEY);
    }
  }
}

// Feature toggle system
export class FeedbackFeatureToggle {
  private static readonly CONFIG_KEY = 'feedback_feature_config';
  private static readonly USER_ROLLOUT_KEY = 'feedback_user_rollout';

  // Default configuration
  private static readonly DEFAULT_CONFIG: FeedbackFeatureConfig = {
    enabled: true,
    rolloutPercentage: 10, // Start with 10% rollout
    maxSubmissionsPerSession: 3,
    allowedRoutes: ['/read', '/library', '/'] // Only show on main app routes
  };

  static getConfig(): FeedbackFeatureConfig {
    if (typeof window === 'undefined') {
      return this.DEFAULT_CONFIG;
    }

    try {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      if (stored) {
        return { ...this.DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Invalid feature config, using defaults');
    }

    return this.DEFAULT_CONFIG;
  }

  static isEnabledForUser(route?: string): boolean {
    const config = this.getConfig();

    if (!config.enabled) {
      return false;
    }

    // Check route restrictions
    if (config.allowedRoutes && route) {
      const isAllowed = config.allowedRoutes.some(allowedRoute =>
        route.startsWith(allowedRoute)
      );
      if (!isAllowed) {
        return false;
      }
    }

    // Check rollout percentage
    return this.isInRollout(config.rolloutPercentage);
  }

  private static isInRollout(percentage: number): boolean {
    if (percentage >= 100) return true;
    if (percentage <= 0) return false;

    // Consistent user assignment based on session
    let rolloutDecision = localStorage.getItem(this.USER_ROLLOUT_KEY);

    if (!rolloutDecision) {
      // Generate consistent decision for this user
      const session = AnonymousSessionManager.getOrCreateSession();
      const hash = this.simpleHash(session.id);
      const userPercentile = hash % 100;
      rolloutDecision = (userPercentile < percentage).toString();
      localStorage.setItem(this.USER_ROLLOUT_KEY, rolloutDecision);
    }

    return rolloutDecision === 'true';
  }

  private static simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  static canSubmitFeedback(): boolean {
    const config = this.getConfig();
    const session = AnonymousSessionManager.getOrCreateSession();
    return session.feedbackCount < config.maxSubmissionsPerSession;
  }

  // Admin functions for updating config
  static updateConfig(newConfig: Partial<FeedbackFeatureConfig>): void {
    const currentConfig = this.getConfig();
    const updatedConfig = { ...currentConfig, ...newConfig };

    if (typeof window !== 'undefined') {
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(updatedConfig));
    }
  }
}

// Form validation utilities
export class FeedbackValidator {
  private static readonly VALIDATION_RULES: ValidationRule[] = [
    {
      field: 'type',
      required: true
    },
    {
      field: 'rating',
      required: true,
      custom: (value: number) => {
        if (value < 1 || value > 5) {
          return 'Rating must be between 1 and 5';
        }
        return null;
      }
    },
    {
      field: 'category',
      required: true
    },
    {
      field: 'description',
      required: true,
      minLength: 10,
      maxLength: 1000,
      custom: (value: string) => {
        if (value.trim().length === 0) {
          return 'Description cannot be empty';
        }
        // Check for potential PII patterns (very basic)
        const piiPatterns = [
          /\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b/, // Email
          /\b\d{3}-\d{2}-\d{4}\b/, // SSN
          /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/ // Credit card
        ];

        for (const pattern of piiPatterns) {
          if (pattern.test(value)) {
            return 'Please do not include personal information in your feedback';
          }
        }

        return null;
      }
    }
  ];

  static validateForm(data: FeedbackFormData): ValidationResult {
    const errors: Record<string, string> = {};

    for (const rule of this.VALIDATION_RULES) {
      const value = data[rule.field];
      const fieldName = rule.field;

      // Check required
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors[fieldName] = `${fieldName} is required`;
        continue;
      }

      if (value === undefined || value === null || value === '') {
        continue; // Skip other validations if empty and not required
      }

      // Check min length
      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors[fieldName] = `${fieldName} must be at least ${rule.minLength} characters`;
        continue;
      }

      // Check max length
      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors[fieldName] = `${fieldName} must be no more than ${rule.maxLength} characters`;
        continue;
      }

      // Check pattern
      if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
        errors[fieldName] = `${fieldName} format is invalid`;
        continue;
      }

      // Check custom validation
      if (rule.custom) {
        const customError = rule.custom(value);
        if (customError) {
          errors[fieldName] = customError;
          continue;
        }
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}

// Privacy utilities
export class PrivacyHelper {
  static sanitizeUserAgent(userAgent: string): string {
    // Only keep browser name and major version for debugging
    const patterns = [
      { name: 'Chrome', pattern: /Chrome\/(\d+)/ },
      { name: 'Firefox', pattern: /Firefox\/(\d+)/ },
      { name: 'Safari', pattern: /Safari\/[\d.]+.*Version\/(\d+)/ },
      { name: 'Edge', pattern: /Edg\/(\d+)/ }
    ];

    for (const { name, pattern } of patterns) {
      const match = userAgent.match(pattern);
      if (match) {
        return `${name}/${match[1]}`;
      }
    }

    return 'Unknown';
  }

  static getCurrentRoute(): string {
    if (typeof window === 'undefined') {
      return '/';
    }

    const path = window.location.pathname;

    // Remove sensitive path parameters while keeping structure
    return path
      .replace(/\/read\/[a-zA-Z0-9-]+/, '/read/[bookId]')
      .replace(/\/[a-f0-9-]{36}/, '/[id]'); // Generic UUID pattern
  }

  static isLocalEnvironment(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname.includes('dev');
  }
}