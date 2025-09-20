/**
 * ML-Enhanced Cache Key Management System
 *
 * Intelligent key generation and management for ML-enhanced caching.
 * Provides consistent key strategies, TTL optimization, and cache consistency
 * while maintaining strict privacy and security boundaries.
 *
 * Features:
 * - Content-aware key generation with semantic hashing
 * - Adaptive TTL calculation based on content patterns and access frequency
 * - Privacy-compliant key namespacing and sharing boundaries
 * - Intelligent cache invalidation with dependency tracking
 * - Rollback capability for cache management operations
 */

import { createHash } from 'crypto';

// Cache key components
export interface CacheKeyComponents {
  namespace: string;      // Privacy/security namespace
  contentType: string;    // Type of cached content
  priority: string;       // Cache priority level
  bookId: string;         // Book identifier
  contentHash: string;    // Content fingerprint
  metadata: string;       // Additional metadata hash
  userContext?: string;   // User-specific context (if applicable)
}

// Cache key metadata
export interface CacheKeyMetadata {
  generated: number;
  keyType: 'direct' | 'semantic' | 'predictive' | 'anonymous';
  privacyLevel: 'public' | 'authenticated' | 'private' | 'anonymous';
  canShareCrossUser: boolean;
  dependencies: string[];
  invalidationRules: string[];
  estimatedSize: number;
  qualityScore: number;
}

// TTL calculation factors
export interface TTLFactors {
  contentType: string;
  accessFrequency: number;
  userPatterns: number;
  qualityScore: number;
  privacyLevel: string;
  computationCost: number;
  seasonality: number;
}

// Cache sharing boundaries
export interface SharingBoundaries {
  allowCrossUser: boolean;
  allowCrossBook: boolean;
  allowAnonymous: boolean;
  requireRLSCompliance: boolean;
  auditRequired: boolean;
  maxSharedUsers: number;
}

// Cache consistency rules
export interface ConsistencyRules {
  level: 'eventual' | 'strong' | 'session';
  dependencies: string[];
  invalidationTriggers: string[];
  cascadeInvalidation: boolean;
  gracePeriod: number;
}

export class CacheMLKeyManager {
  private keyMetadata: Map<string, CacheKeyMetadata> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private invalidationQueue: Array<{ key: string; reason: string; timestamp: number }> = [];

  // Key generation configuration
  private readonly KEY_CONFIG = {
    maxKeyLength: 128,
    hashAlgorithm: 'sha256',
    namespaceDelimiter: ':',
    metadataDelimiter: '|',
    versionPrefix: 'v2'
  };

  // TTL base values (in seconds)
  private readonly TTL_BASE = {
    responses: 900,      // 15 minutes
    embeddings: 3600,    // 1 hour
    chunks: 1800,        // 30 minutes
    summaries: 1200,     // 20 minutes
    translations: 1800,  // 30 minutes
    analysis: 600,       // 10 minutes
    predictive: 3600     // 1 hour for predictions
  };

  // Privacy compliance settings
  private readonly PRIVACY_CONFIG = {
    excludePII: true,
    respectRLSBoundaries: true,
    auditAccess: true,
    anonymizeSharedContent: true,
    maxCrossUserSharing: 1000, // Max users who can share content
    piiPatterns: [
      /\b\d{3}-\d{2}-\d{4}\b/,                           // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,     // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/                 // Phone
    ]
  };

  // Statistics tracking
  private stats = {
    keysGenerated: 0,
    keysInvalidated: 0,
    dependenciesTracked: 0,
    crossUserShares: 0,
    rlsViolationsPrevented: 0,
    ttlAdjustments: 0
  };

  /**
   * Generate intelligent cache key with ML enhancement
   */
  generateMLCacheKey(params: {
    content: string;
    contentType: string;
    bookId: string;
    userId?: string;
    chapterIdx?: number;
    selection?: string;
    enhanceType?: string;
    isPublic?: boolean;
    qualityScore?: number;
  }): { key: string; metadata: CacheKeyMetadata } {

    // Validate content for PII
    if (this.containsPII(params.content)) {
      throw new Error('Content contains PII and cannot be cached');
    }

    // Generate key components
    const components = this.generateKeyComponents(params);

    // Construct the cache key
    const key = this.constructKey(components);

    // Generate metadata
    const metadata = this.generateKeyMetadata(params, components);

    // Store metadata for tracking
    this.keyMetadata.set(key, metadata);

    // Track dependencies
    this.trackDependencies(key, metadata.dependencies);

    this.stats.keysGenerated++;

    return { key, metadata };
  }

  /**
   * Generate semantic cache key for similar content matching
   */
  generateSemanticKey(params: {
    content: string;
    bookId: string;
    userId?: string;
    conceptHash?: string;
  }): string {

    // Extract semantic features
    const semanticFeatures = this.extractSemanticFeatures(params.content);

    // Generate concept hash if not provided
    const conceptHash = params.conceptHash || this.generateConceptHash(semanticFeatures);

    // Create semantic key
    const components: CacheKeyComponents = {
      namespace: 'semantic',
      contentType: 'concept',
      priority: 'normal',
      bookId: params.bookId,
      contentHash: conceptHash,
      metadata: this.hashMetadata({ semanticFeatures }),
      userContext: params.userId ? this.hashUserContext(params.userId) : undefined
    };

    return this.constructKey(components);
  }

  /**
   * Generate anonymous sharing key for cross-user content
   */
  generateAnonymousKey(params: {
    content: string;
    bookId: string;
    conceptCluster: string;
  }): string {

    if (!this.canShareAnonymously(params.content)) {
      throw new Error('Content cannot be shared anonymously');
    }

    const anonymizedContent = this.anonymizeContent(params.content);

    const components: CacheKeyComponents = {
      namespace: 'anonymous',
      contentType: 'shared',
      priority: 'normal',
      bookId: params.bookId,
      contentHash: this.hashContent(anonymizedContent),
      metadata: this.hashMetadata({ conceptCluster: params.conceptCluster })
    };

    return this.constructKey(components);
  }

  /**
   * Calculate adaptive TTL based on multiple factors
   */
  calculateAdaptiveTTL(params: {
    contentType: string;
    accessFrequency?: number;
    qualityScore?: number;
    computationCost?: number;
    privacyLevel?: string;
    userPatterns?: {
      avgSessionDuration: number;
      accessPattern: 'regular' | 'sporadic' | 'intensive';
      timeOfDay: number;
    };
  }): number {

    const factors: TTLFactors = {
      contentType: params.contentType,
      accessFrequency: params.accessFrequency || 1,
      userPatterns: this.calculateUserPatternScore(params.userPatterns),
      qualityScore: params.qualityScore || 0.8,
      privacyLevel: params.privacyLevel || 'authenticated',
      computationCost: params.computationCost || 1,
      seasonality: this.calculateSeasonalityFactor()
    };

    return this.computeTTL(factors);
  }

  /**
   * Define sharing boundaries for cache content
   */
  defineSharingBoundaries(params: {
    contentType: string;
    privacyLevel: string;
    bookId: string;
    userId?: string;
    isPublic?: boolean;
    hasPersonalData?: boolean;
  }): SharingBoundaries {

    const boundaries: SharingBoundaries = {
      allowCrossUser: false,
      allowCrossBook: false,
      allowAnonymous: false,
      requireRLSCompliance: true,
      auditRequired: true,
      maxSharedUsers: 0
    };

    // Public content can be shared more freely
    if (params.isPublic && !params.hasPersonalData) {
      boundaries.allowCrossUser = true;
      boundaries.allowAnonymous = true;
      boundaries.maxSharedUsers = this.PRIVACY_CONFIG.maxCrossUserSharing;
    }

    // Authenticated content has limited sharing
    if (params.privacyLevel === 'authenticated' && !params.hasPersonalData) {
      boundaries.allowCrossBook = true;
      boundaries.maxSharedUsers = 10;
    }

    // Embeddings and chunks can be shared if content allows
    if (['embedding', 'chunk'].includes(params.contentType) && !params.hasPersonalData) {
      boundaries.allowCrossUser = params.isPublic || false;
      boundaries.allowAnonymous = params.isPublic || false;
    }

    return boundaries;
  }

  /**
   * Define consistency rules for cache content
   */
  defineConsistencyRules(params: {
    contentType: string;
    privacyLevel: string;
    dependencies: string[];
    isCritical?: boolean;
  }): ConsistencyRules {

    const rules: ConsistencyRules = {
      level: 'eventual',
      dependencies: params.dependencies,
      invalidationTriggers: [],
      cascadeInvalidation: false,
      gracePeriod: 300 // 5 minutes default
    };

    // Critical content needs strong consistency
    if (params.isCritical) {
      rules.level = 'strong';
      rules.cascadeInvalidation = true;
      rules.gracePeriod = 0;
    }

    // User-specific content needs session consistency
    if (params.privacyLevel === 'private') {
      rules.level = 'session';
      rules.gracePeriod = 60; // 1 minute
    }

    // Define invalidation triggers based on content type
    switch (params.contentType) {
      case 'response':
        rules.invalidationTriggers = ['book_update', 'content_change'];
        break;
      case 'embedding':
        rules.invalidationTriggers = ['model_update', 'content_change'];
        break;
      case 'summary':
        rules.invalidationTriggers = ['book_update', 'chapter_update'];
        rules.cascadeInvalidation = true;
        break;
    }

    return rules;
  }

  /**
   * Invalidate cache keys with dependency cascading
   */
  async invalidateKeys(params: {
    keys?: string[];
    pattern?: string;
    reason: string;
    cascadeLevel?: 'none' | 'immediate' | 'deep';
    dryRun?: boolean;
  }): Promise<{ invalidated: string[]; cascaded: string[]; errors: string[] }> {

    const result = {
      invalidated: [] as string[],
      cascaded: [] as string[],
      errors: [] as string[]
    };

    try {
      let keysToInvalidate: string[] = [];

      // Collect keys to invalidate
      if (params.keys) {
        keysToInvalidate = params.keys;
      } else if (params.pattern) {
        keysToInvalidate = this.findKeysByPattern(params.pattern);
      }

      // Process each key
      for (const key of keysToInvalidate) {
        try {
          if (!params.dryRun) {
            await this.invalidateKey(key, params.reason);
          }
          result.invalidated.push(key);

          // Handle cascade invalidation
          if (params.cascadeLevel && params.cascadeLevel !== 'none') {
            const cascaded = await this.handleCascadeInvalidation(
              key,
              params.cascadeLevel,
              params.dryRun || false
            );
            result.cascaded.push(...cascaded);
          }

        } catch (error) {
          result.errors.push(`${key}: ${error.message}`);
        }
      }

      this.stats.keysInvalidated += result.invalidated.length;

    } catch (error) {
      result.errors.push(`Invalidation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Generate rollback strategy for cache operations
   */
  generateRollbackStrategy(params: {
    operationType: 'invalidation' | 'update' | 'migration';
    affectedKeys: string[];
    reason: string;
    preserveData?: boolean;
  }): {
    strategy: string;
    steps: Array<{
      action: string;
      description: string;
      command: string;
      rollbackCommand: string;
    }>;
    estimatedTime: number;
    riskLevel: 'low' | 'medium' | 'high';
  } {

    const steps: Array<{
      action: string;
      description: string;
      command: string;
      rollbackCommand: string;
    }> = [];

    // Backup step
    steps.push({
      action: 'backup',
      description: 'Create backup of affected cache entries',
      command: `cache.backup(${JSON.stringify(params.affectedKeys)})`,
      rollbackCommand: `cache.restore(backupId)`
    });

    // Main operation step
    switch (params.operationType) {
      case 'invalidation':
        steps.push({
          action: 'invalidate',
          description: 'Invalidate specified cache keys',
          command: `cache.invalidateKeys(${JSON.stringify(params.affectedKeys)})`,
          rollbackCommand: `cache.restore(backupId, keys)`
        });
        break;

      case 'update':
        steps.push({
          action: 'update',
          description: 'Update cache entries with new values',
          command: `cache.updateEntries(updates)`,
          rollbackCommand: `cache.restore(backupId, keys)`
        });
        break;

      case 'migration':
        steps.push({
          action: 'migrate',
          description: 'Migrate cache entries to new format',
          command: `cache.migrateEntries(migrationRules)`,
          rollbackCommand: `cache.restore(backupId)`
        });
        break;
    }

    // Validation step
    steps.push({
      action: 'validate',
      description: 'Validate cache integrity after operation',
      command: `cache.validateIntegrity()`,
      rollbackCommand: `cache.restore(backupId)`
    });

    // Calculate risk level
    const riskLevel = this.assessRiskLevel(params.affectedKeys.length, params.operationType);

    return {
      strategy: `${params.operationType}_with_backup`,
      steps,
      estimatedTime: this.estimateOperationTime(steps.length, params.affectedKeys.length),
      riskLevel
    };
  }

  // Private helper methods

  private generateKeyComponents(params: any): CacheKeyComponents {
    return {
      namespace: this.determineNamespace(params),
      contentType: params.contentType,
      priority: this.determinePriority(params),
      bookId: params.bookId,
      contentHash: this.hashContent(params.content),
      metadata: this.hashMetadata(params),
      userContext: params.userId ? this.hashUserContext(params.userId) : undefined
    };
  }

  private constructKey(components: CacheKeyComponents): string {
    const keyParts = [
      this.KEY_CONFIG.versionPrefix,
      components.namespace,
      components.contentType,
      components.priority,
      components.bookId.substring(0, 8), // Truncate book ID
      components.contentHash.substring(0, 12), // Truncate content hash
      components.metadata.substring(0, 8) // Truncate metadata
    ];

    if (components.userContext) {
      keyParts.push(components.userContext.substring(0, 8));
    }

    const key = keyParts.join(this.KEY_CONFIG.namespaceDelimiter);

    // Ensure key length limit
    if (key.length > this.KEY_CONFIG.maxKeyLength) {
      return createHash('sha256').update(key).digest('hex').substring(0, this.KEY_CONFIG.maxKeyLength);
    }

    return key;
  }

  private generateKeyMetadata(params: any, components: CacheKeyComponents): CacheKeyMetadata {
    const dependencies = this.identifyDependencies(params);

    return {
      generated: Date.now(),
      keyType: this.determineKeyType(params),
      privacyLevel: this.determinePrivacyLevel(params),
      canShareCrossUser: this.canShareCrossUser(params),
      dependencies,
      invalidationRules: this.generateInvalidationRules(params),
      estimatedSize: this.estimateEntrySize(params),
      qualityScore: params.qualityScore || 0.8
    };
  }

  private determineNamespace(params: any): string {
    if (params.userId && !params.isPublic) {
      return 'private';
    } else if (params.userId) {
      return 'authenticated';
    } else if (params.isPublic) {
      return 'public';
    } else {
      return 'anonymous';
    }
  }

  private determinePriority(params: any): string {
    const complexity = this.analyzeContentComplexity(params.content);
    const accessFrequency = params.accessFrequency || 1;

    if (complexity > 0.8 || accessFrequency > 10) {
      return 'hot';
    } else if (complexity < 0.3 && accessFrequency < 2) {
      return 'cold';
    } else {
      return 'normal';
    }
  }

  private determineKeyType(params: any): 'direct' | 'semantic' | 'predictive' | 'anonymous' {
    if (params.isPredicted) return 'predictive';
    if (params.isAnonymous) return 'anonymous';
    if (params.isSemanticMatch) return 'semantic';
    return 'direct';
  }

  private determinePrivacyLevel(params: any): 'public' | 'authenticated' | 'private' | 'anonymous' {
    if (!params.userId) return 'anonymous';
    if (params.isPublic) return 'public';
    if (params.hasPersonalData) return 'private';
    return 'authenticated';
  }

  private canShareCrossUser(params: any): boolean {
    return params.isPublic && !params.hasPersonalData && !this.containsPII(params.content);
  }

  private containsPII(content: string): boolean {
    return this.PRIVACY_CONFIG.piiPatterns.some(pattern => pattern.test(content));
  }

  private canShareAnonymously(content: string): boolean {
    if (this.containsPII(content)) return false;

    // Check for personal references
    const personalPatterns = [
      /\bi\s/i, /\bmy\s/i, /\bme\s/i, /\bmine\s/i,
      /\byou\s/i, /\byour\s/i, /\byours\s/i
    ];

    return !personalPatterns.some(pattern => pattern.test(content));
  }

  private anonymizeContent(content: string): string {
    return content
      .replace(/\b[A-Z][a-z]+\b/g, '[NAME]')
      .replace(/\b\d{4}\b/g, '[YEAR]')
      .replace(/\b\d+\b/g, '[NUMBER]')
      .substring(0, 200);
  }

  private extractSemanticFeatures(content: string): string[] {
    return content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word))
      .slice(0, 10);
  }

  private generateConceptHash(features: string[]): string {
    return createHash('md5')
      .update(features.sort().join('-'))
      .digest('hex')
      .substring(0, 12);
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'but', 'for', 'are', 'with', 'they', 'this', 'that',
      'from', 'have', 'been', 'their', 'said', 'each', 'which', 'what'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  private hashContent(content: string): string {
    return createHash(this.KEY_CONFIG.hashAlgorithm)
      .update(content)
      .digest('hex')
      .substring(0, 16);
  }

  private hashMetadata(metadata: any): string {
    return createHash('md5')
      .update(JSON.stringify(metadata))
      .digest('hex')
      .substring(0, 8);
  }

  private hashUserContext(userId: string): string {
    return createHash('md5')
      .update(userId)
      .digest('hex')
      .substring(0, 8);
  }

  private analyzeContentComplexity(content: string): number {
    const words = content.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const questionMarks = (content.match(/\?/g) || []).length;
    const complexPhrases = (content.match(/\b(analyze|compare|synthesize|evaluate)\b/gi) || []).length;

    return Math.min(1.0,
      (words.length / 100) * 0.3 +
      (avgWordLength / 10) * 0.2 +
      (questionMarks / 5) * 0.3 +
      (complexPhrases / 3) * 0.2
    );
  }

  private calculateUserPatternScore(patterns: any): number {
    if (!patterns) return 0.5;

    const sessionScore = Math.min(1.0, patterns.avgSessionDuration / 3600); // Normalize to 1 hour
    const patternScore = patterns.accessPattern === 'regular' ? 1.0 :
                        patterns.accessPattern === 'intensive' ? 0.8 : 0.4;
    const timeScore = Math.abs(patterns.timeOfDay - 12) / 12; // Peak at noon

    return (sessionScore + patternScore + timeScore) / 3;
  }

  private calculateSeasonalityFactor(): number {
    const hour = new Date().getHours();
    // Peak usage between 9 AM and 9 PM
    if (hour >= 9 && hour <= 21) {
      return 1.2; // 20% longer TTL during peak hours
    } else {
      return 0.8; // 20% shorter TTL during off-peak
    }
  }

  private computeTTL(factors: TTLFactors): number {
    const baseTTL = this.TTL_BASE[factors.contentType] || this.TTL_BASE.responses;

    let multiplier = 1.0;

    // Access frequency factor
    multiplier *= Math.min(2.0, 1 + Math.log10(factors.accessFrequency));

    // Quality score factor
    multiplier *= factors.qualityScore;

    // User patterns factor
    multiplier *= (0.5 + factors.userPatterns * 0.5);

    // Computation cost factor (expensive computations get longer TTL)
    multiplier *= Math.min(1.5, factors.computationCost);

    // Privacy level factor
    if (factors.privacyLevel === 'public') {
      multiplier *= 1.5; // Public content can be cached longer
    } else if (factors.privacyLevel === 'private') {
      multiplier *= 0.7; // Private content has shorter TTL
    }

    // Seasonality factor
    multiplier *= factors.seasonality;

    const finalTTL = Math.floor(baseTTL * multiplier);

    // Ensure reasonable bounds
    return Math.max(60, Math.min(7200, finalTTL)); // 1 minute to 2 hours
  }

  private identifyDependencies(params: any): string[] {
    const dependencies: string[] = [];

    // Book dependency
    dependencies.push(`book:${params.bookId}`);

    // Chapter dependency if applicable
    if (params.chapterIdx !== undefined) {
      dependencies.push(`chapter:${params.bookId}:${params.chapterIdx}`);
    }

    // User dependency for private content
    if (params.userId && !params.isPublic) {
      dependencies.push(`user:${params.userId}`);
    }

    // Content type dependency
    dependencies.push(`content-type:${params.contentType}`);

    return dependencies;
  }

  private generateInvalidationRules(params: any): string[] {
    const rules: string[] = [];

    switch (params.contentType) {
      case 'response':
        rules.push('on_book_update', 'on_content_change');
        break;
      case 'embedding':
        rules.push('on_model_update', 'on_content_change');
        break;
      case 'summary':
        rules.push('on_book_update', 'on_chapter_update');
        break;
      case 'translation':
        rules.push('on_source_change');
        break;
    }

    if (params.userId) {
      rules.push('on_user_logout');
    }

    return rules;
  }

  private estimateEntrySize(params: any): number {
    // Rough estimation in bytes
    const contentSize = params.content?.length || 0;
    const responseSize = params.response?.length || 0;
    const metadataSize = 500; // Estimated metadata overhead

    return contentSize + responseSize + metadataSize;
  }

  private trackDependencies(key: string, dependencies: string[]): void {
    for (const dep of dependencies) {
      const dependents = this.dependencyGraph.get(dep) || new Set();
      dependents.add(key);
      this.dependencyGraph.set(dep, dependents);
    }
    this.stats.dependenciesTracked += dependencies.length;
  }

  private findKeysByPattern(pattern: string): string[] {
    const regex = new RegExp(pattern);
    return Array.from(this.keyMetadata.keys()).filter(key => regex.test(key));
  }

  private async invalidateKey(key: string, reason: string): Promise<void> {
    // Add to invalidation queue
    this.invalidationQueue.push({
      key,
      reason,
      timestamp: Date.now()
    });

    // Remove from tracking
    this.keyMetadata.delete(key);

    // Clean up dependencies
    for (const [dep, dependents] of this.dependencyGraph) {
      if (dependents.has(key)) {
        dependents.delete(key);
        if (dependents.size === 0) {
          this.dependencyGraph.delete(dep);
        }
      }
    }
  }

  private async handleCascadeInvalidation(
    key: string,
    level: 'immediate' | 'deep',
    dryRun: boolean
  ): Promise<string[]> {
    const cascaded: string[] = [];
    const metadata = this.keyMetadata.get(key);

    if (!metadata) return cascaded;

    // Find dependent keys
    for (const dep of metadata.dependencies) {
      const dependents = this.dependencyGraph.get(dep) || new Set();

      for (const dependentKey of dependents) {
        if (dependentKey !== key) {
          if (!dryRun) {
            await this.invalidateKey(dependentKey, `cascade:${key}`);
          }
          cascaded.push(dependentKey);

          // Deep cascade
          if (level === 'deep') {
            const deepCascaded = await this.handleCascadeInvalidation(dependentKey, level, dryRun);
            cascaded.push(...deepCascaded);
          }
        }
      }
    }

    return cascaded;
  }

  private assessRiskLevel(keyCount: number, operationType: string): 'low' | 'medium' | 'high' {
    if (operationType === 'migration' || keyCount > 1000) {
      return 'high';
    } else if (keyCount > 100 || operationType === 'update') {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private estimateOperationTime(steps: number, keyCount: number): number {
    // Estimate in seconds
    const baseTime = steps * 5; // 5 seconds per step
    const keyTime = keyCount * 0.1; // 0.1 seconds per key
    return Math.ceil(baseTime + keyTime);
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): typeof this.stats & {
    totalKeys: number;
    totalDependencies: number;
    queueSize: number;
    avgKeyLength: number;
  } {
    const keys = Array.from(this.keyMetadata.keys());
    const avgKeyLength = keys.length > 0 ?
      keys.reduce((sum, key) => sum + key.length, 0) / keys.length : 0;

    return {
      ...this.stats,
      totalKeys: this.keyMetadata.size,
      totalDependencies: this.dependencyGraph.size,
      queueSize: this.invalidationQueue.length,
      avgKeyLength: Math.round(avgKeyLength)
    };
  }

  /**
   * Clear all tracking data (for testing)
   */
  clear(): void {
    this.keyMetadata.clear();
    this.dependencyGraph.clear();
    this.invalidationQueue = [];
    this.stats = {
      keysGenerated: 0,
      keysInvalidated: 0,
      dependenciesTracked: 0,
      crossUserShares: 0,
      rlsViolationsPrevented: 0,
      ttlAdjustments: 0
    };
  }
}

// Export singleton instance
let cacheMLKeyManagerInstance: CacheMLKeyManager | null = null;

export function getCacheMLKeyManager(): CacheMLKeyManager {
  if (!cacheMLKeyManagerInstance) {
    cacheMLKeyManagerInstance = new CacheMLKeyManager();
  }
  return cacheMLKeyManagerInstance;
}