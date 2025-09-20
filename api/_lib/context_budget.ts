/**
 * Context Budget Management System
 *
 * Implements advanced token optimization strategies to reduce costs by ≥15%
 * while maintaining quality degradation ≤5%
 *
 * Features:
 * - Dynamic context budgeting based on query complexity
 * - Coordinated threshold/dedup/cache/MMR strategies
 * - Adaptive token allocation with quality monitoring
 * - Feature toggles for gradual rollout
 */

import { getPerformanceConfig, PerformanceConfigManager } from './performance-config.js';
import { getResponseCache } from './response-cache.js';
import { createHash } from 'crypto';

// Budget allocation interface
export interface ContextBudget {
  contextTokens: number;
  responseTokens: number;
  totalBudget: number;
  strategy: BudgetStrategy;
  confidence: number;
}

// Budget strategy types
export type BudgetStrategy =
  | 'aggressive'   // Maximum token reduction (30-40%)
  | 'balanced'     // Balanced approach (20-30%)
  | 'conservative' // Minimal reduction (10-20%)
  | 'adaptive';    // Dynamic based on query analysis

// Query complexity analysis
export interface QueryComplexity {
  score: number;        // 0-1 complexity score
  category: 'simple' | 'moderate' | 'complex';
  factors: {
    length: number;
    keywords: number;
    entities: number;
    questions: number;
    analyticalTerms: number;
  };
}

// Context quality metrics
export interface ContextQualityMetrics {
  relevanceScore: number;
  diversityScore: number;
  completenessScore: number;
  coherenceScore: number;
  overallQuality: number;
}

// Budget optimization result
export interface BudgetOptimizationResult {
  budget: ContextBudget;
  estimatedSavings: number;
  qualityImpact: number;
  recommendation: 'apply' | 'skip' | 'monitor';
}

export class ContextBudgetManager {
  private static instance: ContextBudgetManager;
  private configManager = PerformanceConfigManager.getInstance();
  private responseCache = getResponseCache();
  private metricsHistory: Map<string, ContextQualityMetrics> = new Map();

  // Feature toggle configuration
  private featureToggles = {
    enableContextBudget: process.env.ENABLE_CONTEXT_BUDGET !== 'false',
    enableAggressiveMode: process.env.ENABLE_AGGRESSIVE_BUDGET === 'true',
    enableQualityMonitoring: process.env.ENABLE_QUALITY_MONITORING !== 'false',
    defaultStrategy: (process.env.BUDGET_STRATEGY || 'conservative') as BudgetStrategy
  };

  // Budget thresholds
  private readonly BUDGET_THRESHOLDS = {
    aggressive: {
      contextReduction: 0.40,  // 40% reduction
      responseReduction: 0.35,  // 35% reduction
      minQuality: 0.75,         // 75% quality threshold
      cacheBias: 0.9            // Strong cache preference
    },
    balanced: {
      contextReduction: 0.25,   // 25% reduction
      responseReduction: 0.20,   // 20% reduction
      minQuality: 0.80,          // 80% quality threshold
      cacheBias: 0.7             // Moderate cache preference
    },
    conservative: {
      contextReduction: 0.15,   // 15% reduction
      responseReduction: 0.10,   // 10% reduction
      minQuality: 0.85,          // 85% quality threshold
      cacheBias: 0.5             // Light cache preference
    }
  };

  // Baseline token allocations for comparison
  private readonly BASELINE_TOKENS = {
    context: 2000,
    response: 500,
    total: 2500
  };

  private constructor() {
    console.log('Context Budget Manager initialized with strategy:', this.featureToggles.defaultStrategy);
  }

  static getInstance(): ContextBudgetManager {
    if (!ContextBudgetManager.instance) {
      ContextBudgetManager.instance = new ContextBudgetManager();
    }
    return ContextBudgetManager.instance;
  }

  /**
   * Calculate optimal context budget for a query
   */
  async calculateOptimalBudget(
    query: string,
    bookId: string,
    selection?: string,
    forceStrategy?: BudgetStrategy
  ): Promise<BudgetOptimizationResult> {
    if (!this.featureToggles.enableContextBudget) {
      return this.getDefaultBudget();
    }

    // Analyze query complexity
    const complexity = this.analyzeQueryComplexity(query, selection);

    // Determine strategy
    const strategy = forceStrategy || this.determineStrategy(complexity);

    // Check cache potential
    const cacheAnalysis = await this.analyzeCachePotential(query, bookId);

    // Calculate budget based on strategy
    const budget = this.computeBudget(complexity, strategy, cacheAnalysis);

    // Estimate quality impact
    const qualityImpact = this.estimateQualityImpact(budget, complexity);

    // Calculate savings
    const estimatedSavings = this.calculateSavings(budget);

    // Make recommendation
    const recommendation = this.makeRecommendation(qualityImpact, estimatedSavings);

    console.log(`Budget calculation: strategy=${strategy}, savings=${estimatedSavings.toFixed(1)}%, quality impact=${qualityImpact.toFixed(2)}`);

    return {
      budget,
      estimatedSavings,
      qualityImpact,
      recommendation
    };
  }

  /**
   * Analyze query complexity
   */
  private analyzeQueryComplexity(query: string, selection?: string): QueryComplexity {
    const text = query + (selection || '');
    const words = text.toLowerCase().split(/\s+/);

    // Count various complexity factors
    const factors = {
      length: text.length,
      keywords: this.countKeywords(words),
      entities: this.countEntities(text),
      questions: (text.match(/\?/g) || []).length,
      analyticalTerms: this.countAnalyticalTerms(words)
    };

    // Calculate complexity score (0-1)
    const score = Math.min(1,
      (factors.length / 500) * 0.2 +
      (factors.keywords / 10) * 0.2 +
      (factors.entities / 5) * 0.2 +
      (factors.questions / 3) * 0.2 +
      (factors.analyticalTerms / 5) * 0.2
    );

    // Categorize complexity
    let category: 'simple' | 'moderate' | 'complex';
    if (score < 0.33) category = 'simple';
    else if (score < 0.67) category = 'moderate';
    else category = 'complex';

    return { score, category, factors };
  }

  /**
   * Count keywords in query
   */
  private countKeywords(words: string[]): number {
    const keywords = new Set([
      'explain', 'analyze', 'compare', 'contrast', 'describe',
      'summarize', 'evaluate', 'interpret', 'discuss', 'examine',
      'investigate', 'explore', 'define', 'identify', 'illustrate'
    ]);

    return words.filter(w => keywords.has(w)).length;
  }

  /**
   * Count named entities (simple heuristic)
   */
  private countEntities(text: string): number {
    // Count capitalized words that are likely entities
    const matches = text.match(/[A-Z][a-z]+/g) || [];
    return matches.length;
  }

  /**
   * Count analytical terms
   */
  private countAnalyticalTerms(words: string[]): number {
    const analyticalTerms = new Set([
      'because', 'therefore', 'however', 'although', 'whereas',
      'furthermore', 'moreover', 'nevertheless', 'consequently',
      'relationship', 'impact', 'effect', 'cause', 'reason'
    ]);

    return words.filter(w => analyticalTerms.has(w)).length;
  }

  /**
   * Determine budget strategy based on complexity
   */
  private determineStrategy(complexity: QueryComplexity): BudgetStrategy {
    if (this.featureToggles.defaultStrategy === 'adaptive') {
      // Adaptive strategy based on complexity
      if (complexity.category === 'simple') {
        return this.featureToggles.enableAggressiveMode ? 'aggressive' : 'balanced';
      } else if (complexity.category === 'moderate') {
        return 'balanced';
      } else {
        return 'conservative';
      }
    }

    return this.featureToggles.defaultStrategy;
  }

  /**
   * Analyze cache potential for the query
   */
  private async analyzeCachePotential(query: string, bookId: string): Promise<{
    cacheHitProbability: number;
    semanticMatches: number;
    recentSimilarQueries: number;
  }> {
    // Generate cache key
    const cacheKey = createHash('sha256')
      .update(`${bookId}:${query.toLowerCase().trim()}`)
      .digest('hex');

    // Check direct cache hit
    const cached = await this.responseCache.getCachedResponse({
      bookId,
      message: query
    });

    if (cached) {
      return {
        cacheHitProbability: 1.0,
        semanticMatches: 1,
        recentSimilarQueries: 1
      };
    }

    // Analyze semantic similarity with cached queries
    const stats = this.responseCache.getStats();
    const hitRate = stats.hitRate || 0;

    // Estimate cache potential
    const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const commonWords = ['what', 'how', 'why', 'when', 'where', 'who', 'explain', 'describe'];
    const hasCommonPattern = commonWords.some(w => query.toLowerCase().includes(w));

    return {
      cacheHitProbability: hasCommonPattern ? hitRate * 1.5 : hitRate,
      semanticMatches: 0,
      recentSimilarQueries: Math.floor(hitRate * 10)
    };
  }

  /**
   * Compute budget based on analysis
   */
  private computeBudget(
    complexity: QueryComplexity,
    strategy: BudgetStrategy,
    cacheAnalysis: { cacheHitProbability: number }
  ): ContextBudget {
    const config = this.configManager.getConfig();
    const thresholds = this.BUDGET_THRESHOLDS[strategy === 'adaptive' ? 'balanced' : strategy];

    // Base allocations from config
    let contextTokens = config.tokenManagement.maxContextTokens;
    let responseTokens = config.tokenManagement.maxResponseTokens;

    // Apply strategy-based reductions
    if (strategy !== 'adaptive') {
      contextTokens = Math.floor(contextTokens * (1 - thresholds.contextReduction));
      responseTokens = Math.floor(responseTokens * (1 - thresholds.responseReduction));
    } else {
      // Adaptive allocation based on complexity
      const contextMultiplier = 1 - (thresholds.contextReduction * (1 - complexity.score));
      const responseMultiplier = 1 - (thresholds.responseReduction * (1 - complexity.score * 0.5));

      contextTokens = Math.floor(contextTokens * contextMultiplier);
      responseTokens = Math.floor(responseTokens * responseMultiplier);
    }

    // Apply cache bias (reduce tokens if cache hit is likely)
    if (cacheAnalysis.cacheHitProbability > 0.5) {
      const cacheReduction = thresholds.cacheBias * cacheAnalysis.cacheHitProbability * 0.2;
      contextTokens = Math.floor(contextTokens * (1 - cacheReduction));
      responseTokens = Math.floor(responseTokens * (1 - cacheReduction * 0.5));
    }

    // Ensure minimum viable tokens
    contextTokens = Math.max(contextTokens, 500);
    responseTokens = Math.max(responseTokens, 150);

    return {
      contextTokens,
      responseTokens,
      totalBudget: contextTokens + responseTokens,
      strategy,
      confidence: this.calculateConfidence(complexity, cacheAnalysis)
    };
  }

  /**
   * Calculate confidence in budget allocation
   */
  private calculateConfidence(
    complexity: QueryComplexity,
    cacheAnalysis: { cacheHitProbability: number }
  ): number {
    // Higher confidence for simpler queries and higher cache probability
    const complexityConfidence = 1 - (complexity.score * 0.3);
    const cacheConfidence = cacheAnalysis.cacheHitProbability * 0.2;

    return Math.min(0.95, complexityConfidence + cacheConfidence);
  }

  /**
   * Estimate quality impact of budget
   */
  private estimateQualityImpact(budget: ContextBudget, complexity: QueryComplexity): number {
    // Calculate reduction ratios
    const contextReduction = 1 - (budget.contextTokens / this.BASELINE_TOKENS.context);
    const responseReduction = 1 - (budget.responseTokens / this.BASELINE_TOKENS.response);

    // Quality impact formula (empirically derived)
    // Higher complexity queries are more sensitive to token reduction
    const complexityFactor = 1 + (complexity.score * 0.5);
    const contextImpact = contextReduction * 0.6 * complexityFactor;
    const responseImpact = responseReduction * 0.4 * complexityFactor;

    // Total quality impact (0 = no impact, 1 = severe impact)
    return Math.min(1, contextImpact + responseImpact);
  }

  /**
   * Calculate estimated savings
   */
  private calculateSavings(budget: ContextBudget): number {
    const baselineTotal = this.BASELINE_TOKENS.total;
    const optimizedTotal = budget.totalBudget;

    return ((baselineTotal - optimizedTotal) / baselineTotal) * 100;
  }

  /**
   * Make recommendation based on analysis
   */
  private makeRecommendation(qualityImpact: number, savings: number): 'apply' | 'skip' | 'monitor' {
    const config = this.configManager.getConfig();
    const minQuality = config.qualityPreservation.minQualityThreshold;

    // Skip if quality impact is too high
    if (qualityImpact > (1 - minQuality)) {
      return 'skip';
    }

    // Apply if savings are significant and quality is acceptable
    if (savings >= 15 && qualityImpact < 0.05) {
      return 'apply';
    }

    // Monitor for borderline cases
    return 'monitor';
  }

  /**
   * Get default budget (no optimization)
   */
  private getDefaultBudget(): BudgetOptimizationResult {
    const config = this.configManager.getConfig();

    return {
      budget: {
        contextTokens: config.tokenManagement.maxContextTokens,
        responseTokens: config.tokenManagement.maxResponseTokens,
        totalBudget: config.tokenManagement.maxContextTokens + config.tokenManagement.maxResponseTokens,
        strategy: 'conservative',
        confidence: 1.0
      },
      estimatedSavings: 0,
      qualityImpact: 0,
      recommendation: 'skip'
    };
  }

  /**
   * Apply coordinated optimization strategies
   */
  async applyCoordinatedStrategies(
    chunks: any[],
    budget: ContextBudget,
    queryEmbedding: number[]
  ): Promise<{
    optimizedChunks: any[];
    strategies: string[];
    tokensSaved: number;
  }> {
    const strategies: string[] = [];
    let optimizedChunks = [...chunks];

    // 1. Apply threshold filtering
    if (budget.strategy !== 'conservative') {
      const threshold = budget.strategy === 'aggressive' ? 0.8 : 0.75;
      const before = optimizedChunks.length;
      optimizedChunks = optimizedChunks.filter(c => c.similarity >= threshold);
      if (before > optimizedChunks.length) {
        strategies.push(`threshold_filter(${threshold})`);
      }
    }

    // 2. Apply semantic deduplication
    const before = optimizedChunks.length;
    optimizedChunks = this.semanticDeduplicate(optimizedChunks);
    if (before > optimizedChunks.length) {
      strategies.push(`semantic_dedup(removed=${before - optimizedChunks.length})`);
    }

    // 3. Apply MMR reranking for diversity
    if (optimizedChunks.length > 5) {
      optimizedChunks = this.applyMMR(optimizedChunks, queryEmbedding, budget);
      strategies.push('mmr_rerank');
    }

    // 4. Apply smart truncation to fit budget
    const truncated = this.smartTruncate(optimizedChunks, budget.contextTokens);
    if (truncated.length < optimizedChunks.length) {
      strategies.push(`smart_truncate(${truncated.length}/${optimizedChunks.length})`);
    }
    optimizedChunks = truncated;

    // Calculate tokens saved
    const originalTokens = this.estimateTokens(chunks);
    const optimizedTokens = this.estimateTokens(optimizedChunks);
    const tokensSaved = originalTokens - optimizedTokens;

    console.log(`Applied strategies: ${strategies.join(', ')}, saved ${tokensSaved} tokens`);

    return {
      optimizedChunks,
      strategies,
      tokensSaved
    };
  }

  /**
   * Semantic deduplication
   */
  private semanticDeduplicate(chunks: any[]): any[] {
    if (chunks.length <= 1) return chunks;

    const deduplicated: any[] = [];
    const threshold = 0.85;

    for (const chunk of chunks) {
      let isDuplicate = false;

      for (const existing of deduplicated) {
        const similarity = this.calculateSimilarity(chunk.content, existing.content);
        if (similarity > threshold) {
          // Keep the one with higher relevance
          if (chunk.similarity > existing.similarity) {
            const index = deduplicated.indexOf(existing);
            deduplicated[index] = chunk;
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(chunk);
      }
    }

    return deduplicated;
  }

  /**
   * Apply MMR for diversity
   */
  private applyMMR(chunks: any[], queryEmbedding: number[], budget: ContextBudget): any[] {
    const lambda = budget.strategy === 'aggressive' ? 0.6 : 0.7;
    const selected: any[] = [];
    const candidates = [...chunks];

    // Select first chunk (highest relevance)
    candidates.sort((a, b) => b.similarity - a.similarity);
    selected.push(candidates.shift()!);

    // Iteratively select diverse chunks
    const maxChunks = Math.min(chunks.length, Math.ceil(budget.contextTokens / 200));

    while (selected.length < maxChunks && candidates.length > 0) {
      let bestScore = -1;
      let bestIndex = -1;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const relevance = candidate.similarity;

        // Calculate minimum similarity to selected chunks
        let minSim = 1.0;
        for (const sel of selected) {
          const sim = this.calculateSimilarity(candidate.content, sel.content);
          minSim = Math.min(minSim, sim);
        }

        const mmrScore = lambda * relevance + (1 - lambda) * minSim;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }

      if (bestIndex >= 0) {
        selected.push(candidates[bestIndex]);
        candidates.splice(bestIndex, 1);
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * Smart truncation to fit token budget
   */
  private smartTruncate(chunks: any[], maxTokens: number): any[] {
    const result: any[] = [];
    let currentTokens = 0;

    // Sort by importance score
    const scored = chunks.map(chunk => ({
      ...chunk,
      importance: chunk.similarity * (chunk.relevance || 1) * (chunk.contextImportance || 1)
    }));
    scored.sort((a, b) => b.importance - a.importance);

    for (const chunk of scored) {
      const chunkTokens = this.estimateTokens([chunk]);

      if (currentTokens + chunkTokens <= maxTokens) {
        result.push(chunk);
        currentTokens += chunkTokens;
      } else if (currentTokens < maxTokens * 0.8) {
        // Truncate last chunk to fit
        const remainingTokens = maxTokens - currentTokens;
        const truncateRatio = remainingTokens / chunkTokens;
        const truncatedLength = Math.floor(chunk.content.length * truncateRatio);

        if (truncatedLength > 100) {
          chunk.content = chunk.content.substring(0, truncatedLength) + '...';
          result.push(chunk);
          break;
        }
      }
    }

    return result;
  }

  /**
   * Calculate text similarity
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Estimate token count
   */
  private estimateTokens(chunks: any[]): number {
    // Rough estimation: 1 token ≈ 4 characters
    return chunks.reduce((sum, chunk) => sum + Math.ceil(chunk.content.length / 4), 0);
  }

  /**
   * Track quality metrics for monitoring
   */
  async trackQualityMetrics(
    queryId: string,
    metrics: ContextQualityMetrics
  ): Promise<void> {
    if (!this.featureToggles.enableQualityMonitoring) {
      return;
    }

    this.metricsHistory.set(queryId, metrics);

    // Keep only recent metrics (last 100)
    if (this.metricsHistory.size > 100) {
      const keys = Array.from(this.metricsHistory.keys());
      this.metricsHistory.delete(keys[0]);
    }

    // Check for quality degradation
    const recentMetrics = Array.from(this.metricsHistory.values()).slice(-10);
    const avgQuality = recentMetrics.reduce((sum, m) => sum + m.overallQuality, 0) / recentMetrics.length;

    if (avgQuality < 0.8) {
      console.warn(`Quality degradation detected: ${avgQuality.toFixed(2)}`);
      // Could trigger automatic strategy adjustment here
    }
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): {
    totalQueries: number;
    avgSavings: number;
    avgQuality: number;
    strategyDistribution: Record<BudgetStrategy, number>;
  } {
    const metrics = Array.from(this.metricsHistory.values());

    if (metrics.length === 0) {
      return {
        totalQueries: 0,
        avgSavings: 0,
        avgQuality: 0,
        strategyDistribution: {
          aggressive: 0,
          balanced: 0,
          conservative: 0,
          adaptive: 0
        }
      };
    }

    return {
      totalQueries: metrics.length,
      avgSavings: 0, // Would need to track this
      avgQuality: metrics.reduce((sum, m) => sum + m.overallQuality, 0) / metrics.length,
      strategyDistribution: {
        aggressive: 0,
        balanced: 0,
        conservative: 0,
        adaptive: 0
      }
    };
  }

  /**
   * Update feature toggles
   */
  updateFeatureToggles(updates: Partial<typeof this.featureToggles>): void {
    this.featureToggles = { ...this.featureToggles, ...updates };
    console.log('Feature toggles updated:', this.featureToggles);
  }

  /**
   * Get current feature toggles
   */
  getFeatureToggles(): typeof this.featureToggles {
    return { ...this.featureToggles };
  }
}

// Export singleton instance
export const contextBudgetManager = ContextBudgetManager.getInstance();