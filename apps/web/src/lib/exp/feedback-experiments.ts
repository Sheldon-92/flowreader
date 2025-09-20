/**
 * Feedback Entry Experiment Controls
 *
 * A/B testing framework for optimizing feedback collection UX,
 * including trigger types, form styles, positioning, and frequency.
 */

import { getExperiments, track } from './client-sdk.js';
import type {
  FeedbackEntryExperiment,
  FeedbackVariant,
  ExperimentContext
} from '@flowreader/shared/experiments/types.js';
import type {
  FeedbackFormData,
  FeedbackType,
  FeedbackCategory
} from '../feedback/types.js';

export interface FeedbackExperimentConfig {
  experimentId: string;
  enabled: boolean;
  fallbackConfig: FeedbackUIConfig;
  trackingEnabled: boolean;
}

export interface FeedbackUIConfig {
  triggerType: 'always' | 'contextual' | 'time_based' | 'smart';
  formStyle: 'minimal' | 'detailed' | 'conversational';
  position: 'bottom_right' | 'top_bar' | 'sidebar' | 'modal';
  frequency: 'once' | 'session' | 'daily' | 'weekly';
  timing?: {
    delayMs?: number;
    afterAction?: string;
    pageLoadDelay?: number;
  };
  appearance?: {
    theme: 'light' | 'dark' | 'auto';
    size: 'compact' | 'normal' | 'large';
    animation: 'slide' | 'fade' | 'bounce' | 'none';
  };
}

export interface FeedbackInteractionContext {
  route: string;
  feature?: string;
  userAction?: string;
  sessionDuration: number;
  feedbackCount: number;
  lastFeedbackTime?: string;
  sessionId: string;
}

export interface FeedbackMetrics {
  triggerShown: boolean;
  clicked: boolean;
  formStarted: boolean;
  formCompleted: boolean;
  formAbandoned: boolean;
  completionTime?: number;
  rating?: number;
  feedbackLength?: number;
  abandonnmentStage?: 'trigger' | 'form_start' | 'form_middle' | 'form_end';
}

/**
 * Feedback Experiment Manager
 */
export class FeedbackExperimentManager {
  private config: FeedbackExperimentConfig;
  private sessionMetrics = new Map<string, FeedbackMetrics>();

  constructor(config: FeedbackExperimentConfig) {
    this.config = config;
  }

  /**
   * Get feedback UI configuration for current context
   */
  async getFeedbackConfig(context: FeedbackInteractionContext): Promise<{
    config: FeedbackUIConfig;
    shouldShow: boolean;
    experimentId?: string;
    variantId?: string;
  }> {
    if (!this.config.enabled) {
      return {
        config: this.config.fallbackConfig,
        shouldShow: this.shouldShowFeedback(context, this.config.fallbackConfig)
      };
    }

    try {
      const experiments = getExperiments();
      const result = await experiments.getExperiment(
        this.config.experimentId,
        this.buildExperimentContext(context)
      );

      if (result.variant && result.shouldTrack) {
        const variantConfig = result.variant.configuration as FeedbackUIConfig;
        const shouldShow = this.shouldShowFeedback(context, variantConfig);

        // Track exposure if feedback should be shown
        if (shouldShow && this.config.trackingEnabled) {
          await track(this.config.experimentId, 'feedback_exposure', 1, {
            route: context.route,
            feature: context.feature,
            triggerType: variantConfig.triggerType,
            formStyle: variantConfig.formStyle,
            position: variantConfig.position
          });

          // Initialize session metrics
          this.sessionMetrics.set(context.sessionId, {
            triggerShown: true,
            clicked: false,
            formStarted: false,
            formCompleted: false,
            formAbandoned: false
          });
        }

        return {
          config: variantConfig,
          shouldShow,
          experimentId: this.config.experimentId,
          variantId: result.variant.id
        };
      }
    } catch (error) {
      console.warn('Failed to get feedback experiment configuration:', error);
    }

    return {
      config: this.config.fallbackConfig,
      shouldShow: this.shouldShowFeedback(context, this.config.fallbackConfig)
    };
  }

  /**
   * Track feedback trigger interaction
   */
  async trackTriggerClick(
    context: FeedbackInteractionContext,
    experimentId?: string
  ): Promise<void> {
    if (!this.config.trackingEnabled || !experimentId) {
      return;
    }

    try {
      const experiments = getExperiments();

      await experiments.trackEngagement(
        experimentId,
        'feedback_trigger_click',
        1,
        {
          route: context.route,
          feature: context.feature,
          sessionDuration: context.sessionDuration,
          feedbackCount: context.feedbackCount
        }
      );

      // Update session metrics
      const metrics = this.sessionMetrics.get(context.sessionId);
      if (metrics) {
        metrics.clicked = true;
        this.sessionMetrics.set(context.sessionId, metrics);
      }

    } catch (error) {
      console.error('Failed to track trigger click:', error);
    }
  }

  /**
   * Track feedback form start
   */
  async trackFormStart(
    context: FeedbackInteractionContext,
    experimentId?: string
  ): Promise<void> {
    if (!this.config.trackingEnabled || !experimentId) {
      return;
    }

    try {
      const experiments = getExperiments();

      await experiments.trackEngagement(
        experimentId,
        'feedback_form_start',
        1,
        {
          route: context.route,
          feature: context.feature
        }
      );

      // Update session metrics
      const metrics = this.sessionMetrics.get(context.sessionId);
      if (metrics) {
        metrics.formStarted = true;
        this.sessionMetrics.set(context.sessionId, metrics);
      }

    } catch (error) {
      console.error('Failed to track form start:', error);
    }
  }

  /**
   * Track feedback form completion
   */
  async trackFormCompletion(
    context: FeedbackInteractionContext,
    formData: FeedbackFormData,
    completionTime: number,
    experimentId?: string
  ): Promise<void> {
    if (!this.config.trackingEnabled || !experimentId) {
      return;
    }

    try {
      const experiments = getExperiments();

      // Track completion
      await experiments.trackConversion(
        experimentId,
        'feedback_form_completion',
        1,
        {
          route: context.route,
          feature: context.feature,
          completionTime,
          feedbackType: formData.type,
          feedbackCategory: formData.category,
          rating: formData.rating,
          descriptionLength: formData.description.length
        }
      );

      // Track satisfaction
      await experiments.trackSatisfaction(
        experimentId,
        formData.rating,
        formData.description
      );

      // Track form efficiency
      await experiments.track(
        experimentId,
        'form_completion_time',
        completionTime,
        {
          descriptionLength: formData.description.length,
          feedbackType: formData.type
        }
      );

      // Update session metrics
      const metrics = this.sessionMetrics.get(context.sessionId);
      if (metrics) {
        metrics.formCompleted = true;
        metrics.completionTime = completionTime;
        metrics.rating = formData.rating;
        metrics.feedbackLength = formData.description.length;
        this.sessionMetrics.set(context.sessionId, metrics);
      }

    } catch (error) {
      console.error('Failed to track form completion:', error);
    }
  }

  /**
   * Track feedback form abandonment
   */
  async trackFormAbandonment(
    context: FeedbackInteractionContext,
    stage: 'trigger' | 'form_start' | 'form_middle' | 'form_end',
    timeSpent: number,
    experimentId?: string
  ): Promise<void> {
    if (!this.config.trackingEnabled || !experimentId) {
      return;
    }

    try {
      const experiments = getExperiments();

      await experiments.track(
        experimentId,
        'feedback_form_abandonment',
        1,
        {
          route: context.route,
          feature: context.feature,
          abandonmentStage: stage,
          timeSpent,
          feedbackCount: context.feedbackCount
        }
      );

      // Update session metrics
      const metrics = this.sessionMetrics.get(context.sessionId);
      if (metrics) {
        metrics.formAbandoned = true;
        metrics.abandonnmentStage = stage;
        this.sessionMetrics.set(context.sessionId, metrics);
      }

    } catch (error) {
      console.error('Failed to track form abandonment:', error);
    }
  }

  /**
   * Get session metrics for analysis
   */
  getSessionMetrics(sessionId: string): FeedbackMetrics | null {
    return this.sessionMetrics.get(sessionId) || null;
  }

  /**
   * Create smart trigger experiment
   */
  static createSmartTriggerExperiment(): FeedbackEntryExperiment {
    return {
      id: 'feedback_smart_triggers',
      name: 'Smart Feedback Triggers',
      description: 'Test different triggering strategies for feedback collection',
      status: 'active',
      category: 'ui_ux',
      variants: [
        {
          id: 'control_always',
          name: 'Always Show',
          description: 'Always show feedback trigger',
          allocation: 25,
          isControl: true,
          configuration: {
            triggerType: 'always',
            formStyle: 'minimal',
            position: 'bottom_right',
            frequency: 'session',
            timing: {
              delayMs: 3000
            },
            appearance: {
              theme: 'auto',
              size: 'normal',
              animation: 'slide'
            }
          }
        },
        {
          id: 'contextual_smart',
          name: 'Contextual Triggers',
          description: 'Show feedback trigger based on user context',
          allocation: 25,
          isControl: false,
          configuration: {
            triggerType: 'contextual',
            formStyle: 'detailed',
            position: 'bottom_right',
            frequency: 'daily',
            timing: {
              afterAction: 'knowledge_request'
            },
            appearance: {
              theme: 'auto',
              size: 'normal',
              animation: 'fade'
            }
          }
        },
        {
          id: 'time_based',
          name: 'Time-Based Triggers',
          description: 'Show feedback after specific time intervals',
          allocation: 25,
          isControl: false,
          configuration: {
            triggerType: 'time_based',
            formStyle: 'conversational',
            position: 'modal',
            frequency: 'weekly',
            timing: {
              delayMs: 30000, // 30 seconds
              pageLoadDelay: 5000
            },
            appearance: {
              theme: 'light',
              size: 'large',
              animation: 'bounce'
            }
          }
        },
        {
          id: 'ai_smart',
          name: 'AI-Driven Smart Triggers',
          description: 'Use AI to determine optimal feedback timing',
          allocation: 25,
          isControl: false,
          configuration: {
            triggerType: 'smart',
            formStyle: 'minimal',
            position: 'sidebar',
            frequency: 'once',
            timing: {
              afterAction: 'high_engagement'
            },
            appearance: {
              theme: 'dark',
              size: 'compact',
              animation: 'slide'
            }
          }
        }
      ],
      targeting: {
        trafficAllocation: 80,
        sessionBased: true,
        routes: ['/read/*', '/library']
      },
      metrics: [
        {
          id: 'feedback_completion_rate',
          name: 'Feedback Completion Rate',
          type: 'conversion',
          description: 'Percentage of triggered users who complete feedback',
          isPrimary: true,
          target: { value: 0.15, direction: 'increase' },
          aggregation: 'rate'
        },
        {
          id: 'feedback_quality',
          name: 'Feedback Quality Score',
          type: 'satisfaction',
          description: 'Quality of feedback content provided',
          isPrimary: false,
          target: { value: 4.0, direction: 'increase' },
          aggregation: 'average'
        },
        {
          id: 'user_annoyance',
          name: 'User Annoyance Rate',
          type: 'satisfaction',
          description: 'Rate of negative feedback about the feedback system',
          isPrimary: false,
          target: { value: 0.05, direction: 'decrease' },
          aggregation: 'rate'
        }
      ],
      startDate: new Date().toISOString(),
      autoEndConditions: [
        {
          type: 'statistical_significance',
          configuration: { targetConfidence: 0.95 },
          priority: 1
        },
        {
          type: 'sample_size',
          configuration: { targetSampleSize: 500 },
          priority: 2
        },
        {
          type: 'safety',
          configuration: {
            safetyMetrics: ['user_annoyance'],
            minSafetyThreshold: 0.1
          },
          priority: 1
        }
      ],
      metadata: {
        owner: 'ux-team',
        tags: ['feedback', 'ux', 'triggers'],
        category: 'ui_ux',
        priority: 'medium',
        estimatedDuration: 10,
        estimatedSampleSize: 500,
        notes: 'Focus on balancing completion rate with user experience',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Create form style optimization experiment
   */
  static createFormStyleExperiment(): FeedbackEntryExperiment {
    return {
      id: 'feedback_form_styles',
      name: 'Feedback Form Style Optimization',
      description: 'Test different form styles for optimal completion rates',
      status: 'active',
      category: 'ui_ux',
      variants: [
        {
          id: 'control_minimal',
          name: 'Minimal Form',
          description: 'Simple, minimal feedback form',
          allocation: 33,
          isControl: true,
          configuration: {
            triggerType: 'contextual',
            formStyle: 'minimal',
            position: 'bottom_right',
            frequency: 'session',
            appearance: {
              theme: 'auto',
              size: 'compact',
              animation: 'slide'
            }
          }
        },
        {
          id: 'detailed_form',
          name: 'Detailed Form',
          description: 'Comprehensive feedback form with more fields',
          allocation: 33,
          isControl: false,
          configuration: {
            triggerType: 'contextual',
            formStyle: 'detailed',
            position: 'modal',
            frequency: 'session',
            appearance: {
              theme: 'light',
              size: 'large',
              animation: 'fade'
            }
          }
        },
        {
          id: 'conversational_form',
          name: 'Conversational Form',
          description: 'Chat-like conversational feedback interface',
          allocation: 34,
          isControl: false,
          configuration: {
            triggerType: 'contextual',
            formStyle: 'conversational',
            position: 'sidebar',
            frequency: 'session',
            appearance: {
              theme: 'auto',
              size: 'normal',
              animation: 'slide'
            }
          }
        }
      ],
      targeting: {
        trafficAllocation: 60,
        sessionBased: true,
        customConditions: [
          {
            type: 'session_property',
            operator: 'greater_than',
            property: 'pageViews',
            value: 3
          }
        ]
      },
      metrics: [
        {
          id: 'form_completion_time',
          name: 'Form Completion Time',
          type: 'engagement',
          description: 'Time taken to complete feedback form',
          isPrimary: false,
          target: { value: 60, direction: 'decrease' },
          aggregation: 'median'
        },
        {
          id: 'feedback_detail_score',
          name: 'Feedback Detail Score',
          type: 'satisfaction',
          description: 'Richness and detail of feedback provided',
          isPrimary: true,
          target: { value: 0.8, direction: 'increase' },
          aggregation: 'average'
        },
        {
          id: 'form_abandonment_rate',
          name: 'Form Abandonment Rate',
          type: 'conversion',
          description: 'Rate of users abandoning the form',
          isPrimary: false,
          target: { value: 0.3, direction: 'decrease' },
          aggregation: 'rate'
        }
      ],
      startDate: new Date().toISOString(),
      autoEndConditions: [
        {
          type: 'statistical_significance',
          configuration: { targetConfidence: 0.9 },
          priority: 1
        },
        {
          type: 'sample_size',
          configuration: { targetSampleSize: 300 },
          priority: 2
        }
      ],
      metadata: {
        owner: 'design-team',
        tags: ['feedback', 'forms', 'ui'],
        category: 'ui_ux',
        priority: 'low',
        estimatedDuration: 7,
        estimatedSampleSize: 300,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }

  // Private methods

  private shouldShowFeedback(
    context: FeedbackInteractionContext,
    config: FeedbackUIConfig
  ): boolean {
    // Check frequency constraints
    if (!this.checkFrequencyConstraints(context, config)) {
      return false;
    }

    // Check trigger type constraints
    switch (config.triggerType) {
      case 'always':
        return true;

      case 'contextual':
        return this.checkContextualTrigger(context, config);

      case 'time_based':
        return this.checkTimeTrigger(context, config);

      case 'smart':
        return this.checkSmartTrigger(context, config);

      default:
        return false;
    }
  }

  private checkFrequencyConstraints(
    context: FeedbackInteractionContext,
    config: FeedbackUIConfig
  ): boolean {
    const { frequency } = config;
    const { feedbackCount, lastFeedbackTime } = context;

    switch (frequency) {
      case 'once':
        return feedbackCount === 0;

      case 'session':
        return feedbackCount === 0; // Assuming session-based tracking

      case 'daily':
        if (!lastFeedbackTime) return true;
        const lastFeedback = new Date(lastFeedbackTime);
        const daysSince = (Date.now() - lastFeedback.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince >= 1;

      case 'weekly':
        if (!lastFeedbackTime) return true;
        const lastFeedbackWeekly = new Date(lastFeedbackTime);
        const weeksSince = (Date.now() - lastFeedbackWeekly.getTime()) / (1000 * 60 * 60 * 24 * 7);
        return weeksSince >= 1;

      default:
        return true;
    }
  }

  private checkContextualTrigger(
    context: FeedbackInteractionContext,
    config: FeedbackUIConfig
  ): boolean {
    // Check if user just completed a knowledge request
    if (config.timing?.afterAction === 'knowledge_request' && context.userAction === 'knowledge_request') {
      return true;
    }

    // Check if user has high engagement
    if (config.timing?.afterAction === 'high_engagement' && context.sessionDuration > 300000) { // 5 minutes
      return true;
    }

    // Check specific routes
    if (context.route.includes('/read/') && context.sessionDuration > 60000) { // 1 minute reading
      return true;
    }

    return false;
  }

  private checkTimeTrigger(
    context: FeedbackInteractionContext,
    config: FeedbackUIConfig
  ): boolean {
    const { timing } = config;
    if (!timing) return false;

    // Check session duration
    if (timing.delayMs && context.sessionDuration >= timing.delayMs) {
      return true;
    }

    return false;
  }

  private checkSmartTrigger(
    context: FeedbackInteractionContext,
    config: FeedbackUIConfig
  ): boolean {
    // Smart trigger logic based on user behavior patterns
    const engagementScore = this.calculateEngagementScore(context);

    // Show feedback if engagement is high and user hasn't given feedback recently
    return engagementScore > 0.7 && context.feedbackCount < 2;
  }

  private calculateEngagementScore(context: FeedbackInteractionContext): number {
    let score = 0;

    // Session duration factor (normalized to 0-1)
    score += Math.min(1, context.sessionDuration / 600000); // 10 minutes = 1.0

    // Route engagement factor
    if (context.route.includes('/read/')) {
      score += 0.3; // Reading is high engagement
    }

    // Feature usage factor
    if (context.feature === 'knowledge_enhancement') {
      score += 0.2; // Using AI features shows engagement
    }

    // Recent action factor
    if (context.userAction) {
      score += 0.2;
    }

    return Math.min(1, score);
  }

  private buildExperimentContext(context: FeedbackInteractionContext): ExperimentContext {
    return {
      sessionId: context.sessionId,
      route: context.route,
      feature: context.feature || 'feedback',
      timestamp: new Date().toISOString(),
      customProperties: {
        sessionDuration: context.sessionDuration,
        feedbackCount: context.feedbackCount,
        userAction: context.userAction,
        lastFeedbackTime: context.lastFeedbackTime
      }
    };
  }
}

/**
 * Helper functions for feedback experiments
 */

/**
 * Get feedback configuration for current context
 */
export async function getFeedbackUIConfig(context: FeedbackInteractionContext): Promise<{
  config: FeedbackUIConfig;
  shouldShow: boolean;
  experimentId?: string;
}> {
  const manager = new FeedbackExperimentManager({
    experimentId: 'feedback_smart_triggers',
    enabled: true,
    fallbackConfig: {
      triggerType: 'contextual',
      formStyle: 'minimal',
      position: 'bottom_right',
      frequency: 'session',
      timing: { delayMs: 5000 },
      appearance: {
        theme: 'auto',
        size: 'normal',
        animation: 'slide'
      }
    },
    trackingEnabled: true
  });

  return manager.getFeedbackConfig(context);
}

/**
 * Track feedback interaction
 */
export async function trackFeedbackInteraction(
  action: 'trigger_click' | 'form_start' | 'form_complete' | 'form_abandon',
  context: FeedbackInteractionContext,
  data?: any,
  experimentId?: string
): Promise<void> {
  const manager = new FeedbackExperimentManager({
    experimentId: experimentId || 'feedback_smart_triggers',
    enabled: true,
    fallbackConfig: {
      triggerType: 'contextual',
      formStyle: 'minimal',
      position: 'bottom_right',
      frequency: 'session'
    },
    trackingEnabled: true
  });

  switch (action) {
    case 'trigger_click':
      await manager.trackTriggerClick(context, experimentId);
      break;
    case 'form_start':
      await manager.trackFormStart(context, experimentId);
      break;
    case 'form_complete':
      await manager.trackFormCompletion(context, data.formData, data.completionTime, experimentId);
      break;
    case 'form_abandon':
      await manager.trackFormAbandonment(context, data.stage, data.timeSpent, experimentId);
      break;
  }
}