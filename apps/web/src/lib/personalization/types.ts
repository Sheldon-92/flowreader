/**
 * FlowReader Personalization System Types
 * Privacy-first real-time UX personalization with anonymous metrics
 */

import type { ExperimentContext } from '@flowreader/shared/experiments/types.js';

// Core personalization types
export interface PersonalizationConfig {
  enabled: boolean;
  rolloutPercentage: number;
  satisfactionTarget: number; // Target satisfaction score (e.g., 4.5)
  anonMetricsOnly: boolean;
  oneClickDisable: boolean;
  gradualRollout: boolean;
  maxRolloutPercentage: number; // Maximum rollout (e.g., 10%)
}

// Anonymous user behavioral data
export interface UserBehaviorMetrics {
  sessionId: string;
  readingPatterns: ReadingPattern[];
  interactionMetrics: InteractionMetrics;
  preferenceSignals: PreferenceSignals;
  satisfactionScores: SatisfactionScore[];
  timestamp: string;
}

export interface ReadingPattern {
  documentType: 'book' | 'article' | 'paper';
  averageReadingSpeed: number; // words per minute
  preferredTextDensity: 'low' | 'medium' | 'high';
  sessionDuration: number; // minutes
  engagementLevel: number; // 0-1 score
  timeOfDay: string; // ISO time
  deviceType: 'mobile' | 'tablet' | 'desktop';
}

export interface InteractionMetrics {
  knowledgeEnhancementUsage: number; // requests per session
  feedbackFrequency: number; // feedback submissions per session
  navigationPatterns: string[]; // route sequences
  featureAdoption: Record<string, number>; // feature usage counts
  errorRecoveryTime: number; // average time to recover from errors
}

export interface PreferenceSignals {
  preferredKnowledgeIntents: ('explain' | 'background' | 'define')[];
  interfacePreferences: InterfacePreferences;
  contentPreferences: ContentPreferences;
  timingPreferences: TimingPreferences;
}

export interface InterfacePreferences {
  layoutDensity: 'compact' | 'comfortable' | 'spacious';
  colorScheme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  animationsEnabled: boolean;
  sidebarPosition: 'left' | 'right' | 'hidden';
}

export interface ContentPreferences {
  recommendationTypes: string[];
  contextHintFrequency: 'minimal' | 'moderate' | 'frequent';
  explanationDepth: 'brief' | 'detailed' | 'comprehensive';
  backgroundInfoLevel: 'basic' | 'intermediate' | 'advanced';
}

export interface TimingPreferences {
  knowledgeDelay: number; // ms before showing knowledge hints
  recommendationFrequency: number; // hours between recommendations
  feedbackPromptTiming: 'immediate' | 'delayed' | 'session-end';
}

export interface SatisfactionScore {
  score: number; // 1-5 scale
  category: 'reading' | 'knowledge' | 'interface' | 'overall';
  timestamp: string;
  context?: string; // optional context about what was rated
}

// Personalization recommendations
export interface PersonalizationRecommendation {
  id: string;
  type: PersonalizationRecommendationType;
  priority: number; // 1-10, higher = more important
  title: string;
  description: string;
  implementation: PersonalizationImplementation;
  expectedImpact: ExpectedImpact;
  validUntil: string;
  metadata: Record<string, any>;
}

export type PersonalizationRecommendationType =
  | 'interface_adjustment'
  | 'content_recommendation'
  | 'timing_optimization'
  | 'feature_suggestion'
  | 'context_hint'
  | 'workflow_improvement';

export interface PersonalizationImplementation {
  component: string; // Component name to modify
  props: Record<string, any>; // Props to apply
  styles?: Record<string, string>; // CSS overrides
  behavior?: string; // Behavioral changes description
}

export interface ExpectedImpact {
  satisfactionImprovement: number; // expected increase in satisfaction
  engagementImprovement: number; // expected increase in engagement
  usabilityImprovement: number; // expected improvement in task completion
  confidence: number; // 0-1 confidence in prediction
}

// Personalization context for decisions
export interface PersonalizationContext extends ExperimentContext {
  userBehavior: UserBehaviorMetrics;
  currentActivity: CurrentActivity;
  systemState: SystemState;
}

export interface CurrentActivity {
  action: 'reading' | 'exploring' | 'searching' | 'learning';
  bookId?: string;
  chapterIndex?: number;
  selectionText?: string;
  intent?: 'explain' | 'background' | 'define';
  sessionDuration: number;
}

export interface SystemState {
  performance: PerformanceMetrics;
  errorRate: number;
  userLoad: number; // current number of active users
  systemLoad: number; // server resource utilization
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  knowledgeLatency: number;
  pageLoadTime: number;
  errorCount: number;
}

// A/B testing variants for personalization
export interface PersonalizationVariant {
  id: string;
  name: string;
  description: string;
  configuration: PersonalizationVariantConfig;
  targetSegment?: UserSegment;
  rolloutPercentage: number;
}

export interface PersonalizationVariantConfig {
  algorithmType: 'rule_based' | 'ml_enhanced' | 'hybrid';
  adaptationSpeed: 'slow' | 'medium' | 'fast';
  recommendationEngine: RecommendationEngineConfig;
  interfaceAdaptations: InterfaceAdaptationConfig;
  contextualHints: ContextualHintsConfig;
}

export interface UserSegment {
  criteria: SegmentCriteria;
  description: string;
  size: number; // expected percentage of users
}

export interface SegmentCriteria {
  readingExperience?: 'novice' | 'intermediate' | 'expert';
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  sessionLength?: 'short' | 'medium' | 'long';
  featureUsage?: 'light' | 'moderate' | 'heavy';
  satisfactionLevel?: 'low' | 'medium' | 'high';
}

export interface RecommendationEngineConfig {
  enabled: boolean;
  updateFrequency: number; // minutes
  maxRecommendations: number;
  diversityWeight: number; // 0-1, higher = more diverse recommendations
  noveltyWeight: number; // 0-1, higher = more novel recommendations
}

export interface InterfaceAdaptationConfig {
  enabled: boolean;
  adaptationTypes: InterfaceAdaptationType[];
  changeCooldown: number; // minutes between adaptations
  maxChangesPerSession: number;
}

export type InterfaceAdaptationType =
  | 'layout_density'
  | 'color_scheme'
  | 'font_size'
  | 'animation_speed'
  | 'sidebar_behavior'
  | 'menu_organization';

export interface ContextualHintsConfig {
  enabled: boolean;
  hintTypes: ContextualHintType[];
  showDelay: number; // ms
  maxHintsPerSession: number;
  adaptToUserPace: boolean;
}

export type ContextualHintType =
  | 'reading_suggestion'
  | 'feature_discovery'
  | 'knowledge_prompt'
  | 'efficiency_tip'
  | 'exploration_hint';

// Analytics and metrics for personalization
export interface PersonalizationMetrics {
  sessionId: string;
  variantId: string;
  timestamp: string;
  metrics: PersonalizationMetricData;
}

export interface PersonalizationMetricData {
  satisfactionScore?: number;
  engagementTime: number;
  taskCompletionRate: number;
  featureDiscoveryRate: number;
  recommendationAcceptanceRate: number;
  interfaceAdaptationSuccessRate: number;
  knowledgeUsageImprovement: number;
  overallUserExperienceScore: number;
}

// Privacy and compliance
export interface PrivacyConfig {
  anonOnly: boolean;
  dataRetentionDays: number;
  allowOptOut: boolean;
  requireConsent: boolean;
  piiScrubbing: boolean;
  encryptMetrics: boolean;
}

// Rollback and safety
export interface SafetyConfig {
  rollbackThreshold: number; // satisfaction score below which to rollback
  errorRateThreshold: number; // error rate above which to rollback
  performanceThreshold: number; // performance degradation threshold
  autoRollback: boolean;
  rollbackCooldown: number; // hours before retry
}

// Experiment configuration for personalization
export interface PersonalizationExperimentConfig {
  id: string;
  name: string;
  description: string;
  variants: PersonalizationVariant[];
  targetMetrics: PersonalizationTargetMetric[];
  statisticalConfig: StatisticalConfig;
  privacyConfig: PrivacyConfig;
  safetyConfig: SafetyConfig;
  duration: ExperimentDuration;
}

export interface PersonalizationTargetMetric {
  metricId: string;
  name: string;
  target: number;
  threshold: number; // minimum improvement required
  weight: number; // importance weight 0-1
}

export interface StatisticalConfig {
  significanceLevel: number; // e.g., 0.05
  power: number; // e.g., 0.8
  minimumSampleSize: number;
  minimumDetectableEffect: number; // minimum effect size to detect
}

export interface ExperimentDuration {
  startDate: string;
  plannedEndDate: string;
  minDurationDays: number;
  maxDurationDays: number;
}

// API response types
export interface PersonalizationApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    requestId: string;
    timestamp: string;
    processingTime: number;
  };
}

export interface GetPersonalizationResponse {
  recommendations: PersonalizationRecommendation[];
  variantConfig: PersonalizationVariantConfig;
  userSegment: UserSegment;
  experimentId: string;
}

export interface TrackPersonalizationResponse {
  recorded: boolean;
  sessionMetrics: PersonalizationMetricData;
  recommendationUpdates?: PersonalizationRecommendation[];
}