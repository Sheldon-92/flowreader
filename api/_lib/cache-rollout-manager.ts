/**
 * Cache Rollout Manager
 *
 * Implements conservative default strategy with gradual rollout capabilities.
 * Provides feature flags, A/B testing, and rollback mechanisms for safe
 * deployment of the enhanced caching system.
 *
 * Features:
 * - Phased rollout with percentage-based traffic splitting
 * - Feature flag management with runtime configuration
 * - Performance monitoring and automatic rollback
 * - A/B testing framework for cache strategies
 * - Conservative defaults with incremental enhancement
 */

import { EventEmitter } from 'events';
import { getPerformanceConfig } from './performance-config.js';
import { getEnhancedCacheManager } from './enhanced-cache-integration.js';

// Rollout phase definitions
export type RolloutPhase = 'disabled' | 'conservative' | 'balanced' | 'aggressive' | 'full';

// Feature flag configuration
export interface FeatureFlags {
  enhancedCache: boolean;
  l2Cache: boolean;
  semanticMatching: boolean;
  hotPathOptimization: boolean;
  adaptiveTTL: boolean;
  preWarming: boolean;
  securityAuditing: boolean;
  performanceMonitoring: boolean;
}

// Rollout configuration
export interface RolloutConfig {
  phase: RolloutPhase;
  trafficPercentage: number; // 0-100
  features: FeatureFlags;
  targets: {
    hitRate: number;
    latencyReduction: number;
    errorRate: number;
  };
  monitoring: {
    metricsWindow: number; // seconds
    alertThresholds: {
      hitRateBelow: number;
      latencyIncrease: number;
      errorRateAbove: number;
    };
    autoRollback: boolean;
  };
}

// Performance metrics for rollout monitoring
export interface RolloutMetrics {
  timestamp: number;
  phase: RolloutPhase;
  trafficPercentage: number;
  performance: {
    hitRate: number;
    avgLatency: number;
    errorRate: number;
    throughput: number;
  };
  features: {
    [key: string]: {
      enabled: boolean;
      usage: number;
      performance: number;
    };
  };
  comparison: {
    baselineHitRate: number;
    baselineLatency: number;
    improvement: {
      hitRate: number;
      latency: number;
      cost: number;
    };
  };
}

// Rollout event types
export interface RolloutEvent {
  type: 'phase_change' | 'feature_toggle' | 'performance_alert' | 'rollback' | 'milestone';
  timestamp: number;
  data: any;
  reason?: string;
}

export class CacheRolloutManager extends EventEmitter {
  private config: RolloutConfig;
  private metrics: RolloutMetrics[] = [];
  private events: RolloutEvent[] = [];
  private lastMetricsCheck = 0;
  private enhancedCache = getEnhancedCacheManager();

  // Predefined rollout phases
  private readonly PHASE_CONFIGS: Record<RolloutPhase, Partial<RolloutConfig>> = {
    disabled: {
      trafficPercentage: 0,
      features: {
        enhancedCache: false,
        l2Cache: false,
        semanticMatching: false,
        hotPathOptimization: false,
        adaptiveTTL: false,
        preWarming: false,
        securityAuditing: true,
        performanceMonitoring: true
      }
    },
    conservative: {
      trafficPercentage: 25,
      features: {
        enhancedCache: true,
        l2Cache: false,
        semanticMatching: false,
        hotPathOptimization: false,
        adaptiveTTL: true,
        preWarming: false,
        securityAuditing: true,
        performanceMonitoring: true
      },
      targets: {
        hitRate: 0.35,
        latencyReduction: 0.15,
        errorRate: 0.01
      }
    },
    balanced: {
      trafficPercentage: 50,
      features: {
        enhancedCache: true,
        l2Cache: true,
        semanticMatching: true,
        hotPathOptimization: false,
        adaptiveTTL: true,
        preWarming: true,
        securityAuditing: true,
        performanceMonitoring: true
      },
      targets: {
        hitRate: 0.45,
        latencyReduction: 0.30,
        errorRate: 0.005
      }
    },
    aggressive: {
      trafficPercentage: 75,
      features: {
        enhancedCache: true,
        l2Cache: true,
        semanticMatching: true,
        hotPathOptimization: true,
        adaptiveTTL: true,
        preWarming: true,
        securityAuditing: true,
        performanceMonitoring: true
      },
      targets: {
        hitRate: 0.50,
        latencyReduction: 0.40,
        errorRate: 0.003
      }
    },
    full: {
      trafficPercentage: 100,
      features: {
        enhancedCache: true,
        l2Cache: true,
        semanticMatching: true,
        hotPathOptimization: true,
        adaptiveTTL: true,
        preWarming: true,
        securityAuditing: true,
        performanceMonitoring: true
      },
      targets: {
        hitRate: 0.55,
        latencyReduction: 0.50,
        errorRate: 0.002
      }
    }
  };

  constructor() {
    super();

    // Initialize with conservative configuration
    this.config = this.buildConfig('conservative');

    // Load configuration from environment
    this.loadEnvironmentConfig();

    // Start monitoring
    this.startMonitoring();

    console.log(`🚀 Cache rollout manager initialized with phase: ${this.config.phase}`);
  }

  /**
   * Check if a request should use enhanced caching
   */
  shouldUseEnhancedCache(context?: {
    userId?: string;
    bookId?: string;
    requestId?: string;
  }): boolean {
    // Check if enhanced cache is enabled
    if (!this.config.features.enhancedCache) {
      return false;
    }

    // Traffic percentage-based rollout
    const hash = this.calculateTrafficHash(context);
    const threshold = this.config.trafficPercentage / 100;

    return hash < threshold;
  }

  /**
   * Check if a specific feature is enabled
   */
  isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this.config.features[feature];
  }

  /**
   * Get current rollout configuration
   */
  getConfig(): RolloutConfig {
    return { ...this.config };
  }

  /**
   * Update rollout phase
   */
  async setPhase(phase: RolloutPhase, reason?: string): Promise<boolean> {
    if (phase === this.config.phase) {
      return true;
    }

    const previousPhase = this.config.phase;

    try {
      // Validate phase transition
      if (!this.isValidPhaseTransition(this.config.phase, phase)) {
        console.warn(`Invalid phase transition: ${this.config.phase} → ${phase}`);
        return false;
      }

      // Apply new configuration
      const newConfig = this.buildConfig(phase);
      await this.applyConfig(newConfig);

      // Log phase change
      this.logEvent({
        type: 'phase_change',
        timestamp: Date.now(),
        data: {
          from: previousPhase,
          to: phase,
          trafficPercentage: newConfig.trafficPercentage
        },
        reason
      });

      console.log(`📈 Rollout phase changed: ${previousPhase} → ${phase} (${newConfig.trafficPercentage}% traffic)`);

      return true;

    } catch (error) {
      console.error('Failed to change rollout phase:', error);
      return false;
    }
  }

  /**
   * Toggle a specific feature
   */
  async toggleFeature(feature: keyof FeatureFlags, enabled: boolean, reason?: string): Promise<boolean> {
    if (this.config.features[feature] === enabled) {
      return true;
    }

    try {
      this.config.features[feature] = enabled;

      this.logEvent({
        type: 'feature_toggle',
        timestamp: Date.now(),
        data: {
          feature,
          enabled,
          phase: this.config.phase
        },
        reason
      });

      console.log(`🔧 Feature ${feature}: ${enabled ? 'enabled' : 'disabled'}`);

      return true;

    } catch (error) {
      console.error(`Failed to toggle feature ${feature}:`, error);
      return false;
    }
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): RolloutMetrics | null {
    if (this.metrics.length === 0) {
      return null;
    }

    return this.metrics[this.metrics.length - 1];
  }

  /**
   * Get performance history
   */
  getMetricsHistory(since?: number): RolloutMetrics[] {
    if (!since) {
      return [...this.metrics];
    }

    return this.metrics.filter(m => m.timestamp >= since);
  }

  /**
   * Get rollout events
   */
  getEvents(since?: number): RolloutEvent[] {
    if (!since) {
      return [...this.events];
    }

    return this.events.filter(e => e.timestamp >= since);
  }

  /**
   * Manual rollback to previous phase
   */
  async rollback(reason: string): Promise<boolean> {
    const currentPhaseIndex = this.getPhaseIndex(this.config.phase);

    if (currentPhaseIndex <= 0) {
      console.warn('Cannot rollback from lowest phase');
      return false;
    }

    const phases: RolloutPhase[] = ['disabled', 'conservative', 'balanced', 'aggressive', 'full'];
    const previousPhase = phases[currentPhaseIndex - 1];

    console.log(`🔄 Rolling back from ${this.config.phase} to ${previousPhase}: ${reason}`);

    const success = await this.setPhase(previousPhase, `Rollback: ${reason}`);

    if (success) {
      this.logEvent({
        type: 'rollback',
        timestamp: Date.now(),
        data: {
          from: this.config.phase,
          to: previousPhase
        },
        reason
      });
    }

    return success;
  }

  /**
   * Automatic progression to next phase
   */
  async progressToNextPhase(): Promise<boolean> {
    const currentPhaseIndex = this.getPhaseIndex(this.config.phase);
    const phases: RolloutPhase[] = ['disabled', 'conservative', 'balanced', 'aggressive', 'full'];

    if (currentPhaseIndex >= phases.length - 1) {
      console.log('Already at maximum rollout phase');
      return false;
    }

    // Check if current targets are met
    const metrics = this.getCurrentMetrics();
    if (!metrics || !this.areTargetsMet(metrics)) {
      console.log('Current phase targets not met, cannot progress');
      return false;
    }

    const nextPhase = phases[currentPhaseIndex + 1];
    console.log(`📈 Progressing to next phase: ${this.config.phase} → ${nextPhase}`);

    return await this.setPhase(nextPhase, 'Automatic progression - targets met');
  }

  /**
   * Export rollout report
   */
  generateReport(): {
    summary: any;
    performance: any;
    recommendations: string[];
  } {
    const currentMetrics = this.getCurrentMetrics();
    const recentEvents = this.getEvents(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    const summary = {
      currentPhase: this.config.phase,
      trafficPercentage: this.config.trafficPercentage,
      featuresEnabled: Object.entries(this.config.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature]) => feature),
      uptime: this.calculateUptime(),
      eventsCount: recentEvents.length
    };

    const performance = currentMetrics ? {
      hitRate: currentMetrics.performance.hitRate,
      latency: currentMetrics.performance.avgLatency,
      errorRate: currentMetrics.performance.errorRate,
      improvement: currentMetrics.comparison.improvement
    } : null;

    const recommendations = this.generateRecommendations();

    return {
      summary,
      performance,
      recommendations
    };
  }

  // Private methods

  private buildConfig(phase: RolloutPhase): RolloutConfig {
    const baseConfig: RolloutConfig = {
      phase,
      trafficPercentage: 0,
      features: {
        enhancedCache: false,
        l2Cache: false,
        semanticMatching: false,
        hotPathOptimization: false,
        adaptiveTTL: false,
        preWarming: false,
        securityAuditing: true,
        performanceMonitoring: true
      },
      targets: {
        hitRate: 0.32, // Current baseline
        latencyReduction: 0.10,
        errorRate: 0.01
      },
      monitoring: {
        metricsWindow: 300, // 5 minutes
        alertThresholds: {
          hitRateBelow: 0.25,
          latencyIncrease: 1.5, // 50% increase
          errorRateAbove: 0.02
        },
        autoRollback: true
      }
    };

    // Merge with phase-specific configuration
    const phaseConfig = this.PHASE_CONFIGS[phase];
    return {
      ...baseConfig,
      ...phaseConfig,
      features: {
        ...baseConfig.features,
        ...phaseConfig.features
      },
      targets: {
        ...baseConfig.targets,
        ...phaseConfig.targets
      }
    };
  }

  private loadEnvironmentConfig(): void {
    // Override configuration from environment variables
    const envPhase = process.env.CACHE_ROLLOUT_PHASE as RolloutPhase;
    if (envPhase && this.PHASE_CONFIGS[envPhase]) {
      this.config = this.buildConfig(envPhase);
    }

    // Override traffic percentage
    const envTraffic = process.env.CACHE_ROLLOUT_TRAFFIC;
    if (envTraffic) {
      const percentage = parseInt(envTraffic);
      if (percentage >= 0 && percentage <= 100) {
        this.config.trafficPercentage = percentage;
      }
    }

    // Override feature flags
    const featureOverrides: Partial<FeatureFlags> = {};
    if (process.env.CACHE_ENHANCED_ENABLED !== undefined) {
      featureOverrides.enhancedCache = process.env.CACHE_ENHANCED_ENABLED === 'true';
    }
    if (process.env.CACHE_L2_ENABLED !== undefined) {
      featureOverrides.l2Cache = process.env.CACHE_L2_ENABLED === 'true';
    }
    if (process.env.CACHE_SEMANTIC_ENABLED !== undefined) {
      featureOverrides.semanticMatching = process.env.CACHE_SEMANTIC_ENABLED === 'true';
    }
    if (process.env.CACHE_HOT_PATH_ENABLED !== undefined) {
      featureOverrides.hotPathOptimization = process.env.CACHE_HOT_PATH_ENABLED === 'true';
    }

    this.config.features = { ...this.config.features, ...featureOverrides };
  }

  private async applyConfig(newConfig: RolloutConfig): Promise<void> {
    // Update environment variables for other components
    process.env.CACHE_ENHANCED_ENABLED = newConfig.features.enhancedCache.toString();
    process.env.CACHE_L2_ENABLED = newConfig.features.l2Cache.toString();
    process.env.CACHE_SEMANTIC_ENABLED = newConfig.features.semanticMatching.toString();
    process.env.CACHE_HOT_PATH_ENABLED = newConfig.features.hotPathOptimization.toString();
    process.env.CACHE_ADAPTIVE_TTL = newConfig.features.adaptiveTTL.toString();
    process.env.CACHE_ROLLOUT_PERCENTAGE = newConfig.trafficPercentage.toString();

    // Apply configuration
    this.config = newConfig;

    // Emit configuration change event
    this.emit('config:changed', newConfig);
  }

  private calculateTrafficHash(context?: any): number {
    // Create a deterministic hash for traffic splitting
    const hashInput = context?.userId || context?.requestId || Math.random().toString();
    let hash = 0;

    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Normalize to 0-1 range
    return Math.abs(hash) / Math.pow(2, 31);
  }

  private isValidPhaseTransition(from: RolloutPhase, to: RolloutPhase): boolean {
    const phases: RolloutPhase[] = ['disabled', 'conservative', 'balanced', 'aggressive', 'full'];
    const fromIndex = phases.indexOf(from);
    const toIndex = phases.indexOf(to);

    // Allow moving to adjacent phases or rollback
    return Math.abs(toIndex - fromIndex) <= 1 || toIndex < fromIndex;
  }

  private getPhaseIndex(phase: RolloutPhase): number {
    const phases: RolloutPhase[] = ['disabled', 'conservative', 'balanced', 'aggressive', 'full'];
    return phases.indexOf(phase);
  }

  private startMonitoring(): void {
    // Collect metrics every 5 minutes
    setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoring.metricsWindow * 1000);

    // Check for automatic progression every 30 minutes
    setInterval(() => {
      this.checkAutomaticProgression();
    }, 30 * 60 * 1000);
  }

  private async collectMetrics(): Promise<void> {
    try {
      const enhancedStats = this.enhancedCache.getPerformanceMetrics();
      const cacheStats = this.enhancedCache.getStats();

      const metrics: RolloutMetrics = {
        timestamp: Date.now(),
        phase: this.config.phase,
        trafficPercentage: this.config.trafficPercentage,
        performance: {
          hitRate: enhancedStats.overall.hitRate,
          avgLatency: enhancedStats.overall.performance.avgLatency,
          errorRate: 1 - enhancedStats.security.complianceRate,
          throughput: enhancedStats.overall.totalRequests / (this.config.monitoring.metricsWindow / 60)
        },
        features: {
          l1Cache: {
            enabled: this.config.features.enhancedCache,
            usage: enhancedStats.layers.l1.hits,
            performance: enhancedStats.layers.l1.avgLatency
          },
          l2Cache: {
            enabled: this.config.features.l2Cache,
            usage: enhancedStats.layers.l2.hits,
            performance: enhancedStats.layers.l2.avgLatency
          },
          semanticMatching: {
            enabled: this.config.features.semanticMatching,
            usage: enhancedStats.layers.semantic.matches,
            performance: enhancedStats.layers.semantic.accuracy
          }
        },
        comparison: {
          baselineHitRate: 0.32, // Current baseline
          baselineLatency: 1000, // Estimated baseline latency
          improvement: {
            hitRate: (enhancedStats.overall.hitRate - 0.32) / 0.32,
            latency: (1000 - enhancedStats.overall.performance.avgLatency) / 1000,
            cost: 0.25 // Estimated cost improvement
          }
        }
      };

      this.metrics.push(metrics);

      // Limit metrics history
      if (this.metrics.length > 1000) {
        this.metrics = this.metrics.slice(-500);
      }

      // Check for alerts
      this.checkAlerts(metrics);

    } catch (error) {
      console.error('Failed to collect rollout metrics:', error);
    }
  }

  private checkAlerts(metrics: RolloutMetrics): void {
    const alerts = [];

    // Check hit rate
    if (metrics.performance.hitRate < this.config.monitoring.alertThresholds.hitRateBelow) {
      alerts.push(`Hit rate below threshold: ${metrics.performance.hitRate.toFixed(3)} < ${this.config.monitoring.alertThresholds.hitRateBelow}`);
    }

    // Check latency increase
    const latencyIncrease = metrics.performance.avgLatency / metrics.comparison.baselineLatency;
    if (latencyIncrease > this.config.monitoring.alertThresholds.latencyIncrease) {
      alerts.push(`Latency increased: ${latencyIncrease.toFixed(2)}x baseline`);
    }

    // Check error rate
    if (metrics.performance.errorRate > this.config.monitoring.alertThresholds.errorRateAbove) {
      alerts.push(`Error rate above threshold: ${metrics.performance.errorRate.toFixed(3)} > ${this.config.monitoring.alertThresholds.errorRateAbove}`);
    }

    // Trigger alerts and potential rollback
    if (alerts.length > 0) {
      this.handlePerformanceAlerts(alerts, metrics);
    }
  }

  private async handlePerformanceAlerts(alerts: string[], metrics: RolloutMetrics): Promise<void> {
    console.warn('Performance alerts detected:', alerts);

    this.logEvent({
      type: 'performance_alert',
      timestamp: Date.now(),
      data: {
        alerts,
        metrics: metrics.performance,
        phase: this.config.phase
      }
    });

    // Auto-rollback if enabled and alerts are critical
    if (this.config.monitoring.autoRollback && alerts.length >= 2) {
      const reason = `Auto-rollback due to performance alerts: ${alerts.join(', ')}`;
      await this.rollback(reason);
    }
  }

  private async checkAutomaticProgression(): Promise<void> {
    // Only check progression if not at maximum phase
    if (this.config.phase === 'full') {
      return;
    }

    // Check if we've been in current phase long enough (at least 4 hours)
    const recentMetrics = this.getMetricsHistory(Date.now() - 4 * 60 * 60 * 1000);
    if (recentMetrics.length < 10) { // Need at least 10 data points
      return;
    }

    // Check if targets are consistently met
    const targetsMet = recentMetrics.slice(-5).every(m => this.areTargetsMet(m));

    if (targetsMet) {
      await this.progressToNextPhase();
    }
  }

  private areTargetsMet(metrics: RolloutMetrics): boolean {
    return (
      metrics.performance.hitRate >= this.config.targets.hitRate &&
      metrics.comparison.improvement.latency >= this.config.targets.latencyReduction &&
      metrics.performance.errorRate <= this.config.targets.errorRate
    );
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const currentMetrics = this.getCurrentMetrics();

    if (!currentMetrics) {
      recommendations.push('Collect more performance data before making changes');
      return recommendations;
    }

    // Hit rate recommendations
    if (currentMetrics.performance.hitRate < this.config.targets.hitRate) {
      recommendations.push('Consider enabling L2 cache to improve hit rate');

      if (!this.config.features.semanticMatching) {
        recommendations.push('Enable semantic matching for better cache utilization');
      }
    }

    // Performance recommendations
    if (currentMetrics.performance.avgLatency > currentMetrics.comparison.baselineLatency * 0.9) {
      recommendations.push('Monitor latency closely - consider optimizing cache layers');
    }

    // Feature recommendations
    if (this.config.phase === 'conservative' && this.areTargetsMet(currentMetrics)) {
      recommendations.push('Performance targets met - consider advancing to balanced phase');
    }

    return recommendations;
  }

  private calculateUptime(): number {
    // Calculate uptime since manager initialization
    return Date.now() - (this.events[0]?.timestamp || Date.now());
  }

  private logEvent(event: RolloutEvent): void {
    this.events.push(event);

    // Limit event history
    if (this.events.length > 500) {
      this.events = this.events.slice(-250);
    }

    // Emit event
    this.emit('event', event);
  }
}

// Export singleton instance
let rolloutManager: CacheRolloutManager | null = null;

export function getCacheRolloutManager(): CacheRolloutManager {
  if (!rolloutManager) {
    rolloutManager = new CacheRolloutManager();
  }
  return rolloutManager;
}

// Utility functions for easy integration
export function shouldUseEnhancedCache(context?: any): boolean {
  return getCacheRolloutManager().shouldUseEnhancedCache(context);
}

export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return getCacheRolloutManager().isFeatureEnabled(feature);
}