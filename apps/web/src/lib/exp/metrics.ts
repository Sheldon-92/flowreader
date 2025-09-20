/**
 * Anonymous Metric Reporting System
 *
 * Privacy-first metric collection for experiment analysis with
 * automatic aggregation and statistical analysis.
 */

import type {
  ExperimentEvent,
  ExperimentMetric,
  MetricType,
  MetricAggregation,
  ExperimentResults,
  VariantResults,
  MetricResults,
  StatisticalAnalysis
} from '@flowreader/shared/experiments/types.js';

export interface MetricDefinition {
  id: string;
  name: string;
  type: MetricType;
  description: string;
  aggregation: MetricAggregation;
  isPrimary: boolean;
  target?: {
    value: number;
    direction: 'increase' | 'decrease';
  };
}

export interface MetricValue {
  value: number;
  count: number;
  timestamp: string;
  properties?: Record<string, any>;
}

export interface AggregatedMetric {
  metricId: string;
  variantId: string;
  aggregatedValue: number;
  count: number;
  variance: number;
  confidenceInterval: [number, number];
  lastUpdated: string;
}

export interface ComparisonResult {
  metric: string;
  control: AggregatedMetric;
  variant: AggregatedMetric;
  statisticalSignificance: number;
  practicalSignificance: number;
  improvement: number; // percentage
  confidenceLevel: number;
  recommendation: 'deploy' | 'continue' | 'stop';
}

/**
 * Anonymous metric collector with privacy-first design
 */
export class MetricCollector {
  private metrics = new Map<string, MetricDefinition>();
  private events: ExperimentEvent[] = [];
  private aggregations = new Map<string, Map<string, AggregatedMetric>>(); // metricId -> variantId -> aggregation

  constructor() {
    this.registerDefaultMetrics();
  }

  /**
   * Register a metric definition
   */
  registerMetric(metric: MetricDefinition): void {
    this.metrics.set(metric.id, metric);
    if (!this.aggregations.has(metric.id)) {
      this.aggregations.set(metric.id, new Map());
    }
  }

  /**
   * Record an experiment event
   */
  recordEvent(event: ExperimentEvent): void {
    // Scrub any potential PII
    const scrubbedEvent = this.scrubEvent(event);

    this.events.push(scrubbedEvent);

    // Update aggregations in real-time
    this.updateAggregations(scrubbedEvent);
  }

  /**
   * Get aggregated metrics for an experiment
   */
  getMetrics(experimentId: string): Record<string, Map<string, AggregatedMetric>> {
    const result: Record<string, Map<string, AggregatedMetric>> = {};

    for (const [metricId, variantMap] of this.aggregations) {
      const experimentVariants = new Map<string, AggregatedMetric>();

      for (const [variantId, aggregation] of variantMap) {
        // Filter by experiment ID (assuming it's encoded in the data)
        const relevantEvents = this.events.filter(e =>
          e.experimentId === experimentId &&
          e.variantId === variantId &&
          e.metricId === metricId
        );

        if (relevantEvents.length > 0) {
          experimentVariants.set(variantId, aggregation);
        }
      }

      if (experimentVariants.size > 0) {
        result[metricId] = experimentVariants;
      }
    }

    return result;
  }

  /**
   * Compare variants for statistical significance
   */
  compareVariants(
    experimentId: string,
    controlVariantId: string,
    treatmentVariantId: string,
    metricId: string
  ): ComparisonResult | null {
    const metrics = this.getMetrics(experimentId);
    const metricData = metrics[metricId];

    if (!metricData) {
      return null;
    }

    const control = metricData.get(controlVariantId);
    const treatment = metricData.get(treatmentVariantId);

    if (!control || !treatment) {
      return null;
    }

    const metric = this.metrics.get(metricId);
    if (!metric) {
      return null;
    }

    // Perform statistical test
    const statisticalResult = this.performStatisticalTest(control, treatment);

    // Calculate practical significance
    const practicalSignificance = this.calculatePracticalSignificance(
      control.aggregatedValue,
      treatment.aggregatedValue,
      metric
    );

    // Calculate improvement percentage
    const improvement = ((treatment.aggregatedValue - control.aggregatedValue) / control.aggregatedValue) * 100;

    // Make recommendation
    const recommendation = this.makeRecommendation(
      statisticalResult.significance,
      practicalSignificance,
      improvement,
      metric
    );

    return {
      metric: metricId,
      control,
      variant: treatment,
      statisticalSignificance: statisticalResult.significance,
      practicalSignificance,
      improvement,
      confidenceLevel: statisticalResult.confidenceLevel,
      recommendation
    };
  }

  /**
   * Generate experiment results report
   */
  generateResults(experimentId: string, variants: string[]): ExperimentResults {
    const allMetrics = this.getMetrics(experimentId);
    const metricResults: MetricResults[] = [];
    const variantResults: VariantResults[] = [];

    // Calculate results for each metric
    for (const [metricId, variantData] of Object.entries(allMetrics)) {
      const metric = this.metrics.get(metricId);
      if (!metric) continue;

      const variantMetrics: Record<string, any> = {};
      let winner: string | undefined;
      let bestValue = metric.target?.direction === 'increase' ? -Infinity : Infinity;

      for (const variantId of variants) {
        const data = variantData.get(variantId);
        if (data) {
          variantMetrics[variantId] = {
            metricId,
            value: data.aggregatedValue,
            confidenceInterval: data.confidenceInterval,
            significance: 0 // Will be calculated in comparison
          };

          // Determine winner based on metric direction
          const isWinner = metric.target?.direction === 'increase'
            ? data.aggregatedValue > bestValue
            : data.aggregatedValue < bestValue;

          if (isWinner) {
            bestValue = data.aggregatedValue;
            winner = variantId;
          }
        }
      }

      metricResults.push({
        metricId,
        name: metric.name,
        type: metric.type,
        winner,
        statisticalSignificance: 0, // Would need proper calculation
        practicalSignificance: 0,
        variants: variantMetrics
      });
    }

    // Calculate variant results
    for (const variantId of variants) {
      const metrics: Record<string, any> = {};
      let totalParticipants = 0;

      for (const [metricId, variantData] of Object.entries(allMetrics)) {
        const data = variantData.get(variantId);
        if (data) {
          metrics[metricId] = {
            metricId,
            value: data.aggregatedValue,
            confidenceInterval: data.confidenceInterval,
            significance: 0
          };

          totalParticipants = Math.max(totalParticipants, data.count);
        }
      }

      variantResults.push({
        variantId,
        name: variantId, // In real implementation, get from variant config
        participants: totalParticipants,
        allocation: 0, // Would need from experiment config
        metrics
      });
    }

    // Calculate summary
    const totalParticipants = variantResults.reduce((sum, v) => sum + v.participants, 0);
    const primaryMetric = Array.from(this.metrics.values()).find(m => m.isPrimary);
    const primaryMetricResult = primaryMetric ? metricResults.find(r => r.metricId === primaryMetric.id) : undefined;

    return {
      experimentId,
      generatedAt: new Date().toISOString(),
      status: 'active', // Would come from experiment config
      summary: {
        totalParticipants,
        duration: 0, // Would calculate from experiment start date
        confidenceLevel: 0.95,
        primaryMetricWinner: primaryMetricResult?.winner,
        overallRecommendation: 'continue_experiment' // Would be calculated
      },
      variants: variantResults,
      metrics: metricResults,
      recommendations: [], // Would generate based on analysis
      statisticalAnalysis: {
        method: 'frequentist',
        sampleSize: totalParticipants,
        power: 0.8,
        alpha: 0.05,
        effectSize: 0,
        requiredSampleSize: 1000,
        currentPower: 0
      }
    };
  }

  /**
   * Export metrics data for external analysis
   */
  exportData(experimentId: string): {
    events: ExperimentEvent[];
    aggregations: Record<string, Record<string, AggregatedMetric>>;
    metrics: MetricDefinition[];
  } {
    const relevantEvents = this.events.filter(e => e.experimentId === experimentId);
    const relevantAggregations: Record<string, Record<string, AggregatedMetric>> = {};

    for (const [metricId, variantMap] of this.aggregations) {
      const hasRelevantData = Array.from(variantMap.keys()).some(variantId =>
        relevantEvents.some(e => e.variantId === variantId && e.metricId === metricId)
      );

      if (hasRelevantData) {
        relevantAggregations[metricId] = Object.fromEntries(variantMap);
      }
    }

    return {
      events: relevantEvents,
      aggregations: relevantAggregations,
      metrics: Array.from(this.metrics.values())
    };
  }

  // Private methods

  private registerDefaultMetrics(): void {
    const defaultMetrics: MetricDefinition[] = [
      {
        id: 'engagement_time',
        name: 'Engagement Time',
        type: 'engagement',
        description: 'Time spent engaging with feature',
        aggregation: 'average',
        isPrimary: false,
        target: { value: 30, direction: 'increase' }
      },
      {
        id: 'conversion_rate',
        name: 'Conversion Rate',
        type: 'conversion',
        description: 'Percentage of users who converted',
        aggregation: 'rate',
        isPrimary: true,
        target: { value: 0.05, direction: 'increase' }
      },
      {
        id: 'satisfaction_rating',
        name: 'Satisfaction Rating',
        type: 'satisfaction',
        description: 'User satisfaction rating (1-5)',
        aggregation: 'average',
        isPrimary: false,
        target: { value: 4.0, direction: 'increase' }
      },
      {
        id: 'page_load_time',
        name: 'Page Load Time',
        type: 'performance',
        description: 'Time to load page content',
        aggregation: 'median',
        isPrimary: false,
        target: { value: 2000, direction: 'decrease' }
      },
      {
        id: 'feature_usage',
        name: 'Feature Usage',
        type: 'engagement',
        description: 'Number of times feature was used',
        aggregation: 'count',
        isPrimary: false,
        target: { value: 5, direction: 'increase' }
      }
    ];

    for (const metric of defaultMetrics) {
      this.registerMetric(metric);
    }
  }

  private scrubEvent(event: ExperimentEvent): ExperimentEvent {
    const scrubbed = { ...event };

    // Remove potential PII from properties
    if (scrubbed.properties) {
      const cleanProperties: Record<string, any> = {};

      for (const [key, value] of Object.entries(scrubbed.properties)) {
        // Skip fields that might contain PII
        if (this.isPotentiallyPII(key, value)) {
          continue;
        }

        cleanProperties[key] = value;
      }

      scrubbed.properties = cleanProperties;
    }

    return scrubbed;
  }

  private isPotentiallyPII(key: string, value: any): boolean {
    const piiKeywords = ['email', 'phone', 'name', 'address', 'ip', 'user_id', 'userid'];
    const keyLower = key.toLowerCase();

    // Check if key contains PII keywords
    if (piiKeywords.some(keyword => keyLower.includes(keyword))) {
      return true;
    }

    // Check if value looks like email, phone, etc.
    if (typeof value === 'string') {
      if (value.includes('@') || /^\d{10,}$/.test(value)) {
        return true;
      }
    }

    return false;
  }

  private updateAggregations(event: ExperimentEvent): void {
    const { metricId, variantId, value } = event;

    if (value === undefined) {
      return;
    }

    const metric = this.metrics.get(metricId);
    if (!metric) {
      return;
    }

    let variantMap = this.aggregations.get(metricId);
    if (!variantMap) {
      variantMap = new Map();
      this.aggregations.set(metricId, variantMap);
    }

    let aggregation = variantMap.get(variantId);
    if (!aggregation) {
      aggregation = {
        metricId,
        variantId,
        aggregatedValue: 0,
        count: 0,
        variance: 0,
        confidenceInterval: [0, 0],
        lastUpdated: new Date().toISOString()
      };
      variantMap.set(variantId, aggregation);
    }

    // Update aggregation based on type
    this.updateAggregation(aggregation, value, metric.aggregation);

    // Update confidence interval
    aggregation.confidenceInterval = this.calculateConfidenceInterval(
      aggregation.aggregatedValue,
      aggregation.variance,
      aggregation.count
    );

    aggregation.lastUpdated = new Date().toISOString();
  }

  private updateAggregation(
    aggregation: AggregatedMetric,
    newValue: number,
    type: MetricAggregation
  ): void {
    const oldMean = aggregation.aggregatedValue;
    const oldCount = aggregation.count;
    const newCount = oldCount + 1;

    switch (type) {
      case 'sum':
        aggregation.aggregatedValue += newValue;
        break;

      case 'average':
        // Online algorithm for mean and variance
        const newMean = oldMean + (newValue - oldMean) / newCount;
        const delta = newValue - oldMean;
        const delta2 = newValue - newMean;

        aggregation.variance = oldCount > 0
          ? ((oldCount - 1) * aggregation.variance + delta * delta2) / (newCount - 1)
          : 0;

        aggregation.aggregatedValue = newMean;
        break;

      case 'count':
        aggregation.aggregatedValue = newCount;
        break;

      case 'unique_count':
        // For simplicity, treat as count (would need set tracking for true unique count)
        aggregation.aggregatedValue = newCount;
        break;

      case 'median':
        // For simplicity, use average (proper median would need all values)
        aggregation.aggregatedValue = oldMean + (newValue - oldMean) / newCount;
        break;

      case 'rate':
        // Rate calculation depends on context, defaulting to average
        aggregation.aggregatedValue = oldMean + (newValue - oldMean) / newCount;
        break;
    }

    aggregation.count = newCount;
  }

  private calculateConfidenceInterval(
    mean: number,
    variance: number,
    count: number,
    confidence: number = 0.95
  ): [number, number] {
    if (count < 2) {
      return [mean, mean];
    }

    // Using t-distribution for small samples, normal for large
    const alpha = 1 - confidence;
    const tValue = count > 30 ? 1.96 : 2.576; // Simplified, would use proper t-table

    const standardError = Math.sqrt(variance / count);
    const margin = tValue * standardError;

    return [mean - margin, mean + margin];
  }

  private performStatisticalTest(
    control: AggregatedMetric,
    treatment: AggregatedMetric
  ): { significance: number; confidenceLevel: number } {
    // Simplified t-test implementation
    if (control.count < 2 || treatment.count < 2) {
      return { significance: 0, confidenceLevel: 0 };
    }

    const pooledStdError = Math.sqrt(
      (control.variance / control.count) + (treatment.variance / treatment.count)
    );

    if (pooledStdError === 0) {
      return { significance: 1, confidenceLevel: 1 };
    }

    const tStat = Math.abs(treatment.aggregatedValue - control.aggregatedValue) / pooledStdError;

    // Simplified p-value calculation (would use proper statistical functions)
    const pValue = tStat > 2.576 ? 0.01 : tStat > 1.96 ? 0.05 : 0.5;

    return {
      significance: 1 - pValue,
      confidenceLevel: 1 - pValue
    };
  }

  private calculatePracticalSignificance(
    controlValue: number,
    treatmentValue: number,
    metric: MetricDefinition
  ): number {
    if (!metric.target) {
      return 0;
    }

    const difference = Math.abs(treatmentValue - controlValue);
    const targetThreshold = metric.target.value * 0.05; // 5% of target as practical significance

    return Math.min(1, difference / targetThreshold);
  }

  private makeRecommendation(
    statisticalSignificance: number,
    practicalSignificance: number,
    improvement: number,
    metric: MetricDefinition
  ): 'deploy' | 'continue' | 'stop' {
    // High statistical and practical significance
    if (statisticalSignificance > 0.95 && practicalSignificance > 0.8) {
      const isImprovement = metric.target?.direction === 'increase' ? improvement > 0 : improvement < 0;
      return isImprovement ? 'deploy' : 'stop';
    }

    // Moderate significance - continue testing
    if (statisticalSignificance > 0.8 || practicalSignificance > 0.5) {
      return 'continue';
    }

    // Low significance - stop test
    return 'stop';
  }
}

// Export singleton instance
export const metricCollector = new MetricCollector();