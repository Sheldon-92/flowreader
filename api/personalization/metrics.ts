import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthWithSecurity, convertVercelRequest, enhancedAuth } from '../_lib/auth-enhanced.js';
import { supabaseAdmin } from '../_lib/auth.js';
import type {
  PersonalizationMetrics,
  PersonalizationApiResponse,
  TrackPersonalizationResponse
} from '../../apps/web/src/lib/personalization/types.js';

// Import experiment SDK for tracking
import { createExperimentSDK } from '../../packages/shared/experiments/backend-sdk.js';

/**
 * Personalization Metrics Tracking API
 * Tracks effectiveness of personalization features
 */

interface MetricsRequest {
  sessionId: string;
  metrics: PersonalizationMetrics[];
}

class PersonalizationMetricsService {
  private experimentSDK = createExperimentSDK({
    debug: process.env.NODE_ENV === 'development'
  });

  private readonly MAX_METRICS_PER_REQUEST = 20;
  private readonly METRICS_RETENTION_DAYS = 30;

  /**
   * Track personalization metrics
   */
  async trackMetrics(request: MetricsRequest): Promise<TrackPersonalizationResponse> {
    const { sessionId, metrics } = request;

    try {
      // Validate request
      if (metrics.length > this.MAX_METRICS_PER_REQUEST) {
        throw new Error(`Too many metrics in request. Maximum: ${this.MAX_METRICS_PER_REQUEST}`);
      }

      // Process and validate each metric
      const validatedMetrics = metrics.map(metric => this.validateMetric(metric));

      // Store metrics
      const storedCount = await this.storeMetrics(sessionId, validatedMetrics);

      // Track in experiment framework
      await this.trackExperimentMetrics(validatedMetrics);

      // Calculate session metrics summary
      const sessionMetrics = await this.calculateSessionMetrics(sessionId);

      // Generate updated recommendations if needed
      const recommendationUpdates = await this.generateRecommendationUpdates(
        sessionId,
        validatedMetrics
      );

      return {
        recorded: storedCount > 0,
        sessionMetrics,
        recommendationUpdates
      };

    } catch (error) {
      console.error('Failed to track metrics:', error);
      throw error;
    }
  }

  /**
   * Validate and sanitize metric data
   */
  private validateMetric(metric: PersonalizationMetrics): PersonalizationMetrics {
    const validated: PersonalizationMetrics = {
      sessionId: metric.sessionId,
      variantId: metric.variantId || 'unknown',
      timestamp: metric.timestamp || new Date().toISOString(),
      metrics: this.validateMetricData(metric.metrics)
    };

    return validated;
  }

  /**
   * Validate metric data values
   */
  private validateMetricData(metrics: any): any {
    const validated: any = {};

    // Satisfaction score (1-5 scale)
    if (typeof metrics.satisfactionScore === 'number') {
      validated.satisfactionScore = Math.min(Math.max(metrics.satisfactionScore, 1), 5);
    }

    // Engagement time (minutes, max 8 hours)
    if (typeof metrics.engagementTime === 'number') {
      validated.engagementTime = Math.min(Math.max(metrics.engagementTime, 0), 480);
    }

    // Task completion rate (0-1)
    if (typeof metrics.taskCompletionRate === 'number') {
      validated.taskCompletionRate = Math.min(Math.max(metrics.taskCompletionRate, 0), 1);
    }

    // Feature discovery rate (0-1)
    if (typeof metrics.featureDiscoveryRate === 'number') {
      validated.featureDiscoveryRate = Math.min(Math.max(metrics.featureDiscoveryRate, 0), 1);
    }

    // Recommendation acceptance rate (0-1)
    if (typeof metrics.recommendationAcceptanceRate === 'number') {
      validated.recommendationAcceptanceRate = Math.min(Math.max(metrics.recommendationAcceptanceRate, 0), 1);
    }

    // Interface adaptation success rate (0-1)
    if (typeof metrics.interfaceAdaptationSuccessRate === 'number') {
      validated.interfaceAdaptationSuccessRate = Math.min(Math.max(metrics.interfaceAdaptationSuccessRate, 0), 1);
    }

    // Knowledge usage improvement (-1 to 1, representing decrease/increase)
    if (typeof metrics.knowledgeUsageImprovement === 'number') {
      validated.knowledgeUsageImprovement = Math.min(Math.max(metrics.knowledgeUsageImprovement, -1), 1);
    }

    // Overall user experience score (1-5 scale)
    if (typeof metrics.overallUserExperienceScore === 'number') {
      validated.overallUserExperienceScore = Math.min(Math.max(metrics.overallUserExperienceScore, 1), 5);
    }

    return validated;
  }

  /**
   * Store metrics in database
   */
  private async storeMetrics(
    sessionId: string,
    metrics: PersonalizationMetrics[]
  ): Promise<number> {
    try {
      // Ensure metrics table exists
      await this.ensureMetricsTable();

      const metricRecords = metrics.map(metric => ({
        session_id: sessionId,
        variant_id: metric.variantId,
        metric_data: metric.metrics,
        timestamp: metric.timestamp,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + this.METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      }));

      // Insert metrics
      const { data, error } = await supabaseAdmin
        .from('personalization_metrics')
        .insert(metricRecords);

      if (error) {
        console.error('Failed to store metrics:', error);
        return 0;
      }

      return metricRecords.length;

    } catch (error) {
      console.error('Error storing metrics:', error);
      return 0;
    }
  }

  /**
   * Track metrics in experiment framework
   */
  private async trackExperimentMetrics(metrics: PersonalizationMetrics[]): Promise<void> {
    for (const metric of metrics) {
      const experimentId = 'personalization_rollout_v1';

      try {
        // Track satisfaction if available
        if (metric.metrics.satisfactionScore) {
          await this.experimentSDK.trackEvent({
            experimentId,
            variantId: metric.variantId,
            sessionId: metric.sessionId,
            metricId: 'user_satisfaction',
            eventType: 'satisfaction',
            value: metric.metrics.satisfactionScore,
            timestamp: metric.timestamp
          });
        }

        // Track engagement time if available
        if (metric.metrics.engagementTime) {
          await this.experimentSDK.trackEvent({
            experimentId,
            variantId: metric.variantId,
            sessionId: metric.sessionId,
            metricId: 'engagement_time',
            eventType: 'engagement',
            value: metric.metrics.engagementTime,
            timestamp: metric.timestamp
          });
        }

        // Track task completion if available
        if (metric.metrics.taskCompletionRate !== undefined) {
          await this.experimentSDK.trackEvent({
            experimentId,
            variantId: metric.variantId,
            sessionId: metric.sessionId,
            metricId: 'task_completion_rate',
            eventType: 'conversion',
            value: metric.metrics.taskCompletionRate,
            timestamp: metric.timestamp
          });
        }

        // Track feature discovery if available
        if (metric.metrics.featureDiscoveryRate !== undefined) {
          await this.experimentSDK.trackEvent({
            experimentId,
            variantId: metric.variantId,
            sessionId: metric.sessionId,
            metricId: 'feature_discovery_rate',
            eventType: 'engagement',
            value: metric.metrics.featureDiscoveryRate,
            timestamp: metric.timestamp
          });
        }

        // Track knowledge usage improvement if available
        if (metric.metrics.knowledgeUsageImprovement !== undefined) {
          await this.experimentSDK.trackEvent({
            experimentId,
            variantId: metric.variantId,
            sessionId: metric.sessionId,
            metricId: 'knowledge_usage_improvement',
            eventType: 'engagement',
            value: metric.metrics.knowledgeUsageImprovement,
            timestamp: metric.timestamp
          });
        }

      } catch (error) {
        console.error('Failed to track experiment metric:', error);
      }
    }
  }

  /**
   * Calculate session metrics summary
   */
  private async calculateSessionMetrics(sessionId: string): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('personalization_metrics')
        .select('*')
        .eq('session_id', sessionId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to get session metrics:', error);
        return this.getDefaultSessionMetrics();
      }

      if (!data || data.length === 0) {
        return this.getDefaultSessionMetrics();
      }

      // Calculate averages and trends
      const metrics = data.map(d => d.metric_data);

      const satisfactionScores = metrics
        .map(m => m.satisfactionScore)
        .filter(s => typeof s === 'number');

      const engagementTimes = metrics
        .map(m => m.engagementTime)
        .filter(t => typeof t === 'number');

      const taskCompletionRates = metrics
        .map(m => m.taskCompletionRate)
        .filter(r => typeof r === 'number');

      const featureDiscoveryRates = metrics
        .map(m => m.featureDiscoveryRate)
        .filter(r => typeof r === 'number');

      const recommendationAcceptanceRates = metrics
        .map(m => m.recommendationAcceptanceRate)
        .filter(r => typeof r === 'number');

      const interfaceAdaptationSuccessRates = metrics
        .map(m => m.interfaceAdaptationSuccessRate)
        .filter(r => typeof r === 'number');

      const knowledgeUsageImprovements = metrics
        .map(m => m.knowledgeUsageImprovement)
        .filter(i => typeof i === 'number');

      const overallUXScores = metrics
        .map(m => m.overallUserExperienceScore)
        .filter(s => typeof s === 'number');

      return {
        satisfactionScore: this.calculateAverage(satisfactionScores),
        engagementTime: this.calculateSum(engagementTimes),
        taskCompletionRate: this.calculateAverage(taskCompletionRates),
        featureDiscoveryRate: this.calculateAverage(featureDiscoveryRates),
        recommendationAcceptanceRate: this.calculateAverage(recommendationAcceptanceRates),
        interfaceAdaptationSuccessRate: this.calculateAverage(interfaceAdaptationSuccessRates),
        knowledgeUsageImprovement: this.calculateAverage(knowledgeUsageImprovements),
        overallUserExperienceScore: this.calculateAverage(overallUXScores),
        totalMetrics: data.length,
        sessionDuration: this.calculateSessionDuration(data),
        lastUpdate: data[0]?.created_at
      };

    } catch (error) {
      console.error('Error calculating session metrics:', error);
      return this.getDefaultSessionMetrics();
    }
  }

  /**
   * Generate recommendation updates based on metrics
   */
  private async generateRecommendationUpdates(
    sessionId: string,
    metrics: PersonalizationMetrics[]
  ): Promise<any[] | undefined> {
    try {
      const updates: any[] = [];

      for (const metric of metrics) {
        // If satisfaction is low, suggest immediate improvements
        if (metric.metrics.satisfactionScore && metric.metrics.satisfactionScore < 3) {
          updates.push({
            id: `update_${Date.now()}_low_satisfaction`,
            type: 'urgent_improvement',
            action: 'simplify_interface',
            reason: 'Low satisfaction detected',
            priority: 10
          });
        }

        // If task completion is low, suggest workflow improvements
        if (metric.metrics.taskCompletionRate !== undefined && metric.metrics.taskCompletionRate < 0.5) {
          updates.push({
            id: `update_${Date.now()}_low_completion`,
            type: 'workflow_improvement',
            action: 'add_guidance',
            reason: 'Low task completion rate',
            priority: 8
          });
        }

        // If recommendation acceptance is high, increase recommendation frequency
        if (metric.metrics.recommendationAcceptanceRate !== undefined && metric.metrics.recommendationAcceptanceRate > 0.8) {
          updates.push({
            id: `update_${Date.now()}_high_acceptance`,
            type: 'recommendation_tuning',
            action: 'increase_frequency',
            reason: 'High recommendation acceptance',
            priority: 6
          });
        }

        // If interface adaptation is failing, disable adaptations
        if (metric.metrics.interfaceAdaptationSuccessRate !== undefined && metric.metrics.interfaceAdaptationSuccessRate < 0.3) {
          updates.push({
            id: `update_${Date.now()}_adaptation_failing`,
            type: 'adaptation_control',
            action: 'reduce_changes',
            reason: 'Interface adaptations not successful',
            priority: 7
          });
        }
      }

      return updates.length > 0 ? updates : undefined;

    } catch (error) {
      console.error('Error generating recommendation updates:', error);
      return undefined;
    }
  }

  /**
   * Helper functions
   */
  private calculateAverage(values: number[]): number | undefined {
    if (values.length === 0) return undefined;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateSum(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0);
  }

  private calculateSessionDuration(data: any[]): number {
    if (data.length < 2) return 0;

    const timestamps = data.map(d => new Date(d.created_at).getTime()).sort();
    return (timestamps[timestamps.length - 1] - timestamps[0]) / 1000 / 60; // minutes
  }

  private getDefaultSessionMetrics(): any {
    return {
      satisfactionScore: undefined,
      engagementTime: 0,
      taskCompletionRate: undefined,
      featureDiscoveryRate: undefined,
      recommendationAcceptanceRate: undefined,
      interfaceAdaptationSuccessRate: undefined,
      knowledgeUsageImprovement: undefined,
      overallUserExperienceScore: undefined,
      totalMetrics: 0,
      sessionDuration: 0,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Ensure metrics table exists
   */
  private async ensureMetricsTable(): Promise<void> {
    try {
      // This would typically be handled by database migrations
      const { error } = await supabaseAdmin.rpc('create_table_if_not_exists', {
        table_name: 'personalization_metrics',
        table_definition: `
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          variant_id TEXT NOT NULL,
          metric_data JSONB NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        `
      });

      if (error && !error.message.includes('already exists')) {
        console.error('Failed to ensure metrics table:', error);
      }
    } catch (error) {
      console.log('Metrics table creation handled via existing schema');
    }
  }

  /**
   * Clean up expired metrics
   */
  async cleanupExpiredMetrics(): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin
        .from('personalization_metrics')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Failed to cleanup expired metrics:', error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Error cleaning up metrics:', error);
      return 0;
    }
  }
}

/**
 * API handler for metrics tracking
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

    const { sessionId, metrics } = req.body as MetricsRequest;

    // Validate required fields
    if (!sessionId || !Array.isArray(metrics)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields: sessionId, metrics (array)'
        }
      });
    }

    // Validate metrics array
    if (metrics.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Metrics array cannot be empty'
        }
      });
    }

    // Initialize metrics service
    const metricsService = new PersonalizationMetricsService();

    // Track metrics
    const data = await metricsService.trackMetrics({ sessionId, metrics });

    const response: PersonalizationApiResponse<TrackPersonalizationResponse> = {
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
    console.error('Metrics tracking API error:', error);

    // Log security event for system errors
    try {
      const standardReq = convertVercelRequest(req);
      await enhancedAuth.logSecurityEvent(
        'system_error',
        null,
        {
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          endpoint: 'POST /api/personalization/metrics'
        },
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        },
        'low'
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