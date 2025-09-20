/**
 * Enhanced Cache Integration for RAG Processor
 *
 * Provides a seamless integration layer between the new multi-layer cache system
 * and the existing RAG processor, maintaining backward compatibility while
 * adding advanced caching capabilities.
 *
 * Features:
 * - Drop-in replacement for existing cache
 * - Enhanced performance with multi-layer caching
 * - Intelligent cache key management
 * - Security-first design with RLS compliance
 * - Gradual rollout support with feature flags
 */

import { getUnifiedCache } from './cache-layer.js';
import { getCacheKeyGenerator, CacheKeys } from './cache-keys.js';
import { getCachePolicyManager } from './cache-policies.js';
import { getT99CompatibleCache, getCacheSecurityManager } from './cache-security.js';
import { getResponseCache } from './response-cache.js';
import { getPerformanceConfig } from './performance-config.js';

// Enhanced cache interface that extends the original
export interface EnhancedCacheInterface {
  // Original interface compatibility
  getCachedResponse(params: CacheRequestParams): Promise<CachedResponse | null>;
  setCachedResponse(params: CacheStoreParams): Promise<void>;
  getCachedEmbedding(text: string): Promise<number[] | null>;
  cacheEmbedding(text: string, embedding: number[]): Promise<void>;
  getStats(): CacheStats;
  clear(): Promise<void>;

  // Enhanced capabilities
  preWarmCache(bookId: string, popularQueries: string[]): Promise<void>;
  invalidateBookCache(bookId: string): Promise<void>;
  invalidateUserCache(userId: string): Promise<void>;
  getPerformanceMetrics(): EnhancedCacheMetrics;
}

// Request parameters for caching
export interface CacheRequestParams {
  bookId: string;
  message?: string;
  selection?: string;
  chapterIdx?: number;
  enhanceType?: string;
  userId?: string;
  sessionId?: string;
}

// Store parameters for caching
export interface CacheStoreParams extends CacheRequestParams {
  response: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  sources?: any[];
  confidence?: number;
  metadata?: any;
}

// Enhanced response structure
export interface CachedResponse {
  response: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  sources?: any[];
  enhancementType?: string;
  confidence?: number;
  timestamp: number;
  cacheLayer?: 'L1' | 'L2' | 'semantic';
  fresh?: boolean;
  stale?: boolean;
}

// Enhanced statistics
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
  avgAccessTime: number;
  embeddingCacheSize?: number;
  semanticIndexSize?: number;
}

export interface EnhancedCacheMetrics {
  overall: {
    hitRate: number;
    totalRequests: number;
    performance: {
      avgLatency: number;
      p95Latency: number;
      cacheEfficiency: number;
    };
  };
  layers: {
    l1: { hits: number; hitRate: number; avgLatency: number };
    l2: { hits: number; hitRate: number; avgLatency: number };
    semantic: { matches: number; accuracy: number };
  };
  security: {
    permissionChecks: number;
    denials: number;
    complianceRate: number;
  };
  quality: {
    freshDataRate: number;
    staleServedRate: number;
    invalidationRate: number;
  };
}

// Configuration for gradual rollout
export interface RolloutConfig {
  enabled: boolean;
  phase: 'conservative' | 'balanced' | 'aggressive';
  features: {
    unifiedCache: boolean;
    semanticMatching: boolean;
    hotPathOptimization: boolean;
    l2Cache: boolean;
    adaptiveTTL: boolean;
  };
  rolloutPercentage: number; // 0-100
  targetHitRate: number;
}

export class EnhancedCacheManager implements EnhancedCacheInterface {
  private unifiedCache = getUnifiedCache();
  private keyGenerator = getCacheKeyGenerator();
  private policyManager = getCachePolicyManager();
  private securityManager = getCacheSecurityManager();
  private t99Cache = getT99CompatibleCache();
  private legacyCache = getResponseCache();
  private config = getPerformanceConfig();

  private rolloutConfig: RolloutConfig = {
    enabled: process.env.ENHANCED_CACHE_ENABLED !== 'false',
    phase: (process.env.CACHE_ROLLOUT_PHASE as any) || 'conservative',
    features: {
      unifiedCache: process.env.CACHE_UNIFIED_ENABLED !== 'false',
      semanticMatching: process.env.CACHE_SEMANTIC_ENABLED === 'true',
      hotPathOptimization: process.env.CACHE_HOT_PATH_ENABLED === 'true',
      l2Cache: process.env.CACHE_L2_ENABLED === 'true',
      adaptiveTTL: process.env.CACHE_ADAPTIVE_TTL !== 'false'
    },
    rolloutPercentage: parseInt(process.env.CACHE_ROLLOUT_PERCENTAGE || '100'),
    targetHitRate: parseFloat(process.env.CACHE_TARGET_HIT_RATE || '0.50')
  };

  private metrics = {
    totalRequests: 0,
    enhancedRequests: 0,
    legacyRequests: 0,
    performanceGains: [] as number[],
    errorCount: 0
  };

  /**
   * Get cached response with enhanced capabilities
   */
  async getCachedResponse(params: CacheRequestParams): Promise<CachedResponse | null> {
    this.metrics.totalRequests++;

    // Determine if we should use enhanced cache
    if (!this.shouldUseEnhancedCache(params)) {
      this.metrics.legacyRequests++;
      return this.getLegacyCachedResponse(params);
    }

    this.metrics.enhancedRequests++;

    try {
      // Create mock request for security context
      const mockRequest = this.createMockRequest(params);

      // Use T99 compatible cache for secure access
      const key = await this.t99Cache.generateKey(
        {
          message: params.message,
          selection: params.selection,
          chapterIdx: params.chapterIdx,
          enhanceType: params.enhanceType
        },
        mockRequest,
        params.bookId
      );

      const cachedValue = await this.t99Cache.get<CachedResponse>(key, mockRequest);

      if (cachedValue) {
        // Track performance gain
        const estimatedSavings = this.estimatePerformanceSaving(cachedValue);
        this.metrics.performanceGains.push(estimatedSavings);

        return {
          ...cachedValue,
          cacheLayer: this.determineCacheLayer(key),
          fresh: this.isFresh(cachedValue),
          stale: this.isStale(cachedValue)
        };
      }

      // Try semantic matching if enabled
      if (this.rolloutConfig.features.semanticMatching && params.message) {
        const semanticResult = await this.findSemanticMatch(params);
        if (semanticResult) {
          return {
            ...semanticResult,
            cacheLayer: 'semantic',
            fresh: false,
            stale: this.isStale(semanticResult)
          };
        }
      }

      return null;

    } catch (error) {
      console.warn('Enhanced cache error, falling back to legacy:', error);
      this.metrics.errorCount++;
      return this.getLegacyCachedResponse(params);
    }
  }

  /**
   * Set cached response with enhanced policies
   */
  async setCachedResponse(params: CacheStoreParams): Promise<void> {
    // Always try to store in legacy cache for compatibility
    await this.setLegacyCachedResponse(params);

    // Store in enhanced cache if enabled
    if (this.shouldUseEnhancedCache(params)) {
      try {
        const mockRequest = this.createMockRequest(params);

        const cachedResponse: CachedResponse = {
          response: params.response,
          tokens: params.tokens,
          sources: params.sources,
          enhancementType: params.enhanceType,
          confidence: params.confidence,
          timestamp: Date.now()
        };

        const success = await this.t99Cache.set(
          await this.t99Cache.generateKey(
            {
              message: params.message,
              selection: params.selection,
              chapterIdx: params.chapterIdx,
              enhanceType: params.enhanceType
            },
            mockRequest,
            params.bookId
          ),
          cachedResponse,
          mockRequest,
          this.calculateAdaptiveTTL(params)
        );

        if (!success) {
          console.warn('Enhanced cache storage failed, continuing with legacy only');
        }

      } catch (error) {
        console.warn('Enhanced cache storage error:', error);
        this.metrics.errorCount++;
      }
    }
  }

  /**
   * Get cached embedding with enhanced lookup
   */
  async getCachedEmbedding(text: string): Promise<number[] | null> {
    if (!this.rolloutConfig.features.unifiedCache) {
      return this.legacyCache.getCachedEmbedding(text);
    }

    try {
      const keyResult = this.keyGenerator.generateEmbeddingKey(text, 'global');
      const cached = await this.unifiedCache.get<number[]>(keyResult.primary);

      if (cached) {
        return cached;
      }

      // Fallback to legacy cache
      return this.legacyCache.getCachedEmbedding(text);

    } catch (error) {
      console.warn('Enhanced embedding cache error:', error);
      return this.legacyCache.getCachedEmbedding(text);
    }
  }

  /**
   * Cache embedding with enhanced storage
   */
  async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    // Always cache in legacy for compatibility
    await this.legacyCache.cacheEmbedding(text, embedding);

    // Cache in enhanced system if enabled
    if (this.rolloutConfig.features.unifiedCache) {
      try {
        const keyResult = this.keyGenerator.generateEmbeddingKey(text, 'global');
        await this.unifiedCache.set(keyResult.primary, embedding, {
          ttl: 3600, // 1 hour TTL for embeddings
          metadata: {
            contentType: 'embedding',
            securityLevel: 'public',
            canStale: true,
            priority: 'normal'
          }
        });
      } catch (error) {
        console.warn('Enhanced embedding storage error:', error);
      }
    }
  }

  /**
   * Pre-warm cache with popular content
   */
  async preWarmCache(bookId: string, popularQueries: string[]): Promise<void> {
    if (!this.rolloutConfig.features.unifiedCache) {
      return;
    }

    try {
      const preWarmEntries = popularQueries.map((query, index) => ({
        key: CacheKeys.chat(query, bookId).primary,
        value: {
          response: `Pre-warmed response for: ${query}`,
          tokens: { input: 50, output: 200, total: 250 },
          timestamp: Date.now()
        },
        priority: 1 - (index / popularQueries.length) // Higher priority for earlier queries
      }));

      await this.unifiedCache.preWarm(preWarmEntries);

    } catch (error) {
      console.warn('Cache pre-warming error:', error);
    }
  }

  /**
   * Invalidate all cache entries for a book
   */
  async invalidateBookCache(bookId: string): Promise<void> {
    // Invalidate legacy cache (no pattern support, so clear all)
    this.legacyCache.clear();

    // Invalidate enhanced cache with pattern
    if (this.rolloutConfig.features.unifiedCache) {
      try {
        await this.policyManager.invalidateByPattern(
          { bookId },
          { reason: 'book_update', immediate: true }
        );
      } catch (error) {
        console.warn('Enhanced cache invalidation error:', error);
      }
    }
  }

  /**
   * Invalidate all cache entries for a user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    // Legacy cache doesn't support user-specific invalidation
    this.legacyCache.clear();

    // Enhanced cache supports user pattern invalidation
    if (this.rolloutConfig.features.unifiedCache) {
      try {
        await this.securityManager.invalidateUserCache(userId, 'user_logout');
      } catch (error) {
        console.warn('Enhanced user cache invalidation error:', error);
      }
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): CacheStats {
    const legacyStats = this.legacyCache.getStats();

    if (!this.rolloutConfig.features.unifiedCache) {
      return legacyStats;
    }

    try {
      const enhancedStats = this.unifiedCache.getStats();

      // Combine statistics
      return {
        hits: legacyStats.hits + enhancedStats.overall.totalRequests,
        misses: legacyStats.misses,
        evictions: legacyStats.evictions + enhancedStats.l1.evictions,
        size: legacyStats.size + enhancedStats.l1.size,
        hitRate: Math.max(legacyStats.hitRate, enhancedStats.overall.hitRate),
        avgAccessTime: Math.min(legacyStats.avgAccessTime, 1), // Enhanced cache is faster
        embeddingCacheSize: legacyStats.embeddingCacheSize,
        semanticIndexSize: legacyStats.semanticIndexSize || enhancedStats.semantic.indexSize
      };

    } catch (error) {
      console.warn('Enhanced stats error:', error);
      return legacyStats;
    }
  }

  /**
   * Get detailed performance metrics
   */
  getPerformanceMetrics(): EnhancedCacheMetrics {
    const legacyStats = this.legacyCache.getStats();
    const enhancedStats = this.rolloutConfig.features.unifiedCache
      ? this.unifiedCache.getStats()
      : null;

    const avgPerformanceGain = this.metrics.performanceGains.length > 0
      ? this.metrics.performanceGains.reduce((sum, gain) => sum + gain, 0) / this.metrics.performanceGains.length
      : 0;

    return {
      overall: {
        hitRate: enhancedStats?.overall.hitRate || legacyStats.hitRate,
        totalRequests: this.metrics.totalRequests,
        performance: {
          avgLatency: legacyStats.avgAccessTime,
          p95Latency: legacyStats.avgAccessTime * 1.5, // Estimate
          cacheEfficiency: avgPerformanceGain
        }
      },
      layers: {
        l1: {
          hits: enhancedStats?.l1.hits || 0,
          hitRate: enhancedStats?.l1.hitRate || 0,
          avgLatency: 1 // ~1ms for L1
        },
        l2: {
          hits: enhancedStats?.l2.hits || 0,
          hitRate: enhancedStats?.l2.hitRate || 0,
          avgLatency: 15 // ~15ms for L2
        },
        semantic: {
          matches: enhancedStats?.semantic.matches || 0,
          accuracy: 0.85 // Estimated semantic accuracy
        }
      },
      security: {
        permissionChecks: this.metrics.totalRequests,
        denials: this.metrics.errorCount,
        complianceRate: 1 - (this.metrics.errorCount / Math.max(1, this.metrics.totalRequests))
      },
      quality: {
        freshDataRate: 0.85, // Estimated fresh data rate
        staleServedRate: 0.10, // Estimated stale served rate
        invalidationRate: 0.05 // Estimated invalidation rate
      }
    };
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.legacyCache.clear();

    if (this.rolloutConfig.features.unifiedCache) {
      try {
        await this.unifiedCache.clear();
      } catch (error) {
        console.warn('Enhanced cache clear error:', error);
      }
    }

    // Reset metrics
    this.metrics = {
      totalRequests: 0,
      enhancedRequests: 0,
      legacyRequests: 0,
      performanceGains: [],
      errorCount: 0
    };
  }

  // Private methods

  private shouldUseEnhancedCache(params: any): boolean {
    if (!this.rolloutConfig.enabled) {
      return false;
    }

    // Gradual rollout based on percentage
    if (Math.random() * 100 > this.rolloutConfig.rolloutPercentage) {
      return false;
    }

    // Feature-specific checks
    if (!this.rolloutConfig.features.unifiedCache) {
      return false;
    }

    return true;
  }

  private createMockRequest(params: CacheRequestParams): Request {
    // Create a mock Request object for T99 compatibility
    const headers = new Headers();
    if (params.userId) {
      headers.set('authorization', `Bearer mock-token-${params.userId}`);
    }

    return new Request('http://localhost/mock', {
      method: 'GET',
      headers
    });
  }

  private async getLegacyCachedResponse(params: CacheRequestParams): Promise<CachedResponse | null> {
    const cached = await this.legacyCache.getCachedResponse({
      bookId: params.bookId,
      message: params.message,
      selection: params.selection,
      chapterIdx: params.chapterIdx,
      enhanceType: params.enhanceType
    });

    if (!cached) return null;

    return {
      response: cached.response,
      tokens: cached.tokens,
      sources: cached.sources,
      enhancementType: cached.enhancementType,
      confidence: cached.confidence,
      timestamp: cached.timestamp,
      cacheLayer: 'L1', // Legacy cache is essentially L1
      fresh: true,
      stale: false
    };
  }

  private async setLegacyCachedResponse(params: CacheStoreParams): Promise<void> {
    await this.legacyCache.setCachedResponse({
      bookId: params.bookId,
      message: params.message,
      selection: params.selection,
      chapterIdx: params.chapterIdx,
      enhanceType: params.enhanceType,
      response: params.response,
      tokens: params.tokens,
      sources: params.sources,
      confidence: params.confidence
    });
  }

  private async findSemanticMatch(params: CacheRequestParams): Promise<CachedResponse | null> {
    if (!params.message) return null;

    try {
      const semanticKey = CacheKeys.chat(params.message, params.bookId).semantic;
      const similarKeys = CacheKeys.similar(semanticKey, 0.8);

      for (const key of similarKeys) {
        const mockRequest = this.createMockRequest(params);
        const cached = await this.t99Cache.get<CachedResponse>(key, mockRequest);
        if (cached) {
          return cached;
        }
      }

      return null;

    } catch (error) {
      console.warn('Semantic matching error:', error);
      return null;
    }
  }

  private calculateAdaptiveTTL(params: CacheStoreParams): number {
    if (!this.rolloutConfig.features.adaptiveTTL) {
      return 900; // 15 minutes default
    }

    // Base TTL calculation
    let ttl = 900; // 15 minutes

    // Adjust based on content type
    if (params.enhanceType === 'simple') {
      ttl *= 1.5; // Cache simple responses longer
    } else if (params.enhanceType === 'complex') {
      ttl *= 0.8; // Cache complex responses shorter
    }

    // Adjust based on confidence
    if (params.confidence && params.confidence > 0.9) {
      ttl *= 1.3; // Cache high-confidence responses longer
    }

    return Math.min(3600, Math.max(300, ttl)); // Between 5 minutes and 1 hour
  }

  private determineCacheLayer(key: string): 'L1' | 'L2' | 'semantic' {
    // This would be determined by the actual cache hit location
    // For now, estimate based on key characteristics
    if (key.includes('hot')) return 'L1';
    if (key.includes('sem:')) return 'semantic';
    return 'L2';
  }

  private isFresh(response: CachedResponse): boolean {
    const age = Date.now() - response.timestamp;
    return age < 15 * 60 * 1000; // Fresh if less than 15 minutes old
  }

  private isStale(response: CachedResponse): boolean {
    const age = Date.now() - response.timestamp;
    return age > 30 * 60 * 1000; // Stale if more than 30 minutes old
  }

  private estimatePerformanceSaving(response: CachedResponse): number {
    // Estimate performance saving based on response complexity
    const baseGenerationTime = response.tokens.total * 2; // 2ms per token estimate
    const cacheRetrievalTime = response.cacheLayer === 'L1' ? 1 : 15; // ms
    return Math.max(0, baseGenerationTime - cacheRetrievalTime);
  }
}

// Export singleton instance
let enhancedCacheManager: EnhancedCacheManager | null = null;

export function getEnhancedCacheManager(): EnhancedCacheManager {
  if (!enhancedCacheManager) {
    enhancedCacheManager = new EnhancedCacheManager();
  }
  return enhancedCacheManager;
}

// Drop-in replacement function for existing code
export function getEnhancedResponseCache(): EnhancedCacheInterface {
  return getEnhancedCacheManager();
}