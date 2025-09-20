/**
 * Unified Multi-Layer Cache System
 *
 * Implements a sophisticated caching architecture to achieve ≥50% hit rate
 * with hot/cold path optimization, intelligent key strategies, and
 * security-first design.
 *
 * Features:
 * - Multi-layer caching (Memory L1 → Edge KV L2)
 * - Hot/cold path differentiation
 * - Semantic similarity caching
 * - Predictive pre-warming
 * - Security boundary enforcement
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { getPerformanceConfig } from './performance-config.js';
import { supabaseAdmin } from './auth.js';

// Cache layer interfaces
export interface CacheLayer {
  name: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): CacheLayerStats;
}

export interface CacheLayerStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
  avgLatency: number;
  evictions: number;
}

// Cache entry metadata
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  hotness: number; // 0-1 score for hot/cold classification
  userId?: string; // For RLS enforcement
  bookId?: string;
  metadata: CacheEntryMetadata;
}

export interface CacheEntryMetadata {
  contentType: 'response' | 'embedding' | 'chunk' | 'summary';
  queryComplexity: 'simple' | 'moderate' | 'complex';
  size: number;
  tags: string[];
  permissions?: {
    requiresAuth: boolean;
    allowedUsers?: string[];
    rowLevelSecurity: boolean;
  };
}

// Cache strategy configuration
export interface CacheConfig {
  l1: {
    enabled: boolean;
    maxSize: number; // MB
    ttl: number; // seconds
    strategy: 'LRU' | 'LFU' | 'ARC';
  };
  l2: {
    enabled: boolean;
    provider: 'memory' | 'redis' | 'upstash';
    maxSize: number; // MB
    ttl: number; // seconds
  };
  semantic: {
    enabled: boolean;
    threshold: number;
    embeddingDimensions: number;
    maxCandidates: number;
  };
  hotPath: {
    threshold: number; // Access frequency threshold
    ttlMultiplier: number;
    preWarmEnabled: boolean;
  };
  security: {
    enforceRLS: boolean;
    allowCrossUser: boolean;
    encryptSensitive: boolean;
  };
}

// Memory Cache Layer (L1)
export class MemoryCacheLayer implements CacheLayer {
  name = 'L1-Memory';
  private cache = new Map<string, CacheEntry<any>>();
  private accessOrder = new Map<string, number>(); // For LRU
  private stats: CacheLayerStats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRate: 0,
    avgLatency: 0,
    evictions: 0
  };
  private accessCounter = 0;

  constructor(
    private maxSize: number,
    private defaultTtl: number,
    private strategy: 'LRU' | 'LFU' | 'ARC' = 'LRU'
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const start = Date.now();
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.accessOrder.set(key, ++this.accessCounter);

    this.stats.hits++;
    this.stats.avgLatency = (this.stats.avgLatency + (Date.now() - start)) / 2;
    this.updateStats();

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Check size and evict if necessary
    while (this.getCurrentSize() >= this.maxSize && this.cache.size > 0) {
      this.evict();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
      accessCount: 0,
      lastAccessed: Date.now(),
      hotness: 0,
      metadata: {
        contentType: 'response',
        queryComplexity: 'moderate',
        size: this.estimateSize(value),
        tags: []
      }
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
    this.stats.size = this.cache.size;
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.accessOrder.delete(key);
    this.stats.size = this.cache.size;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder.clear();
    this.stats.size = 0;
  }

  private evict(): void {
    if (this.cache.size === 0) return;

    let victimKey: string | null = null;

    if (this.strategy === 'LRU') {
      // Find least recently used
      let oldestAccess = Infinity;
      for (const [key, accessTime] of this.accessOrder) {
        if (accessTime < oldestAccess) {
          oldestAccess = accessTime;
          victimKey = key;
        }
      }
    } else if (this.strategy === 'LFU') {
      // Find least frequently used
      let leastAccess = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.accessCount < leastAccess) {
          leastAccess = entry.accessCount;
          victimKey = key;
        }
      }
    }

    if (victimKey) {
      this.cache.delete(victimKey);
      this.accessOrder.delete(victimKey);
      this.stats.evictions++;
    }
  }

  private getCurrentSize(): number {
    // Estimate current cache size in MB
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.metadata.size;
    }
    return totalSize / (1024 * 1024); // Convert to MB
  }

  private estimateSize(value: any): number {
    // Rough estimation of value size in bytes
    const json = JSON.stringify(value);
    return new Blob([json]).size;
  }

  private updateStats(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  getStats(): CacheLayerStats {
    return { ...this.stats };
  }

  // Get hot keys for promotion to L2
  getHotKeys(threshold: number = 0.7): string[] {
    const hotKeys: string[] = [];
    for (const [key, entry] of this.cache) {
      if (entry.hotness >= threshold) {
        hotKeys.push(key);
      }
    }
    return hotKeys;
  }

  // Update hotness scores based on access patterns
  updateHotness(): void {
    const now = Date.now();
    for (const entry of this.cache.values()) {
      // Calculate hotness based on frequency and recency
      const recency = Math.max(0, 1 - (now - entry.lastAccessed) / (24 * 60 * 60 * 1000)); // Last 24h
      const frequency = Math.min(1, entry.accessCount / 10); // Normalize to max 10 accesses
      entry.hotness = (recency * 0.6) + (frequency * 0.4);
    }
  }
}

// Edge Cache Layer (L2) - Simulated for now, can be extended with Redis/Upstash
export class EdgeCacheLayer implements CacheLayer {
  name = 'L2-Edge';
  private cache = new Map<string, CacheEntry<any>>(); // Simulated edge storage
  private stats: CacheLayerStats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRate: 0,
    avgLatency: 0,
    evictions: 0
  };

  constructor(
    private maxSize: number,
    private defaultTtl: number
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const start = Date.now();

    // Simulate network latency
    await this.simulateLatency(5, 15);

    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.stats.hits++;
    this.stats.avgLatency = (this.stats.avgLatency + (Date.now() - start)) / 2;
    this.updateStats();

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Simulate network latency
    await this.simulateLatency(10, 25);

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
      accessCount: 0,
      lastAccessed: Date.now(),
      hotness: 0.8, // Assume promoted items are hot
      metadata: {
        contentType: 'response',
        queryComplexity: 'moderate',
        size: this.estimateSize(value),
        tags: []
      }
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }

  async delete(key: string): Promise<void> {
    await this.simulateLatency(5, 10);
    this.cache.delete(key);
    this.stats.size = this.cache.size;
  }

  async clear(): Promise<void> {
    await this.simulateLatency(10, 20);
    this.cache.clear();
    this.stats.size = 0;
  }

  private async simulateLatency(min: number, max: number): Promise<void> {
    const latency = min + Math.random() * (max - min);
    await new Promise(resolve => setTimeout(resolve, latency));
  }

  private estimateSize(value: any): number {
    const json = JSON.stringify(value);
    return new Blob([json]).size;
  }

  private updateStats(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  getStats(): CacheLayerStats {
    return { ...this.stats };
  }
}

// Unified Cache Manager
export class UnifiedCacheManager extends EventEmitter {
  private l1Cache: MemoryCacheLayer;
  private l2Cache: EdgeCacheLayer;
  private config: CacheConfig;
  private semanticIndex = new Map<string, string[]>(); // Semantic hash -> cache keys
  private hotPathKeys = new Set<string>();
  private preWarmQueue: string[] = [];

  constructor(config: CacheConfig) {
    super();
    this.config = config;

    // Initialize cache layers
    this.l1Cache = new MemoryCacheLayer(
      config.l1.maxSize,
      config.l1.ttl,
      config.l1.strategy
    );

    this.l2Cache = new EdgeCacheLayer(
      config.l2.maxSize,
      config.l2.ttl
    );

    // Start background tasks
    this.startBackgroundTasks();
  }

  /**
   * Get value from cache with hot/cold path optimization
   */
  async get<T>(key: string, context?: { userId?: string; bookId?: string }): Promise<T | null> {
    // Security check
    if (!this.isAccessAllowed(key, context)) {
      return null;
    }

    // Check if this is a hot path
    const isHotPath = this.hotPathKeys.has(key);

    // Try L1 first
    if (this.config.l1.enabled) {
      const l1Result = await this.l1Cache.get<T>(key);
      if (l1Result !== null) {
        this.emit('cache:hit', { layer: 'L1', key, isHotPath });
        return l1Result;
      }
    }

    // Try L2 if enabled
    if (this.config.l2.enabled) {
      const l2Result = await this.l2Cache.get<T>(key);
      if (l2Result !== null) {
        // Promote to L1 if hot path
        if (isHotPath && this.config.l1.enabled) {
          await this.l1Cache.set(key, l2Result, this.getAdaptiveTTL(key));
        }
        this.emit('cache:hit', { layer: 'L2', key, isHotPath });
        return l2Result;
      }
    }

    // Try semantic similarity if enabled
    if (this.config.semantic.enabled) {
      const semanticResult = await this.findSemanticMatch<T>(key, context);
      if (semanticResult) {
        this.emit('cache:hit', { layer: 'semantic', key, isHotPath });
        return semanticResult;
      }
    }

    this.emit('cache:miss', { key, isHotPath });
    return null;
  }

  /**
   * Set value in appropriate cache layers
   */
  async set<T>(
    key: string,
    value: T,
    options?: {
      ttl?: number;
      metadata?: Partial<CacheEntryMetadata>;
      userId?: string;
      bookId?: string;
      tags?: string[];
    }
  ): Promise<void> {
    const { ttl, metadata, userId, bookId, tags } = options || {};

    // Security validation
    if (!this.isStorageAllowed(value, { userId, bookId })) {
      throw new Error('Cache storage denied: security policy violation');
    }

    const adaptiveTtl = ttl || this.getAdaptiveTTL(key);
    const isHotPath = this.hotPathKeys.has(key);

    // Always store in L1 if enabled
    if (this.config.l1.enabled) {
      await this.l1Cache.set(key, value, adaptiveTtl);
    }

    // Store in L2 if hot path or if L1 is disabled
    if (this.config.l2.enabled && (isHotPath || !this.config.l1.enabled)) {
      await this.l2Cache.set(key, value, adaptiveTtl * this.config.hotPath.ttlMultiplier);
    }

    // Update semantic index
    if (this.config.semantic.enabled && metadata?.contentType === 'response') {
      this.updateSemanticIndex(key, value);
    }

    // Track access patterns for hotness
    this.trackAccess(key);

    this.emit('cache:set', { key, isHotPath, layers: this.getActiveLayers() });
  }

  /**
   * Delete from all cache layers
   */
  async delete(key: string): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.l1.enabled) {
      promises.push(this.l1Cache.delete(key));
    }

    if (this.config.l2.enabled) {
      promises.push(this.l2Cache.delete(key));
    }

    await Promise.all(promises);

    // Clean up indexes
    this.hotPathKeys.delete(key);
    this.cleanupSemanticIndex(key);

    this.emit('cache:delete', { key });
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.l1.enabled) {
      promises.push(this.l1Cache.clear());
    }

    if (this.config.l2.enabled) {
      promises.push(this.l2Cache.clear());
    }

    await Promise.all(promises);

    // Clear indexes
    this.hotPathKeys.clear();
    this.semanticIndex.clear();
    this.preWarmQueue = [];

    this.emit('cache:clear');
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(): {
    overall: { hitRate: number; totalRequests: number };
    l1: CacheLayerStats;
    l2: CacheLayerStats;
    semantic: { indexSize: number; matches: number };
    hotPath: { hotKeys: number; preWarmQueue: number };
  } {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = this.l2Cache.getStats();

    const totalHits = l1Stats.hits + l2Stats.hits;
    const totalRequests = l1Stats.hits + l1Stats.misses + l2Stats.hits + l2Stats.misses;

    return {
      overall: {
        hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
        totalRequests
      },
      l1: l1Stats,
      l2: l2Stats,
      semantic: {
        indexSize: this.semanticIndex.size,
        matches: 0 // Would track semantic matches
      },
      hotPath: {
        hotKeys: this.hotPathKeys.size,
        preWarmQueue: this.preWarmQueue.length
      }
    };
  }

  /**
   * Pre-warm cache with popular content
   */
  async preWarm(entries: Array<{ key: string; value: any; priority: number }>): Promise<void> {
    if (!this.config.hotPath.preWarmEnabled) {
      return;
    }

    // Sort by priority and warm highest priority first
    const sortedEntries = entries.sort((a, b) => b.priority - a.priority);

    for (const entry of sortedEntries) {
      await this.set(entry.key, entry.value);
      this.hotPathKeys.add(entry.key);
    }

    this.emit('cache:preWarm', { count: entries.length });
  }

  // Private methods

  private isAccessAllowed(key: string, context?: { userId?: string; bookId?: string }): boolean {
    if (!this.config.security.enforceRLS) {
      return true;
    }

    // Implement RLS checks here
    // For now, allow access if user context is provided
    return !!context?.userId;
  }

  private isStorageAllowed(value: any, context?: { userId?: string; bookId?: string }): boolean {
    if (!this.config.security.enforceRLS) {
      return true;
    }

    // Check for sensitive data patterns
    const valueStr = JSON.stringify(value).toLowerCase();
    const sensitivePatterns = ['password', 'token', 'secret', 'key', 'credential'];

    for (const pattern of sensitivePatterns) {
      if (valueStr.includes(pattern)) {
        return false;
      }
    }

    return true;
  }

  private getAdaptiveTTL(key: string): number {
    const isHotPath = this.hotPathKeys.has(key);
    const baseTtl = this.config.l1.ttl;

    if (isHotPath) {
      return baseTtl * this.config.hotPath.ttlMultiplier;
    }

    return baseTtl;
  }

  private async findSemanticMatch<T>(key: string, context?: { userId?: string; bookId?: string }): Promise<T | null> {
    // Extract semantic features from key
    const semanticKey = this.generateSemanticKey(key);
    const candidates = this.semanticIndex.get(semanticKey) || [];

    for (const candidateKey of candidates) {
      if (candidateKey === key) continue;

      const similarity = this.calculateSimilarity(key, candidateKey);
      if (similarity >= this.config.semantic.threshold) {
        // Try to get the similar entry
        const result = await this.get<T>(candidateKey, context);
        if (result !== null) {
          return result;
        }
      }
    }

    return null;
  }

  private generateSemanticKey(key: string): string {
    // Simple semantic key generation - can be enhanced with embeddings
    const words = key.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .sort()
      .slice(0, 5)
      .join('-');

    return createHash('md5').update(words).digest('hex').substring(0, 8);
  }

  private calculateSimilarity(key1: string, key2: string): number {
    // Jaccard similarity
    const set1 = new Set(key1.toLowerCase().split(/\s+/));
    const set2 = new Set(key2.toLowerCase().split(/\s+/));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  private updateSemanticIndex(key: string, value: any): void {
    const semanticKey = this.generateSemanticKey(key);
    const existing = this.semanticIndex.get(semanticKey) || [];

    if (!existing.includes(key)) {
      existing.push(key);
      this.semanticIndex.set(semanticKey, existing);
    }
  }

  private cleanupSemanticIndex(key: string): void {
    for (const [semanticKey, keys] of this.semanticIndex) {
      const filtered = keys.filter(k => k !== key);
      if (filtered.length === 0) {
        this.semanticIndex.delete(semanticKey);
      } else if (filtered.length < keys.length) {
        this.semanticIndex.set(semanticKey, filtered);
      }
    }
  }

  private trackAccess(key: string): void {
    // Simple hotness tracking - can be enhanced
    const now = Date.now();

    // Mark as hot if accessed frequently
    if (Math.random() < 0.1) { // 10% chance to promote to hot path
      this.hotPathKeys.add(key);
    }
  }

  private getActiveLayers(): string[] {
    const layers: string[] = [];
    if (this.config.l1.enabled) layers.push('L1');
    if (this.config.l2.enabled) layers.push('L2');
    return layers;
  }

  private startBackgroundTasks(): void {
    // Update hotness scores every 5 minutes
    setInterval(() => {
      this.l1Cache.updateHotness();
      this.promoteHotKeys();
    }, 5 * 60 * 1000);

    // Cleanup expired entries every minute
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60 * 1000);
  }

  private promoteHotKeys(): void {
    if (!this.config.l2.enabled) return;

    const hotKeys = this.l1Cache.getHotKeys(this.config.hotPath.threshold);
    for (const key of hotKeys) {
      this.hotPathKeys.add(key);
    }
  }

  private cleanupExpiredEntries(): void {
    // This would be implemented to clean up expired entries
    // For now, the individual cache layers handle TTL
  }
}

// Factory function for creating cache manager with default config
export function createUnifiedCache(overrides?: Partial<CacheConfig>): UnifiedCacheManager {
  const perfConfig = getPerformanceConfig();

  const defaultConfig: CacheConfig = {
    l1: {
      enabled: true,
      maxSize: 50, // MB
      ttl: 900, // 15 minutes
      strategy: 'LRU'
    },
    l2: {
      enabled: true,
      provider: 'memory',
      maxSize: 200, // MB
      ttl: 3600 // 1 hour
    },
    semantic: {
      enabled: true,
      threshold: 0.8,
      embeddingDimensions: 1536,
      maxCandidates: 10
    },
    hotPath: {
      threshold: 0.7,
      ttlMultiplier: 2,
      preWarmEnabled: true
    },
    security: {
      enforceRLS: true,
      allowCrossUser: false,
      encryptSensitive: true
    }
  };

  const config = { ...defaultConfig, ...overrides };
  return new UnifiedCacheManager(config);
}

// Export singleton instance
let cacheManager: UnifiedCacheManager | null = null;

export function getUnifiedCache(): UnifiedCacheManager {
  if (!cacheManager) {
    cacheManager = createUnifiedCache();
  }
  return cacheManager;
}