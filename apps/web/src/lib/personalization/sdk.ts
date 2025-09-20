/**
 * FlowReader Personalization SDK
 * Privacy-first real-time UX personalization with anonymous metrics
 */

import { browser } from '$app/environment';
import { writable, derived, type Readable } from 'svelte/store';
import type {
  PersonalizationConfig,
  UserBehaviorMetrics,
  PersonalizationRecommendation,
  PersonalizationContext,
  PersonalizationMetrics,
  PersonalizationVariant,
  GetPersonalizationResponse,
  TrackPersonalizationResponse,
  PersonalizationApiResponse,
  PrivacyConfig,
  SafetyConfig,
  InterfacePreferences,
  ContentPreferences,
  ReadingPattern,
  InteractionMetrics,
  SatisfactionScore
} from './types.js';

// Import existing experiment framework
import { ExperimentClientSDK, metricCollector } from '$lib/exp/index.js';

interface PersonalizationSDKConfig {
  apiEndpoint?: string;
  debug?: boolean;
  privacyConfig?: Partial<PrivacyConfig>;
  safetyConfig?: Partial<SafetyConfig>;
  experimentSDK?: ExperimentClientSDK;
}

interface PersonalizationStore {
  enabled: boolean;
  loading: boolean;
  variantId: string | null;
  recommendations: PersonalizationRecommendation[];
  userBehavior: UserBehaviorMetrics | null;
  preferences: {
    interface: Partial<InterfacePreferences>;
    content: Partial<ContentPreferences>;
  };
  satisfactionHistory: SatisfactionScore[];
  error: string | null;
}

class PersonalizationSDK {
  private config: Required<PersonalizationSDKConfig>;
  private sessionId: string;
  private experimentSDK: ExperimentClientSDK;
  private behaviorBuffer: Partial<UserBehaviorMetrics>[] = [];
  private metricsBuffer: PersonalizationMetrics[] = [];
  private flushTimer?: NodeJS.Timeout;

  // Stores
  public readonly store = writable<PersonalizationStore>({
    enabled: false,
    loading: false,
    variantId: null,
    recommendations: [],
    userBehavior: null,
    preferences: {
      interface: {},
      content: {}
    },
    satisfactionHistory: [],
    error: null
  });

  public readonly isEnabled = derived(
    this.store,
    ($store) => $store.enabled
  );

  public readonly isLoading = derived(
    this.store,
    ($store) => $store.loading
  );

  public readonly recommendations = derived(
    this.store,
    ($store) => $store.recommendations
  );

  public readonly preferences = derived(
    this.store,
    ($store) => $store.preferences
  );

  constructor(config: PersonalizationSDKConfig = {}) {
    this.config = {
      apiEndpoint: '/api/personalization',
      debug: false,
      privacyConfig: {
        anonOnly: true,
        dataRetentionDays: 7,
        allowOptOut: true,
        requireConsent: false,
        piiScrubbing: true,
        encryptMetrics: true,
        ...config.privacyConfig
      },
      safetyConfig: {
        rollbackThreshold: 3.5, // satisfaction score below which to rollback
        errorRateThreshold: 0.05, // 5% error rate threshold
        performanceThreshold: 0.2, // 20% performance degradation threshold
        autoRollback: true,
        rollbackCooldown: 24, // 24 hours before retry
        ...config.safetyConfig
      },
      experimentSDK: config.experimentSDK || new ExperimentClientSDK()
    };

    this.experimentSDK = this.config.experimentSDK;
    this.sessionId = this.generateSessionId();

    if (browser) {
      this.initialize();
    }
  }

  /**
   * Initialize the personalization SDK
   */
  private async initialize(): Promise<void> {
    try {
      // Check if personalization is enabled and user consents
      const enabled = await this.checkPersonalizationEnabled();
      if (!enabled) {
        this.store.update(s => ({ ...s, enabled: false }));
        return;
      }

      this.store.update(s => ({ ...s, enabled: true, loading: true }));

      // Load cached preferences
      this.loadCachedPreferences();

      // Initialize behavior tracking
      this.initializeBehaviorTracking();

      // Get personalization configuration and recommendations
      await this.loadPersonalizationConfig();

      // Start metric collection
      this.startMetricCollection();

      this.store.update(s => ({ ...s, loading: false }));

      if (this.config.debug) {
        console.log('Personalization SDK initialized', {
          sessionId: this.sessionId,
          enabled: true
        });
      }

    } catch (error) {
      console.error('Failed to initialize personalization SDK:', error);
      this.store.update(s => ({
        ...s,
        loading: false,
        error: error instanceof Error ? error.message : 'Initialization failed'
      }));
    }
  }

  /**
   * Check if personalization should be enabled for this user
   */
  private async checkPersonalizationEnabled(): Promise<boolean> {
    // Check feature flag from experiment framework
    const experiment = await this.experimentSDK.getExperiment('personalization_rollout');
    if (!experiment?.variant?.configuration?.enabled) {
      return false;
    }

    // Check user consent if required
    if (this.config.privacyConfig.requireConsent) {
      const consent = this.getStoredConsent();
      if (!consent) {
        return false;
      }
    }

    // Check if user has opted out
    if (this.hasUserOptedOut()) {
      return false;
    }

    return true;
  }

  /**
   * Load personalization configuration and recommendations
   */
  private async loadPersonalizationConfig(): Promise<void> {
    try {
      const context = await this.buildPersonalizationContext();
      const response = await this.apiCall<GetPersonalizationResponse>('/config', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: this.sessionId,
          context
        })
      });

      if (response.success && response.data) {
        this.store.update(s => ({
          ...s,
          recommendations: response.data!.recommendations,
          variantId: response.data!.experimentId
        }));

        // Apply immediate recommendations
        this.applyRecommendations(response.data.recommendations);
      }

    } catch (error) {
      console.error('Failed to load personalization config:', error);
    }
  }

  /**
   * Track user behavior metrics (anonymous)
   */
  public trackBehavior(behavior: Partial<UserBehaviorMetrics>): void {
    if (!this.isPersonalizationEnabled()) return;

    // Scrub any PII from behavior data
    const cleanBehavior = this.scrubPII(behavior);

    // Add to buffer
    this.behaviorBuffer.push({
      ...cleanBehavior,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });

    // Immediate analysis for real-time adaptations
    this.analyzeRealtimeBehavior(cleanBehavior);
  }

  /**
   * Track reading pattern
   */
  public trackReadingPattern(pattern: Partial<ReadingPattern>): void {
    this.trackBehavior({
      readingPatterns: [
        {
          documentType: 'book',
          averageReadingSpeed: 200,
          preferredTextDensity: 'medium',
          sessionDuration: 30,
          engagementLevel: 0.8,
          timeOfDay: new Date().toISOString(),
          deviceType: this.detectDeviceType(),
          ...pattern
        }
      ]
    });
  }

  /**
   * Track interaction metrics
   */
  public trackInteraction(interaction: Partial<InteractionMetrics>): void {
    this.trackBehavior({
      interactionMetrics: {
        knowledgeEnhancementUsage: 0,
        feedbackFrequency: 0,
        navigationPatterns: [],
        featureAdoption: {},
        errorRecoveryTime: 0,
        ...interaction
      }
    });
  }

  /**
   * Track satisfaction score
   */
  public trackSatisfaction(score: number, category: SatisfactionScore['category'], context?: string): void {
    const satisfaction: SatisfactionScore = {
      score,
      category,
      timestamp: new Date().toISOString(),
      context
    };

    this.store.update(s => ({
      ...s,
      satisfactionHistory: [...s.satisfactionHistory.slice(-9), satisfaction] // Keep last 10
    }));

    this.trackBehavior({
      satisfactionScores: [satisfaction]
    });

    // Check if we need to trigger safety rollback
    this.checkSafetyThresholds();
  }

  /**
   * Get current personalization recommendations
   */
  public getRecommendations(): PersonalizationRecommendation[] {
    const state = this.getStoreValue();
    return state.recommendations;
  }

  /**
   * Apply a specific recommendation
   */
  public async applyRecommendation(recommendationId: string): Promise<boolean> {
    const recommendations = this.getRecommendations();
    const recommendation = recommendations.find(r => r.id === recommendationId);

    if (!recommendation) {
      console.warn('Recommendation not found:', recommendationId);
      return false;
    }

    try {
      // Apply the recommendation
      await this.applyRecommendationImplementation(recommendation);

      // Track the application
      await this.trackPersonalizationMetric({
        sessionId: this.sessionId,
        variantId: this.getStoreValue().variantId || 'unknown',
        timestamp: new Date().toISOString(),
        metrics: {
          engagementTime: 0,
          taskCompletionRate: 1,
          featureDiscoveryRate: 1,
          recommendationAcceptanceRate: 1,
          interfaceAdaptationSuccessRate: 1,
          knowledgeUsageImprovement: 0,
          overallUserExperienceScore: 4.0
        }
      });

      if (this.config.debug) {
        console.log('Applied recommendation:', recommendation);
      }

      return true;

    } catch (error) {
      console.error('Failed to apply recommendation:', error);
      return false;
    }
  }

  /**
   * Disable personalization (opt-out)
   */
  public disablePersonalization(): void {
    // Store opt-out preference
    if (browser) {
      localStorage.setItem('flowreader_personalization_optout', 'true');
    }

    // Clear all data
    this.clearPersonalizationData();

    // Update store
    this.store.update(s => ({
      ...s,
      enabled: false,
      recommendations: [],
      userBehavior: null,
      preferences: { interface: {}, content: {} }
    }));

    if (this.config.debug) {
      console.log('Personalization disabled by user');
    }
  }

  /**
   * Enable personalization (opt-in)
   */
  public async enablePersonalization(): Promise<void> {
    // Remove opt-out preference
    if (browser) {
      localStorage.removeItem('flowreader_personalization_optout');
    }

    // Reinitialize
    await this.initialize();
  }

  /**
   * Get privacy status and controls
   */
  public getPrivacyStatus(): {
    enabled: boolean;
    anonOnly: boolean;
    canOptOut: boolean;
    dataRetentionDays: number;
    hasConsented: boolean;
  } {
    return {
      enabled: this.isPersonalizationEnabled(),
      anonOnly: this.config.privacyConfig.anonOnly,
      canOptOut: this.config.privacyConfig.allowOptOut,
      dataRetentionDays: this.config.privacyConfig.dataRetentionDays,
      hasConsented: this.getStoredConsent()
    };
  }

  // Private helper methods

  private isPersonalizationEnabled(): boolean {
    return this.getStoreValue().enabled;
  }

  private getStoreValue(): PersonalizationStore {
    let value: PersonalizationStore;
    this.store.subscribe(v => value = v)();
    return value!;
  }

  private generateSessionId(): string {
    return `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private detectDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    if (!browser) return 'desktop';

    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  private scrubPII(data: any): any {
    if (!this.config.privacyConfig.piiScrubbing) return data;

    // Deep clone and scrub sensitive data
    const cleaned = JSON.parse(JSON.stringify(data));

    // Remove any potential PII patterns (very conservative)
    const scrubObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;

      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove potential emails, names, IDs that might be personal
          if (key.toLowerCase().includes('email') ||
              key.toLowerCase().includes('name') ||
              key.toLowerCase().includes('user')) {
            obj[key] = '[REDACTED]';
          }
        } else if (typeof obj[key] === 'object') {
          obj[key] = scrubObject(obj[key]);
        }
      }
      return obj;
    };

    return scrubObject(cleaned);
  }

  private loadCachedPreferences(): void {
    if (!browser) return;

    try {
      const cached = localStorage.getItem('flowreader_personalization_prefs');
      if (cached) {
        const prefs = JSON.parse(cached);
        this.store.update(s => ({
          ...s,
          preferences: prefs
        }));
      }
    } catch (error) {
      console.warn('Failed to load cached preferences:', error);
    }
  }

  private initializeBehaviorTracking(): void {
    if (!browser) return;

    // Track page navigation
    window.addEventListener('beforeunload', () => {
      this.flushBuffers();
    });

    // Track reading behavior
    this.trackReadingBehavior();
    this.trackInteractionBehavior();
  }

  private trackReadingBehavior(): void {
    let startTime = Date.now();
    let scrollTime = 0;

    const handleScroll = () => {
      scrollTime += 100; // Approximate scroll engagement
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const sessionDuration = (Date.now() - startTime) / 1000 / 60; // minutes
        const engagementLevel = Math.min(1, scrollTime / (sessionDuration * 1000));

        this.trackReadingPattern({
          sessionDuration,
          engagementLevel
        });
      } else {
        startTime = Date.now();
        scrollTime = 0;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  private trackInteractionBehavior(): void {
    let navigationSequence: string[] = [];

    // Track navigation patterns
    if (browser && 'navigation' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            navigationSequence.push(window.location.pathname);
            if (navigationSequence.length > 10) {
              navigationSequence = navigationSequence.slice(-10);
            }
          }
        }
      });
      observer.observe({ entryTypes: ['navigation'] });
    }

    // Periodically update interaction metrics
    setInterval(() => {
      this.trackInteraction({
        navigationPatterns: [...navigationSequence]
      });
    }, 30000); // Every 30 seconds
  }

  private async buildPersonalizationContext(): Promise<PersonalizationContext> {
    const baseContext = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      route: browser ? window.location.pathname : '',
      userAgent: browser ? navigator.userAgent : '',
      viewport: browser ? {
        width: window.innerWidth,
        height: window.innerHeight
      } : { width: 1920, height: 1080 }
    };

    const behaviorMetrics = this.getStoreValue().userBehavior || {
      sessionId: this.sessionId,
      readingPatterns: [],
      interactionMetrics: {
        knowledgeEnhancementUsage: 0,
        feedbackFrequency: 0,
        navigationPatterns: [],
        featureAdoption: {},
        errorRecoveryTime: 0
      },
      preferenceSignals: {
        preferredKnowledgeIntents: [],
        interfacePreferences: {},
        contentPreferences: {},
        timingPreferences: {}
      },
      satisfactionScores: [],
      timestamp: new Date().toISOString()
    };

    return {
      ...baseContext,
      userBehavior: behaviorMetrics,
      currentActivity: {
        action: 'reading',
        sessionDuration: 0
      },
      systemState: {
        performance: {
          averageResponseTime: 200,
          knowledgeLatency: 500,
          pageLoadTime: 1000,
          errorCount: 0
        },
        errorRate: 0,
        userLoad: 1,
        systemLoad: 0.1
      }
    };
  }

  private analyzeRealtimeBehavior(behavior: Partial<UserBehaviorMetrics>): void {
    // Real-time behavior analysis for immediate adaptations
    // This could trigger immediate UI changes or recommendations

    if (behavior.satisfactionScores?.some(s => s.score < 3)) {
      // Low satisfaction - maybe suggest interface changes
      this.generateImmediateRecommendations('low_satisfaction');
    }

    if (behavior.interactionMetrics?.errorRecoveryTime && behavior.interactionMetrics.errorRecoveryTime > 10000) {
      // High error recovery time - suggest UI simplification
      this.generateImmediateRecommendations('high_error_recovery');
    }
  }

  private generateImmediateRecommendations(trigger: string): void {
    // Generate context-specific recommendations
    const recommendations: PersonalizationRecommendation[] = [];

    switch (trigger) {
      case 'low_satisfaction':
        recommendations.push({
          id: `imm_${Date.now()}_satisfaction`,
          type: 'interface_adjustment',
          priority: 8,
          title: 'Simplify Interface',
          description: 'Reduce interface complexity to improve satisfaction',
          implementation: {
            component: 'MainLayout',
            props: { density: 'comfortable', animationsEnabled: false }
          },
          expectedImpact: {
            satisfactionImprovement: 0.5,
            engagementImprovement: 0.2,
            usabilityImprovement: 0.3,
            confidence: 0.7
          },
          validUntil: new Date(Date.now() + 3600000).toISOString(), // 1 hour
          metadata: { trigger, immediate: true }
        });
        break;

      case 'high_error_recovery':
        recommendations.push({
          id: `imm_${Date.now()}_error`,
          type: 'workflow_improvement',
          priority: 9,
          title: 'Add Context Hints',
          description: 'Provide more guidance to reduce errors',
          implementation: {
            component: 'ContextHints',
            props: { frequency: 'frequent', helpLevel: 'detailed' }
          },
          expectedImpact: {
            satisfactionImprovement: 0.3,
            engagementImprovement: 0.1,
            usabilityImprovement: 0.6,
            confidence: 0.8
          },
          validUntil: new Date(Date.now() + 1800000).toISOString(), // 30 minutes
          metadata: { trigger, immediate: true }
        });
        break;
    }

    if (recommendations.length > 0) {
      this.store.update(s => ({
        ...s,
        recommendations: [...s.recommendations, ...recommendations]
      }));
    }
  }

  private async applyRecommendations(recommendations: PersonalizationRecommendation[]): Promise<void> {
    // Apply high-priority immediate recommendations
    const immediateRecs = recommendations
      .filter(r => r.priority >= 8 && r.metadata?.immediate)
      .sort((a, b) => b.priority - a.priority);

    for (const rec of immediateRecs) {
      await this.applyRecommendationImplementation(rec);
    }
  }

  private async applyRecommendationImplementation(recommendation: PersonalizationRecommendation): Promise<void> {
    const { implementation } = recommendation;

    switch (implementation.component) {
      case 'MainLayout':
        // Update interface preferences
        this.updatePreferences('interface', implementation.props);
        break;

      case 'ContextHints':
        // Update content preferences
        this.updatePreferences('content', implementation.props);
        break;

      // Add more component implementations as needed
    }
  }

  private updatePreferences(type: 'interface' | 'content', props: Record<string, any>): void {
    this.store.update(s => ({
      ...s,
      preferences: {
        ...s.preferences,
        [type]: { ...s.preferences[type], ...props }
      }
    }));

    // Cache preferences
    if (browser) {
      const prefs = this.getStoreValue().preferences;
      localStorage.setItem('flowreader_personalization_prefs', JSON.stringify(prefs));
    }
  }

  private startMetricCollection(): void {
    // Flush buffers periodically
    this.flushTimer = setInterval(() => {
      this.flushBuffers();
    }, 30000); // Every 30 seconds
  }

  private async flushBuffers(): Promise<void> {
    if (this.behaviorBuffer.length === 0 && this.metricsBuffer.length === 0) return;

    try {
      // Send behavior data
      if (this.behaviorBuffer.length > 0) {
        await this.apiCall('/behavior', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: this.sessionId,
            behaviors: this.behaviorBuffer
          })
        });
        this.behaviorBuffer = [];
      }

      // Send metrics data
      if (this.metricsBuffer.length > 0) {
        await this.apiCall('/metrics', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: this.sessionId,
            metrics: this.metricsBuffer
          })
        });
        this.metricsBuffer = [];
      }

    } catch (error) {
      console.error('Failed to flush personalization buffers:', error);
    }
  }

  private async trackPersonalizationMetric(metric: PersonalizationMetrics): Promise<void> {
    this.metricsBuffer.push(metric);
  }

  private checkSafetyThresholds(): void {
    const satisfactionHistory = this.getStoreValue().satisfactionHistory;
    if (satisfactionHistory.length < 3) return;

    const recentSatisfaction = satisfactionHistory.slice(-3);
    const avgSatisfaction = recentSatisfaction.reduce((sum, s) => sum + s.score, 0) / recentSatisfaction.length;

    if (avgSatisfaction < this.config.safetyConfig.rollbackThreshold && this.config.safetyConfig.autoRollback) {
      this.triggerSafetyRollback('low_satisfaction', avgSatisfaction);
    }
  }

  private triggerSafetyRollback(reason: string, value: number): void {
    console.warn('Triggering personalization rollback:', { reason, value });

    // Disable personalization temporarily
    this.store.update(s => ({
      ...s,
      enabled: false,
      recommendations: [],
      error: `Rolled back due to ${reason}: ${value}`
    }));

    // Record rollback event
    this.experimentSDK.track('personalization_safety_rollback', 'rollback', 1, {
      reason,
      value,
      timestamp: new Date().toISOString()
    });
  }

  private getStoredConsent(): boolean {
    if (!browser) return false;
    return localStorage.getItem('flowreader_personalization_consent') === 'true';
  }

  private hasUserOptedOut(): boolean {
    if (!browser) return false;
    return localStorage.getItem('flowreader_personalization_optout') === 'true';
  }

  private clearPersonalizationData(): void {
    if (!browser) return;

    localStorage.removeItem('flowreader_personalization_prefs');
    this.behaviorBuffer = [];
    this.metricsBuffer = [];
  }

  private async apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<PersonalizationApiResponse<T>> {
    const url = `${this.config.apiEndpoint}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

// Singleton instance
let personalizationSDK: PersonalizationSDK | null = null;

export function initializePersonalization(config?: PersonalizationSDKConfig): PersonalizationSDK {
  if (!personalizationSDK) {
    personalizationSDK = new PersonalizationSDK(config);
  }
  return personalizationSDK;
}

export function getPersonalizationSDK(): PersonalizationSDK | null {
  return personalizationSDK;
}

export { PersonalizationSDK };
export type { PersonalizationSDKConfig };