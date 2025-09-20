// FlowReader Feedback API Client
// Privacy-first feedback submission with rate limiting and validation

import type {
  FeedbackSubmission,
  FeedbackFormData,
  FeedbackApiResponse,
  FeedbackStatsResponse
} from './types';
import {
  AnonymousSessionManager,
  FeedbackFeatureToggle,
  FeedbackValidator,
  PrivacyHelper
} from './utils';

export class FeedbackApiClient {
  private static readonly API_BASE = '/api/feedback';
  private static readonly RATE_LIMIT_KEY = 'feedback_rate_limit';
  private static readonly RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
  private static readonly MAX_REQUESTS_PER_WINDOW = 5;

  // Submit feedback with privacy controls and validation
  static async submitFeedback(formData: FeedbackFormData): Promise<FeedbackApiResponse> {
    try {
      // Check feature toggle
      if (!FeedbackFeatureToggle.isEnabledForUser(PrivacyHelper.getCurrentRoute())) {
        return {
          success: false,
          error: 'Feedback system is currently unavailable'
        };
      }

      // Check session limits
      if (!FeedbackFeatureToggle.canSubmitFeedback()) {
        return {
          success: false,
          error: 'Maximum feedback submissions reached for this session'
        };
      }

      // Check rate limiting
      if (!this.checkRateLimit()) {
        return {
          success: false,
          error: 'Too many feedback requests. Please try again later.'
        };
      }

      // Validate form data
      const validation = FeedbackValidator.validateForm(formData);
      if (!validation.isValid) {
        return {
          success: false,
          error: Object.values(validation.errors)[0] || 'Invalid form data'
        };
      }

      // Get anonymous session
      const session = AnonymousSessionManager.getOrCreateSession();

      // Prepare submission with privacy controls
      const submission: FeedbackSubmission = {
        ...formData,
        sessionId: session.id,
        timestamp: new Date().toISOString(),
        userAgent: PrivacyHelper.sanitizeUserAgent(navigator.userAgent),
        route: PrivacyHelper.getCurrentRoute()
      };

      // Submit to API
      const response = await fetch(`${this.API_BASE}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submission)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const result: FeedbackApiResponse = await response.json();

      if (result.success) {
        // Update session on successful submission
        AnonymousSessionManager.incrementFeedbackCount();
        this.recordRateLimitRequest();
      }

      return result;

    } catch (error) {
      console.error('Feedback submission error:', error);
      return {
        success: false,
        error: 'Network error. Please check your connection and try again.'
      };
    }
  }

  // Get feedback statistics (for admin dashboard)
  static async getFeedbackStats(): Promise<FeedbackStatsResponse | null> {
    try {
      const response = await fetch(`${this.API_BASE}/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch feedback stats:', response.statusText);
        return null;
      }

      return await response.json();

    } catch (error) {
      console.error('Error fetching feedback stats:', error);
      return null;
    }
  }

  // Client-side rate limiting
  private static checkRateLimit(): boolean {
    if (typeof window === 'undefined') {
      return true; // Allow on server side
    }

    try {
      const stored = localStorage.getItem(this.RATE_LIMIT_KEY);
      const now = Date.now();

      if (!stored) {
        return true;
      }

      const requests: number[] = JSON.parse(stored);

      // Filter out requests outside the current window
      const recentRequests = requests.filter(timestamp =>
        now - timestamp < this.RATE_LIMIT_WINDOW
      );

      return recentRequests.length < this.MAX_REQUESTS_PER_WINDOW;

    } catch (error) {
      console.warn('Rate limit check failed, allowing request');
      return true;
    }
  }

  private static recordRateLimitRequest(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(this.RATE_LIMIT_KEY);
      const now = Date.now();

      let requests: number[] = stored ? JSON.parse(stored) : [];

      // Add current request
      requests.push(now);

      // Clean up old requests
      requests = requests.filter(timestamp =>
        now - timestamp < this.RATE_LIMIT_WINDOW
      );

      localStorage.setItem(this.RATE_LIMIT_KEY, JSON.stringify(requests));

    } catch (error) {
      console.warn('Failed to record rate limit request');
    }
  }

  // Utility method to test feature availability
  static isFeatureAvailable(): boolean {
    return FeedbackFeatureToggle.isEnabledForUser(PrivacyHelper.getCurrentRoute()) &&
           FeedbackFeatureToggle.canSubmitFeedback();
  }

  // Get current session info (for debugging/admin)
  static getSessionInfo() {
    const session = AnonymousSessionManager.getOrCreateSession();
    const config = FeedbackFeatureToggle.getConfig();

    return {
      sessionId: session.id,
      feedbackCount: session.feedbackCount,
      maxSubmissions: config.maxSubmissionsPerSession,
      canSubmit: FeedbackFeatureToggle.canSubmitFeedback(),
      isEnabled: FeedbackFeatureToggle.isEnabledForUser(),
      currentRoute: PrivacyHelper.getCurrentRoute()
    };
  }
}

// Export convenience functions
export const submitFeedback = FeedbackApiClient.submitFeedback.bind(FeedbackApiClient);
export const getFeedbackStats = FeedbackApiClient.getFeedbackStats.bind(FeedbackApiClient);
export const isFeatureAvailable = FeedbackApiClient.isFeatureAvailable.bind(FeedbackApiClient);
export const getSessionInfo = FeedbackApiClient.getSessionInfo.bind(FeedbackApiClient);