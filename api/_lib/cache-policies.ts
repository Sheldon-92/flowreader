/**
 * Cache Consistency and Expiration Policies
 *
 * Implements sophisticated cache policies for consistency, expiration,
 * and invalidation to ensure data freshness while maximizing hit rates.
 *
 * Features:
 * - Multi-level expiration strategies
 * - Content-aware TTL calculation
 * - Consistency guarantees with invalidation cascades
 * - Security-aware cache boundaries
 * - Performance monitoring and adaptive policies
 */

import { EventEmitter } from 'events';
import { getPerformanceConfig } from './performance-config.js';
import { CacheKeyResult } from './cache-keys.js';

// Cache policy configuration
export interface CachePolicyConfig {
  consistency: {
    level: 'eventual' | 'strong' | 'session';
    invalidationStrategy: 'immediate' | 'lazy' | 'batched';
    crossLayerSync: boolean;
    conflictResolution: 'timestamp' | 'version' | 'merge';
  };
  expiration: {
    defaultTTL: number;
    maxTTL: number;
    minTTL: number;
    adaptiveTTL: boolean;
    gracePeriod: number; // Allow stale reads during refresh
  };
  invalidation: {
    enabled: boolean;
    cascadeRules: boolean;
    batchSize: number;
    debounceMs: number;
  };
  security: {
    isolateByUser: boolean;
    respectRLS: boolean;
    encryptionBoundaries: boolean;
  };
  monitoring: {
    trackAccess: boolean;
    trackInvalidations: boolean;
    metricsRetentionMs: number;
  };
}

// Cache entry with policy metadata
export interface PolicyCacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  version: number;
  accessCount: number;
  lastAccessed: number;
  staleAfter?: number;
  refreshAfter?: number;
  dependencies: string[]; // Keys that invalidate this entry
  metadata: {
    contentType: string;
    userId?: string;
    bookId?: string;
    securityLevel: 'public' | 'private' | 'encrypted';
    canStale: boolean; // Allow stale reads
    priority: 'critical' | 'normal' | 'low';
  };
}

// Invalidation event
export interface InvalidationEvent {
  keys: string[];
  reason: 'expiration' | 'dependency' | 'manual' | 'security';
  cascade: boolean;
  timestamp: number;
}

// Policy metrics
export interface PolicyMetrics {
  hits: number;
  misses: number;
  staleHits: number;
  invalidations: number;
  cascadeInvalidations: number;
  adaptiveTTLAdjustments: number;
  securityViolations: number;
}

export class CachePolicyManager extends EventEmitter {
  private config: CachePolicyConfig;
  private entries = new Map<string, PolicyCacheEntry<any>>();
  private dependencies = new Map<string, Set<string>>(); // dependency -> dependents
  private invalidationQueue: Array<{ keys: string[]; timestamp: number; reason: string }> = [];
  private metrics: PolicyMetrics = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    invalidations: 0,
    cascadeInvalidations: 0,
    adaptiveTTLAdjustments: 0,
    securityViolations: 0
  };
  private accessLog: Array<{ key: string; timestamp: number; userId?: string }> = [];

  constructor(config?: Partial<CachePolicyConfig>) {
    super();

    this.config = {
      consistency: {
        level: 'eventual',
        invalidationStrategy: 'lazy',
        crossLayerSync: true,
        conflictResolution: 'timestamp'
      },
      expiration: {
        defaultTTL: 900, // 15 minutes
        maxTTL: 3600, // 1 hour
        minTTL: 60, // 1 minute
        adaptiveTTL: true,
        gracePeriod: 300 // 5 minutes stale grace
      },
      invalidation: {
        enabled: true,
        cascadeRules: true,
        batchSize: 50,
        debounceMs: 1000
      },
      security: {
        isolateByUser: true,
        respectRLS: true,
        encryptionBoundaries: true
      },
      monitoring: {
        trackAccess: true,
        trackInvalidations: true,
        metricsRetentionMs: 24 * 60 * 60 * 1000 // 24 hours
      },
      ...config
    };

    this.startBackgroundTasks();
  }

  /**
   * Get value with policy enforcement
   */
  async get<T>(
    key: string,
    context?: {
      userId?: string;
      allowStale?: boolean;
      refreshInBackground?: boolean;
    }
  ): Promise<{
    value: T | null;
    fresh: boolean;
    stale: boolean;
    ttl: number;
  }> {
    const entry = this.entries.get(key);

    if (!entry) {
      this.metrics.misses++;
      this.trackAccess(key, context?.userId, 'miss');
      return { value: null, fresh: false, stale: false, ttl: 0 };
    }

    // Security check
    if (!this.checkAccess(entry, context?.userId)) {
      this.metrics.securityViolations++;
      this.emit('security:violation', { key, userId: context?.userId });
      return { value: null, fresh: false, stale: false, ttl: 0 };
    }

    const now = Date.now();
    const age = now - entry.timestamp;
    const expired = age > entry.ttl * 1000;
    const staleThreshold = entry.staleAfter || (entry.ttl * 0.8);
    const isStale = age > staleThreshold * 1000;

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessed = now;

    // Handle expired entries
    if (expired) {
      // Check if we can serve stale data
      if (context?.allowStale && entry.metadata.canStale &&
          age <= (entry.ttl + this.config.expiration.gracePeriod) * 1000) {
        this.metrics.staleHits++;
        this.trackAccess(key, context?.userId, 'stale');

        // Trigger background refresh if requested
        if (context?.refreshInBackground) {
          this.emit('refresh:background', { key, entry });
        }

        return {
          value: entry.value as T,
          fresh: false,
          stale: true,
          ttl: Math.max(0, entry.ttl - Math.floor(age / 1000))
        };
      }

      // Entry is expired and can't serve stale
      this.invalidateKey(key, 'expiration');
      this.metrics.misses++;
      this.trackAccess(key, context?.userId, 'expired');
      return { value: null, fresh: false, stale: false, ttl: 0 };
    }

    // Successful hit
    this.metrics.hits++;
    this.trackAccess(key, context?.userId, 'hit');

    // Adapt TTL based on access patterns
    if (this.config.expiration.adaptiveTTL) {
      this.adaptTTL(key, entry);
    }

    return {
      value: entry.value as T,
      fresh: !isStale,
      stale: isStale,
      ttl: Math.max(0, entry.ttl - Math.floor(age / 1000))
    };
  }

  /**
   * Set value with policy application
   */
  async set<T>(
    key: string,
    value: T,
    options?: {
      ttl?: number;
      metadata?: Partial<PolicyCacheEntry<T>['metadata']>;
      dependencies?: string[];
      version?: number;
      allowStale?: boolean;
      priority?: 'critical' | 'normal' | 'low';
    }
  ): Promise<void> {
    const now = Date.now();
    const ttl = this.calculateTTL(key, value, options?.ttl);

    // Create policy entry
    const entry: PolicyCacheEntry<T> = {
      value,
      timestamp: now,
      ttl,
      version: options?.version || 1,
      accessCount: 0,
      lastAccessed: now,
      staleAfter: ttl * 0.8, // Allow stale reads after 80% of TTL
      refreshAfter: ttl * 0.9, // Suggest refresh after 90% of TTL
      dependencies: options?.dependencies || [],
      metadata: {
        contentType: 'response',
        securityLevel: 'private',
        canStale: options?.allowStale ?? true,
        priority: options?.priority || 'normal',
        ...options?.metadata
      }
    };

    // Store entry
    this.entries.set(key, entry);

    // Update dependency tracking
    if (options?.dependencies && this.config.invalidation.cascadeRules) {
      this.updateDependencies(key, options.dependencies);
    }

    // Emit set event
    this.emit('cache:set', { key, entry, ttl });

    // Schedule expiration if needed
    if (this.config.consistency.invalidationStrategy === 'immediate') {
      this.scheduleExpiration(key, ttl);
    }
  }

  /**
   * Invalidate specific keys
   */
  async invalidate(
    keys: string | string[],
    options?: {
      reason?: string;
      cascade?: boolean;
      immediate?: boolean;
    }
  ): Promise<void> {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const reason = options?.reason || 'manual';
    const cascade = options?.cascade ?? this.config.invalidation.cascadeRules;
    const immediate = options?.immediate ?? (this.config.consistency.invalidationStrategy === 'immediate');

    if (immediate) {
      await this.processInvalidation(keyArray, reason, cascade);
    } else {
      this.queueInvalidation(keyArray, reason, cascade);
    }
  }

  /**
   * Invalidate by pattern or metadata
   */
  async invalidateByPattern(
    pattern: {
      userId?: string;
      bookId?: string;
      contentType?: string;
      securityLevel?: string;
      keyPattern?: RegExp;
    },
    options?: {
      reason?: string;
      immediate?: boolean;
    }
  ): Promise<void> {
    const matchingKeys: string[] = [];

    for (const [key, entry] of this.entries) {
      let matches = true;

      if (pattern.userId && entry.metadata.userId !== pattern.userId) {
        matches = false;
      }
      if (pattern.bookId && entry.metadata.bookId !== pattern.bookId) {
        matches = false;
      }
      if (pattern.contentType && entry.metadata.contentType !== pattern.contentType) {
        matches = false;
      }
      if (pattern.securityLevel && entry.metadata.securityLevel !== pattern.securityLevel) {
        matches = false;
      }
      if (pattern.keyPattern && !pattern.keyPattern.test(key)) {
        matches = false;
      }

      if (matches) {
        matchingKeys.push(key);
      }
    }

    if (matchingKeys.length > 0) {
      await this.invalidate(matchingKeys, {
        reason: options?.reason || 'pattern',
        immediate: options?.immediate
      });
    }
  }

  /**
   * Refresh entries nearing expiration
   */
  async refreshStale(
    refreshFunction: (key: string, entry: PolicyCacheEntry<any>) => Promise<any>
  ): Promise<number> {
    const now = Date.now();
    let refreshed = 0;

    for (const [key, entry] of this.entries) {
      const age = now - entry.timestamp;
      const shouldRefresh = entry.refreshAfter &&
                           age > entry.refreshAfter * 1000 &&
                           age < entry.ttl * 1000;

      if (shouldRefresh) {
        try {
          const newValue = await refreshFunction(key, entry);
          if (newValue !== undefined) {
            await this.set(key, newValue, {
              ttl: entry.ttl,
              metadata: entry.metadata,
              dependencies: entry.dependencies,
              version: entry.version + 1
            });
            refreshed++;
          }
        } catch (error) {
          this.emit('refresh:error', { key, error });
        }
      }
    }

    return refreshed;
  }

  /**
   * Get cache statistics and metrics
   */
  getMetrics(): PolicyMetrics & {
    totalEntries: number;
    averageAge: number;
    hitRate: number;
    staleRate: number;
    dependencyGraphSize: number;
  } {
    const now = Date.now();
    const entries = Array.from(this.entries.values());
    const totalRequests = this.metrics.hits + this.metrics.misses + this.metrics.staleHits;

    const averageAge = entries.length > 0
      ? entries.reduce((sum, entry) => sum + (now - entry.timestamp), 0) / entries.length / 1000
      : 0;

    return {
      ...this.metrics,
      totalEntries: this.entries.size,
      averageAge,
      hitRate: totalRequests > 0 ? (this.metrics.hits + this.metrics.staleHits) / totalRequests : 0,
      staleRate: totalRequests > 0 ? this.metrics.staleHits / totalRequests : 0,
      dependencyGraphSize: this.dependencies.size
    };
  }

  /**
   * Get entries nearing expiration
   */
  getExpiringEntries(withinSeconds: number = 300): Array<{ key: string; ttl: number; entry: PolicyCacheEntry<any> }> {
    const now = Date.now();
    const threshold = withinSeconds * 1000;

    return Array.from(this.entries.entries())
      .map(([key, entry]) => {
        const age = now - entry.timestamp;
        const remainingTTL = Math.max(0, entry.ttl * 1000 - age);
        return { key, ttl: Math.floor(remainingTTL / 1000), entry };
      })
      .filter(item => item.ttl <= withinSeconds && item.ttl > 0)
      .sort((a, b) => a.ttl - b.ttl);
  }

  /**
   * Clear all entries
   */
  async clear(
    pattern?: {
      userId?: string;
      bookId?: string;
      securityLevel?: string;
    }
  ): Promise<void> {
    if (!pattern) {
      this.entries.clear();
      this.dependencies.clear();
      this.invalidationQueue = [];
      this.emit('cache:clear', { pattern: 'all' });
      return;
    }

    await this.invalidateByPattern(pattern, { reason: 'clear', immediate: true });
  }

  // Private methods

  private calculateTTL<T>(key: string, value: T, requestedTTL?: number): number {
    let ttl = requestedTTL || this.config.expiration.defaultTTL;

    // Apply min/max constraints
    ttl = Math.max(this.config.expiration.minTTL, ttl);
    ttl = Math.min(this.config.expiration.maxTTL, ttl);

    // Adaptive TTL based on access patterns
    if (this.config.expiration.adaptiveTTL) {
      const existingEntry = this.entries.get(key);
      if (existingEntry && existingEntry.accessCount > 0) {
        // Increase TTL for frequently accessed items
        const accessBonus = Math.min(0.5, existingEntry.accessCount / 10);
        ttl = Math.floor(ttl * (1 + accessBonus));
      }
    }

    return ttl;
  }

  private checkAccess(entry: PolicyCacheEntry<any>, userId?: string): boolean {
    if (!this.config.security.respectRLS) {
      return true;
    }

    // Public entries are accessible to all
    if (entry.metadata.securityLevel === 'public') {
      return true;
    }

    // Private entries require user context
    if (entry.metadata.securityLevel === 'private') {
      if (!userId || !entry.metadata.userId) {
        return false;
      }

      // User isolation check
      if (this.config.security.isolateByUser && entry.metadata.userId !== userId) {
        return false;
      }
    }

    // Encrypted entries require special handling
    if (entry.metadata.securityLevel === 'encrypted' && this.config.security.encryptionBoundaries) {
      // Additional encryption checks would go here
      return !!userId;
    }

    return true;
  }

  private adaptTTL(key: string, entry: PolicyCacheEntry<any>): void {
    const accessFrequency = entry.accessCount / Math.max(1, (Date.now() - entry.timestamp) / (60 * 60 * 1000)); // accesses per hour

    // Increase TTL for frequently accessed items
    if (accessFrequency > 10 && entry.ttl < this.config.expiration.maxTTL) {
      const newTTL = Math.min(this.config.expiration.maxTTL, entry.ttl * 1.1);
      if (newTTL !== entry.ttl) {
        entry.ttl = newTTL;
        this.metrics.adaptiveTTLAdjustments++;
        this.emit('ttl:adapted', { key, oldTTL: entry.ttl, newTTL, reason: 'high-frequency' });
      }
    }
  }

  private updateDependencies(key: string, dependencies: string[]): void {
    // Remove old dependencies
    for (const [dep, dependents] of this.dependencies) {
      dependents.delete(key);
      if (dependents.size === 0) {
        this.dependencies.delete(dep);
      }
    }

    // Add new dependencies
    for (const dep of dependencies) {
      const dependents = this.dependencies.get(dep) || new Set();
      dependents.add(key);
      this.dependencies.set(dep, dependents);
    }
  }

  private async processInvalidation(keys: string[], reason: string, cascade: boolean): Promise<void> {
    const invalidatedKeys: string[] = [];

    for (const key of keys) {
      if (this.entries.has(key)) {
        this.entries.delete(key);
        invalidatedKeys.push(key);
        this.metrics.invalidations++;

        // Handle cascading invalidation
        if (cascade) {
          const dependents = this.dependencies.get(key);
          if (dependents && dependents.size > 0) {
            const cascadeKeys = Array.from(dependents);
            await this.processInvalidation(cascadeKeys, 'cascade', true);
            this.metrics.cascadeInvalidations += cascadeKeys.length;
          }
        }

        // Clean up dependency tracking
        this.dependencies.delete(key);
        for (const [dep, dependents] of this.dependencies) {
          dependents.delete(key);
          if (dependents.size === 0) {
            this.dependencies.delete(dep);
          }
        }
      }
    }

    if (invalidatedKeys.length > 0) {
      this.emit('cache:invalidated', {
        keys: invalidatedKeys,
        reason,
        cascade,
        timestamp: Date.now()
      } as InvalidationEvent);

      if (this.config.monitoring.trackInvalidations) {
        this.trackInvalidation(invalidatedKeys, reason);
      }
    }
  }

  private queueInvalidation(keys: string[], reason: string, cascade: boolean): void {
    this.invalidationQueue.push({
      keys,
      timestamp: Date.now(),
      reason: `${reason}${cascade ? '-cascade' : ''}`
    });

    // Process queue if it gets too large
    if (this.invalidationQueue.length >= this.config.invalidation.batchSize) {
      this.processInvalidationQueue();
    }
  }

  private async processInvalidationQueue(): Promise<void> {
    if (this.invalidationQueue.length === 0) return;

    const batch = this.invalidationQueue.splice(0, this.config.invalidation.batchSize);
    const allKeys = new Set<string>();

    for (const item of batch) {
      item.keys.forEach(key => allKeys.add(key));
    }

    await this.processInvalidation(Array.from(allKeys), 'batched', false);
  }

  private scheduleExpiration(key: string, ttl: number): void {
    setTimeout(() => {
      if (this.entries.has(key)) {
        this.invalidateKey(key, 'expiration');
      }
    }, ttl * 1000);
  }

  private invalidateKey(key: string, reason: string): void {
    this.processInvalidation([key], reason, this.config.invalidation.cascadeRules);
  }

  private trackAccess(key: string, userId?: string, type: string): void {
    if (!this.config.monitoring.trackAccess) return;

    this.accessLog.push({
      key,
      timestamp: Date.now(),
      userId
    });

    // Limit log size
    if (this.accessLog.length > 10000) {
      this.accessLog = this.accessLog.slice(-5000);
    }
  }

  private trackInvalidation(keys: string[], reason: string): void {
    // Would implement detailed invalidation tracking here
    this.emit('invalidation:tracked', { keys, reason, timestamp: Date.now() });
  }

  private startBackgroundTasks(): void {
    // Process invalidation queue every second
    setInterval(() => {
      this.processInvalidationQueue();
    }, this.config.invalidation.debounceMs);

    // Clean up expired entries every 5 minutes
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);

    // Clean up old access logs
    setInterval(() => {
      const cutoff = Date.now() - this.config.monitoring.metricsRetentionMs;
      this.accessLog = this.accessLog.filter(log => log.timestamp > cutoff);
    }, 60 * 60 * 1000); // Every hour
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.entries) {
      const age = now - entry.timestamp;
      if (age > (entry.ttl + this.config.expiration.gracePeriod) * 1000) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      this.processInvalidation(expiredKeys, 'cleanup', false);
    }
  }
}

// Export singleton instance
let policyManager: CachePolicyManager | null = null;

export function getCachePolicyManager(): CachePolicyManager {
  if (!policyManager) {
    policyManager = new CachePolicyManager();
  }
  return policyManager;
}

// Export factory for custom configurations
export function createCachePolicyManager(config?: Partial<CachePolicyConfig>): CachePolicyManager {
  return new CachePolicyManager(config);
}