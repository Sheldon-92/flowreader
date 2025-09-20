// FlowReader A/B Testing Manager
// Manages controlled experimentation for UX improvements

import { AnonymousSessionManager } from '../utils';

export interface ABTestConfig {
  testId: string;
  name: string;
  description: string;
  enabled: boolean;
  trafficAllocation: number; // Percentage (0-100)
  variants: ABTestVariant[];
  startDate: string;
  endDate?: string;
  targetMetrics: string[];
}

export interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  weight: number; // Relative weight for traffic distribution
  isControl: boolean;
}

export interface ABTestAssignment {
  testId: string;
  variantId: string;
  assignedAt: string;
  sessionId: string;
}

export class ABTestManager {
  private static readonly ASSIGNMENT_KEY = 'fr_ab_assignments';
  private static readonly TRACKING_KEY = 'fr_ab_tracking';

  // Active A/B tests configuration
  private static readonly ACTIVE_TESTS: ABTestConfig[] = [
    {
      testId: 'ai_interaction_v1',
      name: 'AI Interaction Optimization',
      description: 'Test improved AI response speed and context retention',
      enabled: true,
      trafficAllocation: 20, // 20% of users
      variants: [
        {
          id: 'control',
          name: 'Current AI Implementation',
          description: 'Existing AI interaction system',
          weight: 50,
          isControl: true
        },
        {
          id: 'optimized',
          name: 'Optimized AI with Caching',
          description: 'AI with response caching and context improvements',
          weight: 50,
          isControl: false
        }
      ],
      startDate: '2024-01-15T00:00:00Z',
      endDate: '2024-02-15T00:00:00Z',
      targetMetrics: ['ai_response_time', 'ai_satisfaction_rating', 'ai_conversation_length']
    },
    {
      testId: 'navigation_mobile_v1',
      name: 'Mobile Navigation Enhancement',
      description: 'Test improved mobile reading navigation with gestures',
      enabled: true,
      trafficAllocation: 15, // 15% of users
      variants: [
        {
          id: 'control',
          name: 'Current Navigation',
          description: 'Existing mobile navigation system',
          weight: 50,
          isControl: true
        },
        {
          id: 'enhanced',
          name: 'Gesture-Based Navigation',
          description: 'Enhanced navigation with swipe gestures and improved UI',
          weight: 50,
          isControl: false
        }
      ],
      startDate: '2024-01-15T00:00:00Z',
      endDate: '2024-02-15T00:00:00Z',
      targetMetrics: ['navigation_efficiency', 'mobile_satisfaction', 'session_duration']
    },
    {
      testId: 'performance_loading_v1',
      name: 'Progressive Loading Optimization',
      description: 'Test progressive loading and improved loading states',
      enabled: true,
      trafficAllocation: 10, // 10% of users
      variants: [
        {
          id: 'control',
          name: 'Current Loading',
          description: 'Existing loading experience',
          weight: 50,
          isControl: true
        },
        {
          id: 'progressive',
          name: 'Progressive Loading',
          description: 'Progressive loading with better user feedback',
          weight: 50,
          isControl: false
        }
      ],
      startDate: '2024-01-15T00:00:00Z',
      endDate: '2024-02-15T00:00:00Z',
      targetMetrics: ['page_load_time', 'perceived_performance', 'loading_satisfaction']
    }
  ];

  /**
   * Get user's variant assignment for a specific test
   */
  static getVariantForTest(testId: string): string | null {
    const test = this.getActiveTest(testId);
    if (!test || !test.enabled) {
      return null;
    }

    // Check if user is in traffic allocation
    if (!this.isUserInTrafficAllocation(test)) {
      return null;
    }

    // Get or create assignment
    const assignments = this.getUserAssignments();
    const existingAssignment = assignments.find(a => a.testId === testId);

    if (existingAssignment) {
      return existingAssignment.variantId;
    }

    // Create new assignment
    const variantId = this.assignVariant(test);
    const assignment: ABTestAssignment = {
      testId,
      variantId,
      assignedAt: new Date().toISOString(),
      sessionId: AnonymousSessionManager.getOrCreateSession().id
    };

    this.saveAssignment(assignment);
    this.trackEvent('ab_test_assignment', {
      testId,
      variantId,
      sessionId: assignment.sessionId
    });

    return variantId;
  }

  /**
   * Check if user should see a specific variant
   */
  static isInVariant(testId: string, variantId: string): boolean {
    const assignedVariant = this.getVariantForTest(testId);
    return assignedVariant === variantId;
  }

  /**
   * Track A/B test events for analysis
   */
  static trackEvent(eventName: string, properties: Record<string, any>): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const tracking = this.getTrackingData();
      const event = {
        eventName,
        properties,
        timestamp: new Date().toISOString(),
        sessionId: AnonymousSessionManager.getOrCreateSession().id
      };

      tracking.events.push(event);

      // Keep only last 100 events to prevent storage bloat
      if (tracking.events.length > 100) {
        tracking.events = tracking.events.slice(-100);
      }

      localStorage.setItem(this.TRACKING_KEY, JSON.stringify(tracking));

      // Also send to analytics if available
      this.sendToAnalytics(event);

    } catch (error) {
      console.warn('Failed to track A/B test event:', error);
    }
  }

  /**
   * Get all active tests
   */
  static getActiveTests(): ABTestConfig[] {
    const now = new Date();
    return this.ACTIVE_TESTS.filter(test => {
      if (!test.enabled) return false;

      const startDate = new Date(test.startDate);
      if (now < startDate) return false;

      if (test.endDate) {
        const endDate = new Date(test.endDate);
        if (now > endDate) return false;
      }

      return true;
    });
  }

  /**
   * Get user's current assignments for debugging
   */
  static getUserTestStatus(): Record<string, any> {
    const assignments = this.getUserAssignments();
    const activeTests = this.getActiveTests();

    return {
      assignments: assignments.map(a => ({
        testId: a.testId,
        variantId: a.variantId,
        assignedAt: a.assignedAt
      })),
      activeTests: activeTests.map(t => ({
        testId: t.testId,
        name: t.name,
        trafficAllocation: t.trafficAllocation,
        userInTest: this.isUserInTrafficAllocation(t)
      })),
      sessionId: AnonymousSessionManager.getOrCreateSession().id
    };
  }

  // Private helper methods

  private static getActiveTest(testId: string): ABTestConfig | null {
    return this.getActiveTests().find(test => test.testId === testId) || null;
  }

  private static isUserInTrafficAllocation(test: ABTestConfig): boolean {
    if (test.trafficAllocation >= 100) return true;
    if (test.trafficAllocation <= 0) return false;

    // Consistent allocation based on session ID
    const session = AnonymousSessionManager.getOrCreateSession();
    const hash = this.simpleHash(session.id + test.testId);
    const userPercentile = hash % 100;

    return userPercentile < test.trafficAllocation;
  }

  private static assignVariant(test: ABTestConfig): string {
    const session = AnonymousSessionManager.getOrCreateSession();
    const hash = this.simpleHash(session.id + test.testId + 'variant');

    // Calculate cumulative weights
    let totalWeight = test.variants.reduce((sum, v) => sum + v.weight, 0);
    let randomValue = hash % totalWeight;

    for (const variant of test.variants) {
      randomValue -= variant.weight;
      if (randomValue < 0) {
        return variant.id;
      }
    }

    // Fallback to control
    return test.variants.find(v => v.isControl)?.id || test.variants[0].id;
  }

  private static getUserAssignments(): ABTestAssignment[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(this.ASSIGNMENT_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load A/B test assignments:', error);
      return [];
    }
  }

  private static saveAssignment(assignment: ABTestAssignment): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const assignments = this.getUserAssignments();
      const existingIndex = assignments.findIndex(a => a.testId === assignment.testId);

      if (existingIndex >= 0) {
        assignments[existingIndex] = assignment;
      } else {
        assignments.push(assignment);
      }

      localStorage.setItem(this.ASSIGNMENT_KEY, JSON.stringify(assignments));
    } catch (error) {
      console.warn('Failed to save A/B test assignment:', error);
    }
  }

  private static getTrackingData(): { events: any[] } {
    if (typeof window === 'undefined') {
      return { events: [] };
    }

    try {
      const stored = localStorage.getItem(this.TRACKING_KEY);
      return stored ? JSON.parse(stored) : { events: [] };
    } catch (error) {
      return { events: [] };
    }
  }

  private static sendToAnalytics(event: any): void {
    // Integration point for analytics services
    // Could send to Google Analytics, Mixpanel, etc.
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', event.eventName, {
        custom_parameter_1: event.properties.testId,
        custom_parameter_2: event.properties.variantId
      });
    }
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
}

// Export convenience functions
export const getVariantForTest = ABTestManager.getVariantForTest.bind(ABTestManager);
export const isInVariant = ABTestManager.isInVariant.bind(ABTestManager);
export const trackEvent = ABTestManager.trackEvent.bind(ABTestManager);
export const getUserTestStatus = ABTestManager.getUserTestStatus.bind(ABTestManager);