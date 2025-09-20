/**
 * FlowReader Experiments Framework
 *
 * Complete A/B testing and controlled experiments system with privacy-first
 * anonymous tracking, specialized feature testing, and automated analysis.
 */

// Core SDK exports
export {
  initializeExperiments,
  getExperiments,
  getExperiment,
  track,
  createFeatureFlag,
  ExperimentClientSDK
} from './client-sdk.js';

// Metrics and reporting
export {
  metricCollector,
  type MetricDefinition,
  type MetricValue,
  type AggregatedMetric,
  type ComparisonResult
} from './metrics.js';

export {
  experimentReporter,
  type ReportingConfig,
  type ReportSchedule,
  type NotificationConfig
} from './reporting.js';

// Knowledge enhancement experiments
export {
  KnowledgeExperimentManager,
  getKnowledgeConfig,
  trackKnowledgeMetrics,
  shouldUseProgressiveFill,
  shouldUsePrecompute,
  getLatencyTarget,
  getQualityThreshold,
  type KnowledgeExperimentConfig,
  type KnowledgeEnhancementConfig,
  type KnowledgeRequestContext,
  type KnowledgePerformanceMetrics
} from './knowledge-experiments.js';

// Feedback entry experiments
export {
  FeedbackExperimentManager,
  getFeedbackUIConfig,
  trackFeedbackInteraction,
  type FeedbackExperimentConfig,
  type FeedbackUIConfig,
  type FeedbackInteractionContext,
  type FeedbackMetrics
} from './feedback-experiments.js';

// Type exports from shared package
export type {
  ExperimentConfig,
  ExperimentVariant,
  ExperimentAssignment,
  ExperimentEvent,
  ExperimentContext,
  ExperimentResults,
  ExperimentQueryResult,
  KnowledgeEnhancementExperiment,
  KnowledgeVariant,
  FeedbackEntryExperiment,
  FeedbackVariant,
  MetricType,
  MetricAggregation,
  AutoEndCondition,
  Recommendation,
  StatisticalAnalysis,
  FeatureFlag
} from '@flowreader/shared/experiments/types.js';