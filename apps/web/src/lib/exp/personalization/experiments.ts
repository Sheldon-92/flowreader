/**
 * Personalization A/B Testing Experiments
 * Privacy-first personalization with statistical rigor
 */

import type {
  ExperimentConfig,
  ExperimentVariant,
  MetricDefinition
} from '@flowreader/shared/experiments/types.js';

import type {
  PersonalizationVariant,
  PersonalizationExperimentConfig,
  PersonalizationTargetMetric
} from '../../personalization/types.js';

/**
 * Core personalization rollout experiment
 * Tests personalization system effectiveness with gradual rollout
 */
export function createPersonalizationRolloutExperiment(): ExperimentConfig {
  return {
    id: 'personalization_rollout_v1',
    name: 'Personalization System Rollout',
    description: 'Privacy-first personalization system with real-time UX adaptations. Tests impact on satisfaction and engagement.',
    status: 'active',

    variants: [
      {
        id: 'control',
        name: 'Standard Experience',
        allocation: 90, // Start with 90% control for safety
        isControl: true,
        configuration: {
          personalizationEnabled: false,
          staticInterface: true,
          standardRecommendations: true
        }
      },
      {
        id: 'personalized_basic',
        name: 'Basic Personalization',
        allocation: 10, // Gradual rollout starting at 10%
        isControl: false,
        configuration: {
          personalizationEnabled: true,
          algorithmType: 'rule_based',
          adaptationSpeed: 'slow',
          recommendationEngine: {
            enabled: true,
            updateFrequency: 60, // 1 hour
            maxRecommendations: 3,
            diversityWeight: 0.7,
            noveltyWeight: 0.3
          },
          interfaceAdaptations: {
            enabled: true,
            adaptationTypes: ['layout_density', 'font_size'],
            changeCooldown: 30, // 30 minutes
            maxChangesPerSession: 2
          },
          contextualHints: {
            enabled: true,
            hintTypes: ['reading_suggestion', 'feature_discovery'],
            showDelay: 2000,
            maxHintsPerSession: 3,
            adaptToUserPace: true
          }
        }
      }
    ],

    targeting: {
      trafficAllocation: 100,
      sessionBased: true,
      routes: ['/read/*', '/library', '/dashboard'],
      exclusionCriteria: {
        newUsers: false, // Include new users
        mobileOnly: false,
        timeWindow: null
      }
    },

    metrics: [
      {
        id: 'user_satisfaction',
        name: 'User Satisfaction Score',
        type: 'satisfaction',
        isPrimary: true,
        target: { value: 4.5, direction: 'increase' }, // Primary goal: 4.5+ satisfaction
        aggregation: 'average',
        description: 'Overall user satisfaction rating (1-5 scale)'
      },
      {
        id: 'engagement_time',
        name: 'Session Engagement Time',
        type: 'engagement',
        isPrimary: false,
        target: { value: 0.15, direction: 'increase' }, // 15% increase in engagement
        aggregation: 'average',
        description: 'Time spent actively engaging with content'
      },
      {
        id: 'task_completion_rate',
        name: 'Task Completion Rate',
        type: 'conversion',
        isPrimary: false,
        target: { value: 0.1, direction: 'increase' }, // 10% improvement
        aggregation: 'rate',
        description: 'Rate of successful task completion'
      },
      {
        id: 'feature_discovery_rate',
        name: 'Feature Discovery Rate',
        type: 'engagement',
        isPrimary: false,
        target: { value: 0.2, direction: 'increase' }, // 20% more features discovered
        aggregation: 'rate',
        description: 'Rate of new feature discovery and adoption'
      },
      {
        id: 'knowledge_usage_improvement',
        name: 'Knowledge Enhancement Usage',
        type: 'engagement',
        isPrimary: false,
        target: { value: 0.25, direction: 'increase' }, // 25% more knowledge usage
        aggregation: 'rate',
        description: 'Improvement in knowledge enhancement feature usage'
      },
      {
        id: 'error_rate',
        name: 'User Error Rate',
        type: 'quality',
        isPrimary: false,
        target: { value: -0.3, direction: 'decrease' }, // 30% fewer errors
        aggregation: 'rate',
        description: 'Rate of user errors and failed actions'
      }
    ],

    autoEndConditions: [
      {
        type: 'statistical_significance',
        configuration: {
          targetConfidence: 0.95,
          primaryMetricOnly: true,
          minSampleSize: 500
        },
        priority: 1
      },
      {
        type: 'sample_size',
        configuration: { targetSampleSize: 2000 },
        priority: 2
      },
      {
        type: 'time',
        configuration: { maxDurationDays: 30 },
        priority: 3
      },
      {
        type: 'safety',
        configuration: {
          safetyMetrics: ['error_rate', 'user_satisfaction'],
          minSafetyThreshold: 0.05, // 5% degradation triggers rollback
          checkFrequency: 3600 // Check every hour
        },
        priority: 1
      }
    ],

    startDate: new Date().toISOString(),
    metadata: {
      owner: 'frontend-team',
      tags: ['personalization', 'ux', 'satisfaction'],
      category: 'core_feature',
      priority: 'high',
      hypothesis: 'Privacy-first personalization will improve user satisfaction to 4.5+ without impacting performance'
    }
  };
}

/**
 * Advanced personalization experiment with ML-enhanced recommendations
 */
export function createAdvancedPersonalizationExperiment(): ExperimentConfig {
  return {
    id: 'personalization_advanced_v1',
    name: 'ML-Enhanced Personalization',
    description: 'Advanced personalization with machine learning recommendations and faster adaptations',
    status: 'draft',

    variants: [
      {
        id: 'basic_personalization',
        name: 'Basic Rule-Based',
        allocation: 50,
        isControl: true,
        configuration: {
          algorithmType: 'rule_based',
          adaptationSpeed: 'slow',
          mlEnhanced: false
        }
      },
      {
        id: 'ml_enhanced',
        name: 'ML-Enhanced Personalization',
        allocation: 50,
        isControl: false,
        configuration: {
          algorithmType: 'ml_enhanced',
          adaptationSpeed: 'fast',
          mlEnhanced: true,
          modelVersion: 'v1.0',
          realTimeInference: true,
          predictionConfidenceThreshold: 0.7
        }
      }
    ],

    targeting: {
      trafficAllocation: 100,
      sessionBased: true,
      routes: ['/read/*'],
      inclusionCriteria: {
        hasPersonalizationEnabled: true,
        minSessionCount: 3 // Only users with some experience
      }
    },

    metrics: [
      {
        id: 'recommendation_accuracy',
        name: 'Recommendation Accuracy',
        type: 'quality',
        isPrimary: true,
        target: { value: 0.8, direction: 'increase' },
        aggregation: 'average'
      },
      {
        id: 'adaptation_relevance',
        name: 'Interface Adaptation Relevance',
        type: 'satisfaction',
        isPrimary: true,
        target: { value: 4.2, direction: 'increase' },
        aggregation: 'average'
      }
    ],

    autoEndConditions: [
      {
        type: 'statistical_significance',
        configuration: { targetConfidence: 0.95 },
        priority: 1
      },
      {
        type: 'sample_size',
        configuration: { targetSampleSize: 1000 },
        priority: 2
      }
    ],

    startDate: new Date().toISOString(),
    metadata: {
      owner: 'ml-team',
      tags: ['personalization', 'ml', 'advanced'],
      category: 'enhancement',
      priority: 'medium'
    }
  };
}

/**
 * Interface adaptation experiment
 */
export function createInterfaceAdaptationExperiment(): ExperimentConfig {
  return {
    id: 'interface_adaptation_v1',
    name: 'Dynamic Interface Adaptation',
    description: 'Test different levels of interface adaptation based on user behavior',
    status: 'draft',

    variants: [
      {
        id: 'minimal_adaptation',
        name: 'Minimal Adaptation',
        allocation: 33,
        isControl: true,
        configuration: {
          adaptationTypes: ['font_size'],
          maxChangesPerSession: 1,
          changeCooldown: 60
        }
      },
      {
        id: 'moderate_adaptation',
        name: 'Moderate Adaptation',
        allocation: 33,
        isControl: false,
        configuration: {
          adaptationTypes: ['font_size', 'layout_density', 'color_scheme'],
          maxChangesPerSession: 3,
          changeCooldown: 30
        }
      },
      {
        id: 'full_adaptation',
        name: 'Full Adaptation',
        allocation: 34,
        isControl: false,
        configuration: {
          adaptationTypes: ['font_size', 'layout_density', 'color_scheme', 'animation_speed', 'sidebar_behavior'],
          maxChangesPerSession: 5,
          changeCooldown: 15
        }
      }
    ],

    targeting: {
      trafficAllocation: 100,
      sessionBased: true,
      routes: ['/read/*', '/library']
    },

    metrics: [
      {
        id: 'adaptation_satisfaction',
        name: 'Interface Adaptation Satisfaction',
        type: 'satisfaction',
        isPrimary: true,
        target: { value: 4.0, direction: 'increase' },
        aggregation: 'average'
      },
      {
        id: 'adaptation_disruption',
        name: 'Adaptation Disruption Score',
        type: 'quality',
        isPrimary: false,
        target: { value: -0.2, direction: 'decrease' },
        aggregation: 'average'
      }
    ],

    autoEndConditions: [
      {
        type: 'statistical_significance',
        configuration: { targetConfidence: 0.90 },
        priority: 1
      }
    ],

    startDate: new Date().toISOString(),
    metadata: {
      owner: 'ux-team',
      tags: ['interface', 'adaptation', 'ux'],
      category: 'ui_ux',
      priority: 'medium'
    }
  };
}

/**
 * Reading recommendation experiment
 */
export function createReadingRecommendationExperiment(): ExperimentConfig {
  return {
    id: 'reading_recommendations_v1',
    name: 'Intelligent Reading Recommendations',
    description: 'Test personalized reading recommendations and context hints',
    status: 'draft',

    variants: [
      {
        id: 'no_recommendations',
        name: 'No Recommendations',
        allocation: 25,
        isControl: true,
        configuration: {
          recommendationsEnabled: false,
          contextHintsEnabled: false
        }
      },
      {
        id: 'basic_recommendations',
        name: 'Basic Recommendations',
        allocation: 25,
        isControl: false,
        configuration: {
          recommendationsEnabled: true,
          contextHintsEnabled: false,
          maxRecommendations: 3,
          updateFrequency: 120 // 2 hours
        }
      },
      {
        id: 'recommendations_with_hints',
        name: 'Recommendations + Context Hints',
        allocation: 25,
        isControl: false,
        configuration: {
          recommendationsEnabled: true,
          contextHintsEnabled: true,
          maxRecommendations: 5,
          updateFrequency: 60, // 1 hour
          maxHintsPerSession: 5
        }
      },
      {
        id: 'adaptive_recommendations',
        name: 'Adaptive Recommendations',
        allocation: 25,
        isControl: false,
        configuration: {
          recommendationsEnabled: true,
          contextHintsEnabled: true,
          adaptive: true,
          maxRecommendations: 7,
          updateFrequency: 30, // 30 minutes
          maxHintsPerSession: 8,
          adaptToUserPace: true
        }
      }
    ],

    targeting: {
      trafficAllocation: 100,
      sessionBased: true,
      routes: ['/read/*']
    },

    metrics: [
      {
        id: 'recommendation_engagement',
        name: 'Recommendation Engagement Rate',
        type: 'engagement',
        isPrimary: true,
        target: { value: 0.3, direction: 'increase' },
        aggregation: 'rate'
      },
      {
        id: 'reading_progression',
        name: 'Reading Progression Rate',
        type: 'engagement',
        isPrimary: false,
        target: { value: 0.2, direction: 'increase' },
        aggregation: 'rate'
      },
      {
        id: 'knowledge_discovery',
        name: 'Knowledge Discovery Rate',
        type: 'engagement',
        isPrimary: false,
        target: { value: 0.4, direction: 'increase' },
        aggregation: 'rate'
      }
    ],

    autoEndConditions: [
      {
        type: 'statistical_significance',
        configuration: { targetConfidence: 0.95 },
        priority: 1
      },
      {
        type: 'sample_size',
        configuration: { targetSampleSize: 1500 },
        priority: 2
      }
    ],

    startDate: new Date().toISOString(),
    metadata: {
      owner: 'content-team',
      tags: ['recommendations', 'reading', 'content'],
      category: 'content_discovery',
      priority: 'high'
    }
  };
}

/**
 * Performance impact experiment
 */
export function createPersonalizationPerformanceExperiment(): ExperimentConfig {
  return {
    id: 'personalization_performance_v1',
    name: 'Personalization Performance Impact',
    description: 'Measure performance impact of personalization system',
    status: 'active',

    variants: [
      {
        id: 'baseline',
        name: 'No Personalization',
        allocation: 30,
        isControl: true,
        configuration: {
          personalizationEnabled: false,
          trackingEnabled: false
        }
      },
      {
        id: 'lightweight_tracking',
        name: 'Lightweight Tracking Only',
        allocation: 35,
        isControl: false,
        configuration: {
          personalizationEnabled: false,
          trackingEnabled: true,
          trackingFrequency: 30000 // 30 seconds
        }
      },
      {
        id: 'full_personalization',
        name: 'Full Personalization',
        allocation: 35,
        isControl: false,
        configuration: {
          personalizationEnabled: true,
          trackingEnabled: true,
          trackingFrequency: 10000, // 10 seconds
          realTimeAdaptations: true
        }
      }
    ],

    targeting: {
      trafficAllocation: 100,
      sessionBased: true,
      routes: ['/read/*', '/library', '/dashboard']
    },

    metrics: [
      {
        id: 'page_load_time',
        name: 'Page Load Time',
        type: 'performance',
        isPrimary: true,
        target: { value: 0.1, direction: 'decrease' }, // No more than 10% degradation
        aggregation: 'average'
      },
      {
        id: 'time_to_interactive',
        name: 'Time to Interactive',
        type: 'performance',
        isPrimary: true,
        target: { value: 0.1, direction: 'decrease' },
        aggregation: 'average'
      },
      {
        id: 'client_side_errors',
        name: 'Client-Side Error Rate',
        type: 'quality',
        isPrimary: false,
        target: { value: 0.05, direction: 'decrease' },
        aggregation: 'rate'
      },
      {
        id: 'memory_usage',
        name: 'Client Memory Usage',
        type: 'performance',
        isPrimary: false,
        target: { value: 0.15, direction: 'decrease' },
        aggregation: 'average'
      }
    ],

    autoEndConditions: [
      {
        type: 'safety',
        configuration: {
          safetyMetrics: ['page_load_time', 'time_to_interactive'],
          minSafetyThreshold: 0.2, // 20% performance degradation triggers rollback
          checkFrequency: 1800 // Check every 30 minutes
        },
        priority: 1
      },
      {
        type: 'statistical_significance',
        configuration: { targetConfidence: 0.95 },
        priority: 2
      }
    ],

    startDate: new Date().toISOString(),
    metadata: {
      owner: 'performance-team',
      tags: ['performance', 'personalization', 'monitoring'],
      category: 'performance',
      priority: 'critical'
    }
  };
}

// Export all experiments
export const personalizationExperiments = {
  rollout: createPersonalizationRolloutExperiment,
  advanced: createAdvancedPersonalizationExperiment,
  interface: createInterfaceAdaptationExperiment,
  recommendations: createReadingRecommendationExperiment,
  performance: createPersonalizationPerformanceExperiment
} as const;

// Helper to get all personalization experiments
export function getAllPersonalizationExperiments(): ExperimentConfig[] {
  return Object.values(personalizationExperiments).map(fn => fn());
}

// Helper to get specific experiment by type
export function getPersonalizationExperiment(type: keyof typeof personalizationExperiments): ExperimentConfig {
  return personalizationExperiments[type]();
}