import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthWithSecurity, convertVercelRequest, enhancedAuth } from '../_lib/auth-enhanced.js';
import { supabaseAdminAdmin } from '../_lib/auth.js';
import type {
  PersonalizationContext,
  PersonalizationRecommendation,
  PersonalizationVariantConfig,
  GetPersonalizationResponse,
  PersonalizationApiResponse
} from '../../apps/web/src/lib/personalization/types.js';

// Import experiment SDK
import { createExperimentSDK } from '../../packages/shared/experiments/backend-sdk.js';
import { getPersonalizationExperiment } from '../../apps/web/src/lib/exp/personalization/experiments.js';

/**
 * Personalization Configuration API
 * Returns personalized configuration and recommendations based on user behavior
 */

interface ConfigRequest {
  sessionId: string;
  context: PersonalizationContext;
}

class PersonalizationConfigService {
  private experimentSDK = createExperimentSDK({
    debug: process.env.NODE_ENV === 'development'
  });

  /**
   * Get personalization configuration for user
   */
  async getPersonalizationConfig(
    request: ConfigRequest,
    userId: string
  ): Promise<GetPersonalizationResponse> {
    const { sessionId, context } = request;

    try {
      // Get personalization experiment assignment
      const experimentResult = await this.experimentSDK.getAssignment(
        'personalization_rollout_v1',
        {
          sessionId,
          route: context.route,
          timestamp: new Date().toISOString(),
          userAgent: context.userAgent,
          customProperties: {
            deviceType: context.userBehavior?.readingPatterns?.[0]?.deviceType || 'desktop',
            sessionDuration: context.currentActivity?.sessionDuration || 0
          }
        }
      );

      if (!experimentResult.assignment || !experimentResult.variant) {
        // No personalization - return empty config
        return {
          recommendations: [],
          variantConfig: this.getDefaultVariantConfig(),
          userSegment: this.getDefaultUserSegment(),
          experimentId: 'control'
        };
      }

      const variantConfig = this.parseVariantConfig(experimentResult.variant.configuration);

      // Generate recommendations based on user behavior and variant config
      const recommendations = await this.generateRecommendations(
        context,
        variantConfig,
        userId
      );

      // Determine user segment
      const userSegment = this.identifyUserSegment(context);

      return {
        recommendations,
        variantConfig,
        userSegment,
        experimentId: experimentResult.assignment.experimentId
      };

    } catch (error) {
      console.error('Failed to get personalization config:', error);

      // Return safe defaults on error
      return {
        recommendations: [],
        variantConfig: this.getDefaultVariantConfig(),
        userSegment: this.getDefaultUserSegment(),
        experimentId: 'error_fallback'
      };
    }
  }

  /**
   * Generate personalized recommendations based on user behavior
   */
  private async generateRecommendations(
    context: PersonalizationContext,
    config: PersonalizationVariantConfig,
    userId: string
  ): Promise<PersonalizationRecommendation[]> {
    const recommendations: PersonalizationRecommendation[] = [];

    if (!config.recommendationEngine.enabled) {
      return recommendations;
    }

    const { userBehavior, currentActivity, systemState } = context;

    // Reading pattern optimizations
    if (userBehavior.readingPatterns?.length > 0) {
      const latestPattern = userBehavior.readingPatterns[0];

      // Slow reading speed - suggest reading aids
      if (latestPattern.averageReadingSpeed < 150) {
        recommendations.push({
          id: `rec_${Date.now()}_reading_speed`,
          type: 'feature_suggestion',
          priority: 7,
          title: 'Enable Reading Focus Mode',
          description: 'Reduce distractions and improve reading speed with focus mode',
          implementation: {
            component: 'ReadingInterface',
            props: {
              focusMode: true,
              distractionsReduced: true,
              lineSpacing: 'expanded'
            }
          },
          expectedImpact: {
            satisfactionImprovement: 0.3,
            engagementImprovement: 0.4,
            usabilityImprovement: 0.2,
            confidence: 0.8
          },
          validUntil: new Date(Date.now() + 3600000).toISOString(), // 1 hour
          metadata: {
            trigger: 'slow_reading_speed',
            readingSpeed: latestPattern.averageReadingSpeed
          }
        });
      }

      // Mobile device - suggest mobile optimizations
      if (latestPattern.deviceType === 'mobile') {
        recommendations.push({
          id: `rec_${Date.now()}_mobile_optimization`,
          type: 'interface_adjustment',
          priority: 6,
          title: 'Optimize for Mobile Reading',
          description: 'Adjust layout and font size for better mobile experience',
          implementation: {
            component: 'MobileLayout',
            props: {
              fontSize: 'large',
              lineHeight: 1.6,
              margins: 'comfortable',
              tapTargets: 'enlarged'
            }
          },
          expectedImpact: {
            satisfactionImprovement: 0.4,
            engagementImprovement: 0.2,
            usabilityImprovement: 0.5,
            confidence: 0.9
          },
          validUntil: new Date(Date.now() + 7200000).toISOString(), // 2 hours
          metadata: {
            trigger: 'mobile_device',
            deviceType: latestPattern.deviceType
          }
        });
      }
    }

    // Knowledge enhancement usage patterns
    if (userBehavior.interactionMetrics?.knowledgeEnhancementUsage > 5) {
      recommendations.push({
        id: `rec_${Date.now()}_knowledge_power_user`,
        type: 'feature_suggestion',
        priority: 5,
        title: 'Advanced Knowledge Features',
        description: 'Access advanced knowledge features for power users',
        implementation: {
          component: 'KnowledgeInterface',
          props: {
            showAdvancedOptions: true,
            batchMode: true,
            keyboardShortcuts: true
          }
        },
        expectedImpact: {
          satisfactionImprovement: 0.2,
          engagementImprovement: 0.3,
          usabilityImprovement: 0.4,
          confidence: 0.7
        },
        validUntil: new Date(Date.now() + 86400000).toISOString(), // 24 hours
        metadata: {
          trigger: 'high_knowledge_usage',
          usageCount: userBehavior.interactionMetrics.knowledgeEnhancementUsage
        }
      });
    }

    // Low satisfaction - suggest interface simplification
    const recentSatisfaction = userBehavior.satisfactionScores?.slice(-3);
    if (recentSatisfaction?.length >= 2) {
      const avgSatisfaction = recentSatisfaction.reduce((sum, s) => sum + s.score, 0) / recentSatisfaction.length;

      if (avgSatisfaction < 3.5) {
        recommendations.push({
          id: `rec_${Date.now()}_simplify_interface`,
          type: 'interface_adjustment',
          priority: 9,
          title: 'Simplify Interface',
          description: 'Reduce complexity to improve your experience',
          implementation: {
            component: 'SimpleInterface',
            props: {
              density: 'comfortable',
              advancedFeatures: false,
              guidedTour: true
            }
          },
          expectedImpact: {
            satisfactionImprovement: 0.6,
            engagementImprovement: 0.1,
            usabilityImprovement: 0.4,
            confidence: 0.8
          },
          validUntil: new Date(Date.now() + 1800000).toISOString(), // 30 minutes
          metadata: {
            trigger: 'low_satisfaction',
            avgSatisfaction
          }
        });
      }
    }

    // Time-based recommendations
    if (config.contextualHints.enabled) {
      const currentHour = new Date().getHours();

      // Evening reading - suggest dark mode
      if (currentHour >= 18 || currentHour <= 6) {
        recommendations.push({
          id: `rec_${Date.now()}_dark_mode`,
          type: 'interface_adjustment',
          priority: 4,
          title: 'Enable Dark Mode',
          description: 'Reduce eye strain during evening reading',
          implementation: {
            component: 'ThemeManager',
            props: {
              theme: 'dark',
              eyeStrainReduction: true
            }
          },
          expectedImpact: {
            satisfactionImprovement: 0.3,
            engagementImprovement: 0.1,
            usabilityImprovement: 0.2,
            confidence: 0.6
          },
          validUntil: new Date(Date.now() + 10800000).toISOString(), // 3 hours
          metadata: {
            trigger: 'evening_reading',
            currentHour
          }
        });
      }
    }

    // Sort by priority and limit based on config
    recommendations.sort((a, b) => b.priority - a.priority);
    return recommendations.slice(0, config.recommendationEngine.maxRecommendations);
  }

  /**
   * Parse variant configuration from experiment
   */
  private parseVariantConfig(config: any): PersonalizationVariantConfig {
    return {
      algorithmType: config.algorithmType || 'rule_based',
      adaptationSpeed: config.adaptationSpeed || 'medium',
      recommendationEngine: {
        enabled: config.recommendationEngine?.enabled || true,
        updateFrequency: config.recommendationEngine?.updateFrequency || 60,
        maxRecommendations: config.recommendationEngine?.maxRecommendations || 3,
        diversityWeight: config.recommendationEngine?.diversityWeight || 0.7,
        noveltyWeight: config.recommendationEngine?.noveltyWeight || 0.3
      },
      interfaceAdaptations: {
        enabled: config.interfaceAdaptations?.enabled || true,
        adaptationTypes: config.interfaceAdaptations?.adaptationTypes || ['layout_density'],
        changeCooldown: config.interfaceAdaptations?.changeCooldown || 30,
        maxChangesPerSession: config.interfaceAdaptations?.maxChangesPerSession || 2
      },
      contextualHints: {
        enabled: config.contextualHints?.enabled || true,
        hintTypes: config.contextualHints?.hintTypes || ['reading_suggestion'],
        showDelay: config.contextualHints?.showDelay || 2000,
        maxHintsPerSession: config.contextualHints?.maxHintsPerSession || 3,
        adaptToUserPace: config.contextualHints?.adaptToUserPace || true
      }
    };
  }

  /**
   * Identify user segment based on behavior
   */
  private identifyUserSegment(context: PersonalizationContext): any {
    const { userBehavior } = context;

    // Reading experience level
    let readingExperience: 'novice' | 'intermediate' | 'expert' = 'intermediate';
    if (userBehavior.interactionMetrics?.knowledgeEnhancementUsage > 10) {
      readingExperience = 'expert';
    } else if (userBehavior.interactionMetrics?.knowledgeEnhancementUsage < 3) {
      readingExperience = 'novice';
    }

    // Device type
    const deviceType = userBehavior.readingPatterns?.[0]?.deviceType || 'desktop';

    // Session length
    let sessionLength: 'short' | 'medium' | 'long' = 'medium';
    const avgDuration = userBehavior.readingPatterns?.reduce((sum, p) => sum + p.sessionDuration, 0) /
                       (userBehavior.readingPatterns?.length || 1);
    if (avgDuration > 60) sessionLength = 'long';
    else if (avgDuration < 15) sessionLength = 'short';

    // Feature usage
    let featureUsage: 'light' | 'moderate' | 'heavy' = 'moderate';
    const totalUsage = (userBehavior.interactionMetrics?.knowledgeEnhancementUsage || 0) +
                      (userBehavior.interactionMetrics?.feedbackFrequency || 0);
    if (totalUsage > 15) featureUsage = 'heavy';
    else if (totalUsage < 5) featureUsage = 'light';

    // Satisfaction level
    let satisfactionLevel: 'low' | 'medium' | 'high' = 'medium';
    const avgSatisfaction = userBehavior.satisfactionScores?.reduce((sum, s) => sum + s.score, 0) /
                           (userBehavior.satisfactionScores?.length || 1);
    if (avgSatisfaction > 4) satisfactionLevel = 'high';
    else if (avgSatisfaction < 3) satisfactionLevel = 'low';

    return {
      criteria: {
        readingExperience,
        deviceType,
        sessionLength,
        featureUsage,
        satisfactionLevel
      },
      description: `${readingExperience} reader using ${deviceType} with ${sessionLength} sessions`,
      size: this.estimateSegmentSize({ readingExperience, deviceType, sessionLength, featureUsage, satisfactionLevel })
    };
  }

  /**
   * Estimate segment size based on criteria
   */
  private estimateSegmentSize(criteria: any): number {
    // Simplified segment size estimation
    let size = 100; // Start with 100%

    if (criteria.readingExperience === 'expert') size *= 0.2; // 20% experts
    else if (criteria.readingExperience === 'novice') size *= 0.3; // 30% novices
    else size *= 0.5; // 50% intermediate

    if (criteria.deviceType === 'mobile') size *= 0.6; // 60% mobile
    else if (criteria.deviceType === 'tablet') size *= 0.1; // 10% tablet
    else size *= 0.3; // 30% desktop

    return Math.round(size);
  }

  /**
   * Get default variant configuration
   */
  private getDefaultVariantConfig(): PersonalizationVariantConfig {
    return {
      algorithmType: 'rule_based',
      adaptationSpeed: 'slow',
      recommendationEngine: {
        enabled: false,
        updateFrequency: 120,
        maxRecommendations: 0,
        diversityWeight: 0.5,
        noveltyWeight: 0.5
      },
      interfaceAdaptations: {
        enabled: false,
        adaptationTypes: [],
        changeCooldown: 60,
        maxChangesPerSession: 0
      },
      contextualHints: {
        enabled: false,
        hintTypes: [],
        showDelay: 5000,
        maxHintsPerSession: 0,
        adaptToUserPace: false
      }
    };
  }

  /**
   * Get default user segment
   */
  private getDefaultUserSegment(): any {
    return {
      criteria: {
        readingExperience: 'intermediate',
        deviceType: 'desktop',
        sessionLength: 'medium',
        featureUsage: 'moderate',
        satisfactionLevel: 'medium'
      },
      description: 'Default user segment',
      size: 100
    };
  }
}

/**
 * API handler for personalization configuration
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    // Convert VercelRequest to standard Request for enhanced auth
    const standardReq = convertVercelRequest(req);

    // Enhanced authentication
    let user;
    try {
      user = await requireAuthWithSecurity(standardReq);
    } catch (authError: any) {
      const statusCode = authError.message?.includes('Rate limit') ? 429 : 401;
      return res.status(statusCode).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: authError.message || 'Authentication required'
        }
      });
    }

    const { sessionId, context } = req.body as ConfigRequest;

    // Validate required fields
    if (!sessionId || !context) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields: sessionId, context'
        }
      });
    }

    // Initialize personalization service
    const personalizationService = new PersonalizationConfigService();

    // Get personalization configuration
    const data = await personalizationService.getPersonalizationConfig(
      { sessionId, context },
      user.id
    );

    const response: PersonalizationApiResponse<GetPersonalizationResponse> = {
      success: true,
      data,
      metadata: {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - Date.now() // Will be calculated properly
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Personalization config API error:', error);

    // Log security event for system errors
    try {
      const standardReq = convertVercelRequest(req);
      await enhancedAuth.logSecurityEvent(
        'system_error',
        null,
        {
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          endpoint: 'POST /api/personalization/config'
        },
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        },
        'medium'
      );
    } catch (logError) {
      console.error('Failed to log security event:', logError);
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
  }
}