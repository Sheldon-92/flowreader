/**
 * Automatic Summary Reporting and End Conditions
 *
 * Automated experiment monitoring, analysis, and decision-making system
 * with configurable end conditions and comprehensive reporting.
 */

import type {
  ExperimentConfig,
  ExperimentResults,
  AutoEndCondition,
  Recommendation,
  StatisticalAnalysis,
  ExperimentSummary
} from '@flowreader/shared/experiments/types.js';
import { metricCollector, type MetricCollector, type ComparisonResult } from './metrics.js';

export interface ReportingConfig {
  checkInterval: number; // milliseconds
  enableAutoEnd: boolean;
  enableSlackNotifications: boolean;
  enableEmailNotifications: boolean;
  confidenceThreshold: number;
  minimumSampleSize: number;
  maximumDuration: number; // days
}

export interface ReportSchedule {
  experimentId: string;
  frequency: 'hourly' | 'daily' | 'weekly';
  recipients: string[];
  includeRawData: boolean;
  customMetrics?: string[];
}

export interface NotificationConfig {
  slack?: {
    webhookUrl: string;
    channel: string;
  };
  email?: {
    apiKey: string;
    fromAddress: string;
  };
}

/**
 * Automated experiment reporting and monitoring system
 */
export class ExperimentReporter {
  private config: ReportingConfig;
  private notifications: NotificationConfig;
  private schedules = new Map<string, ReportSchedule>();
  private checkTimer?: NodeJS.Timeout;
  private metricCollector: MetricCollector;

  constructor(
    config: Partial<ReportingConfig> = {},
    notifications: NotificationConfig = {},
    metricCollector: MetricCollector = metricCollector
  ) {
    this.config = {
      checkInterval: 3600000, // 1 hour
      enableAutoEnd: true,
      enableSlackNotifications: false,
      enableEmailNotifications: false,
      confidenceThreshold: 0.95,
      minimumSampleSize: 100,
      maximumDuration: 30,
      ...config
    };

    this.notifications = notifications;
    this.metricCollector = metricCollector;

    if (this.config.enableAutoEnd) {
      this.startAutoEndMonitoring();
    }
  }

  /**
   * Generate comprehensive experiment report
   */
  async generateReport(experimentConfig: ExperimentConfig): Promise<ExperimentResults> {
    const variantIds = experimentConfig.variants.map(v => v.id);
    const baseResults = this.metricCollector.generateResults(experimentConfig.id, variantIds);

    // Enhance with additional analysis
    const enhancedResults = await this.enhanceResults(baseResults, experimentConfig);

    // Generate recommendations
    const recommendations = this.generateRecommendations(enhancedResults, experimentConfig);

    // Perform statistical analysis
    const statisticalAnalysis = this.performStatisticalAnalysis(enhancedResults, experimentConfig);

    return {
      ...enhancedResults,
      recommendations,
      statisticalAnalysis
    };
  }

  /**
   * Check if experiment should automatically end
   */
  async checkAutoEndConditions(experimentConfig: ExperimentConfig): Promise<{
    shouldEnd: boolean;
    reason?: string;
    triggeredCondition?: AutoEndCondition;
  }> {
    if (!experimentConfig.autoEndConditions?.length) {
      return { shouldEnd: false };
    }

    const results = await this.generateReport(experimentConfig);

    // Sort conditions by priority
    const sortedConditions = experimentConfig.autoEndConditions.sort((a, b) => b.priority - a.priority);

    for (const condition of sortedConditions) {
      const result = await this.evaluateEndCondition(condition, results, experimentConfig);
      if (result.shouldEnd) {
        return {
          shouldEnd: true,
          reason: result.reason,
          triggeredCondition: condition
        };
      }
    }

    return { shouldEnd: false };
  }

  /**
   * Schedule recurring reports
   */
  scheduleReport(schedule: ReportSchedule): void {
    this.schedules.set(schedule.experimentId, schedule);

    // Set up recurring execution based on frequency
    const intervalMs = this.getIntervalFromFrequency(schedule.frequency);

    setInterval(async () => {
      try {
        await this.executeScheduledReport(schedule);
      } catch (error) {
        console.error(`Failed to execute scheduled report for ${schedule.experimentId}:`, error);
      }
    }, intervalMs);
  }

  /**
   * Generate real-time dashboard data
   */
  async getDashboardData(experimentIds: string[]): Promise<{
    experiments: Array<{
      id: string;
      status: string;
      summary: ExperimentSummary;
      keyMetrics: Array<{ name: string; value: number; trend: 'up' | 'down' | 'stable' }>;
      alerts: string[];
    }>;
    systemHealth: {
      totalExperiments: number;
      activeExperiments: number;
      completedToday: number;
      averageConfidence: number;
    };
  }> {
    const experiments = [];
    let totalExperiments = experimentIds.length;
    let activeExperiments = 0;
    let completedToday = 0;
    let totalConfidence = 0;

    for (const experimentId of experimentIds) {
      // In real implementation, fetch experiment config
      const mockConfig: ExperimentConfig = {
        id: experimentId,
        name: `Experiment ${experimentId}`,
        description: '',
        status: 'active',
        variants: [
          { id: 'control', name: 'Control', description: '', allocation: 50, configuration: {}, isControl: true },
          { id: 'treatment', name: 'Treatment', description: '', allocation: 50, configuration: {}, isControl: false }
        ],
        targeting: { trafficAllocation: 100, sessionBased: true },
        metrics: [],
        startDate: new Date().toISOString(),
        metadata: {
          owner: 'system',
          tags: [],
          category: 'feature',
          priority: 'medium',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      try {
        const results = await this.generateReport(mockConfig);
        const keyMetrics = this.extractKeyMetrics(results);
        const alerts = this.generateAlerts(results, mockConfig);

        experiments.push({
          id: experimentId,
          status: mockConfig.status,
          summary: results.summary,
          keyMetrics,
          alerts
        });

        if (mockConfig.status === 'active') {
          activeExperiments++;
        }

        totalConfidence += results.summary.confidenceLevel;

        // Check if completed today
        if (mockConfig.endDate && this.isToday(mockConfig.endDate)) {
          completedToday++;
        }
      } catch (error) {
        console.error(`Failed to get dashboard data for ${experimentId}:`, error);
      }
    }

    return {
      experiments,
      systemHealth: {
        totalExperiments,
        activeExperiments,
        completedToday,
        averageConfidence: totalConfidence / totalExperiments
      }
    };
  }

  /**
   * Export detailed analytics data
   */
  async exportAnalytics(
    experimentId: string,
    format: 'json' | 'csv' | 'excel' = 'json'
  ): Promise<{
    data: any;
    filename: string;
    contentType: string;
  }> {
    const exportData = this.metricCollector.exportData(experimentId);
    const timestamp = new Date().toISOString().split('T')[0];

    switch (format) {
      case 'csv':
        return {
          data: this.convertToCSV(exportData),
          filename: `experiment_${experimentId}_${timestamp}.csv`,
          contentType: 'text/csv'
        };

      case 'excel':
        return {
          data: this.convertToExcel(exportData),
          filename: `experiment_${experimentId}_${timestamp}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };

      default:
        return {
          data: JSON.stringify(exportData, null, 2),
          filename: `experiment_${experimentId}_${timestamp}.json`,
          contentType: 'application/json'
        };
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  destroy(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
  }

  // Private methods

  private startAutoEndMonitoring(): void {
    this.checkTimer = setInterval(async () => {
      // In real implementation, would fetch active experiments from database
      const activeExperiments: ExperimentConfig[] = [];

      for (const experiment of activeExperiments) {
        try {
          const endCheck = await this.checkAutoEndConditions(experiment);
          if (endCheck.shouldEnd) {
            await this.handleAutoEnd(experiment, endCheck);
          }
        } catch (error) {
          console.error(`Failed to check auto-end conditions for ${experiment.id}:`, error);
        }
      }
    }, this.config.checkInterval);
  }

  private async evaluateEndCondition(
    condition: AutoEndCondition,
    results: ExperimentResults,
    experimentConfig: ExperimentConfig
  ): Promise<{ shouldEnd: boolean; reason?: string }> {
    switch (condition.type) {
      case 'time':
        return this.evaluateTimeCondition(condition, experimentConfig);

      case 'sample_size':
        return this.evaluateSampleSizeCondition(condition, results);

      case 'statistical_significance':
        return this.evaluateSignificanceCondition(condition, results);

      case 'metric_threshold':
        return this.evaluateMetricThresholdCondition(condition, results);

      case 'safety':
        return this.evaluateSafetyCondition(condition, results);

      default:
        return { shouldEnd: false };
    }
  }

  private evaluateTimeCondition(
    condition: AutoEndCondition,
    experimentConfig: ExperimentConfig
  ): { shouldEnd: boolean; reason?: string } {
    const maxDuration = condition.configuration.maxDurationDays || this.config.maximumDuration;
    const startDate = new Date(experimentConfig.startDate);
    const daysSinceStart = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceStart >= maxDuration) {
      return {
        shouldEnd: true,
        reason: `Maximum duration of ${maxDuration} days reached`
      };
    }

    return { shouldEnd: false };
  }

  private evaluateSampleSizeCondition(
    condition: AutoEndCondition,
    results: ExperimentResults
  ): { shouldEnd: boolean; reason?: string } {
    const targetSample = condition.configuration.targetSampleSize || this.config.minimumSampleSize;

    if (results.summary.totalParticipants >= targetSample) {
      return {
        shouldEnd: true,
        reason: `Target sample size of ${targetSample} reached`
      };
    }

    return { shouldEnd: false };
  }

  private evaluateSignificanceCondition(
    condition: AutoEndCondition,
    results: ExperimentResults
  ): { shouldEnd: boolean; reason?: string } {
    const targetConfidence = condition.configuration.targetConfidence || this.config.confidenceThreshold;

    // Find primary metric
    const primaryMetric = results.metrics.find(m => m.metricId.includes('primary') || m.metricId === 'conversion_rate');

    if (primaryMetric && primaryMetric.statisticalSignificance >= targetConfidence) {
      return {
        shouldEnd: true,
        reason: `Statistical significance threshold of ${targetConfidence} reached for primary metric`
      };
    }

    return { shouldEnd: false };
  }

  private evaluateMetricThresholdCondition(
    condition: AutoEndCondition,
    results: ExperimentResults
  ): { shouldEnd: boolean; reason?: string } {
    const metricId = condition.configuration.metricId;
    const threshold = condition.configuration.threshold;
    const direction = condition.configuration.direction || 'increase';

    const metric = results.metrics.find(m => m.metricId === metricId);
    if (!metric || !metric.winner) {
      return { shouldEnd: false };
    }

    const winnerData = metric.variants[metric.winner];
    if (!winnerData) {
      return { shouldEnd: false };
    }

    const meetsThreshold = direction === 'increase'
      ? winnerData.value >= threshold
      : winnerData.value <= threshold;

    if (meetsThreshold) {
      return {
        shouldEnd: true,
        reason: `Metric ${metricId} reached threshold of ${threshold}`
      };
    }

    return { shouldEnd: false };
  }

  private evaluateSafetyCondition(
    condition: AutoEndCondition,
    results: ExperimentResults
  ): { shouldEnd: boolean; reason?: string } {
    const safetyMetrics = condition.configuration.safetyMetrics || [];

    for (const safetyMetricId of safetyMetrics) {
      const metric = results.metrics.find(m => m.metricId === safetyMetricId);
      if (metric && metric.winner) {
        const winnerData = metric.variants[metric.winner];
        const minThreshold = condition.configuration.minSafetyThreshold || 0;

        if (winnerData.value < minThreshold) {
          return {
            shouldEnd: true,
            reason: `Safety threshold violated for metric ${safetyMetricId}`
          };
        }
      }
    }

    return { shouldEnd: false };
  }

  private async enhanceResults(
    baseResults: ExperimentResults,
    experimentConfig: ExperimentConfig
  ): Promise<ExperimentResults> {
    // Add additional analysis, comparisons, etc.
    const enhanced = { ...baseResults };

    // Calculate more detailed statistical metrics
    for (const metric of enhanced.metrics) {
      if (metric.variants && Object.keys(metric.variants).length >= 2) {
        const variantIds = Object.keys(metric.variants);
        const controlId = variantIds.find(id =>
          experimentConfig.variants.find(v => v.id === id)?.isControl
        ) || variantIds[0];

        for (const variantId of variantIds) {
          if (variantId !== controlId) {
            const comparison = this.metricCollector.compareVariants(
              experimentConfig.id,
              controlId,
              variantId,
              metric.metricId
            );

            if (comparison) {
              metric.variants[variantId].improvement = comparison.improvement;
              metric.statisticalSignificance = Math.max(
                metric.statisticalSignificance,
                comparison.statisticalSignificance
              );
              metric.practicalSignificance = Math.max(
                metric.practicalSignificance || 0,
                comparison.practicalSignificance
              );
            }
          }
        }
      }
    }

    return enhanced;
  }

  private generateRecommendations(
    results: ExperimentResults,
    experimentConfig: ExperimentConfig
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Overall recommendation based on primary metric
    const primaryMetric = results.metrics.find(m => m.metricId === 'conversion_rate') || results.metrics[0];

    if (primaryMetric) {
      if (primaryMetric.statisticalSignificance >= this.config.confidenceThreshold) {
        if (primaryMetric.winner && primaryMetric.winner !== 'control') {
          recommendations.push({
            type: 'deploy',
            confidence: 'high',
            reason: 'Statistically significant improvement detected',
            details: `The ${primaryMetric.winner} variant shows significant improvement in ${primaryMetric.name}`,
            actions: [
              'Deploy the winning variant to 100% of users',
              'Monitor metrics for any unexpected changes',
              'Document learnings for future experiments'
            ]
          });
        } else {
          recommendations.push({
            type: 'stop',
            confidence: 'high',
            reason: 'No significant improvement detected',
            details: 'Control variant performs as well or better than treatment variants',
            actions: [
              'Stop the experiment and revert to control',
              'Analyze why the treatment did not perform better',
              'Consider alternative approaches'
            ]
          });
        }
      } else {
        recommendations.push({
          type: 'extend',
          confidence: 'medium',
          reason: 'Insufficient statistical power',
          details: 'More data needed to reach statistical significance',
          actions: [
            'Continue running the experiment',
            'Consider increasing traffic allocation',
            'Monitor for early signs of significance'
          ]
        });
      }
    }

    // Safety recommendations
    const safetyIssues = this.identifySafetyIssues(results);
    if (safetyIssues.length > 0) {
      recommendations.push({
        type: 'stop',
        confidence: 'high',
        reason: 'Safety concerns detected',
        details: `Issues detected: ${safetyIssues.join(', ')}`,
        actions: [
          'Immediately stop the experiment',
          'Investigate the cause of safety issues',
          'Implement safeguards before retesting'
        ]
      });
    }

    return recommendations;
  }

  private performStatisticalAnalysis(
    results: ExperimentResults,
    experimentConfig: ExperimentConfig
  ): StatisticalAnalysis {
    const sampleSize = results.summary.totalParticipants;
    const variants = experimentConfig.variants.length;

    // Calculate required sample size (simplified)
    const alpha = 0.05;
    const power = 0.8;
    const effectSize = 0.05; // 5% relative improvement
    const requiredSampleSize = Math.ceil(16 * Math.pow(effectSize, -2)); // Simplified formula

    // Calculate current power (simplified)
    const currentPower = Math.min(0.99, sampleSize / requiredSampleSize);

    return {
      method: 'frequentist',
      sampleSize,
      power: currentPower,
      alpha,
      effectSize,
      requiredSampleSize,
      currentPower
    };
  }

  private async handleAutoEnd(
    experiment: ExperimentConfig,
    endResult: { shouldEnd: boolean; reason?: string; triggeredCondition?: AutoEndCondition }
  ): Promise<void> {
    console.log(`Auto-ending experiment ${experiment.id}: ${endResult.reason}`);

    // Generate final report
    const finalReport = await this.generateReport(experiment);

    // Send notifications
    if (this.config.enableSlackNotifications && this.notifications.slack) {
      await this.sendSlackNotification(experiment, finalReport, endResult.reason || 'Auto-ended');
    }

    if (this.config.enableEmailNotifications && this.notifications.email) {
      await this.sendEmailNotification(experiment, finalReport, endResult.reason || 'Auto-ended');
    }

    // In real implementation, would update experiment status in database
  }

  private async executeScheduledReport(schedule: ReportSchedule): Promise<void> {
    // In real implementation, fetch experiment config
    const experiment: ExperimentConfig = {
      id: schedule.experimentId,
      name: `Experiment ${schedule.experimentId}`,
      description: '',
      status: 'active',
      variants: [],
      targeting: { trafficAllocation: 100, sessionBased: true },
      metrics: [],
      startDate: new Date().toISOString(),
      metadata: {
        owner: 'system',
        tags: [],
        category: 'feature',
        priority: 'medium',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    const report = await this.generateReport(experiment);

    // Send to recipients (implementation depends on notification system)
    for (const recipient of schedule.recipients) {
      console.log(`Sending scheduled report to ${recipient}`);
    }
  }

  private extractKeyMetrics(results: ExperimentResults): Array<{ name: string; value: number; trend: 'up' | 'down' | 'stable' }> {
    return results.metrics.slice(0, 3).map(metric => ({
      name: metric.name,
      value: metric.winner ? metric.variants[metric.winner]?.value || 0 : 0,
      trend: 'stable' as const // Would calculate from historical data
    }));
  }

  private generateAlerts(results: ExperimentResults, config: ExperimentConfig): string[] {
    const alerts: string[] = [];

    // Low sample size alert
    if (results.summary.totalParticipants < this.config.minimumSampleSize) {
      alerts.push(`Low sample size: ${results.summary.totalParticipants} participants`);
    }

    // Low confidence alert
    if (results.summary.confidenceLevel < this.config.confidenceThreshold) {
      alerts.push(`Low confidence: ${(results.summary.confidenceLevel * 100).toFixed(1)}%`);
    }

    // Long running experiment alert
    const duration = results.summary.duration;
    if (duration > this.config.maximumDuration) {
      alerts.push(`Long running: ${duration} days`);
    }

    return alerts;
  }

  private identifySafetyIssues(results: ExperimentResults): string[] {
    const issues: string[] = [];

    // Check for significant negative performance
    for (const metric of results.metrics) {
      if (metric.name.includes('error') || metric.name.includes('crash')) {
        const winner = metric.winner;
        if (winner && winner !== 'control') {
          const improvement = metric.variants[winner]?.improvement || 0;
          if (improvement > 10) { // 10% increase in errors
            issues.push(`Increased ${metric.name}`);
          }
        }
      }
    }

    return issues;
  }

  private async sendSlackNotification(
    experiment: ExperimentConfig,
    report: ExperimentResults,
    reason: string
  ): Promise<void> {
    // Implementation depends on Slack webhook
    console.log(`Slack notification: Experiment ${experiment.name} ended - ${reason}`);
  }

  private async sendEmailNotification(
    experiment: ExperimentConfig,
    report: ExperimentResults,
    reason: string
  ): Promise<void> {
    // Implementation depends on email service
    console.log(`Email notification: Experiment ${experiment.name} ended - ${reason}`);
  }

  private getIntervalFromFrequency(frequency: 'hourly' | 'daily' | 'weekly'): number {
    switch (frequency) {
      case 'hourly': return 3600000; // 1 hour
      case 'daily': return 86400000; // 24 hours
      case 'weekly': return 604800000; // 7 days
    }
  }

  private isToday(dateString: string): boolean {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  private convertToCSV(data: any): string {
    // Simplified CSV conversion
    return JSON.stringify(data);
  }

  private convertToExcel(data: any): Buffer {
    // Would use a library like xlsx
    return Buffer.from(JSON.stringify(data));
  }
}

// Export singleton instance
export const experimentReporter = new ExperimentReporter();