/**
 * Backend Experiment SDK
 *
 * Server-side experiment management and configuration system
 * with anonymous user assignment and metric collection.
 */

import {
  ExperimentConfig,
  ExperimentAssignment,
  ExperimentEvent,
  ExperimentContext,
  ExperimentQueryResult,
  ExperimentVariant,
  ExperimentError,
  AutoEndCondition,
  ExperimentResults,
  BatchMetricEvent,
  BatchReportingConfig,
  ExperimentSDKConfig,
  PrivacyConfig
} from './types.js';

export class ExperimentSDK {
  private config: ExperimentSDKConfig;
  private privacyConfig: PrivacyConfig;
  private experiments = new Map<string, ExperimentConfig>();
  private assignments = new Map<string, ExperimentAssignment[]>(); // sessionId -> assignments
  private eventBuffer: ExperimentEvent[] = [];
  private batchConfig: BatchReportingConfig;

  constructor(
    config: ExperimentSDKConfig,
    privacyConfig: PrivacyConfig,
    batchConfig: BatchReportingConfig
  ) {
    this.config = {
      cacheEnabled: true,
      cacheTTL: 300000, // 5 minutes
      defaultTimeout: 5000,
      batchEventReporting: true,
      reportingInterval: 30000, // 30 seconds
      debug: false,
      ...config
    };

    this.privacyConfig = {
      anonymousOnly: true,
      dataRetentionDays: 90,
      consentRequired: false,
      piiScrubbing: true,
      ...privacyConfig
    };

    this.batchConfig = {
      maxBatchSize: 100,
      flushInterval: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...batchConfig
    };

    // Start batch reporting if enabled
    if (this.config.batchEventReporting) {
      this.startBatchReporting();
    }
  }

  /**
   * Load experiment configurations from storage/API
   */
  async loadExperiments(): Promise<void> {
    try {
      // In a real implementation, this would load from database/API
      // For now, we'll support in-memory configuration
      const experiments = await this.fetchExperimentConfigs();

      for (const experiment of experiments) {
        this.experiments.set(experiment.id, experiment);
      }

      if (this.config.debug) {
        console.log(`Loaded ${experiments.length} experiments`);
      }
    } catch (error) {
      console.error('Failed to load experiments:', error);
      throw new ExperimentError({
        code: 'CONFIG_INVALID',
        message: 'Failed to load experiment configurations',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get experiment assignment for a session
   */
  async getAssignment(
    experimentId: string,
    context: ExperimentContext
  ): Promise<ExperimentQueryResult> {
    try {
      const experiment = this.experiments.get(experimentId);

      if (!experiment) {
        return {
          shouldTrack: false,
          error: {
            code: 'EXPERIMENT_NOT_FOUND',
            message: `Experiment ${experimentId} not found`,
            experimentId,
            timestamp: new Date().toISOString()
          }
        };
      }

      if (experiment.status !== 'active') {
        return {
          shouldTrack: false,
          error: {
            code: 'EXPERIMENT_INACTIVE',
            message: `Experiment ${experimentId} is not active`,
            experimentId,
            timestamp: new Date().toISOString()
          }
        };
      }

      // Check if user is already assigned
      const existingAssignment = this.getExistingAssignment(experimentId, context.sessionId);
      if (existingAssignment) {
        const variant = experiment.variants.find(v => v.id === existingAssignment.variantId);
        return {
          assignment: existingAssignment,
          variant,
          shouldTrack: true
        };
      }

      // Check targeting conditions
      if (!this.evaluateTargeting(experiment.targeting, context)) {
        return {
          shouldTrack: false
        };
      }

      // Assign variant
      const variant = this.assignVariant(experiment, context);
      if (!variant) {
        return {
          shouldTrack: false,
          error: {
            code: 'ASSIGNMENT_FAILED',
            message: 'Failed to assign variant',
            experimentId,
            timestamp: new Date().toISOString()
          }
        };
      }

      // Create assignment
      const assignment: ExperimentAssignment = {
        experimentId,
        variantId: variant.id,
        sessionId: context.sessionId,
        assignedAt: new Date().toISOString(),
        context: {
          route: context.route,
          feature: context.feature,
          userAgent: this.privacyConfig.piiScrubbing ? this.scrubUserAgent(context.userAgent) : context.userAgent,
          region: context.region,
          customProperties: context.customProperties
        }
      };

      // Store assignment
      this.storeAssignment(assignment);

      // Track exposure event
      await this.trackEvent({
        id: this.generateEventId(),
        experimentId,
        variantId: variant.id,
        sessionId: context.sessionId,
        metricId: 'exposure',
        eventType: 'exposure',
        timestamp: new Date().toISOString()
      });

      return {
        assignment,
        variant,
        shouldTrack: true
      };

    } catch (error) {
      console.error('Assignment failed:', error);
      return {
        shouldTrack: false,
        error: {
          code: 'ASSIGNMENT_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          experimentId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Track experiment event
   */
  async trackEvent(event: Omit<ExperimentEvent, 'id'>): Promise<void> {
    try {
      const fullEvent: ExperimentEvent = {
        ...event,
        id: event.id || this.generateEventId()
      };

      if (this.config.batchEventReporting) {
        this.eventBuffer.push(fullEvent);

        if (this.eventBuffer.length >= this.batchConfig.maxBatchSize) {
          await this.flushEvents();
        }
      } else {
        await this.sendEvent(fullEvent);
      }

      if (this.config.debug) {
        console.log('Event tracked:', fullEvent);
      }
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  }

  /**
   * Track multiple metrics for an experiment
   */
  async trackMetrics(
    experimentId: string,
    variantId: string,
    sessionId: string,
    metrics: Array<{
      metricId: string;
      value?: number;
      properties?: Record<string, any>;
    }>
  ): Promise<void> {
    const events = metrics.map(metric => ({
      id: this.generateEventId(),
      experimentId,
      variantId,
      sessionId,
      metricId: metric.metricId,
      eventType: this.inferEventType(metric.metricId),
      value: metric.value,
      properties: metric.properties,
      timestamp: new Date().toISOString()
    }));

    for (const event of events) {
      await this.trackEvent(event);
    }
  }

  /**
   * Get experiment results and analysis
   */
  async getResults(experimentId: string): Promise<ExperimentResults | null> {
    try {
      // This would typically call an analytics service
      // For now, return a placeholder implementation
      const experiment = this.experiments.get(experimentId);
      if (!experiment) {
        return null;
      }

      // In a real implementation, this would aggregate metrics from storage
      return this.generateResultsPlaceholder(experiment);
    } catch (error) {
      console.error('Failed to get results:', error);
      return null;
    }
  }

  /**
   * Check auto-end conditions for active experiments
   */
  async checkAutoEndConditions(): Promise<void> {
    for (const [experimentId, experiment] of this.experiments) {
      if (experiment.status !== 'active' || !experiment.autoEndConditions?.length) {
        continue;
      }

      try {
        const shouldEnd = await this.evaluateAutoEndConditions(experiment);
        if (shouldEnd) {
          await this.endExperiment(experimentId, 'auto_ended');

          if (this.config.debug) {
            console.log(`Auto-ended experiment: ${experimentId}`);
          }
        }
      } catch (error) {
        console.error(`Failed to check auto-end conditions for ${experimentId}:`, error);
      }
    }
  }

  /**
   * Manually end an experiment
   */
  async endExperiment(experimentId: string, reason: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status = 'completed';
    experiment.endDate = new Date().toISOString();

    // Generate final results
    const results = await this.getResults(experimentId);

    // Send completion event
    await this.trackEvent({
      id: this.generateEventId(),
      experimentId,
      variantId: 'system',
      sessionId: 'system',
      metricId: 'experiment_ended',
      eventType: 'custom',
      properties: { reason, results },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Force flush pending events
   */
  async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.sendBatchEvents(events);
    } catch (error) {
      console.error('Failed to flush events:', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...events);
    }
  }

  // Private methods

  private async fetchExperimentConfigs(): Promise<ExperimentConfig[]> {
    // Placeholder - in real implementation, fetch from database/API
    return [];
  }

  private getExistingAssignment(experimentId: string, sessionId: string): ExperimentAssignment | null {
    const sessionAssignments = this.assignments.get(sessionId) || [];
    return sessionAssignments.find(a => a.experimentId === experimentId) || null;
  }

  private evaluateTargeting(targeting: any, context: ExperimentContext): boolean {
    // Traffic allocation check
    if (targeting.trafficAllocation < 100) {
      const hash = this.hashString(context.sessionId);
      const userPercentile = hash % 100;
      if (userPercentile >= targeting.trafficAllocation) {
        return false;
      }
    }

    // Route targeting
    if (targeting.routes?.length && context.route) {
      if (!targeting.routes.includes(context.route)) {
        return false;
      }
    }

    // Feature targeting
    if (targeting.features?.length && context.feature) {
      if (!targeting.features.includes(context.feature)) {
        return false;
      }
    }

    // Custom conditions
    if (targeting.customConditions?.length) {
      for (const condition of targeting.customConditions) {
        if (!this.evaluateCondition(condition, context)) {
          return false;
        }
      }
    }

    return true;
  }

  private evaluateCondition(condition: any, context: ExperimentContext): boolean {
    // Simplified condition evaluation
    const value = context.customProperties?.[condition.property] || context[condition.property as keyof ExperimentContext];

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      default:
        return false;
    }
  }

  private assignVariant(experiment: ExperimentConfig, context: ExperimentContext): ExperimentVariant | null {
    // Deterministic assignment based on session ID hash
    const hash = this.hashString(context.sessionId + experiment.id);
    const assignmentValue = hash % 100;

    let cumulativeAllocation = 0;
    for (const variant of experiment.variants) {
      cumulativeAllocation += variant.allocation;
      if (assignmentValue < cumulativeAllocation) {
        return variant;
      }
    }

    return null;
  }

  private storeAssignment(assignment: ExperimentAssignment): void {
    const sessionAssignments = this.assignments.get(assignment.sessionId) || [];
    sessionAssignments.push(assignment);
    this.assignments.set(assignment.sessionId, sessionAssignments);
  }

  private async sendEvent(event: ExperimentEvent): Promise<void> {
    // Placeholder - send to analytics endpoint
    if (this.config.debug) {
      console.log('Sending event:', event);
    }
  }

  private async sendBatchEvents(events: ExperimentEvent[]): Promise<void> {
    const batch: BatchMetricEvent = {
      events,
      sessionId: 'batch',
      timestamp: new Date().toISOString()
    };

    // Placeholder - send batch to analytics endpoint
    if (this.config.debug) {
      console.log('Sending batch events:', batch);
    }
  }

  private startBatchReporting(): void {
    setInterval(async () => {
      await this.flushEvents();
    }, this.batchConfig.flushInterval);
  }

  private async evaluateAutoEndConditions(experiment: ExperimentConfig): Promise<boolean> {
    if (!experiment.autoEndConditions?.length) {
      return false;
    }

    // Sort by priority and check conditions
    const sortedConditions = experiment.autoEndConditions.sort((a, b) => b.priority - a.priority);

    for (const condition of sortedConditions) {
      switch (condition.type) {
        case 'time':
          if (this.checkTimeCondition(experiment, condition)) {
            return true;
          }
          break;
        case 'sample_size':
          if (await this.checkSampleSizeCondition(experiment, condition)) {
            return true;
          }
          break;
        case 'statistical_significance':
          if (await this.checkSignificanceCondition(experiment, condition)) {
            return true;
          }
          break;
      }
    }

    return false;
  }

  private checkTimeCondition(experiment: ExperimentConfig, condition: AutoEndCondition): boolean {
    const maxDuration = condition.configuration.maxDurationDays || 30;
    const startDate = new Date(experiment.startDate);
    const daysSinceStart = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceStart >= maxDuration;
  }

  private async checkSampleSizeCondition(experiment: ExperimentConfig, condition: AutoEndCondition): Promise<boolean> {
    const targetSample = condition.configuration.targetSampleSize || 1000;
    // In real implementation, query actual participant count
    const actualSample = 0; // Placeholder

    return actualSample >= targetSample;
  }

  private async checkSignificanceCondition(experiment: ExperimentConfig, condition: AutoEndCondition): Promise<boolean> {
    const targetSignificance = condition.configuration.targetSignificance || 0.95;
    // In real implementation, calculate statistical significance
    const actualSignificance = 0; // Placeholder

    return actualSignificance >= targetSignificance;
  }

  private generateResultsPlaceholder(experiment: ExperimentConfig): ExperimentResults {
    return {
      experimentId: experiment.id,
      generatedAt: new Date().toISOString(),
      status: experiment.status,
      summary: {
        totalParticipants: 0,
        duration: 0,
        confidenceLevel: 0.95,
        overallRecommendation: 'inconclusive'
      },
      variants: [],
      metrics: [],
      recommendations: [],
      statisticalAnalysis: {
        method: 'frequentist',
        sampleSize: 0,
        power: 0.8,
        alpha: 0.05,
        effectSize: 0,
        requiredSampleSize: 1000,
        currentPower: 0
      }
    };
  }

  private inferEventType(metricId: string): any {
    if (metricId.includes('conversion')) return 'conversion';
    if (metricId.includes('engagement')) return 'engagement';
    if (metricId.includes('satisfaction')) return 'satisfaction';
    if (metricId.includes('performance')) return 'performance';
    return 'custom';
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private scrubUserAgent(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;

    // Basic PII scrubbing - remove version numbers and detailed info
    return userAgent
      .replace(/\d+\.\d+\.\d+/g, 'X.X.X')
      .replace(/Version\/[\d.]+/g, 'Version/X.X')
      .substring(0, 100); // Limit length
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Convenience factory function
export function createExperimentSDK(
  config: Partial<ExperimentSDKConfig> = {},
  privacyConfig: Partial<PrivacyConfig> = {},
  batchConfig: Partial<BatchReportingConfig> = {}
): ExperimentSDK {
  const defaultConfig: ExperimentSDKConfig = {
    apiEndpoint: '/api/experiments',
    debug: process.env.NODE_ENV === 'development',
    cacheEnabled: true,
    cacheTTL: 300000,
    defaultTimeout: 5000,
    batchEventReporting: true,
    reportingInterval: 30000
  };

  const defaultPrivacyConfig: PrivacyConfig = {
    anonymousOnly: true,
    dataRetentionDays: 90,
    consentRequired: false,
    piiScrubbing: true
  };

  const defaultBatchConfig: BatchReportingConfig = {
    maxBatchSize: 100,
    flushInterval: 30000,
    maxRetries: 3,
    retryDelay: 1000
  };

  return new ExperimentSDK(
    { ...defaultConfig, ...config },
    { ...defaultPrivacyConfig, ...privacyConfig },
    { ...defaultBatchConfig, ...batchConfig }
  );
}