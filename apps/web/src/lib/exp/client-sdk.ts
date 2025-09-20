/**
 * Frontend Experiment SDK
 *
 * Client-side experiment management with feature flags, A/B testing,
 * and anonymous metric collection for SvelteKit applications.
 */

import { browser } from '$app/environment';
import { writable, derived, type Readable } from 'svelte/store';
import type {
  ExperimentAssignment,
  ExperimentVariant,
  ExperimentContext,
  ExperimentEvent,
  ExperimentQueryResult,
  ExperimentSDKConfig,
  FeatureFlag
} from '@flowreader/shared/experiments/types.js';

interface ClientSDKConfig extends Partial<ExperimentSDKConfig> {
  sessionId?: string;
  baseUrl?: string;
  autoTrackPageViews?: boolean;
  enableDevTools?: boolean;
}

interface ExperimentStore {
  assignments: Map<string, ExperimentAssignment>;
  variants: Map<string, ExperimentVariant>;
  loading: Set<string>;
  errors: Map<string, string>;
}

class ExperimentClientSDK {
  private config: Required<ClientSDKConfig>;
  private sessionId: string;
  private context: ExperimentContext;
  private eventBuffer: ExperimentEvent[] = [];
  private flushTimer?: NodeJS.Timeout;

  // Svelte stores
  public readonly store = writable<ExperimentStore>({
    assignments: new Map(),
    variants: new Map(),
    loading: new Set(),
    errors: new Map()
  });

  public readonly isLoading = derived(
    this.store,
    ($store) => $store.loading.size > 0
  );

  constructor(config: ClientSDKConfig = {}) {
    this.config = {
      apiEndpoint: '/api/experiments',
      debug: false,
      cacheEnabled: true,
      cacheTTL: 300000, // 5 minutes
      defaultTimeout: 5000,
      batchEventReporting: true,
      reportingInterval: 30000, // 30 seconds
      sessionId: this.generateSessionId(),
      baseUrl: '',
      autoTrackPageViews: true,
      enableDevTools: config.debug || false,
      ...config
    };

    this.sessionId = this.config.sessionId;
    this.context = this.buildContext();

    if (browser) {
      this.initialize();
    }
  }

  /**
   * Initialize the SDK
   */
  private async initialize(): Promise<void> {
    // Load cached assignments
    this.loadCachedAssignments();

    // Start batch reporting
    if (this.config.batchEventReporting) {
      this.startBatchReporting();
    }

    // Track page view if enabled
    if (this.config.autoTrackPageViews) {
      this.trackPageView();
    }

    // Enable dev tools in development
    if (this.config.enableDevTools) {
      this.enableDevTools();
    }
  }

  /**
   * Get experiment assignment and variant
   */
  async getExperiment(experimentId: string, customContext?: Partial<ExperimentContext>): Promise<ExperimentQueryResult> {
    // Update loading state
    this.store.update(store => {
      store.loading.add(experimentId);
      return store;
    });

    try {
      // Check cache first
      const cached = this.getCachedAssignment(experimentId);
      if (cached) {
        this.store.update(store => {
          store.assignments.set(experimentId, cached.assignment);
          if (cached.variant) {
            store.variants.set(experimentId, cached.variant);
          }
          store.loading.delete(experimentId);
          return store;
        });

        return cached;
      }

      // Fetch from server
      const context = { ...this.context, ...customContext };
      const result = await this.fetchAssignment(experimentId, context);

      if (result.assignment && result.variant) {
        // Cache the result
        this.cacheAssignment(experimentId, result.assignment, result.variant);

        // Update store
        this.store.update(store => {
          store.assignments.set(experimentId, result.assignment!);
          store.variants.set(experimentId, result.variant!);
          store.errors.delete(experimentId);
          store.loading.delete(experimentId);
          return store;
        });
      } else {
        // Handle error or no assignment
        this.store.update(store => {
          if (result.error) {
            store.errors.set(experimentId, result.error.message);
          }
          store.loading.delete(experimentId);
          return store;
        });
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.store.update(store => {
        store.errors.set(experimentId, errorMessage);
        store.loading.delete(experimentId);
        return store;
      });

      return {
        shouldTrack: false,
        error: {
          code: 'NETWORK_ERROR',
          message: errorMessage,
          experimentId,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get variant configuration for an experiment
   */
  getVariant(experimentId: string): ExperimentVariant | null {
    const store = this.getStoreValue();
    return store.variants.get(experimentId) || null;
  }

  /**
   * Get variant configuration value
   */
  getVariantConfig<T = any>(experimentId: string, key: string, defaultValue?: T): T {
    const variant = this.getVariant(experimentId);
    return variant?.configuration?.[key] ?? defaultValue;
  }

  /**
   * Check if user is in experiment
   */
  isInExperiment(experimentId: string): boolean {
    const store = this.getStoreValue();
    return store.assignments.has(experimentId);
  }

  /**
   * Check if user is in specific variant
   */
  isInVariant(experimentId: string, variantId: string): boolean {
    const variant = this.getVariant(experimentId);
    return variant?.id === variantId;
  }

  /**
   * Track experiment event
   */
  async track(
    experimentId: string,
    metricId: string,
    value?: number,
    properties?: Record<string, any>
  ): Promise<void> {
    const assignment = this.getStoreValue().assignments.get(experimentId);
    if (!assignment) {
      if (this.config.debug) {
        console.warn(`Cannot track ${metricId} - user not in experiment ${experimentId}`);
      }
      return;
    }

    const event: Omit<ExperimentEvent, 'id'> = {
      experimentId,
      variantId: assignment.variantId,
      sessionId: this.sessionId,
      metricId,
      eventType: this.inferEventType(metricId),
      value,
      properties,
      timestamp: new Date().toISOString()
    };

    if (this.config.batchEventReporting) {
      this.eventBuffer.push({ ...event, id: this.generateEventId() });
    } else {
      await this.sendEvent(event);
    }
  }

  /**
   * Track conversion event
   */
  async trackConversion(
    experimentId: string,
    conversionType: string,
    value?: number,
    properties?: Record<string, any>
  ): Promise<void> {
    await this.track(experimentId, `conversion_${conversionType}`, value, properties);
  }

  /**
   * Track engagement event
   */
  async trackEngagement(
    experimentId: string,
    engagementType: string,
    duration?: number,
    properties?: Record<string, any>
  ): Promise<void> {
    await this.track(experimentId, `engagement_${engagementType}`, duration, properties);
  }

  /**
   * Track satisfaction rating
   */
  async trackSatisfaction(
    experimentId: string,
    rating: number,
    feedback?: string
  ): Promise<void> {
    await this.track(experimentId, 'satisfaction_rating', rating, { feedback });
  }

  /**
   * Create a feature flag store
   */
  createFeatureFlag(
    key: string,
    defaultValue: boolean = false,
    experimentId?: string
  ): Readable<boolean> {
    return derived(this.store, ($store) => {
      if (experimentId) {
        const variant = $store.variants.get(experimentId);
        if (variant) {
          return variant.configuration?.[key] ?? defaultValue;
        }
      }
      return defaultValue;
    });
  }

  /**
   * Create a variant configuration store
   */
  createVariantStore<T = any>(
    experimentId: string,
    key: string,
    defaultValue?: T
  ): Readable<T> {
    return derived(this.store, ($store) => {
      const variant = $store.variants.get(experimentId);
      return variant?.configuration?.[key] ?? defaultValue;
    });
  }

  /**
   * Force refresh experiment assignments
   */
  async refresh(experimentIds?: string[]): Promise<void> {
    const idsToRefresh = experimentIds || Array.from(this.getStoreValue().assignments.keys());

    for (const experimentId of idsToRefresh) {
      // Clear cache
      this.clearCachedAssignment(experimentId);

      // Refetch
      await this.getExperiment(experimentId);
    }
  }

  /**
   * Force flush pending events
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.sendBatchEvents(events);
    } catch (error) {
      // Re-add events to buffer
      this.eventBuffer.unshift(...events);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush().catch(console.error);
  }

  // Private methods

  private generateSessionId(): string {
    if (browser && localStorage.getItem('flowreader_session_id')) {
      return localStorage.getItem('flowreader_session_id')!;
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (browser) {
      localStorage.setItem('flowreader_session_id', sessionId);
    }

    return sessionId;
  }

  private buildContext(): ExperimentContext {
    const context: ExperimentContext = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    };

    if (browser) {
      context.userAgent = navigator.userAgent;
      context.route = window.location.pathname;
    }

    return context;
  }

  private async fetchAssignment(experimentId: string, context: ExperimentContext): Promise<ExperimentQueryResult> {
    const response = await fetch(`${this.config.baseUrl}${this.config.apiEndpoint}/assignment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        experimentId,
        context
      }),
      signal: AbortSignal.timeout(this.config.defaultTimeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async sendEvent(event: Omit<ExperimentEvent, 'id'>): Promise<void> {
    await fetch(`${this.config.baseUrl}${this.config.apiEndpoint}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        id: this.generateEventId()
      })
    });
  }

  private async sendBatchEvents(events: ExperimentEvent[]): Promise<void> {
    await fetch(`${this.config.baseUrl}${this.config.apiEndpoint}/events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString()
      })
    });
  }

  private startBatchReporting(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush().catch(console.error);
    }, this.config.reportingInterval);
  }

  private trackPageView(): void {
    if (!browser) return;

    this.track('page_view', 'page_view', 1, {
      url: window.location.href,
      referrer: document.referrer
    });
  }

  private enableDevTools(): void {
    if (!browser || typeof window === 'undefined') return;

    // Add global debug object
    (window as any).__FLOWREADER_EXPERIMENTS__ = {
      getStore: () => this.getStoreValue(),
      getAssignment: (experimentId: string) => this.getStoreValue().assignments.get(experimentId),
      getVariant: (experimentId: string) => this.getVariant(experimentId),
      track: (experimentId: string, metricId: string, value?: number) => this.track(experimentId, metricId, value),
      flush: () => this.flush(),
      refresh: () => this.refresh()
    };

    if (this.config.debug) {
      console.log('FlowReader Experiments DevTools enabled. Access via window.__FLOWREADER_EXPERIMENTS__');
    }
  }

  private getCachedAssignment(experimentId: string): ExperimentQueryResult | null {
    if (!this.config.cacheEnabled || !browser) return null;

    try {
      const cached = localStorage.getItem(`exp_${experimentId}`);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;

      if (age > this.config.cacheTTL) {
        localStorage.removeItem(`exp_${experimentId}`);
        return null;
      }

      return {
        assignment: data.assignment,
        variant: data.variant,
        shouldTrack: true
      };
    } catch {
      return null;
    }
  }

  private cacheAssignment(experimentId: string, assignment: ExperimentAssignment, variant: ExperimentVariant): void {
    if (!this.config.cacheEnabled || !browser) return;

    try {
      const data = {
        assignment,
        variant,
        timestamp: Date.now()
      };

      localStorage.setItem(`exp_${experimentId}`, JSON.stringify(data));
    } catch {
      // Ignore cache errors
    }
  }

  private clearCachedAssignment(experimentId: string): void {
    if (!browser) return;
    localStorage.removeItem(`exp_${experimentId}`);
  }

  private loadCachedAssignments(): void {
    if (!this.config.cacheEnabled || !browser) return;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('exp_')) {
          const experimentId = key.substring(4);
          const cached = this.getCachedAssignment(experimentId);

          if (cached && cached.assignment && cached.variant) {
            this.store.update(store => {
              store.assignments.set(experimentId, cached.assignment!);
              store.variants.set(experimentId, cached.variant!);
              return store;
            });
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  private getStoreValue(): ExperimentStore {
    let value: ExperimentStore;
    this.store.subscribe(v => value = v)();
    return value!;
  }

  private inferEventType(metricId: string): any {
    if (metricId.includes('conversion')) return 'conversion';
    if (metricId.includes('engagement')) return 'engagement';
    if (metricId.includes('satisfaction')) return 'satisfaction';
    if (metricId.includes('performance')) return 'performance';
    return 'custom';
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global SDK instance
let globalSDK: ExperimentClientSDK | null = null;

/**
 * Initialize the experiments SDK
 */
export function initializeExperiments(config: ClientSDKConfig = {}): ExperimentClientSDK {
  if (globalSDK) {
    globalSDK.destroy();
  }

  globalSDK = new ExperimentClientSDK(config);
  return globalSDK;
}

/**
 * Get the global SDK instance
 */
export function getExperiments(): ExperimentClientSDK {
  if (!globalSDK) {
    throw new Error('Experiments SDK not initialized. Call initializeExperiments() first.');
  }
  return globalSDK;
}

/**
 * Convenience function for getting experiment assignment
 */
export async function getExperiment(experimentId: string, context?: Partial<ExperimentContext>) {
  return getExperiments().getExperiment(experimentId, context);
}

/**
 * Convenience function for tracking events
 */
export async function track(experimentId: string, metricId: string, value?: number, properties?: Record<string, any>) {
  return getExperiments().track(experimentId, metricId, value, properties);
}

/**
 * Convenience function for feature flags
 */
export function createFeatureFlag(key: string, defaultValue = false, experimentId?: string) {
  return getExperiments().createFeatureFlag(key, defaultValue, experimentId);
}

// Export the class for advanced usage
export { ExperimentClientSDK };