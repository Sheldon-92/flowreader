/**
 * FlowReader Experiments Framework
 *
 * Comprehensive A/B testing and feature flag system for controlled experiments
 * with privacy-first anonymous metric collection and automatic reporting.
 */

// Core experiment configuration
export interface ExperimentConfig {
  id: string;
  name: string;
  description: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  targeting: ExperimentTargeting;
  metrics: ExperimentMetric[];
  startDate: string;
  endDate?: string;
  autoEndConditions?: AutoEndCondition[];
  metadata: ExperimentMetadata;
}

export type ExperimentStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  allocation: number; // Percentage allocation (0-100)
  configuration: Record<string, any>;
  isControl: boolean;
}

export interface ExperimentTargeting {
  // Traffic allocation
  trafficAllocation: number; // Percentage of users to include (0-100)

  // User targeting (anonymous)
  sessionBased: boolean;

  // Feature/route targeting
  features?: string[];
  routes?: string[];

  // Geographic targeting (optional)
  regions?: string[];

  // Custom targeting conditions
  customConditions?: TargetingCondition[];
}

export interface TargetingCondition {
  type: 'feature_flag' | 'user_property' | 'session_property' | 'route' | 'custom';
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  property: string;
  value: any;
}

// Metrics and measurement
export interface ExperimentMetric {
  id: string;
  name: string;
  type: MetricType;
  description: string;
  isPrimary: boolean;
  target?: MetricTarget;
  aggregation: MetricAggregation;
}

export type MetricType =
  | 'engagement'
  | 'conversion'
  | 'satisfaction'
  | 'performance'
  | 'retention'
  | 'custom';

export type MetricAggregation = 'sum' | 'average' | 'median' | 'count' | 'unique_count' | 'rate';

export interface MetricTarget {
  value: number;
  direction: 'increase' | 'decrease';
  confidence: number; // Statistical confidence level (0.8, 0.9, 0.95, 0.99)
}

// Auto-end conditions
export interface AutoEndCondition {
  type: 'time' | 'sample_size' | 'statistical_significance' | 'metric_threshold' | 'safety';
  configuration: Record<string, any>;
  priority: number; // Higher priority conditions checked first
}

export interface ExperimentMetadata {
  owner: string;
  tags: string[];
  category: ExperimentCategory;
  priority: ExperimentPriority;
  estimatedDuration?: number; // Days
  estimatedSampleSize?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExperimentCategory =
  | 'feature'
  | 'ui_ux'
  | 'performance'
  | 'ai_enhancement'
  | 'monetization'
  | 'onboarding'
  | 'engagement';

export type ExperimentPriority = 'low' | 'medium' | 'high' | 'critical';

// Experiment assignment and tracking
export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  sessionId: string;
  assignedAt: string;
  context: AssignmentContext;
}

export interface AssignmentContext {
  route?: string;
  feature?: string;
  userAgent?: string;
  region?: string;
  customProperties?: Record<string, any>;
}

// Event tracking for experiments
export interface ExperimentEvent {
  id: string;
  experimentId: string;
  variantId: string;
  sessionId: string;
  metricId: string;
  eventType: EventType;
  value?: number;
  properties?: Record<string, any>;
  timestamp: string;
}

export type EventType =
  | 'exposure'
  | 'conversion'
  | 'engagement'
  | 'satisfaction'
  | 'performance'
  | 'error'
  | 'custom';

// Specific experiment types for FlowReader features
export interface KnowledgeEnhancementExperiment extends ExperimentConfig {
  category: 'ai_enhancement';
  variants: KnowledgeVariant[];
}

export interface KnowledgeVariant extends ExperimentVariant {
  configuration: {
    enhancementStyle: 'basic' | 'progressive' | 'precomputed' | 'cached';
    latencyTarget: number; // milliseconds
    qualityThreshold: number; // 0-1
    fallbackEnabled: boolean;
    progressiveFillEnabled: boolean;
  };
}

export interface FeedbackEntryExperiment extends ExperimentConfig {
  category: 'ui_ux';
  variants: FeedbackVariant[];
}

export interface FeedbackVariant extends ExperimentVariant {
  configuration: {
    triggerType: 'always' | 'contextual' | 'time_based' | 'smart';
    formStyle: 'minimal' | 'detailed' | 'conversational';
    position: 'bottom_right' | 'top_bar' | 'sidebar' | 'modal';
    frequency: 'once' | 'session' | 'daily' | 'weekly';
  };
}

// Results and reporting
export interface ExperimentResults {
  experimentId: string;
  generatedAt: string;
  status: ExperimentStatus;
  summary: ExperimentSummary;
  variants: VariantResults[];
  metrics: MetricResults[];
  recommendations: Recommendation[];
  statisticalAnalysis: StatisticalAnalysis;
}

export interface ExperimentSummary {
  totalParticipants: number;
  duration: number; // days
  confidenceLevel: number;
  primaryMetricWinner?: string; // variant ID
  overallRecommendation: 'deploy_winner' | 'continue_experiment' | 'stop_experiment' | 'inconclusive';
}

export interface VariantResults {
  variantId: string;
  name: string;
  participants: number;
  allocation: number;
  metrics: Record<string, VariantMetricResult>;
}

export interface VariantMetricResult {
  metricId: string;
  value: number;
  confidenceInterval: [number, number];
  significance: number;
  improvement?: number; // percentage vs control
}

export interface MetricResults {
  metricId: string;
  name: string;
  type: MetricType;
  winner?: string; // variant ID
  statisticalSignificance: number;
  practicalSignificance: number;
  variants: Record<string, VariantMetricResult>;
}

export interface Recommendation {
  type: 'deploy' | 'iterate' | 'stop' | 'extend';
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  details: string;
  actions: string[];
}

export interface StatisticalAnalysis {
  method: 'frequentist' | 'bayesian';
  sampleSize: number;
  power: number;
  alpha: number;
  effectSize: number;
  requiredSampleSize: number;
  currentPower: number;
}

// SDK Configuration
export interface ExperimentSDKConfig {
  apiEndpoint: string;
  apiKey?: string;
  debug: boolean;
  cacheEnabled: boolean;
  cacheTTL: number; // milliseconds
  defaultTimeout: number; // milliseconds
  batchEventReporting: boolean;
  reportingInterval: number; // milliseconds
}

// Feature flag integration
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  variants?: Record<string, any>;
  targeting?: ExperimentTargeting;
  rolloutPercentage?: number;
  experimentId?: string;
}

// Privacy and compliance
export interface PrivacyConfig {
  anonymousOnly: boolean;
  dataRetentionDays: number;
  allowedRegions?: string[];
  consentRequired: boolean;
  piiScrubbing: boolean;
}

// Error handling
export interface ExperimentError {
  code: string;
  message: string;
  experimentId?: string;
  variantId?: string;
  context?: Record<string, any>;
  timestamp: string;
}

export type ExperimentErrorCode =
  | 'ASSIGNMENT_FAILED'
  | 'VARIANT_NOT_FOUND'
  | 'EXPERIMENT_INACTIVE'
  | 'TARGETING_ERROR'
  | 'METRIC_TRACKING_FAILED'
  | 'CONFIG_INVALID'
  | 'NETWORK_ERROR'
  | 'STORAGE_ERROR';

// Utilities
export interface ExperimentContext {
  sessionId: string;
  route?: string;
  feature?: string;
  timestamp: string;
  userAgent?: string;
  region?: string;
  customProperties?: Record<string, any>;
}

export interface ExperimentQueryResult {
  assignment?: ExperimentAssignment;
  variant?: ExperimentVariant;
  shouldTrack: boolean;
  error?: ExperimentError;
}

// Batch operations
export interface BatchMetricEvent {
  events: ExperimentEvent[];
  sessionId: string;
  timestamp: string;
}

export interface BatchReportingConfig {
  maxBatchSize: number;
  flushInterval: number; // milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
}