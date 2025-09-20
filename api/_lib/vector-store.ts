/**
 * Vector Store for Semantic Cache Enhancement
 *
 * Implements vector similarity search and concept clustering for ML-enhanced caching.
 * Provides semantic matching capabilities to increase cache hit rates while maintaining
 * strict privacy and security compliance.
 *
 * Features:
 * - Vector embedding generation and storage
 * - Semantic similarity search with configurable thresholds
 * - Concept clustering for anonymous content sharing
 * - Privacy-compliant cross-user knowledge sharing
 * - Efficient vector operations with sub-10ms query latency
 */

import { createHash } from 'crypto';

// Vector embedding interface
export interface VectorEmbedding {
  id: string;
  vector: number[];
  metadata: {
    content: string;
    bookId: string;
    userId?: string;
    conceptHash: string;
    isAnonymous: boolean;
    timestamp: number;
    accessCount: number;
    lastAccessed: number;
  };
}

// Similarity search result
export interface SimilarityResult {
  id: string;
  similarity: number;
  metadata: VectorEmbedding['metadata'];
  isSemanticMatch: boolean;
  isPredictive: boolean;
}

// Concept cluster for anonymous sharing
export interface ConceptCluster {
  id: string;
  centroid: number[];
  conceptHash: string;
  memberCount: number;
  anonymizedContent: string;
  examples: string[];
  confidence: number;
  createdAt: number;
  lastUpdated: number;
}

// Vector store configuration
export interface VectorStoreConfig {
  embeddingDimension: number;
  similarityThreshold: number;
  maxClusters: number;
  clusteringThreshold: number;
  anonymizationLevel: 'strict' | 'moderate' | 'lenient';
  enableCrossUserSharing: boolean;
  maxStorageSize: number; // in MB
}

// Privacy compliance levels
export interface PrivacyCompliance {
  excludePII: boolean;
  respectRLSBoundaries: boolean;
  auditAccess: boolean;
  anonymizeContent: boolean;
  enableCrossUserSharing: boolean;
}

export class VectorStore {
  private embeddings: Map<string, VectorEmbedding> = new Map();
  private conceptClusters: Map<string, ConceptCluster> = new Map();
  private userIndex: Map<string, Set<string>> = new Map(); // userId -> embedding IDs
  private bookIndex: Map<string, Set<string>> = new Map(); // bookId -> embedding IDs
  private conceptIndex: Map<string, Set<string>> = new Map(); // conceptHash -> embedding IDs

  private config: VectorStoreConfig;
  private privacyConfig: PrivacyCompliance;

  // Performance tracking
  private stats = {
    totalEmbeddings: 0,
    totalClusters: 0,
    searchQueries: 0,
    semanticHits: 0,
    predictiveHits: 0,
    avgQueryTime: 0,
    lastClusterUpdate: 0
  };

  constructor(config?: Partial<VectorStoreConfig>) {
    this.config = {
      embeddingDimension: 1536, // OpenAI ada-002 dimension
      similarityThreshold: 0.85,
      maxClusters: 10000,
      clusteringThreshold: 0.90,
      anonymizationLevel: 'strict',
      enableCrossUserSharing: process.env.ENABLE_CROSS_USER_SHARING === 'true',
      maxStorageSize: 100, // 100MB default
      ...config
    };

    this.privacyConfig = {
      excludePII: true,
      respectRLSBoundaries: true,
      auditAccess: true,
      anonymizeContent: true,
      enableCrossUserSharing: this.config.enableCrossUserSharing
    };

    // Periodic maintenance
    setInterval(() => this.performMaintenance(), 300000); // Every 5 minutes
  }

  /**
   * Store vector embedding with privacy compliance
   */
  async storeEmbedding(
    content: string,
    vector: number[],
    metadata: {
      bookId: string;
      userId?: string;
      chapterIdx?: number;
      isPublic?: boolean;
    }
  ): Promise<string> {
    // Generate unique ID
    const id = this.generateEmbeddingId(content, metadata);

    // Check for PII and sanitize content
    const sanitizedContent = this.sanitizeContent(content);
    if (!sanitizedContent) {
      throw new Error('Content contains PII and cannot be stored');
    }

    // Generate concept hash for clustering
    const conceptHash = this.generateConceptHash(sanitizedContent);

    // Determine if content can be shared anonymously
    const isAnonymous = this.canShareAnonymously(sanitizedContent, metadata);

    const embedding: VectorEmbedding = {
      id,
      vector,
      metadata: {
        content: sanitizedContent,
        bookId: metadata.bookId,
        userId: metadata.userId,
        conceptHash,
        isAnonymous,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now()
      }
    };

    // Store embedding
    this.embeddings.set(id, embedding);
    this.stats.totalEmbeddings++;

    // Update indices
    this.updateIndices(id, embedding);

    // Update concept clusters if applicable
    if (isAnonymous) {
      await this.updateConceptClusters(embedding);
    }

    // Log for audit trail
    this.logAccess('store', id, metadata.userId);

    return id;
  }

  /**
   * Search for semantically similar content
   */
  async findSimilar(
    queryVector: number[],
    options: {
      userId?: string;
      bookId?: string;
      threshold?: number;
      maxResults?: number;
      includeAnonymous?: boolean;
      includePredictive?: boolean;
    } = {}
  ): Promise<SimilarityResult[]> {
    const startTime = Date.now();
    this.stats.searchQueries++;

    const threshold = options.threshold || this.config.similarityThreshold;
    const maxResults = options.maxResults || 10;
    const results: SimilarityResult[] = [];

    // Search user's own embeddings first
    if (options.userId) {
      const userEmbeddingIds = this.userIndex.get(options.userId) || new Set();
      for (const embeddingId of userEmbeddingIds) {
        const embedding = this.embeddings.get(embeddingId);
        if (!embedding) continue;

        // Filter by book if specified
        if (options.bookId && embedding.metadata.bookId !== options.bookId) {
          continue;
        }

        const similarity = this.cosineSimilarity(queryVector, embedding.vector);
        if (similarity >= threshold) {
          results.push({
            id: embeddingId,
            similarity,
            metadata: embedding.metadata,
            isSemanticMatch: true,
            isPredictive: false
          });

          // Update access metadata
          embedding.metadata.accessCount++;
          embedding.metadata.lastAccessed = Date.now();
        }
      }
    }

    // Search anonymous concept clusters for cross-user knowledge
    if (options.includeAnonymous && this.privacyConfig.enableCrossUserSharing) {
      for (const cluster of this.conceptClusters.values()) {
        const similarity = this.cosineSimilarity(queryVector, cluster.centroid);
        if (similarity >= threshold * 0.9) { // Slightly lower threshold for clusters
          // Find best representative embedding from cluster
          const clusterEmbeddingIds = this.conceptIndex.get(cluster.conceptHash) || new Set();
          for (const embeddingId of clusterEmbeddingIds) {
            const embedding = this.embeddings.get(embeddingId);
            if (!embedding || !embedding.metadata.isAnonymous) continue;

            // Respect RLS boundaries - no cross-user access unless anonymous
            if (embedding.metadata.userId && embedding.metadata.userId !== options.userId) {
              continue;
            }

            const embeddingSimilarity = this.cosineSimilarity(queryVector, embedding.vector);
            if (embeddingSimilarity >= threshold * 0.85) {
              results.push({
                id: embeddingId,
                similarity: embeddingSimilarity,
                metadata: {
                  ...embedding.metadata,
                  content: cluster.anonymizedContent, // Use anonymized content
                  userId: undefined // Remove user identification
                },
                isSemanticMatch: true,
                isPredictive: false
              });
              break; // Only take best match from cluster
            }
          }
        }
      }
    }

    // Add predictive results if enabled
    if (options.includePredictive) {
      const predictiveResults = await this.findPredictiveMatches(queryVector, options);
      results.push(...predictiveResults);
    }

    // Sort by similarity and limit results
    results.sort((a, b) => b.similarity - a.similarity);
    const finalResults = results.slice(0, maxResults);

    // Update statistics
    const queryTime = Date.now() - startTime;
    this.stats.avgQueryTime = (this.stats.avgQueryTime + queryTime) / 2;

    if (finalResults.length > 0) {
      const semanticHits = finalResults.filter(r => r.isSemanticMatch).length;
      const predictiveHits = finalResults.filter(r => r.isPredictive).length;
      this.stats.semanticHits += semanticHits;
      this.stats.predictiveHits += predictiveHits;
    }

    // Log for audit trail
    this.logAccess('search', 'query', options.userId, {
      resultsCount: finalResults.length,
      queryTimeMs: queryTime
    });

    return finalResults;
  }

  /**
   * Find predictive matches based on user patterns
   */
  private async findPredictiveMatches(
    queryVector: number[],
    options: {
      userId?: string;
      bookId?: string;
    }
  ): Promise<SimilarityResult[]> {
    if (!options.userId) return [];

    const results: SimilarityResult[] = [];
    const userEmbeddingIds = this.userIndex.get(options.userId) || new Set();

    // Analyze user's content patterns
    const userPatterns = this.analyzeUserPatterns(options.userId);
    if (!userPatterns) return [];

    // Find embeddings that match predicted interests
    for (const embeddingId of userEmbeddingIds) {
      const embedding = this.embeddings.get(embeddingId);
      if (!embedding) continue;

      // Calculate predictive score based on user patterns
      const predictiveScore = this.calculatePredictiveScore(
        embedding,
        userPatterns,
        queryVector
      );

      if (predictiveScore >= 0.7) {
        const similarity = this.cosineSimilarity(queryVector, embedding.vector);
        results.push({
          id: embeddingId,
          similarity: similarity * predictiveScore, // Weight by predictive confidence
          metadata: embedding.metadata,
          isSemanticMatch: false,
          isPredictive: true
        });
      }
    }

    return results;
  }

  /**
   * Update concept clusters for anonymous sharing
   */
  private async updateConceptClusters(embedding: VectorEmbedding): Promise<void> {
    const conceptHash = embedding.metadata.conceptHash;
    let cluster = this.conceptClusters.get(conceptHash);

    if (!cluster) {
      // Create new cluster
      cluster = {
        id: conceptHash,
        centroid: [...embedding.vector],
        conceptHash,
        memberCount: 1,
        anonymizedContent: this.anonymizeContent(embedding.metadata.content),
        examples: [embedding.metadata.content.substring(0, 100)],
        confidence: 1.0,
        createdAt: Date.now(),
        lastUpdated: Date.now()
      };
    } else {
      // Update existing cluster
      cluster.memberCount++;
      cluster.lastUpdated = Date.now();

      // Update centroid using moving average
      for (let i = 0; i < cluster.centroid.length; i++) {
        cluster.centroid[i] = (cluster.centroid[i] * (cluster.memberCount - 1) + embedding.vector[i]) / cluster.memberCount;
      }

      // Update anonymized content and examples
      if (cluster.examples.length < 5) {
        cluster.examples.push(embedding.metadata.content.substring(0, 100));
      }

      cluster.anonymizedContent = this.anonymizeContent(
        cluster.examples.join(' ')
      );

      // Update confidence based on cluster size
      cluster.confidence = Math.min(1.0, cluster.memberCount / 10);
    }

    this.conceptClusters.set(conceptHash, cluster);
    this.stats.totalClusters = this.conceptClusters.size;
    this.stats.lastClusterUpdate = Date.now();
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Generate unique embedding ID
   */
  private generateEmbeddingId(content: string, metadata: any): string {
    const hash = createHash('sha256')
      .update(content + JSON.stringify(metadata) + Date.now())
      .digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Generate concept hash for clustering
   */
  private generateConceptHash(content: string): string {
    // Extract key concepts and normalize
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word))
      .sort()
      .slice(0, 10);

    return createHash('md5').update(words.join('-')).digest('hex').substring(0, 12);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'but', 'for', 'are', 'with', 'they', 'this', 'that', 'from',
      'have', 'been', 'their', 'said', 'each', 'which', 'what', 'were', 'will',
      'there', 'would', 'could', 'should', 'about', 'into', 'through', 'during'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Sanitize content to remove PII
   */
  private sanitizeContent(content: string): string | null {
    if (!this.privacyConfig.excludePII) {
      return content;
    }

    // Check for common PII patterns
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/, // Phone number
    ];

    for (const pattern of piiPatterns) {
      if (pattern.test(content)) {
        return null; // Reject content with PII
      }
    }

    return content;
  }

  /**
   * Check if content can be shared anonymously
   */
  private canShareAnonymously(content: string, metadata: any): boolean {
    if (!this.privacyConfig.enableCrossUserSharing) {
      return false;
    }

    // Content must be public or from public books
    if (!metadata.isPublic) {
      return false;
    }

    // Content should be general enough (not too specific)
    const words = content.split(/\s+/);
    if (words.length < 10) {
      return false; // Too short to be safely anonymized
    }

    // Check for personal references
    const personalPatterns = [
      /\bi\s/i, /\bmy\s/i, /\bme\s/i, /\bmine\s/i,
      /\byou\s/i, /\byour\s/i, /\byours\s/i
    ];

    for (const pattern of personalPatterns) {
      if (pattern.test(content)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Anonymize content for sharing
   */
  private anonymizeContent(content: string): string {
    if (this.config.anonymizationLevel === 'strict') {
      // Replace specific terms with generic ones
      return content
        .replace(/\b[A-Z][a-z]+\b/g, '[NAME]') // Proper nouns
        .replace(/\b\d{4}\b/g, '[YEAR]') // Years
        .replace(/\b\d+\b/g, '[NUMBER]') // Numbers
        .substring(0, 200); // Limit length
    }

    return content.substring(0, 300); // Basic truncation
  }

  /**
   * Analyze user patterns for predictive matching
   */
  private analyzeUserPatterns(userId: string): any {
    const userEmbeddingIds = this.userIndex.get(userId) || new Set();
    if (userEmbeddingIds.size < 5) {
      return null; // Not enough data
    }

    const embeddings = Array.from(userEmbeddingIds)
      .map(id => this.embeddings.get(id))
      .filter(e => e && e.metadata.accessCount > 0);

    if (embeddings.length === 0) return null;

    // Calculate centroid of user's interests
    const centroid = new Array(this.config.embeddingDimension).fill(0);
    let totalWeight = 0;

    for (const embedding of embeddings) {
      const weight = Math.log(embedding.metadata.accessCount + 1);
      totalWeight += weight;

      for (let i = 0; i < centroid.length; i++) {
        centroid[i] += embedding.vector[i] * weight;
      }
    }

    // Normalize centroid
    for (let i = 0; i < centroid.length; i++) {
      centroid[i] /= totalWeight;
    }

    return {
      centroid,
      totalInteractions: embeddings.reduce((sum, e) => sum + e.metadata.accessCount, 0),
      avgAccessTime: embeddings.reduce((sum, e) => sum + e.metadata.lastAccessed, 0) / embeddings.length,
      conceptDistribution: this.calculateConceptDistribution(embeddings)
    };
  }

  /**
   * Calculate predictive score for an embedding
   */
  private calculatePredictiveScore(
    embedding: VectorEmbedding,
    userPatterns: any,
    queryVector: number[]
  ): number {
    // Similarity to user's interest centroid
    const interestSimilarity = this.cosineSimilarity(embedding.vector, userPatterns.centroid);

    // Temporal relevance (recent content is more relevant)
    const timeFactor = Math.exp(-(Date.now() - embedding.metadata.lastAccessed) / (24 * 60 * 60 * 1000));

    // Access frequency factor
    const frequencyFactor = Math.min(1.0, embedding.metadata.accessCount / 10);

    // Query relevance
    const queryRelevance = this.cosineSimilarity(embedding.vector, queryVector);

    return (interestSimilarity * 0.4 + timeFactor * 0.2 + frequencyFactor * 0.2 + queryRelevance * 0.2);
  }

  /**
   * Calculate concept distribution for user patterns
   */
  private calculateConceptDistribution(embeddings: VectorEmbedding[]): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const embedding of embeddings) {
      const concept = embedding.metadata.conceptHash;
      distribution[concept] = (distribution[concept] || 0) + embedding.metadata.accessCount;
    }

    return distribution;
  }

  /**
   * Update various indices
   */
  private updateIndices(id: string, embedding: VectorEmbedding): void {
    // User index
    if (embedding.metadata.userId) {
      const userEmbeddings = this.userIndex.get(embedding.metadata.userId) || new Set();
      userEmbeddings.add(id);
      this.userIndex.set(embedding.metadata.userId, userEmbeddings);
    }

    // Book index
    const bookEmbeddings = this.bookIndex.get(embedding.metadata.bookId) || new Set();
    bookEmbeddings.add(id);
    this.bookIndex.set(embedding.metadata.bookId, bookEmbeddings);

    // Concept index
    const conceptEmbeddings = this.conceptIndex.get(embedding.metadata.conceptHash) || new Set();
    conceptEmbeddings.add(id);
    this.conceptIndex.set(embedding.metadata.conceptHash, conceptEmbeddings);
  }

  /**
   * Log access for audit trail
   */
  private logAccess(
    action: string,
    targetId: string,
    userId?: string,
    metadata?: any
  ): void {
    if (!this.privacyConfig.auditAccess) return;

    const logEntry = {
      timestamp: Date.now(),
      action,
      targetId,
      userId,
      metadata
    };

    // In production, this would go to a proper audit log system
    console.log('VectorStore Audit:', JSON.stringify(logEntry));
  }

  /**
   * Perform periodic maintenance
   */
  private performMaintenance(): void {
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    // Clean old embeddings
    let cleaned = 0;
    for (const [id, embedding] of this.embeddings) {
      if (embedding.metadata.lastAccessed < oneWeekAgo && embedding.metadata.accessCount === 0) {
        this.embeddings.delete(id);
        cleaned++;
      }
    }

    // Clean indices
    this.cleanIndices();

    // Clean old clusters
    let clustersCleared = 0;
    for (const [id, cluster] of this.conceptClusters) {
      if (cluster.lastUpdated < oneWeekAgo && cluster.memberCount < 3) {
        this.conceptClusters.delete(id);
        clustersCleared++;
      }
    }

    if (cleaned > 0 || clustersCleared > 0) {
      console.log(`VectorStore maintenance: cleaned ${cleaned} embeddings, ${clustersCleared} clusters`);
    }

    this.stats.totalEmbeddings = this.embeddings.size;
    this.stats.totalClusters = this.conceptClusters.size;
  }

  /**
   * Clean up indices to remove dangling references
   */
  private cleanIndices(): void {
    // Clean user index
    for (const [userId, embeddingIds] of this.userIndex) {
      const validIds = new Set([...embeddingIds].filter(id => this.embeddings.has(id)));
      if (validIds.size === 0) {
        this.userIndex.delete(userId);
      } else if (validIds.size < embeddingIds.size) {
        this.userIndex.set(userId, validIds);
      }
    }

    // Clean book index
    for (const [bookId, embeddingIds] of this.bookIndex) {
      const validIds = new Set([...embeddingIds].filter(id => this.embeddings.has(id)));
      if (validIds.size === 0) {
        this.bookIndex.delete(bookId);
      } else if (validIds.size < embeddingIds.size) {
        this.bookIndex.set(bookId, validIds);
      }
    }

    // Clean concept index
    for (const [conceptHash, embeddingIds] of this.conceptIndex) {
      const validIds = new Set([...embeddingIds].filter(id => this.embeddings.has(id)));
      if (validIds.size === 0) {
        this.conceptIndex.delete(conceptHash);
      } else if (validIds.size < embeddingIds.size) {
        this.conceptIndex.set(conceptHash, validIds);
      }
    }
  }

  /**
   * Get vector store statistics
   */
  getStats(): typeof this.stats & {
    memoryUsageMB: number;
    userCount: number;
    bookCount: number;
    conceptCount: number;
  } {
    const memoryUsageMB = (
      this.embeddings.size * 1536 * 4 + // 4 bytes per float
      this.conceptClusters.size * 1536 * 4 +
      this.userIndex.size * 100 + // Estimated index overhead
      this.bookIndex.size * 100 +
      this.conceptIndex.size * 100
    ) / (1024 * 1024);

    return {
      ...this.stats,
      memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
      userCount: this.userIndex.size,
      bookCount: this.bookIndex.size,
      conceptCount: this.conceptIndex.size
    };
  }

  /**
   * Clear all data (for testing/reset)
   */
  clear(): void {
    this.embeddings.clear();
    this.conceptClusters.clear();
    this.userIndex.clear();
    this.bookIndex.clear();
    this.conceptIndex.clear();

    this.stats = {
      totalEmbeddings: 0,
      totalClusters: 0,
      searchQueries: 0,
      semanticHits: 0,
      predictiveHits: 0,
      avgQueryTime: 0,
      lastClusterUpdate: 0
    };
  }

  /**
   * Export configuration for monitoring
   */
  getConfig(): VectorStoreConfig & { privacy: PrivacyCompliance } {
    return {
      ...this.config,
      privacy: this.privacyConfig
    };
  }
}

// Export singleton instance
let vectorStoreInstance: VectorStore | null = null;

export function getVectorStore(config?: Partial<VectorStoreConfig>): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore(config);
  }
  return vectorStoreInstance;
}