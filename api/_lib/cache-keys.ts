/**
 * Intelligent Cache Key Strategies
 *
 * Implements sophisticated cache key generation with hot/cold path differentiation,
 * content-aware hashing, and semantic clustering for maximum cache efficiency.
 *
 * Features:
 * - Content-aware key generation
 * - Hot/cold path optimization
 * - Semantic clustering for similarity matching
 * - Security-first key design with RLS enforcement
 * - Hierarchical key namespacing
 */

import { createHash } from 'crypto';
import { getPerformanceConfig } from './performance-config.js';

// Key generation context
export interface CacheKeyContext {
  userId?: string;
  bookId: string;
  sessionId?: string;
  contentType: 'response' | 'embedding' | 'chunk' | 'summary' | 'analysis';
  queryType: 'simple' | 'complex' | 'analytical' | 'creative';
  priority: 'hot' | 'warm' | 'cold';
  security: {
    requiresAuth: boolean;
    isPublic: boolean;
    encryptionRequired: boolean;
  };
}

// Key strategy configuration
export interface KeyStrategyConfig {
  enableContentHashing: boolean;
  enableSemanticClustering: boolean;
  enableHotPathOptimization: boolean;
  enableSecurityNamespacing: boolean;
  maxKeyLength: number;
  semanticHashLength: number;
  contentHashLength: number;
}

// Cache key result
export interface CacheKeyResult {
  primary: string;           // Main cache key
  semantic: string;          // Semantic similarity key
  namespace: string;         // Security namespace
  tags: string[];           // Classification tags
  metadata: {
    strategy: string;
    hotPath: boolean;
    security: 'public' | 'private' | 'encrypted';
    ttlHint: number;
  };
}

// Hot path patterns for optimization
const HOT_PATH_PATTERNS = {
  // Common query patterns that are frequently cached
  simple: [
    /^(what|who|when|where|how)\s+is\s+/i,
    /^define\s+/i,
    /^explain\s+briefly\s+/i,
    /^summarize\s+/i
  ],
  interactive: [
    /^tell\s+me\s+about\s+/i,
    /^describe\s+/i,
    /^help\s+me\s+understand\s+/i
  ],
  analytical: [
    /^analyze\s+/i,
    /^compare\s+/i,
    /^evaluate\s+/i,
    /^examine\s+/i
  ]
};

// Content type classifiers
const CONTENT_CLASSIFIERS = {
  response: {
    patterns: [/response/, /answer/, /reply/],
    priority: 'warm',
    ttl: 900 // 15 minutes
  },
  embedding: {
    patterns: [/embedding/, /vector/, /similarity/],
    priority: 'hot',
    ttl: 3600 // 1 hour
  },
  chunk: {
    patterns: [/chunk/, /segment/, /passage/],
    priority: 'cold',
    ttl: 1800 // 30 minutes
  },
  summary: {
    patterns: [/summary/, /overview/, /synopsis/],
    priority: 'warm',
    ttl: 1200 // 20 minutes
  }
};

export class CacheKeyGenerator {
  private config: KeyStrategyConfig;
  private semanticCache = new Map<string, string[]>(); // Semantic clusters
  private hotPathCache = new Set<string>(); // Known hot paths
  private keyUsageStats = new Map<string, { count: number; lastUsed: number }>(); // Usage tracking

  constructor(config?: Partial<KeyStrategyConfig>) {
    const perfConfig = getPerformanceConfig();

    this.config = {
      enableContentHashing: true,
      enableSemanticClustering: true,
      enableHotPathOptimization: true,
      enableSecurityNamespacing: true,
      maxKeyLength: 256,
      semanticHashLength: 12,
      contentHashLength: 16,
      ...config
    };
  }

  /**
   * Generate intelligent cache key with hot/cold path optimization
   */
  generateKey(
    content: {
      message?: string;
      selection?: string;
      chapterIdx?: number;
      enhanceType?: string;
      queryText?: string;
    },
    context: CacheKeyContext
  ): CacheKeyResult {
    // Determine content type and priority
    const contentType = this.classifyContent(content, context);
    const priority = this.determinePriority(content, context);
    const isHotPath = this.isHotPath(content, context);

    // Generate namespace for security
    const namespace = this.generateNamespace(context);

    // Generate primary key
    const primary = this.generatePrimaryKey(content, context, {
      contentType,
      priority,
      isHotPath,
      namespace
    });

    // Generate semantic key for similarity matching
    const semantic = this.generateSemanticKey(content, context);

    // Generate classification tags
    const tags = this.generateTags(content, context, { contentType, priority });

    // Calculate TTL hint
    const ttlHint = this.calculateTTLHint(contentType, priority, isHotPath);

    const result: CacheKeyResult = {
      primary,
      semantic,
      namespace,
      tags,
      metadata: {
        strategy: isHotPath ? 'hot-path' : 'standard',
        hotPath: isHotPath,
        security: context.security.isPublic ? 'public' :
                 context.security.encryptionRequired ? 'encrypted' : 'private',
        ttlHint
      }
    };

    // Track usage for hotness detection
    this.trackKeyUsage(primary);

    // Update semantic clustering
    if (this.config.enableSemanticClustering) {
      this.updateSemanticClustering(semantic, primary);
    }

    return result;
  }

  /**
   * Generate key for chat/query responses
   */
  generateChatKey(
    message: string,
    bookId: string,
    options?: {
      userId?: string;
      selection?: string;
      chapterIdx?: number;
      sessionId?: string;
    }
  ): CacheKeyResult {
    const context: CacheKeyContext = {
      userId: options?.userId,
      bookId,
      sessionId: options?.sessionId,
      contentType: 'response',
      queryType: this.classifyQuery(message),
      priority: this.isPopularQuery(message) ? 'hot' : 'warm',
      security: {
        requiresAuth: !!options?.userId,
        isPublic: false,
        encryptionRequired: false
      }
    };

    return this.generateKey({
      message,
      selection: options?.selection,
      chapterIdx: options?.chapterIdx
    }, context);
  }

  /**
   * Generate key for embeddings
   */
  generateEmbeddingKey(
    text: string,
    bookId: string,
    options?: {
      userId?: string;
      model?: string;
      dimensions?: number;
    }
  ): CacheKeyResult {
    const context: CacheKeyContext = {
      userId: options?.userId,
      bookId,
      contentType: 'embedding',
      queryType: 'simple',
      priority: 'hot', // Embeddings are expensive, cache aggressively
      security: {
        requiresAuth: false,
        isPublic: true, // Embeddings can be shared across users
        encryptionRequired: false
      }
    };

    return this.generateKey({
      queryText: text
    }, context);
  }

  /**
   * Generate key for content chunks
   */
  generateChunkKey(
    chapterIdx: number,
    startPos: number,
    endPos: number,
    bookId: string,
    options?: {
      userId?: string;
      similarity?: number;
    }
  ): CacheKeyResult {
    const context: CacheKeyContext = {
      userId: options?.userId,
      bookId,
      contentType: 'chunk',
      queryType: 'simple',
      priority: 'cold', // Chunks are static, less frequently accessed
      security: {
        requiresAuth: !!options?.userId,
        isPublic: false,
        encryptionRequired: false
      }
    };

    return this.generateKey({
      chapterIdx,
      queryText: `chunk:${chapterIdx}:${startPos}:${endPos}`
    }, context);
  }

  /**
   * Generate batch keys for multiple items
   */
  generateBatchKeys<T>(
    items: T[],
    keyExtractor: (item: T) => { content: any; context: CacheKeyContext }
  ): CacheKeyResult[] {
    return items.map(item => {
      const { content, context } = keyExtractor(item);
      return this.generateKey(content, context);
    });
  }

  /**
   * Find similar keys based on semantic clustering
   */
  findSimilarKeys(semanticKey: string, threshold: number = 0.8): string[] {
    if (!this.config.enableSemanticClustering) {
      return [];
    }

    const candidates = this.semanticCache.get(semanticKey) || [];
    return candidates.filter(key => {
      const similarity = this.calculateKeySimilarity(semanticKey, key);
      return similarity >= threshold;
    });
  }

  /**
   * Get hot path recommendations
   */
  getHotPathKeys(limit: number = 100): string[] {
    const sortedKeys = Array.from(this.keyUsageStats.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([key]) => key);

    return sortedKeys;
  }

  /**
   * Get cache key statistics
   */
  getStats(): {
    totalKeys: number;
    hotPathKeys: number;
    semanticClusters: number;
    avgClusterSize: number;
    topKeys: Array<{ key: string; usage: number }>;
  } {
    const clusters = Array.from(this.semanticCache.values());
    const avgClusterSize = clusters.length > 0
      ? clusters.reduce((sum, cluster) => sum + cluster.length, 0) / clusters.length
      : 0;

    const topKeys = Array.from(this.keyUsageStats.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([key, stats]) => ({ key, usage: stats.count }));

    return {
      totalKeys: this.keyUsageStats.size,
      hotPathKeys: this.hotPathCache.size,
      semanticClusters: this.semanticCache.size,
      avgClusterSize,
      topKeys
    };
  }

  // Private methods

  private generatePrimaryKey(
    content: any,
    context: CacheKeyContext,
    metadata: {
      contentType: string;
      priority: string;
      isHotPath: boolean;
      namespace: string;
    }
  ): string {
    const components: string[] = [];

    // Add namespace for security isolation
    if (this.config.enableSecurityNamespacing) {
      components.push(metadata.namespace);
    }

    // Add content type prefix
    components.push(metadata.contentType);

    // Add hot path indicator for routing optimization
    if (this.config.enableHotPathOptimization && metadata.isHotPath) {
      components.push('hot');
    }

    // Add book context
    components.push(`book:${context.bookId}`);

    // Generate content hash
    if (this.config.enableContentHashing) {
      const contentHash = this.generateContentHash(content, context);
      components.push(contentHash);
    }

    // Add priority for cache layer routing
    components.push(`p:${metadata.priority}`);

    const key = components.join(':');

    // Ensure key length is within limits
    if (key.length > this.config.maxKeyLength) {
      return this.truncateKey(key, this.config.maxKeyLength);
    }

    return key;
  }

  private generateSemanticKey(content: any, context: CacheKeyContext): string {
    const textContent = this.extractTextContent(content);

    if (!textContent) {
      return '';
    }

    // Normalize and extract semantic features
    const normalized = textContent
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract key terms (remove stop words, keep important words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    const words = normalized
      .split(' ')
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 8) // Take first 8 significant words
      .sort() // Sort for consistency
      .join(' ');

    // Generate semantic hash
    const semanticHash = createHash('sha256')
      .update(words)
      .digest('hex')
      .substring(0, this.config.semanticHashLength);

    return `sem:${context.contentType}:${semanticHash}`;
  }

  private generateNamespace(context: CacheKeyContext): string {
    const components: string[] = [];

    // Security level
    if (context.security.requiresAuth) {
      components.push('auth');
      if (context.userId) {
        components.push(`u:${this.hashUserId(context.userId)}`);
      }
    } else {
      components.push('public');
    }

    // Content classification
    if (context.security.encryptionRequired) {
      components.push('enc');
    }

    return components.join(':');
  }

  private generateContentHash(content: any, context: CacheKeyContext): string {
    // Create deterministic hash from content
    const hashInput = JSON.stringify({
      ...content,
      // Add context that affects the result
      contentType: context.contentType,
      queryType: context.queryType
    });

    return createHash('sha256')
      .update(hashInput)
      .digest('hex')
      .substring(0, this.config.contentHashLength);
  }

  private generateTags(
    content: any,
    context: CacheKeyContext,
    metadata: { contentType: string; priority: string }
  ): string[] {
    const tags: string[] = [];

    // Content type tag
    tags.push(`type:${metadata.contentType}`);

    // Priority tag
    tags.push(`priority:${metadata.priority}`);

    // Query type tag
    tags.push(`query:${context.queryType}`);

    // Security tags
    if (context.security.requiresAuth) {
      tags.push('auth-required');
    }
    if (context.security.isPublic) {
      tags.push('public');
    }
    if (context.security.encryptionRequired) {
      tags.push('encrypted');
    }

    // Content-specific tags
    const textContent = this.extractTextContent(content);
    if (textContent) {
      // Add intent-based tags
      if (this.containsQuestionWords(textContent)) {
        tags.push('question');
      }
      if (this.containsAnalyticalTerms(textContent)) {
        tags.push('analytical');
      }
    }

    return tags;
  }

  private classifyContent(content: any, context: CacheKeyContext): string {
    // Use context if available
    if (context.contentType) {
      return context.contentType;
    }

    // Classify based on content structure
    const textContent = this.extractTextContent(content);
    if (!textContent) {
      return 'unknown';
    }

    for (const [type, classifier] of Object.entries(CONTENT_CLASSIFIERS)) {
      if (classifier.patterns.some(pattern => pattern.test(textContent))) {
        return type;
      }
    }

    return 'response'; // Default
  }

  private classifyQuery(message: string): 'simple' | 'complex' | 'analytical' | 'creative' {
    const lowerMessage = message.toLowerCase();

    // Check for analytical patterns
    if (HOT_PATH_PATTERNS.analytical.some(pattern => pattern.test(message))) {
      return 'analytical';
    }

    // Check for complex patterns
    if (lowerMessage.length > 100 ||
        (lowerMessage.match(/\?/g) || []).length > 1 ||
        lowerMessage.includes('compare') ||
        lowerMessage.includes('analyze')) {
      return 'complex';
    }

    // Check for simple patterns
    if (HOT_PATH_PATTERNS.simple.some(pattern => pattern.test(message))) {
      return 'simple';
    }

    // Check for creative patterns
    if (lowerMessage.includes('imagine') ||
        lowerMessage.includes('create') ||
        lowerMessage.includes('write')) {
      return 'creative';
    }

    return 'simple'; // Default
  }

  private determinePriority(content: any, context: CacheKeyContext): 'hot' | 'warm' | 'cold' {
    // Use context priority if specified
    if (context.priority) {
      return context.priority;
    }

    // Determine based on content type
    const contentType = this.classifyContent(content, context);
    const classifier = CONTENT_CLASSIFIERS[contentType as keyof typeof CONTENT_CLASSIFIERS];

    return classifier?.priority as 'hot' | 'warm' | 'cold' || 'warm';
  }

  private isHotPath(content: any, context: CacheKeyContext): boolean {
    if (!this.config.enableHotPathOptimization) {
      return false;
    }

    const textContent = this.extractTextContent(content);
    if (!textContent) {
      return false;
    }

    // Check against hot path patterns
    const allPatterns = [
      ...HOT_PATH_PATTERNS.simple,
      ...HOT_PATH_PATTERNS.interactive
    ];

    return allPatterns.some(pattern => pattern.test(textContent));
  }

  private isPopularQuery(message: string): boolean {
    // Simple popularity check - can be enhanced with analytics
    const commonQueries = [
      'what is',
      'who is',
      'explain',
      'summarize',
      'tell me about'
    ];

    return commonQueries.some(query =>
      message.toLowerCase().includes(query)
    );
  }

  private extractTextContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (content && typeof content === 'object') {
      const textFields = ['message', 'text', 'query', 'content', 'queryText'];
      for (const field of textFields) {
        if (content[field] && typeof content[field] === 'string') {
          return content[field];
        }
      }
    }

    return '';
  }

  private containsQuestionWords(text: string): boolean {
    const questionWords = ['what', 'who', 'when', 'where', 'why', 'how', 'which'];
    const lowerText = text.toLowerCase();
    return questionWords.some(word => lowerText.includes(word));
  }

  private containsAnalyticalTerms(text: string): boolean {
    const analyticalTerms = ['analyze', 'compare', 'evaluate', 'examine', 'assess'];
    const lowerText = text.toLowerCase();
    return analyticalTerms.some(term => lowerText.includes(term));
  }

  private calculateTTLHint(contentType: string, priority: string, isHotPath: boolean): number {
    const classifier = CONTENT_CLASSIFIERS[contentType as keyof typeof CONTENT_CLASSIFIERS];
    let baseTtl = classifier?.ttl || 900; // 15 minutes default

    // Adjust based on priority
    switch (priority) {
      case 'hot':
        baseTtl *= 2; // Cache longer for hot content
        break;
      case 'cold':
        baseTtl *= 0.5; // Cache shorter for cold content
        break;
    }

    // Adjust for hot path
    if (isHotPath) {
      baseTtl *= 1.5;
    }

    return baseTtl;
  }

  private hashUserId(userId: string): string {
    return createHash('sha256')
      .update(userId)
      .digest('hex')
      .substring(0, 8);
  }

  private truncateKey(key: string, maxLength: number): string {
    if (key.length <= maxLength) {
      return key;
    }

    // Keep the beginning and add a hash of the full key
    const hash = createHash('sha256').update(key).digest('hex').substring(0, 8);
    const truncated = key.substring(0, maxLength - 9); // Leave room for hash
    return `${truncated}#${hash}`;
  }

  private trackKeyUsage(key: string): void {
    const current = this.keyUsageStats.get(key) || { count: 0, lastUsed: 0 };
    current.count++;
    current.lastUsed = Date.now();
    this.keyUsageStats.set(key, current);

    // Promote to hot path if used frequently
    if (current.count >= 5) {
      this.hotPathCache.add(key);
    }
  }

  private updateSemanticClustering(semanticKey: string, primaryKey: string): void {
    const cluster = this.semanticCache.get(semanticKey) || [];
    if (!cluster.includes(primaryKey)) {
      cluster.push(primaryKey);
      this.semanticCache.set(semanticKey, cluster);
    }
  }

  private calculateKeySimilarity(key1: string, key2: string): number {
    // Simple Jaccard similarity for now
    const set1 = new Set(key1.split(':'));
    const set2 = new Set(key2.split(':'));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }
}

// Export singleton instance
let keyGenerator: CacheKeyGenerator | null = null;

export function getCacheKeyGenerator(): CacheKeyGenerator {
  if (!keyGenerator) {
    keyGenerator = new CacheKeyGenerator();
  }
  return keyGenerator;
}

// Utility functions for common key generation patterns
export const CacheKeys = {
  chat: (message: string, bookId: string, options?: any) =>
    getCacheKeyGenerator().generateChatKey(message, bookId, options),

  embedding: (text: string, bookId: string, options?: any) =>
    getCacheKeyGenerator().generateEmbeddingKey(text, bookId, options),

  chunk: (chapterIdx: number, startPos: number, endPos: number, bookId: string, options?: any) =>
    getCacheKeyGenerator().generateChunkKey(chapterIdx, startPos, endPos, bookId, options),

  similar: (semanticKey: string, threshold?: number) =>
    getCacheKeyGenerator().findSimilarKeys(semanticKey, threshold),

  hotPaths: (limit?: number) =>
    getCacheKeyGenerator().getHotPathKeys(limit)
};