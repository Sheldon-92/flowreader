/**
 * FlowReader Personalization Recommendation Engine
 * Context-aware recommendation system with privacy-first design
 */

import type {
  PersonalizationRecommendation,
  UserBehaviorMetrics,
  PersonalizationContext,
  ReadingPattern,
  InteractionMetrics,
  SatisfactionScore,
  PersonalizationRecommendationType,
  InterfaceAdaptationType,
  ContextualHintType
} from './types.js';

interface RecommendationRule {
  id: string;
  name: string;
  description: string;
  priority: number;
  triggers: RecommendationTrigger[];
  action: RecommendationAction;
  cooldown?: number; // minutes
  maxPerSession?: number;
  conditions?: RecommendationCondition[];
}

interface RecommendationTrigger {
  type: 'behavior_pattern' | 'satisfaction_drop' | 'performance_issue' | 'time_based' | 'usage_milestone';
  metric?: string;
  threshold?: number;
  comparison?: 'greater_than' | 'less_than' | 'equals' | 'range';
  timeWindow?: number; // minutes
}

interface RecommendationAction {
  type: PersonalizationRecommendationType;
  component: string;
  props: Record<string, any>;
  expectedImpact: {
    satisfactionImprovement: number;
    engagementImprovement: number;
    usabilityImprovement: number;
    confidence: number;
  };
}

interface RecommendationCondition {
  type: 'device_type' | 'time_of_day' | 'session_length' | 'feature_usage' | 'reading_experience';
  value: any;
  operator?: 'equals' | 'in' | 'greater_than' | 'less_than';
}

interface RecommendationContext {
  userBehavior: UserBehaviorMetrics;
  currentActivity: {
    action: string;
    sessionDuration: number;
    currentRoute: string;
  };
  systemState: {
    performance: {
      averageResponseTime: number;
      errorRate: number;
    };
  };
  previousRecommendations: PersonalizationRecommendation[];
}

export class PersonalizationRecommendationEngine {
  private rules: RecommendationRule[] = [];
  private recommendationHistory: Map<string, PersonalizationRecommendation[]> = new Map();
  private readonly MAX_RECOMMENDATIONS_PER_SESSION = 8;
  private readonly RECOMMENDATION_COOLDOWN_MINUTES = 5;

  constructor() {
    this.initializeRecommendationRules();
  }

  /**
   * Generate personalized recommendations based on context
   */
  generateRecommendations(
    context: RecommendationContext,
    maxRecommendations: number = 5
  ): PersonalizationRecommendation[] {
    const recommendations: PersonalizationRecommendation[] = [];
    const sessionId = context.userBehavior.sessionId;

    // Get previous recommendations for this session
    const previousRecommendations = this.recommendationHistory.get(sessionId) || [];

    // Evaluate each rule
    for (const rule of this.rules) {
      // Check if we've already generated enough recommendations
      if (recommendations.length >= maxRecommendations) {
        break;
      }

      // Check cooldown
      if (this.isRuleOnCooldown(rule, previousRecommendations)) {
        continue;
      }

      // Check session limit
      if (this.hasExceededSessionLimit(rule, previousRecommendations)) {
        continue;
      }

      // Check conditions
      if (!this.evaluateConditions(rule.conditions || [], context)) {
        continue;
      }

      // Check triggers
      if (this.evaluateTriggers(rule.triggers, context)) {
        const recommendation = this.createRecommendation(rule, context);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      }
    }

    // Sort by priority and impact
    recommendations.sort((a, b) => {
      // Primary sort by priority
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Secondary sort by expected impact
      return b.expectedImpact.satisfactionImprovement - a.expectedImpact.satisfactionImprovement;
    });

    // Update recommendation history
    const updatedHistory = [...previousRecommendations, ...recommendations];
    this.recommendationHistory.set(sessionId, updatedHistory);

    return recommendations;
  }

  /**
   * Initialize recommendation rules
   */
  private initializeRecommendationRules(): void {
    this.rules = [
      // Reading Performance Optimization
      {
        id: 'slow_reading_focus_mode',
        name: 'Enable Focus Mode for Slow Reading',
        description: 'Suggest focus mode when reading speed is below average',
        priority: 8,
        triggers: [
          {
            type: 'behavior_pattern',
            metric: 'averageReadingSpeed',
            threshold: 150,
            comparison: 'less_than'
          }
        ],
        action: {
          type: 'feature_suggestion',
          component: 'ReadingInterface',
          props: {
            focusMode: true,
            distractionsReduced: true,
            lineSpacing: 'expanded',
            highlightCurrentParagraph: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.3,
            engagementImprovement: 0.4,
            usabilityImprovement: 0.2,
            confidence: 0.8
          }
        },
        cooldown: 30,
        maxPerSession: 1
      },

      // Mobile Experience Optimization
      {
        id: 'mobile_interface_optimization',
        name: 'Optimize for Mobile Reading',
        description: 'Improve mobile reading experience with larger fonts and touch-friendly interface',
        priority: 7,
        triggers: [
          {
            type: 'behavior_pattern',
            metric: 'deviceType',
            threshold: 'mobile',
            comparison: 'equals'
          }
        ],
        conditions: [
          {
            type: 'device_type',
            value: 'mobile',
            operator: 'equals'
          }
        ],
        action: {
          type: 'interface_adjustment',
          component: 'MobileLayout',
          props: {
            fontSize: 'large',
            lineHeight: 1.6,
            margins: 'comfortable',
            tapTargets: 'enlarged',
            scrollOptimization: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.4,
            engagementImprovement: 0.2,
            usabilityImprovement: 0.5,
            confidence: 0.9
          }
        },
        cooldown: 60,
        maxPerSession: 1
      },

      // Knowledge Enhancement Power User
      {
        id: 'knowledge_power_user_features',
        name: 'Advanced Knowledge Features',
        description: 'Offer advanced features to users who frequently use knowledge enhancement',
        priority: 6,
        triggers: [
          {
            type: 'usage_milestone',
            metric: 'knowledgeEnhancementUsage',
            threshold: 8,
            comparison: 'greater_than',
            timeWindow: 60 // last hour
          }
        ],
        action: {
          type: 'feature_suggestion',
          component: 'KnowledgeInterface',
          props: {
            showAdvancedOptions: true,
            batchMode: true,
            keyboardShortcuts: true,
            smartSuggestions: true,
            contextualDefinitions: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.2,
            engagementImprovement: 0.3,
            usabilityImprovement: 0.4,
            confidence: 0.7
          }
        },
        cooldown: 120,
        maxPerSession: 1
      },

      // Satisfaction Recovery
      {
        id: 'low_satisfaction_recovery',
        name: 'Simplify Interface for Low Satisfaction',
        description: 'Reduce interface complexity when satisfaction drops',
        priority: 9,
        triggers: [
          {
            type: 'satisfaction_drop',
            metric: 'averageSatisfaction',
            threshold: 3.5,
            comparison: 'less_than'
          }
        ],
        action: {
          type: 'interface_adjustment',
          component: 'SimpleInterface',
          props: {
            density: 'comfortable',
            advancedFeatures: false,
            guidedTour: true,
            helpHints: true,
            reducedAnimations: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.6,
            engagementImprovement: 0.1,
            usabilityImprovement: 0.4,
            confidence: 0.8
          }
        },
        cooldown: 15,
        maxPerSession: 2
      },

      // Evening Reading Optimization
      {
        id: 'evening_dark_mode',
        name: 'Enable Dark Mode for Evening Reading',
        description: 'Suggest dark mode during evening hours to reduce eye strain',
        priority: 5,
        triggers: [
          {
            type: 'time_based'
          }
        ],
        conditions: [
          {
            type: 'time_of_day',
            value: ['evening', 'night'],
            operator: 'in'
          }
        ],
        action: {
          type: 'interface_adjustment',
          component: 'ThemeManager',
          props: {
            theme: 'dark',
            eyeStrainReduction: true,
            reducedBlueLight: true,
            softGlow: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.3,
            engagementImprovement: 0.1,
            usabilityImprovement: 0.2,
            confidence: 0.6
          }
        },
        cooldown: 180,
        maxPerSession: 1
      },

      // Reading Speed Assistance
      {
        id: 'reading_speed_assistance',
        name: 'Reading Speed Enhancement',
        description: 'Offer reading speed tools for users who want to read faster',
        priority: 4,
        triggers: [
          {
            type: 'behavior_pattern',
            metric: 'sessionDuration',
            threshold: 45,
            comparison: 'greater_than'
          }
        ],
        conditions: [
          {
            type: 'session_length',
            value: 'long',
            operator: 'equals'
          }
        ],
        action: {
          type: 'feature_suggestion',
          component: 'ReadingTools',
          props: {
            speedReading: true,
            progressIndicator: true,
            readingGoals: true,
            timeEstimates: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.2,
            engagementImprovement: 0.4,
            usabilityImprovement: 0.3,
            confidence: 0.6
          }
        },
        cooldown: 90,
        maxPerSession: 1
      },

      // Feature Discovery
      {
        id: 'low_feature_discovery',
        name: 'Feature Discovery Guidance',
        description: 'Help users discover features they haven\'t used',
        priority: 5,
        triggers: [
          {
            type: 'behavior_pattern',
            metric: 'featureAdoptionCount',
            threshold: 3,
            comparison: 'less_than'
          }
        ],
        action: {
          type: 'context_hint',
          component: 'FeatureDiscovery',
          props: {
            showTooltips: true,
            highlightUnusedFeatures: true,
            interactiveGuide: true,
            progressTracking: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.2,
            engagementImprovement: 0.3,
            usabilityImprovement: 0.4,
            confidence: 0.7
          }
        },
        cooldown: 60,
        maxPerSession: 2
      },

      // Error Recovery
      {
        id: 'high_error_recovery',
        name: 'Error Recovery Assistance',
        description: 'Provide guidance when users experience frequent errors',
        priority: 8,
        triggers: [
          {
            type: 'performance_issue',
            metric: 'errorRecoveryTime',
            threshold: 10000,
            comparison: 'greater_than'
          }
        ],
        action: {
          type: 'workflow_improvement',
          component: 'ErrorRecovery',
          props: {
            contextHelp: true,
            stepByStepGuide: true,
            preventiveHints: true,
            errorPrevention: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.4,
            engagementImprovement: 0.2,
            usabilityImprovement: 0.6,
            confidence: 0.8
          }
        },
        cooldown: 30,
        maxPerSession: 3
      },

      // Long Session Comfort
      {
        id: 'long_session_comfort',
        name: 'Long Session Comfort Features',
        description: 'Enable comfort features for extended reading sessions',
        priority: 4,
        triggers: [
          {
            type: 'behavior_pattern',
            metric: 'sessionDuration',
            threshold: 60,
            comparison: 'greater_than'
          }
        ],
        action: {
          type: 'interface_adjustment',
          component: 'ComfortMode',
          props: {
            breakReminders: true,
            eyeRestMode: true,
            positionSuggestions: true,
            readingBreaks: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.3,
            engagementImprovement: 0.2,
            usabilityImprovement: 0.3,
            confidence: 0.6
          }
        },
        cooldown: 30,
        maxPerSession: 2
      },

      // Novice User Onboarding
      {
        id: 'novice_user_guidance',
        name: 'Guided Experience for New Users',
        description: 'Provide guided experience for users new to the platform',
        priority: 7,
        triggers: [
          {
            type: 'behavior_pattern',
            metric: 'totalSessions',
            threshold: 5,
            comparison: 'less_than'
          }
        ],
        conditions: [
          {
            type: 'reading_experience',
            value: 'novice',
            operator: 'equals'
          }
        ],
        action: {
          type: 'workflow_improvement',
          component: 'OnboardingGuide',
          props: {
            interactiveTutorial: true,
            featureHighlights: true,
            progressiveDisclosure: true,
            helpSystem: true
          },
          expectedImpact: {
            satisfactionImprovement: 0.5,
            engagementImprovement: 0.4,
            usabilityImprovement: 0.6,
            confidence: 0.8
          }
        },
        cooldown: 60,
        maxPerSession: 1
      }
    ];

    // Sort rules by priority
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Evaluate rule triggers
   */
  private evaluateTriggers(triggers: RecommendationTrigger[], context: RecommendationContext): boolean {
    return triggers.some(trigger => {
      switch (trigger.type) {
        case 'behavior_pattern':
          return this.evaluateBehaviorTrigger(trigger, context);

        case 'satisfaction_drop':
          return this.evaluateSatisfactionTrigger(trigger, context);

        case 'performance_issue':
          return this.evaluatePerformanceTrigger(trigger, context);

        case 'time_based':
          return this.evaluateTimeTrigger(trigger, context);

        case 'usage_milestone':
          return this.evaluateUsageTrigger(trigger, context);

        default:
          return false;
      }
    });
  }

  /**
   * Evaluate behavior pattern trigger
   */
  private evaluateBehaviorTrigger(trigger: RecommendationTrigger, context: RecommendationContext): boolean {
    if (!trigger.metric || trigger.threshold === undefined) return false;

    const { userBehavior } = context;
    let value: any;

    // Extract value based on metric
    switch (trigger.metric) {
      case 'averageReadingSpeed':
        value = userBehavior.readingPatterns?.[0]?.averageReadingSpeed;
        break;
      case 'sessionDuration':
        value = context.currentActivity.sessionDuration;
        break;
      case 'deviceType':
        value = userBehavior.readingPatterns?.[0]?.deviceType;
        break;
      case 'knowledgeEnhancementUsage':
        value = userBehavior.interactionMetrics?.knowledgeEnhancementUsage || 0;
        break;
      case 'featureAdoptionCount':
        value = Object.keys(userBehavior.interactionMetrics?.featureAdoption || {}).length;
        break;
      default:
        return false;
    }

    if (value === undefined) return false;

    // Compare value with threshold
    switch (trigger.comparison) {
      case 'greater_than':
        return value > trigger.threshold;
      case 'less_than':
        return value < trigger.threshold;
      case 'equals':
        return value === trigger.threshold;
      default:
        return false;
    }
  }

  /**
   * Evaluate satisfaction drop trigger
   */
  private evaluateSatisfactionTrigger(trigger: RecommendationTrigger, context: RecommendationContext): boolean {
    const satisfactionScores = context.userBehavior.satisfactionScores || [];
    if (satisfactionScores.length === 0) return false;

    // Calculate recent average satisfaction
    const recentScores = satisfactionScores.slice(-3); // Last 3 scores
    const avgSatisfaction = recentScores.reduce((sum, score) => sum + score.score, 0) / recentScores.length;

    return avgSatisfaction < (trigger.threshold || 3.5);
  }

  /**
   * Evaluate performance issue trigger
   */
  private evaluatePerformanceTrigger(trigger: RecommendationTrigger, context: RecommendationContext): boolean {
    if (!trigger.metric || trigger.threshold === undefined) return false;

    const { userBehavior, systemState } = context;

    switch (trigger.metric) {
      case 'errorRecoveryTime':
        const errorTime = userBehavior.interactionMetrics?.errorRecoveryTime || 0;
        return errorTime > trigger.threshold;

      case 'responseTime':
        return systemState.performance.averageResponseTime > trigger.threshold;

      case 'errorRate':
        return systemState.performance.errorRate > trigger.threshold;

      default:
        return false;
    }
  }

  /**
   * Evaluate time-based trigger
   */
  private evaluateTimeTrigger(trigger: RecommendationTrigger, context: RecommendationContext): boolean {
    const currentHour = new Date().getHours();

    // Evening/night hours (6 PM - 6 AM)
    return currentHour >= 18 || currentHour <= 6;
  }

  /**
   * Evaluate usage milestone trigger
   */
  private evaluateUsageTrigger(trigger: RecommendationTrigger, context: RecommendationContext): boolean {
    if (!trigger.metric || trigger.threshold === undefined) return false;

    const { userBehavior } = context;
    const timeWindow = trigger.timeWindow || 60; // default 60 minutes

    // For this example, we'll check if usage in current session exceeds threshold
    // In a real implementation, you'd check usage within the time window
    switch (trigger.metric) {
      case 'knowledgeEnhancementUsage':
        return (userBehavior.interactionMetrics?.knowledgeEnhancementUsage || 0) > trigger.threshold;

      default:
        return false;
    }
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateConditions(conditions: RecommendationCondition[], context: RecommendationContext): boolean {
    return conditions.every(condition => {
      switch (condition.type) {
        case 'device_type':
          const deviceType = context.userBehavior.readingPatterns?.[0]?.deviceType;
          return this.compareValue(deviceType, condition.value, condition.operator || 'equals');

        case 'time_of_day':
          const currentHour = new Date().getHours();
          let timeOfDay: string;
          if (currentHour >= 6 && currentHour < 12) timeOfDay = 'morning';
          else if (currentHour >= 12 && currentHour < 18) timeOfDay = 'afternoon';
          else if (currentHour >= 18 && currentHour < 22) timeOfDay = 'evening';
          else timeOfDay = 'night';

          return this.compareValue(timeOfDay, condition.value, condition.operator || 'equals');

        case 'session_length':
          const duration = context.currentActivity.sessionDuration;
          let sessionLength: string;
          if (duration < 15) sessionLength = 'short';
          else if (duration < 45) sessionLength = 'medium';
          else sessionLength = 'long';

          return this.compareValue(sessionLength, condition.value, condition.operator || 'equals');

        case 'reading_experience':
          // Determine reading experience based on behavior
          const knowledgeUsage = context.userBehavior.interactionMetrics?.knowledgeEnhancementUsage || 0;
          let experience: string;
          if (knowledgeUsage > 10) experience = 'expert';
          else if (knowledgeUsage > 3) experience = 'intermediate';
          else experience = 'novice';

          return this.compareValue(experience, condition.value, condition.operator || 'equals');

        default:
          return true;
      }
    });
  }

  /**
   * Compare values using specified operator
   */
  private compareValue(actual: any, expected: any, operator: string): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'greater_than':
        return actual > expected;
      case 'less_than':
        return actual < expected;
      default:
        return actual === expected;
    }
  }

  /**
   * Check if rule is on cooldown
   */
  private isRuleOnCooldown(rule: RecommendationRule, history: PersonalizationRecommendation[]): boolean {
    if (!rule.cooldown) return false;

    const lastRecommendation = history
      .filter(rec => rec.metadata?.ruleId === rule.id)
      .sort((a, b) => new Date(b.validUntil).getTime() - new Date(a.validUntil).getTime())[0];

    if (!lastRecommendation) return false;

    const cooldownExpiry = new Date(lastRecommendation.validUntil).getTime() + (rule.cooldown * 60 * 1000);
    return Date.now() < cooldownExpiry;
  }

  /**
   * Check if rule has exceeded session limit
   */
  private hasExceededSessionLimit(rule: RecommendationRule, history: PersonalizationRecommendation[]): boolean {
    if (!rule.maxPerSession) return false;

    const ruleRecommendations = history.filter(rec => rec.metadata?.ruleId === rule.id);
    return ruleRecommendations.length >= rule.maxPerSession;
  }

  /**
   * Create recommendation from rule
   */
  private createRecommendation(rule: RecommendationRule, context: RecommendationContext): PersonalizationRecommendation {
    const validDuration = 60 * 60 * 1000; // 1 hour default validity

    return {
      id: `${rule.id}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: rule.action.type,
      priority: rule.priority,
      title: rule.name,
      description: rule.description,
      implementation: {
        component: rule.action.component,
        props: rule.action.props
      },
      expectedImpact: rule.action.expectedImpact,
      validUntil: new Date(Date.now() + validDuration).toISOString(),
      metadata: {
        ruleId: rule.id,
        triggered: new Date().toISOString(),
        context: {
          route: context.currentActivity.currentRoute,
          sessionDuration: context.currentActivity.sessionDuration,
          deviceType: context.userBehavior.readingPatterns?.[0]?.deviceType || 'unknown'
        }
      }
    };
  }

  /**
   * Get recommendation performance metrics
   */
  getRecommendationMetrics(sessionId: string): {
    totalRecommendations: number;
    acceptedRecommendations: number;
    acceptanceRate: number;
    topPerformingRules: string[];
  } {
    const recommendations = this.recommendationHistory.get(sessionId) || [];
    const totalRecommendations = recommendations.length;

    // In a real implementation, track which recommendations were accepted
    const acceptedRecommendations = Math.floor(totalRecommendations * 0.7); // Mock 70% acceptance
    const acceptanceRate = totalRecommendations > 0 ? acceptedRecommendations / totalRecommendations : 0;

    // Count rule usage
    const ruleUsage = new Map<string, number>();
    recommendations.forEach(rec => {
      const ruleId = rec.metadata?.ruleId;
      if (ruleId) {
        ruleUsage.set(ruleId, (ruleUsage.get(ruleId) || 0) + 1);
      }
    });

    const topPerformingRules = Array.from(ruleUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ruleId]) => ruleId);

    return {
      totalRecommendations,
      acceptedRecommendations,
      acceptanceRate,
      topPerformingRules
    };
  }

  /**
   * Clear recommendation history for session
   */
  clearSessionHistory(sessionId: string): void {
    this.recommendationHistory.delete(sessionId);
  }

  /**
   * Get all active recommendation rules
   */
  getRecommendationRules(): RecommendationRule[] {
    return [...this.rules];
  }
}

// Export singleton instance
export const recommendationEngine = new PersonalizationRecommendationEngine();