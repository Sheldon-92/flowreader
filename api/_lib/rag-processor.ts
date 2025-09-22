/**
 * RAG Processing Implementation
 * 
 * Based on the RAG quality spike validation,
 * this implements the production-ready RAG processing pipeline
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './auth.js';
import { TextChunker, EmbeddingGenerator, RAGRetriever } from '../_spikes/rag-quality-test.js';
import type { ChatStreamRequest } from '@flowreader/shared';
import { getPerformanceConfig, PerformanceConfigManager } from './performance-config.js';
import { getResponseCache } from './response-cache.js';
import { contextBudgetManager, type ContextBudget, type ContextQualityMetrics } from './context_budget.js';

// Optimized chunk interface with additional metadata
interface OptimizedChunk {
  content: string;
  chapterIdx: number;
  startPos: number;
  endPos: number;
  similarity: number;
  relevance?: number;
  diversity?: number;
  contextImportance?: number;
}

export class RAGProcessor {
  private openai: OpenAI;
  private embeddingGenerator: EmbeddingGenerator;
  private retriever: RAGRetriever;
  private chunker: TextChunker;
  private responseCache = getResponseCache();
  private configManager = PerformanceConfigManager.getInstance();

  // Dynamic optimization parameters from config
  private get CHUNK_SIZE() { return 600; }
  private get OVERLAP_SIZE() { return 150; }
  private get TOP_K_INITIAL() {
    const config = this.configManager.getConfig();
    return config.tokenManagement.topKInitial;
  }
  private get TOP_K_FINAL() {
    const config = this.configManager.getConfig();
    return config.tokenManagement.topKFinal;
  }
  private get SIMILARITY_THRESHOLD() {
    const config = this.configManager.getConfig();
    return config.tokenManagement.similarityThreshold;
  }
  private get MMR_LAMBDA() { return 0.7; }
  private get MAX_CONTEXT_TOKENS() {
    const config = this.configManager.getConfig();
    return config.tokenManagement.maxContextTokens;
  }

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    this.embeddingGenerator = new EmbeddingGenerator();
    this.retriever = new RAGRetriever();
    this.chunker = new TextChunker(this.CHUNK_SIZE, this.OVERLAP_SIZE);
  }

  /**
   * Process book chapters to create embeddings for RAG
   */
  async processBookForRAG(bookId: string): Promise<{
    chunksCreated: number;
    embeddingsStored: number;
    costEstimate: number;
  }> {
    try {
      console.log(`🔮 Processing book ${bookId} for RAG...`);

      // Get all chapters for the book
      const { data: chapters, error } = await supabaseAdmin
        .from('chapters')
        .select('id, idx, content')
        .eq('book_id', bookId)
        .order('idx');

      if (error || !chapters) {
        throw new Error(`Failed to load chapters: ${error?.message}`);
      }

      let totalChunks = 0;
      let totalTextLength = 0;
      const allChunks: any[] = [];
      const allTexts: string[] = [];

      // Process each chapter
      for (const chapter of chapters) {
        const chunks = this.chunker.chunkText(chapter.content, chapter.idx);
        
        chunks.forEach(chunk => {
          allChunks.push({
            ...chunk,
            bookId
          });
          allTexts.push(chunk.content);
        });

        totalChunks += chunks.length;
        totalTextLength += chapter.content.length;
      }

      console.log(`📝 Created ${totalChunks} chunks from ${chapters.length} chapters`);

      // Generate embeddings
      const embeddings = await this.embeddingGenerator.generateEmbeddings(allTexts);

      // Store embeddings
      await this.retriever.storeEmbeddings(bookId, allChunks, embeddings);

      const costEstimate = this.embeddingGenerator.estimateCost(totalTextLength);

      console.log(`✅ RAG processing completed for book ${bookId}`);

      return {
        chunksCreated: totalChunks,
        embeddingsStored: embeddings.length,
        costEstimate
      };

    } catch (error) {
      console.error('RAG processing failed:', error);
      throw new Error(`RAG processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate streaming AI response with RAG context
   */
  async *streamChatResponse(request: ChatStreamRequest): Promise<AsyncGenerator<{
    type: 'sources' | 'token' | 'usage' | 'done' | 'error';
    data: any;
  }>> {
    try {
      console.log(`🤖 Starting chat stream for book ${request.book_id}`);

      // Check cache first
      const cachedResponse = await this.responseCache.getCachedResponse({
        bookId: request.book_id,
        message: request.message,
        selection: request.selection,
        chapterIdx: request.chapter_idx
      });

      if (cachedResponse) {
        console.log(`✨ Using cached response, saved ${cachedResponse.tokens.total} tokens`);

        // Emit cached sources if available
        if (cachedResponse.sources) {
          yield {
            type: 'sources',
            data: cachedResponse.sources
          };
        }

        // Stream cached response
        const words = cachedResponse.response.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          yield {
            type: 'token',
            data: words.slice(i, i + 3).join(' ') + ' '
          };
          await new Promise(resolve => setTimeout(resolve, 10)); // Simulate streaming
        }

        // Emit cached usage
        yield {
          type: 'usage',
          data: {
            prompt_tokens: cachedResponse.tokens.input,
            completion_tokens: cachedResponse.tokens.output,
            total_tokens: cachedResponse.tokens.total,
            cost_usd: this.calculateCost(cachedResponse.tokens.total),
            cached: true
          }
        };

        yield {
          type: 'done',
          data: { completed_at: Date.now(), cached: true }
        };

        return;
      }

      // Check for cached embedding
      let queryEmbedding = this.responseCache.getCachedEmbedding(request.message);

      if (!queryEmbedding) {
        // Generate query embedding
        queryEmbedding = await this.embeddingGenerator.generateSingleEmbedding(
          request.message
        );

        // Cache the embedding
        await this.responseCache.cacheEmbedding(request.message, queryEmbedding);
      }

      // Calculate optimal context budget
      const budgetOptimization = await contextBudgetManager.calculateOptimalBudget(
        request.message,
        request.book_id,
        request.selection
      );

      console.log(`💰 Budget optimization: strategy=${budgetOptimization.budget.strategy}, savings=${budgetOptimization.estimatedSavings.toFixed(1)}%, recommendation=${budgetOptimization.recommendation}`);

      // Query expansion for better retrieval
      const expandedQuery = await this.expandQuery(request.message);
      console.log(`🔍 Expanded query: ${expandedQuery}`);

      // Generate embeddings for both original and expanded queries
      const expandedEmbedding = expandedQuery !== request.message
        ? await this.embeddingGenerator.generateSingleEmbedding(expandedQuery)
        : queryEmbedding;

      // Hybrid retrieval: combine original and expanded query results
      const [originalChunks, expandedChunks] = await Promise.all([
        this.retriever.retrieveRelevantChunks(
          request.book_id,
          queryEmbedding,
          this.TOP_K_INITIAL,
          this.SIMILARITY_THRESHOLD,
          request.chapter_idx
        ),
        expandedQuery !== request.message
          ? this.retriever.retrieveRelevantChunks(
              request.book_id,
              expandedEmbedding,
              this.TOP_K_INITIAL,
              this.SIMILARITY_THRESHOLD,
              request.chapter_idx
            )
          : Promise.resolve([])
      ]);

      // Merge and deduplicate chunks
      const allChunks = this.mergeAndDeduplicateChunks(originalChunks, expandedChunks);

      // Apply semantic deduplication if enabled
      const config = this.configManager.getConfig();
      let processedChunks = allChunks;

      if (config.tokenManagement.semanticDeduplication) {
        processedChunks = this.deduplicateSemanticChunks(allChunks);
        console.log(`📊 Semantic deduplication: ${allChunks.length} → ${processedChunks.length} chunks`);
      }

      // Apply relevance filtering
      if (config.tokenManagement.relevanceScoreThreshold > 0) {
        processedChunks = processedChunks.filter(
          chunk => chunk.similarity >= config.tokenManagement.relevanceScoreThreshold
        );
        console.log(`🎯 Relevance filtering: ${processedChunks.length} chunks above threshold`);
      }

      // Apply re-ranking with MMR (Maximal Marginal Relevance)
      const rerankedChunks = await this.rerankWithMMR(
        processedChunks,
        queryEmbedding,
        request.message,
        this.TOP_K_FINAL
      );

      // Apply coordinated optimization strategies if budget recommendation is 'apply'
      let relevantChunks: OptimizedChunk[];
      let optimizationStrategies: string[] = [];

      if (budgetOptimization.recommendation === 'apply' || budgetOptimization.recommendation === 'monitor') {
        const coordinatedResult = await contextBudgetManager.applyCoordinatedStrategies(
          rerankedChunks,
          budgetOptimization.budget,
          queryEmbedding
        );
        relevantChunks = coordinatedResult.optimizedChunks;
        optimizationStrategies = coordinatedResult.strategies;
        console.log(`🎯 Applied budget strategies: ${optimizationStrategies.join(', ')}, saved ${coordinatedResult.tokensSaved} tokens`);
      } else {
        // Fall back to original optimization
        const intentType = this.detectIntentType(request.message);
        const tokenLimits = this.configManager.getTokenLimitsByIntent(intentType);
        relevantChunks = this.optimizeContextWindow(rerankedChunks, tokenLimits.context);
      }

      // Emit sources
      yield {
        type: 'sources',
        data: relevantChunks.map(chunk => ({
          chapter_idx: chunk.chapterIdx,
          start: chunk.startPos,
          end: chunk.endPos,
          similarity: chunk.similarity
        }))
      };

      // Build context for AI
      const context = this.buildContext(relevantChunks, request.selection);
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(request.message, context, request.selection);

      console.log(`📚 Using ${relevantChunks.length} context chunks for response`);

      // Select model and token limits based on budget optimization
      const intentType = this.detectIntentType(request.message);
      let model: string;
      let maxTokens: number;

      if (budgetOptimization.recommendation === 'apply') {
        // Use budget-optimized settings
        model = this.configManager.getModelForIntent(intentType);
        maxTokens = budgetOptimization.budget.responseTokens;
      } else {
        // Use standard settings
        const tokenLimits = this.configManager.getTokenLimitsByIntent(intentType);
        model = this.configManager.getModelForIntent(intentType);
        maxTokens = tokenLimits.response;
      }

      console.log(`🎯 Using model: ${model}, max tokens: ${maxTokens}, budget strategy: ${budgetOptimization.budget.strategy}`);

      // Stream AI response
      const stream = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        max_tokens: maxTokens,
        temperature: 0.7
      });

      let totalTokens = 0;
      let responseTokens = 0;
      let fullResponse = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          fullResponse += delta.content;
          yield {
            type: 'token',
            data: delta.content
          };
          responseTokens++;

          // Early stopping if confidence threshold reached
          if (config.requestProcessing.earlyStoppingConfidence > 0 &&
              this.checkEarlyStoppingCondition(fullResponse, responseTokens)) {
            console.log(`⚡ Early stopping at ${responseTokens} tokens`);
            break;
          }
        }
      }

      // Estimate token usage (rough calculation)
      const promptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      totalTokens = promptTokens + responseTokens;

      // Cache the response
      await this.responseCache.setCachedResponse({
        bookId: request.book_id,
        message: request.message,
        selection: request.selection,
        chapterIdx: request.chapter_idx,
        response: fullResponse,
        tokens: {
          input: promptTokens,
          output: responseTokens,
          total: totalTokens
        },
        sources: relevantChunks.map(chunk => ({
          chapter_idx: chunk.chapterIdx,
          start: chunk.startPos,
          end: chunk.endPos,
          similarity: chunk.similarity
        }))
      });

      // Calculate quality metrics for monitoring
      const qualityMetrics: ContextQualityMetrics = {
        relevanceScore: this.calculateRelevanceScore(relevantChunks, request.message),
        diversityScore: this.calculateDiversityScore(relevantChunks),
        completenessScore: this.estimateCompletenessScore(fullResponse, request.message),
        coherenceScore: this.estimateCoherenceScore(fullResponse),
        overallQuality: 0
      };
      qualityMetrics.overallQuality = (
        qualityMetrics.relevanceScore * 0.3 +
        qualityMetrics.diversityScore * 0.2 +
        qualityMetrics.completenessScore * 0.3 +
        qualityMetrics.coherenceScore * 0.2
      );

      // Track quality metrics if budget optimization was applied
      if (budgetOptimization.recommendation !== 'skip') {
        await contextBudgetManager.trackQualityMetrics(
          `${request.book_id}_${Date.now()}`,
          qualityMetrics
        );
      }

      // Emit usage information
      yield {
        type: 'usage',
        data: {
          prompt_tokens: promptTokens,
          completion_tokens: responseTokens,
          total_tokens: totalTokens,
          cost_usd: this.calculateCost(totalTokens),
          model_used: model,
          cached: false,
          budget_strategy: budgetOptimization.budget.strategy,
          estimated_savings: budgetOptimization.estimatedSavings,
          quality_score: qualityMetrics.overallQuality,
          optimization_applied: optimizationStrategies.length > 0
        }
      };

      // Save conversation to database
      await this.saveConversation(request, {
        prompt_tokens: promptTokens,
        completion_tokens: responseTokens,
        total_tokens: totalTokens,
        context_chunks: relevantChunks.map(chunk => chunk.content)
      });

      yield {
        type: 'done',
        data: { completed_at: Date.now() }
      };

      console.log(`✅ Chat stream completed with ${totalTokens} tokens, quality score: ${qualityMetrics.overallQuality.toFixed(2)}`);

    } catch (error) {
      console.error('Chat stream failed:', error);
      yield {
        type: 'error',
        data: {
          code: 'CHAT_STREAM_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private buildContext(chunks: OptimizedChunk[], selection?: string): string {
    let context = '';

    if (selection) {
      context += `User's selected text: "${selection}"\n\n`;
    }

    context += 'Relevant context from the book (ordered by relevance):\n\n';

    chunks.forEach((chunk, index) => {
      // Include relevance metadata for better context understanding
      const metadata = [];
      if (chunk.relevance) metadata.push(`relevance: ${(chunk.relevance * 100).toFixed(1)}%`);
      if (chunk.diversity) metadata.push(`diversity: ${(chunk.diversity * 100).toFixed(1)}%`);

      context += `[Context ${index + 1}] (Chapter ${chunk.chapterIdx + 1}`;
      if (metadata.length > 0) context += `, ${metadata.join(', ')}`;
      context += `):\n`;
      context += `${chunk.content}\n\n`;
    });

    return context;
  }

  private buildSystemPrompt(): string {
    const config = this.configManager.getConfig();

    if (config.promptOptimization.useConcisePrompts) {
      // Optimized concise prompt (40% reduction)
      return `You are FlowReader's AI assistant. Help readers understand their books.

Rules:
- Use provided context
- Be conversational
- Make connections when relevant
- Acknowledge limitations
- Stay concise (<150 words)`;
    }

    // Original verbose prompt
    return `You are FlowReader's AI reading companion. Your role is to help readers understand and engage with their books through thoughtful discussion.

Guidelines:
1. Base your responses primarily on the provided book context
2. Be conversational and helpful, not academic or dry
3. When appropriate, make connections between different parts of the book
4. If the context doesn't contain enough information, acknowledge this limitation
5. Encourage deeper thinking with follow-up questions when appropriate
6. Keep responses focused and concise (under 200 words typically)

Remember: You're having a conversation with a reader about their book, not writing an essay.`;
  }

  private buildUserPrompt(message: string, context: string, selection?: string): string {
    const config = this.configManager.getConfig();

    if (config.promptOptimization.useConcisePrompts) {
      // Optimized concise prompt (35% reduction)
      let prompt = `Context:\n${context}\n\n`;
      if (selection) {
        prompt += `Selection: "${selection.substring(0, 100)}..."\n\n`;
      }
      prompt += `Question: ${message}\n\nRespond based on context.`;

      // Apply max length limit
      if (config.promptOptimization.maxUserPromptLength > 0) {
        prompt = prompt.substring(0, config.promptOptimization.maxUserPromptLength);
      }

      return prompt;
    }

    // Original verbose prompt
    let prompt = context + '\n\n';
    if (selection) {
      prompt += `The user is asking about this selected passage: "${selection}"\n\n`;
    }
    prompt += `User's question: ${message}\n\n`;
    prompt += 'Please provide a helpful response based on the book context above.';

    return prompt;
  }

  private calculateCost(tokens: number): number {
    // GPT-3.5-turbo pricing: ~$0.002 per 1K tokens
    return (tokens / 1000) * 0.002;
  }

  private async saveConversation(
    request: ChatStreamRequest,
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      context_chunks: string[];
    }
  ): Promise<void> {
    try {
      // This would be implemented based on the conversation storage schema
      console.log(`💾 Saving conversation for book ${request.book_id}`);
      // Implementation details will be added when building the actual chat storage
    } catch (error) {
      console.warn('Failed to save conversation:', error);
      // Don't throw - the conversation was successful even if saving failed
    }
  }

  /**
   * Check if book has been processed for RAG
   */
  async isBookProcessed(bookId: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('chapter_embeddings')
        .select('id')
        .eq('book_id', bookId)
        .limit(1);

      return !error && data && data.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Update book processing status
   */
  async updateProcessingStatus(bookId: string, status: 'processing' | 'completed' | 'failed'): Promise<void> {
    try {
      // This could be stored in book metadata or a separate processing status table
      const { error } = await supabaseAdmin
        .from('books')
        .update({
          metadata: supabaseAdmin.raw(`metadata || '{"rag_status": "${status}"}'`)
        })
        .eq('id', bookId);

      if (error) {
        console.warn('Failed to update processing status:', error);
      }
    } catch (error) {
      console.warn('Failed to update processing status:', error);
    }
  }

  /**
   * Query expansion for better retrieval
   */
  private async expandQuery(query: string): Promise<string> {
    // Simple keyword-based expansion
    const expansions: { [key: string]: string[] } = {
      'summary': ['summarize', 'overview', 'main points', 'key ideas'],
      'explain': ['clarify', 'describe', 'elaborate', 'meaning'],
      'compare': ['contrast', 'difference', 'similarity', 'versus'],
      'analyze': ['examine', 'investigate', 'explore', 'study'],
      'character': ['protagonist', 'person', 'individual', 'figure'],
      'theme': ['motif', 'subject', 'topic', 'message'],
      'plot': ['story', 'narrative', 'events', 'action']
    };

    let expandedQuery = query;
    const queryLower = query.toLowerCase();

    // Add relevant expansions
    for (const [key, values] of Object.entries(expansions)) {
      if (queryLower.includes(key)) {
        const relevantExpansions = values.filter(v => !queryLower.includes(v)).slice(0, 2);
        if (relevantExpansions.length > 0) {
          expandedQuery += ` ${relevantExpansions.join(' ')}`;
        }
      }
    }

    return expandedQuery;
  }

  /**
   * Merge and deduplicate chunks from multiple retrievals
   */
  private mergeAndDeduplicateChunks(
    chunks1: any[],
    chunks2: any[]
  ): OptimizedChunk[] {
    const chunkMap = new Map<string, OptimizedChunk>();

    // Helper to create a unique key for each chunk
    const getChunkKey = (chunk: any) =>
      `${chunk.chapterIdx}-${chunk.startPos}-${chunk.endPos}`;

    // Add all chunks, keeping the one with highest similarity
    [...chunks1, ...chunks2].forEach(chunk => {
      const key = getChunkKey(chunk);
      const existing = chunkMap.get(key);

      if (!existing || chunk.similarity > existing.similarity) {
        chunkMap.set(key, chunk as OptimizedChunk);
      }
    });

    return Array.from(chunkMap.values());
  }

  /**
   * Re-rank chunks using Maximal Marginal Relevance (MMR)
   */
  private async rerankWithMMR(
    chunks: OptimizedChunk[],
    queryEmbedding: number[],
    query: string,
    topK: number
  ): Promise<OptimizedChunk[]> {
    if (chunks.length === 0) return [];

    const selected: OptimizedChunk[] = [];
    const candidates = [...chunks];

    // First, select the most relevant chunk
    candidates.sort((a, b) => b.similarity - a.similarity);
    const firstChunk = candidates.shift()!;
    firstChunk.relevance = firstChunk.similarity;
    firstChunk.diversity = 1.0;
    selected.push(firstChunk);

    // Iteratively select chunks that balance relevance and diversity
    while (selected.length < topK && candidates.length > 0) {
      let bestScore = -1;
      let bestIndex = -1;
      let bestChunk: OptimizedChunk | null = null;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        // Calculate relevance (similarity to query)
        const relevance = candidate.similarity;

        // Calculate diversity (minimum similarity to already selected chunks)
        let minSimilarity = 1.0;
        for (const selectedChunk of selected) {
          const similarity = this.calculateTextSimilarity(
            candidate.content,
            selectedChunk.content
          );
          minSimilarity = Math.min(minSimilarity, similarity);
        }

        // MMR score: balance relevance and diversity
        const mmrScore = this.MMR_LAMBDA * relevance + (1 - this.MMR_LAMBDA) * minSimilarity;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
          bestChunk = candidate;
          bestChunk.relevance = relevance;
          bestChunk.diversity = minSimilarity;
        }
      }

      if (bestChunk && bestIndex >= 0) {
        selected.push(bestChunk);
        candidates.splice(bestIndex, 1);
      } else {
        break;
      }
    }

    // Add contextual importance scores
    selected.forEach((chunk, index) => {
      // Prioritize chunks that contain query keywords
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const chunkLower = chunk.content.toLowerCase();
      const keywordMatches = queryWords.filter(word => chunkLower.includes(word)).length;
      chunk.contextImportance = keywordMatches / Math.max(queryWords.length, 1);
    });

    return selected;
  }

  /**
   * Calculate simple text similarity using Jaccard coefficient
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Optimize context window to fit within token budget
   */
  private optimizeContextWindow(
    chunks: OptimizedChunk[],
    maxTokens: number
  ): OptimizedChunk[] {
    const optimized: OptimizedChunk[] = [];
    let currentTokens = 0;

    // Estimate tokens (rough: 1 token ≈ 4 characters)
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);

    // Sort by composite score (relevance + context importance)
    const sortedChunks = [...chunks].sort((a, b) => {
      const scoreA = (a.relevance || 0) * 0.7 + (a.contextImportance || 0) * 0.3;
      const scoreB = (b.relevance || 0) * 0.7 + (b.contextImportance || 0) * 0.3;
      return scoreB - scoreA;
    });

    for (const chunk of sortedChunks) {
      const chunkTokens = estimateTokens(chunk.content);

      if (currentTokens + chunkTokens <= maxTokens) {
        optimized.push(chunk);
        currentTokens += chunkTokens;
      } else if (currentTokens < maxTokens * 0.8) {
        // If we have room, truncate the chunk to fit
        const remainingTokens = maxTokens - currentTokens;
        const truncatedLength = remainingTokens * 4;

        if (truncatedLength > 100) { // Only include if meaningful
          chunk.content = chunk.content.substring(0, truncatedLength) + '...';
          optimized.push(chunk);
          break;
        }
      }
    }

    // Re-sort by chapter order for better readability
    optimized.sort((a, b) => {
      if (a.chapterIdx !== b.chapterIdx) {
        return a.chapterIdx - b.chapterIdx;
      }
      return a.startPos - b.startPos;
    });

    console.log(`📊 Context optimization: ${chunks.length} chunks → ${optimized.length} chunks (${currentTokens} tokens)`);

    return optimized;
  }

  /**
   * Deduplicate semantically similar chunks
   */
  private deduplicateSemanticChunks(chunks: OptimizedChunk[]): OptimizedChunk[] {
    if (chunks.length <= 1) return chunks;

    const deduplicated: OptimizedChunk[] = [];
    const semanticThreshold = 0.85; // High threshold for semantic similarity

    for (const chunk of chunks) {
      let isDuplicate = false;

      for (const existing of deduplicated) {
        const similarity = this.calculateTextSimilarity(chunk.content, existing.content);
        if (similarity > semanticThreshold) {
          // Keep the chunk with higher relevance score
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
   * Detect intent type from message
   */
  private detectIntentType(message: string): string {
    const messageLower = message.toLowerCase();

    // Simple intent patterns
    if (messageLower.includes('what is') || messageLower.includes('define')) {
      return 'simple';
    }
    if (messageLower.includes('explain') || messageLower.includes('describe')) {
      return 'explain';
    }
    if (messageLower.includes('analyze') || messageLower.includes('compare')) {
      return 'complex';
    }
    if (messageLower.includes('summarize') || messageLower.includes('overview')) {
      return 'simple';
    }

    // Default based on message length
    if (message.length < 50) return 'simple';
    if (message.length > 150) return 'complex';

    return 'enhance';
  }

  /**
   * Check early stopping condition
   */
  private checkEarlyStoppingCondition(response: string, tokens: number): boolean {
    const config = this.configManager.getConfig();

    // Check if response seems complete
    const sentences = response.split(/[.!?]/).filter(s => s.trim().length > 0);
    const hasCompleteSentence = sentences.length > 0;
    const lastChar = response.trim().slice(-1);
    const endsWithPunctuation = ['.', '!', '?'].includes(lastChar);

    // Early stopping conditions
    if (tokens > 100 && hasCompleteSentence && endsWithPunctuation) {
      // Calculate response completeness confidence
      const wordsPerSentence = response.split(/\s+/).length / Math.max(sentences.length, 1);
      const completenessScore = Math.min(1, sentences.length / 3) *
                                 (endsWithPunctuation ? 1 : 0.7) *
                                 Math.min(1, wordsPerSentence / 10);

      return completenessScore >= config.requestProcessing.earlyStoppingConfidence;
    }

    return false;
  }

  /**
   * Calculate relevance score of chunks
   */
  private calculateRelevanceScore(chunks: OptimizedChunk[], query: string): number {
    if (chunks.length === 0) return 0;

    // Average similarity score weighted by relevance metadata
    const totalScore = chunks.reduce((sum, chunk) => {
      const similarity = chunk.similarity || 0;
      const relevance = chunk.relevance || similarity;
      const importance = chunk.contextImportance || 1;
      return sum + (similarity * relevance * importance);
    }, 0);

    return Math.min(1, totalScore / chunks.length);
  }

  /**
   * Calculate diversity score of chunks
   */
  private calculateDiversityScore(chunks: OptimizedChunk[]): number {
    if (chunks.length <= 1) return 1;

    // Calculate average pairwise diversity
    let totalDiversity = 0;
    let pairs = 0;

    for (let i = 0; i < chunks.length - 1; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const similarity = this.calculateTextSimilarity(chunks[i].content, chunks[j].content);
        totalDiversity += (1 - similarity);
        pairs++;
      }
    }

    return pairs > 0 ? totalDiversity / pairs : 0;
  }

  /**
   * Estimate completeness of response
   */
  private estimateCompletenessScore(response: string, query: string): number {
    // Check if response addresses key query terms
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const responseWords = new Set(response.toLowerCase().split(/\s+/));

    const addressedWords = queryWords.filter(w => responseWords.has(w)).length;
    const keywordCoverage = queryWords.length > 0 ? addressedWords / queryWords.length : 0;

    // Check response structure
    const sentences = response.split(/[.!?]/).filter(s => s.trim().length > 10);
    const hasSufficientContent = sentences.length >= 2;
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / Math.max(sentences.length, 1);
    const hasGoodStructure = avgSentenceLength > 30 && avgSentenceLength < 200;

    return (keywordCoverage * 0.5) +
           (hasSufficientContent ? 0.25 : 0) +
           (hasGoodStructure ? 0.25 : 0);
  }

  /**
   * Estimate coherence of response
   */
  private estimateCoherenceScore(response: string): number {
    const sentences = response.split(/[.!?]/).filter(s => s.trim().length > 0);

    if (sentences.length === 0) return 0;

    // Check for transition words and coherent flow
    const transitionWords = ['however', 'therefore', 'moreover', 'furthermore', 'additionally',
                            'consequently', 'thus', 'hence', 'meanwhile', 'nevertheless'];
    const hasTransitions = transitionWords.some(word =>
      response.toLowerCase().includes(word)
    );

    // Check for proper punctuation and structure
    const properPunctuation = response.match(/[.!?]$/);
    const hasCapitalization = response.match(/^[A-Z]/);

    // Check sentence length variation
    const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avgLength = sentenceLengths.reduce((sum, len) => sum + len, 0) / sentenceLengths.length;
    const variance = sentenceLengths.reduce((sum, len) =>
      sum + Math.pow(len - avgLength, 2), 0
    ) / sentenceLengths.length;
    const hasVariation = variance > 10;

    return (hasTransitions ? 0.3 : 0) +
           (properPunctuation ? 0.2 : 0) +
           (hasCapitalization ? 0.2 : 0) +
           (hasVariation ? 0.3 : 0.2);
  }
}