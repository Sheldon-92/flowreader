/**
 * Performance Configuration Module
 *
 * Centralized configuration for performance optimizations
 * Supports dynamic tuning and feature flags for A/B testing
 */

export interface PerformanceConfig {
  // Token Management Configuration
  tokenManagement: {
    enabled: boolean;
    maxContextTokens: number;
    maxResponseTokens: number;
    topKInitial: number;
    topKFinal: number;
    similarityThreshold: number;
    semanticDeduplication: boolean;
    relevanceScoreThreshold: number;
    dynamicTokenLimit: boolean;
  };

  // Caching Configuration
  caching: {
    enabled: boolean;
    responseCacheTTL: number; // seconds
    embeddingCacheTTL: number; // seconds
    maxCacheSize: number; // MB
    cacheStrategy: 'LRU' | 'LFU' | 'FIFO';
    semanticSimilarityThreshold: number;
    precomputePopularContent: boolean;
  };

  // Prompt Optimization Configuration
  promptOptimization: {
    enabled: boolean;
    useConcisePrompts: boolean;
    dynamicPromptSelection: boolean;
    removeRedundantInstructions: boolean;
    maxSystemPromptLength: number;
    maxUserPromptLength: number;
    intentBasedLimits: boolean;
  };

  // Request Processing Configuration
  requestProcessing: {
    batchingEnabled: boolean;
    batchSize: number;
    parallelProcessing: boolean;
    maxConcurrentRequests: number;
    streamingOptimized: boolean;
    earlyStoppingConfidence: number;
  };

  // Quality Preservation Configuration
  qualityPreservation: {
    minQualityThreshold: number; // Minimum quality score (0-1)
    qualityCheckInterval: number; // Check every N requests
    autoRollback: boolean;
    qualityMetricsEnabled: boolean;
  };

  // Model Selection Configuration
  modelSelection: {
    preferFastModels: boolean;
    fallbackToGPT35: boolean;
    modelByIntent: Record<string, string>;
    costOptimizedRouting: boolean;
  };
}

// Default optimized configuration
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  tokenManagement: {
    enabled: true,
    maxContextTokens: 1500, // Reduced from 2000 (25% reduction)
    maxResponseTokens: 400, // Reduced from 500 (20% reduction)
    topKInitial: 8, // Reduced from 10 (20% reduction)
    topKFinal: 3, // Reduced from 5 (40% reduction)
    similarityThreshold: 0.75, // Increased from 0.65 for better relevance
    semanticDeduplication: true,
    relevanceScoreThreshold: 0.7,
    dynamicTokenLimit: true
  },

  caching: {
    enabled: true,
    responseCacheTTL: 900, // 15 minutes
    embeddingCacheTTL: 3600, // 1 hour
    maxCacheSize: 100, // MB
    cacheStrategy: 'LRU',
    semanticSimilarityThreshold: 0.95, // High threshold for cache hits
    precomputePopularContent: true
  },

  promptOptimization: {
    enabled: true,
    useConcisePrompts: true,
    dynamicPromptSelection: true,
    removeRedundantInstructions: true,
    maxSystemPromptLength: 500, // Reduced from unbounded
    maxUserPromptLength: 1000, // Reduced from unbounded
    intentBasedLimits: true
  },

  requestProcessing: {
    batchingEnabled: true,
    batchSize: 5,
    parallelProcessing: true,
    maxConcurrentRequests: 3,
    streamingOptimized: true,
    earlyStoppingConfidence: 0.9
  },

  qualityPreservation: {
    minQualityThreshold: 0.632, // 63.2% (T5 baseline - 2%)
    qualityCheckInterval: 10,
    autoRollback: true,
    qualityMetricsEnabled: true
  },

  modelSelection: {
    preferFastModels: true,
    fallbackToGPT35: true,
    modelByIntent: {
      'simple': 'gpt-3.5-turbo',
      'enhance': 'gpt-3.5-turbo', // Changed from gpt-4 for cost
      'complex': 'gpt-4-turbo-preview'
    },
    costOptimizedRouting: true
  }
};

// Environment-specific configurations
export const CONFIGS: Record<string, PerformanceConfig> = {
  development: {
    ...DEFAULT_PERFORMANCE_CONFIG,
    caching: {
      ...DEFAULT_PERFORMANCE_CONFIG.caching,
      enabled: false // Disable caching in development for testing
    },
    qualityPreservation: {
      ...DEFAULT_PERFORMANCE_CONFIG.qualityPreservation,
      autoRollback: false
    }
  },

  production: DEFAULT_PERFORMANCE_CONFIG,

  testing: {
    ...DEFAULT_PERFORMANCE_CONFIG,
    tokenManagement: {
      ...DEFAULT_PERFORMANCE_CONFIG.tokenManagement,
      maxContextTokens: 1000, // Even more aggressive for testing
      maxResponseTokens: 300
    }
  }
};

// Configuration manager class
export class PerformanceConfigManager {
  private static instance: PerformanceConfigManager;
  private config: PerformanceConfig;
  private overrides: Partial<PerformanceConfig> = {};

  private constructor() {
    const env = process.env.NODE_ENV || 'development';
    this.config = CONFIGS[env] || DEFAULT_PERFORMANCE_CONFIG;
  }

  static getInstance(): PerformanceConfigManager {
    if (!PerformanceConfigManager.instance) {
      PerformanceConfigManager.instance = new PerformanceConfigManager();
    }
    return PerformanceConfigManager.instance;
  }

  getConfig(): PerformanceConfig {
    return { ...this.config, ...this.overrides };
  }

  updateConfig(updates: Partial<PerformanceConfig>): void {
    this.overrides = { ...this.overrides, ...updates };
  }

  resetConfig(): void {
    this.overrides = {};
  }

  // Get token limits based on intent type
  getTokenLimitsByIntent(intent: string): { context: number; response: number } {
    const config = this.getConfig();

    if (!config.promptOptimization.intentBasedLimits) {
      return {
        context: config.tokenManagement.maxContextTokens,
        response: config.tokenManagement.maxResponseTokens
      };
    }

    // Dynamic limits based on intent
    switch (intent) {
      case 'simple':
      case 'definition':
        return {
          context: Math.floor(config.tokenManagement.maxContextTokens * 0.6),
          response: Math.floor(config.tokenManagement.maxResponseTokens * 0.7)
        };

      case 'enhance':
      case 'explain':
        return {
          context: config.tokenManagement.maxContextTokens,
          response: config.tokenManagement.maxResponseTokens
        };

      case 'complex':
      case 'analyze':
        return {
          context: Math.floor(config.tokenManagement.maxContextTokens * 1.2),
          response: Math.floor(config.tokenManagement.maxResponseTokens * 1.2)
        };

      default:
        return {
          context: config.tokenManagement.maxContextTokens,
          response: config.tokenManagement.maxResponseTokens
        };
    }
  }

  // Get model based on intent
  getModelForIntent(intent: string): string {
    const config = this.getConfig();

    if (!config.modelSelection.costOptimizedRouting) {
      return 'gpt-3.5-turbo'; // Default model
    }

    return config.modelSelection.modelByIntent[intent] || 'gpt-3.5-turbo';
  }

  // Check if optimization feature is enabled
  isFeatureEnabled(feature: keyof PerformanceConfig): boolean {
    const config = this.getConfig();
    const featureConfig = config[feature];

    if (typeof featureConfig === 'object' && 'enabled' in featureConfig) {
      return featureConfig.enabled;
    }

    return false;
  }

  // Export configuration for monitoring
  exportMetrics(): Record<string, any> {
    const config = this.getConfig();
    return {
      tokenReduction: {
        contextReduction: `${Math.round((1 - config.tokenManagement.maxContextTokens / 2000) * 100)}%`,
        responseReduction: `${Math.round((1 - config.tokenManagement.maxResponseTokens / 500) * 100)}%`,
        topKReduction: `${Math.round((1 - config.tokenManagement.topKFinal / 5) * 100)}%`
      },
      caching: {
        enabled: config.caching.enabled,
        strategy: config.caching.cacheStrategy,
        ttl: config.caching.responseCacheTTL
      },
      quality: {
        threshold: config.qualityPreservation.minQualityThreshold,
        autoRollback: config.qualityPreservation.autoRollback
      },
      performance: {
        batching: config.requestProcessing.batchingEnabled,
        parallel: config.requestProcessing.parallelProcessing
      }
    };
  }
}

// Export singleton instance getter
export function getPerformanceConfig(): PerformanceConfig {
  return PerformanceConfigManager.getInstance().getConfig();
}

// Export configuration updater
export function updatePerformanceConfig(updates: Partial<PerformanceConfig>): void {
  PerformanceConfigManager.getInstance().updateConfig(updates);
}

// Export metrics exporter
export function exportPerformanceMetrics(): Record<string, any> {
  return PerformanceConfigManager.getInstance().exportMetrics();
}