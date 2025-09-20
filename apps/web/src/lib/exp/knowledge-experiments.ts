/**
 * Knowledge Enhancement A/B Testing Framework
 *
 * Specialized experiment framework for testing different knowledge enhancement
 * styles, latency optimizations, and AI interaction patterns.
 */

import { getExperiments, track } from './client-sdk.js';
import type {
  KnowledgeEnhancementExperiment,
  KnowledgeVariant,
  ExperimentContext
} from '@flowreader/shared/experiments/types.js';

export interface KnowledgeExperimentConfig {
  experimentId: string;
  enabled: boolean;
  fallbackConfig: KnowledgeEnhancementConfig;
  trackingEnabled: boolean;
}

export interface KnowledgeEnhancementConfig {
  enhancementStyle: 'basic' | 'progressive' | 'precomputed' | 'cached';
  latencyTarget: number; // milliseconds
  qualityThreshold: number; // 0-1
  fallbackEnabled: boolean;
  progressiveFillEnabled: boolean;
  cacheEnabled: boolean;
  precomputeEnabled: boolean;
}

export interface KnowledgeRequestContext {
  bookId: string;
  intent: 'explain' | 'background' | 'define';
  selectionText: string;
  chapterId?: string;
  userId?: string;
  sessionId: string;
}

export interface KnowledgePerformanceMetrics {
  firstByteTime: number;
  totalProcessingTime: number;
  qualityScore: number;
  tokensUsed: number;
  cacheHit: boolean;
  fallbackUsed: boolean;
  strategy: string;
}

/**
 * Knowledge Enhancement Experiment Manager
 */
export class KnowledgeExperimentManager {
  private config: KnowledgeExperimentConfig;
  private activeExperiments = new Map<string, KnowledgeEnhancementExperiment>();

  constructor(config: KnowledgeExperimentConfig) {
    this.config = config;
  }

  /**
   * Get knowledge enhancement configuration for a request
   */
  async getEnhancementConfig(context: KnowledgeRequestContext): Promise<{
    config: KnowledgeEnhancementConfig;
    experimentId?: string;
    variantId?: string;
  }> {
    if (!this.config.enabled) {
      return { config: this.config.fallbackConfig };
    }

    try {
      // Check for active knowledge enhancement experiments
      const experiments = getExperiments();
      const result = await experiments.getExperiment(
        this.config.experimentId,
        this.buildExperimentContext(context)
      );

      if (result.variant && result.shouldTrack) {
        const variantConfig = result.variant.configuration as KnowledgeEnhancementConfig;

        // Track exposure
        if (this.config.trackingEnabled) {
          await track(this.config.experimentId, 'knowledge_exposure', 1, {
            intent: context.intent,
            enhancementStyle: variantConfig.enhancementStyle,
            bookId: context.bookId
          });
        }

        return {
          config: variantConfig,
          experimentId: this.config.experimentId,
          variantId: result.variant.id
        };
      }
    } catch (error) {
      console.warn('Failed to get experiment configuration, using fallback:', error);
    }

    return { config: this.config.fallbackConfig };
  }

  /**
   * Track knowledge enhancement performance metrics
   */
  async trackPerformance(
    context: KnowledgeRequestContext,
    metrics: KnowledgePerformanceMetrics,
    experimentId?: string,
    variantId?: string
  ): Promise<void> {
    if (!this.config.trackingEnabled || !experimentId) {
      return;
    }

    try {
      const experiments = getExperiments();

      // Track latency metrics
      await experiments.trackEngagement(
        experimentId,
        'first_byte_time',
        metrics.firstByteTime,
        {
          intent: context.intent,
          strategy: metrics.strategy,
          cacheHit: metrics.cacheHit
        }
      );

      await experiments.trackEngagement(
        experimentId,
        'total_processing_time',
        metrics.totalProcessingTime,
        {
          intent: context.intent,
          strategy: metrics.strategy
        }
      );

      // Track quality metrics
      await experiments.track(
        experimentId,
        'quality_score',
        metrics.qualityScore,
        {
          intent: context.intent,
          tokensUsed: metrics.tokensUsed,
          fallbackUsed: metrics.fallbackUsed
        }
      );

      // Track efficiency metrics
      await experiments.track(
        experimentId,
        'tokens_used',
        metrics.tokensUsed,
        {
          intent: context.intent,
          qualityScore: metrics.qualityScore
        }
      );

      // Track conversion (successful knowledge delivery)
      if (metrics.qualityScore >= 0.7 && metrics.firstByteTime <= 2000) {
        await experiments.trackConversion(
          experimentId,
          'successful_knowledge_delivery',
          1,
          {
            intent: context.intent,
            strategy: metrics.strategy,
            firstByteTime: metrics.firstByteTime,
            qualityScore: metrics.qualityScore
          }
        );
      }

      // Track cache performance if applicable
      if (metrics.cacheHit) {
        await experiments.track(
          experimentId,
          'cache_hit',
          1,
          {
            intent: context.intent,
            strategy: metrics.strategy
          }
        );
      }

    } catch (error) {
      console.error('Failed to track knowledge enhancement metrics:', error);
    }
  }

  /**
   * Track user satisfaction with knowledge enhancement
   */
  async trackSatisfaction(
    context: KnowledgeRequestContext,
    rating: number,
    feedback?: string,
    experimentId?: string
  ): Promise<void> {
    if (!this.config.trackingEnabled || !experimentId) {
      return;
    }

    try {
      const experiments = getExperiments();

      await experiments.trackSatisfaction(
        experimentId,
        rating,
        feedback
      );

      // Track additional context
      await experiments.track(
        experimentId,
        'satisfaction_detailed',
        rating,
        {
          intent: context.intent,
          bookId: context.bookId,
          hasTextFeedback: !!feedback,
          feedbackLength: feedback?.length || 0
        }
      );

    } catch (error) {
      console.error('Failed to track satisfaction:', error);
    }
  }

  /**
   * Create predefined knowledge enhancement experiments
   */
  static createLatencyOptimizationExperiment(): KnowledgeEnhancementExperiment {
    return {
      id: 'knowledge_latency_optimization',
      name: 'Knowledge Enhancement Latency Optimization',
      description: 'Test different strategies to minimize knowledge enhancement latency',
      status: 'active',
      category: 'ai_enhancement',
      variants: [
        {
          id: 'control_basic',
          name: 'Basic Enhancement',
          description: 'Standard knowledge enhancement without optimizations',
          allocation: 25,
          isControl: true,
          configuration: {
            enhancementStyle: 'basic',
            latencyTarget: 5000,
            qualityThreshold: 0.7,
            fallbackEnabled: true,
            progressiveFillEnabled: false,
            cacheEnabled: false,
            precomputeEnabled: false
          }
        },
        {
          id: 'progressive_fill',
          name: 'Progressive Fill',
          description: 'Progressive enhancement with early response',
          allocation: 25,
          isControl: false,
          configuration: {
            enhancementStyle: 'progressive',
            latencyTarget: 1000,
            qualityThreshold: 0.6,
            fallbackEnabled: true,
            progressiveFillEnabled: true,
            cacheEnabled: true,
            precomputeEnabled: false
          }
        },
        {
          id: 'precomputed',
          name: 'Precomputed Cache',
          description: 'Use precomputed knowledge enhancements',
          allocation: 25,
          isControl: false,
          configuration: {
            enhancementStyle: 'precomputed',
            latencyTarget: 500,
            qualityThreshold: 0.8,
            fallbackEnabled: true,
            progressiveFillEnabled: false,
            cacheEnabled: true,
            precomputeEnabled: true
          }
        },
        {
          id: 'hybrid_optimized',
          name: 'Hybrid Optimized',
          description: 'Combination of progressive fill and caching',
          allocation: 25,
          isControl: false,
          configuration: {
            enhancementStyle: 'cached',
            latencyTarget: 800,
            qualityThreshold: 0.75,
            fallbackEnabled: true,
            progressiveFillEnabled: true,
            cacheEnabled: true,
            precomputeEnabled: true
          }
        }
      ],
      targeting: {
        trafficAllocation: 100,
        sessionBased: true,
        features: ['knowledge_enhancement'],
        routes: ['/read/*']
      },
      metrics: [
        {
          id: 'first_byte_time',
          name: 'First Byte Time',
          type: 'performance',
          description: 'Time to first response byte',
          isPrimary: true,
          target: { value: 1000, direction: 'decrease' },
          aggregation: 'median'
        },
        {
          id: 'quality_score',
          name: 'Response Quality',
          type: 'satisfaction',
          description: 'AI-assessed response quality',
          isPrimary: false,
          target: { value: 0.8, direction: 'increase' },
          aggregation: 'average'
        },
        {
          id: 'successful_knowledge_delivery',
          name: 'Successful Delivery Rate',
          type: 'conversion',
          description: 'Rate of high-quality, fast responses',
          isPrimary: false,
          target: { value: 0.85, direction: 'increase' },
          aggregation: 'rate'
        }
      ],
      startDate: new Date().toISOString(),
      autoEndConditions: [
        {
          type: 'statistical_significance',
          configuration: { targetConfidence: 0.95, primaryMetricOnly: true },
          priority: 1
        },
        {
          type: 'sample_size',
          configuration: { targetSampleSize: 1000 },
          priority: 2
        },
        {
          type: 'time',
          configuration: { maxDurationDays: 14 },
          priority: 3
        }
      ],
      metadata: {
        owner: 'ai-team',
        tags: ['latency', 'optimization', 'ai'],
        category: 'ai_enhancement',
        priority: 'high',
        estimatedDuration: 14,
        estimatedSampleSize: 1000,
        notes: 'Focus on maintaining quality while improving response time',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Create quality vs speed trade-off experiment
   */
  static createQualitySpeedTradeoffExperiment(): KnowledgeEnhancementExperiment {
    return {
      id: 'knowledge_quality_speed_tradeoff',
      name: 'Knowledge Quality vs Speed Trade-off',
      description: 'Test optimal balance between response quality and speed',
      status: 'active',
      category: 'ai_enhancement',
      variants: [
        {
          id: 'control_balanced',
          name: 'Balanced Control',
          description: 'Current balanced approach',
          allocation: 33,
          isControl: true,
          configuration: {
            enhancementStyle: 'basic',
            latencyTarget: 3000,
            qualityThreshold: 0.7,
            fallbackEnabled: true,
            progressiveFillEnabled: false,
            cacheEnabled: true,
            precomputeEnabled: false
          }
        },
        {
          id: 'speed_optimized',
          name: 'Speed Optimized',
          description: 'Prioritize speed over quality',
          allocation: 33,
          isControl: false,
          configuration: {
            enhancementStyle: 'progressive',
            latencyTarget: 1000,
            qualityThreshold: 0.6,
            fallbackEnabled: true,
            progressiveFillEnabled: true,
            cacheEnabled: true,
            precomputeEnabled: true
          }
        },
        {
          id: 'quality_optimized',
          name: 'Quality Optimized',
          description: 'Prioritize quality over speed',
          allocation: 34,
          isControl: false,
          configuration: {
            enhancementStyle: 'basic',
            latencyTarget: 8000,
            qualityThreshold: 0.85,
            fallbackEnabled: false,
            progressiveFillEnabled: false,
            cacheEnabled: false,
            precomputeEnabled: false
          }
        }
      ],
      targeting: {
        trafficAllocation: 50, // Only 50% of users for more conservative test
        sessionBased: true,
        features: ['knowledge_enhancement']
      },
      metrics: [
        {
          id: 'user_satisfaction',
          name: 'User Satisfaction',
          type: 'satisfaction',
          description: 'Overall user satisfaction rating',
          isPrimary: true,
          target: { value: 4.0, direction: 'increase' },
          aggregation: 'average'
        },
        {
          id: 'engagement_duration',
          name: 'Knowledge Engagement Duration',
          type: 'engagement',
          description: 'Time users spend reading knowledge content',
          isPrimary: false,
          target: { value: 30, direction: 'increase' },
          aggregation: 'average'
        },
        {
          id: 'abandonment_rate',
          name: 'Request Abandonment Rate',
          type: 'conversion',
          description: 'Rate of users abandoning knowledge requests',
          isPrimary: false,
          target: { value: 0.1, direction: 'decrease' },
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
          type: 'safety',
          configuration: {
            safetyMetrics: ['abandonment_rate'],
            minSafetyThreshold: 0.2
          },
          priority: 1
        }
      ],
      metadata: {
        owner: 'product-team',
        tags: ['quality', 'speed', 'ux'],
        category: 'ai_enhancement',
        priority: 'medium',
        estimatedDuration: 21,
        estimatedSampleSize: 1500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
  }

  // Private methods

  private buildExperimentContext(context: KnowledgeRequestContext): ExperimentContext {
    return {
      sessionId: context.sessionId,
      feature: 'knowledge_enhancement',
      timestamp: new Date().toISOString(),
      customProperties: {
        intent: context.intent,
        bookId: context.bookId,
        chapterId: context.chapterId,
        selectionLength: context.selectionText.length
      }
    };
  }
}

/**
 * Helper functions for knowledge enhancement experiments
 */

/**
 * Get current knowledge enhancement configuration
 */
export async function getKnowledgeConfig(context: KnowledgeRequestContext): Promise<{
  config: KnowledgeEnhancementConfig;
  experimentId?: string;
  variantId?: string;
}> {
  const manager = new KnowledgeExperimentManager({
    experimentId: 'knowledge_latency_optimization',
    enabled: true,
    fallbackConfig: {
      enhancementStyle: 'basic',
      latencyTarget: 5000,
      qualityThreshold: 0.7,
      fallbackEnabled: true,
      progressiveFillEnabled: false,
      cacheEnabled: true,
      precomputeEnabled: false
    },
    trackingEnabled: true
  });

  return manager.getEnhancementConfig(context);
}

/**
 * Track knowledge enhancement metrics
 */
export async function trackKnowledgeMetrics(
  context: KnowledgeRequestContext,
  metrics: KnowledgePerformanceMetrics,
  experimentId?: string
): Promise<void> {
  const manager = new KnowledgeExperimentManager({
    experimentId: experimentId || 'knowledge_latency_optimization',
    enabled: true,
    fallbackConfig: {
      enhancementStyle: 'basic',
      latencyTarget: 5000,
      qualityThreshold: 0.7,
      fallbackEnabled: true,
      progressiveFillEnabled: false,
      cacheEnabled: true,
      precomputeEnabled: false
    },
    trackingEnabled: true
  });

  return manager.trackPerformance(context, metrics, experimentId);
}

/**
 * Check if progressive fill should be enabled based on experiment
 */
export async function shouldUseProgressiveFill(context: KnowledgeRequestContext): Promise<boolean> {
  const { config } = await getKnowledgeConfig(context);
  return config.progressiveFillEnabled;
}

/**
 * Check if precompute cache should be used
 */
export async function shouldUsePrecompute(context: KnowledgeRequestContext): Promise<boolean> {
  const { config } = await getKnowledgeConfig(context);
  return config.precomputeEnabled;
}

/**
 * Get target latency for knowledge requests
 */
export async function getLatencyTarget(context: KnowledgeRequestContext): Promise<number> {
  const { config } = await getKnowledgeConfig(context);
  return config.latencyTarget;
}

/**
 * Get quality threshold for knowledge responses
 */
export async function getQualityThreshold(context: KnowledgeRequestContext): Promise<number> {
  const { config } = await getKnowledgeConfig(context);
  return config.qualityThreshold;
}