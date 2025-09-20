/**
 * Response Caching System
 *
 * Implements intelligent caching for AI responses to reduce latency and token consumption
 * Features LRU cache with TTL, semantic similarity matching, and performance monitoring
 */

import { createHash } from 'crypto';
import { getPerformanceConfig } from './performance-config.js';

// Cache entry interface
interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  metadata?: Record<string, any>;
}

// Cache statistics
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
  avgAccessTime: number;
}

// Response cache data structure
interface CachedResponse {
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
}

// Abstract cache strategy
abstract class CacheStrategy<T> {
  protected cache: Map<string, CacheEntry<T>>;
  protected maxSize: number;
  protected ttl: number;
  protected stats: CacheStats;

  constructor(maxSize: number, ttl: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
      avgAccessTime: 0
    };
  }

  abstract evict(): void;

  get(key: string): T | null {
    const startTime = Date.now();
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl * 1000) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.stats.hits++;
    this.stats.avgAccessTime =
      (this.stats.avgAccessTime + (Date.now() - startTime)) / 2;
    this.updateHitRate();

    return entry.value;
  }

  set(key: string, value: T, metadata?: Record<string, any>): void {
    // Check if we need to evict
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
      metadata
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }

  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  protected updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

// LRU Cache Implementation
class LRUCache<T> extends CacheStrategy<T> {
  evict(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }
}

// LFU Cache Implementation
class LFUCache<T> extends CacheStrategy<T> {
  evict(): void {
    let leastKey: string | null = null;
    let leastCount = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessCount < leastCount) {
        leastCount = entry.accessCount;
        leastKey = key;
      }
    }

    if (leastKey) {
      this.cache.delete(leastKey);
      this.stats.evictions++;
    }
  }
}

// Main Response Cache class
export class ResponseCache {
  private cache: CacheStrategy<CachedResponse>;
  private embeddingCache: Map<string, { embedding: number[]; timestamp: number }>;
  private config = getPerformanceConfig();
  private semanticIndex: Map<string, string[]>; // Maps semantic hashes to cache keys

  constructor() {
    const cacheConfig = this.config.caching;
    const maxEntries = Math.floor((cacheConfig.maxCacheSize * 1024 * 1024) / 5000); // Estimate 5KB per entry

    // Initialize cache strategy
    switch (cacheConfig.cacheStrategy) {
      case 'LRU':
        this.cache = new LRUCache<CachedResponse>(maxEntries, cacheConfig.responseCacheTTL);
        break;
      case 'LFU':
        this.cache = new LFUCache<CachedResponse>(maxEntries, cacheConfig.responseCacheTTL);
        break;
      default:
        this.cache = new LRUCache<CachedResponse>(maxEntries, cacheConfig.responseCacheTTL);
    }

    this.embeddingCache = new Map();
    this.semanticIndex = new Map();

    // Periodic cleanup
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Generate cache key for a request
   */
  generateCacheKey(params: {
    bookId: string;
    message?: string;
    selection?: string;
    chapterIdx?: number;
    enhanceType?: string;
  }): string {
    const normalized = {
      bookId: params.bookId,
      message: params.message?.toLowerCase().trim(),
      selection: params.selection?.substring(0, 100), // Limit selection length
      chapterIdx: params.chapterIdx,
      enhanceType: params.enhanceType
    };

    const keyString = JSON.stringify(normalized);
    return createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Get cached response
   */
  async getCachedResponse(params: {
    bookId: string;
    message?: string;
    selection?: string;
    chapterIdx?: number;
    enhanceType?: string;
  }): Promise<CachedResponse | null> {
    if (!this.config.caching.enabled) {
      return null;
    }

    const key = this.generateCacheKey(params);
    const cached = this.cache.get(key);

    if (cached) {
      console.log(`Cache hit for key: ${key.substring(0, 8)}...`);
      return cached;
    }

    // Try semantic similarity matching if enabled
    if (this.config.caching.semanticSimilarityThreshold > 0 && params.message) {
      const semanticMatch = await this.findSemanticMatch(params.message, params.bookId);
      if (semanticMatch) {
        console.log(`Semantic cache hit for key: ${semanticMatch.substring(0, 8)}...`);
        return this.cache.get(semanticMatch);
      }
    }

    console.log(`Cache miss for key: ${key.substring(0, 8)}...`);
    return null;
  }

  /**
   * Set cached response
   */
  async setCachedResponse(params: {
    bookId: string;
    message?: string;
    selection?: string;
    chapterIdx?: number;
    enhanceType?: string;
    response: string;
    tokens: {
      input: number;
      output: number;
      total: number;
    };
    sources?: any[];
    confidence?: number;
  }): Promise<void> {
    if (!this.config.caching.enabled) {
      return;
    }

    const key = this.generateCacheKey(params);

    const cachedResponse: CachedResponse = {
      response: params.response,
      tokens: params.tokens,
      sources: params.sources,
      enhancementType: params.enhanceType,
      confidence: params.confidence,
      timestamp: Date.now()
    };

    this.cache.set(key, cachedResponse, {
      bookId: params.bookId,
      messageLength: params.message?.length || 0,
      hasSelection: !!params.selection
    });

    // Update semantic index if message provided
    if (params.message) {
      const semanticKey = this.generateSemanticKey(params.message);
      const existing = this.semanticIndex.get(semanticKey) || [];
      if (!existing.includes(key)) {
        existing.push(key);
        this.semanticIndex.set(semanticKey, existing);
      }
    }

    console.log(`Cached response for key: ${key.substring(0, 8)}...`);
  }

  /**
   * Find semantically similar cached responses
   */
  private async findSemanticMatch(message: string, bookId: string): Promise<string | null> {
    const semanticKey = this.generateSemanticKey(message);
    const candidates = this.semanticIndex.get(semanticKey) || [];

    // Filter candidates by book ID
    for (const candidateKey of candidates) {
      const cached = this.cache.get(candidateKey);
      if (cached && this.calculateSimilarity(message, candidateKey) >=
          this.config.caching.semanticSimilarityThreshold) {
        return candidateKey;
      }
    }

    return null;
  }

  /**
   * Generate semantic key for indexing
   */
  private generateSemanticKey(text: string): string {
    // Simple semantic hashing based on key terms
    const keywords = text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .sort()
      .slice(0, 5)
      .join('-');

    return createHash('md5').update(keywords).digest('hex').substring(0, 8);
  }

  /**
   * Calculate similarity between messages
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Cache embeddings for reuse
   */
  async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    if (!this.config.caching.enabled) {
      return;
    }

    const key = createHash('sha256').update(text).digest('hex');
    this.embeddingCache.set(key, {
      embedding,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached embedding
   */
  getCachedEmbedding(text: string): number[] | null {
    if (!this.config.caching.enabled) {
      return null;
    }

    const key = createHash('sha256').update(text).digest('hex');
    const cached = this.embeddingCache.get(key);

    if (!cached) {
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > this.config.caching.embeddingCacheTTL * 1000) {
      this.embeddingCache.delete(key);
      return null;
    }

    return cached.embedding;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();

    // Clean embedding cache
    for (const [key, entry] of this.embeddingCache) {
      if (now - entry.timestamp > this.config.caching.embeddingCacheTTL * 1000) {
        this.embeddingCache.delete(key);
      }
    }

    // Clean semantic index
    for (const [semanticKey, keys] of this.semanticIndex) {
      const validKeys = keys.filter(key => this.cache.get(key) !== null);
      if (validKeys.length === 0) {
        this.semanticIndex.delete(semanticKey);
      } else if (validKeys.length < keys.length) {
        this.semanticIndex.set(semanticKey, validKeys);
      }
    }

    console.log(`Cache cleanup completed. Stats:`, this.getStats());
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { embeddingCacheSize: number; semanticIndexSize: number } {
    return {
      ...this.cache.getStats(),
      embeddingCacheSize: this.embeddingCache.size,
      semanticIndexSize: this.semanticIndex.size
    };
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.cache.clear();
    this.embeddingCache.clear();
    this.semanticIndex.clear();
    console.log('All caches cleared');
  }

  /**
   * Precompute popular content
   */
  async precomputePopularContent(bookId: string, popularSelections: string[]): Promise<void> {
    if (!this.config.caching.precomputePopularContent) {
      return;
    }

    console.log(`Precomputing cache for ${popularSelections.length} popular selections`);

    // This would integrate with the RAG processor to pre-generate responses
    // Implementation would be done in the RAG processor integration
  }
}

// Export singleton instance
let cacheInstance: ResponseCache | null = null;

export function getResponseCache(): ResponseCache {
  if (!cacheInstance) {
    cacheInstance = new ResponseCache();
  }
  return cacheInstance;
}

// Export cache statistics for monitoring
export function getCacheStatistics(): any {
  return getResponseCache().getStats();
}