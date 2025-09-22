/**
 * Knowledge Precomputation System
 *
 * Precomputes common knowledge enhancement content (definitions, background)
 * with segmented caching at chapter and concept granularity for optimal
 * latency reduction while maintaining quality.
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './auth.js';
import { RAGProcessor } from './rag-processor.js';

// Cache key interfaces for segmented storage
interface ConceptCacheKey {
  bookId: string;
  chapterId: string;
  conceptHash: string; // Hash of normalized concept text
  intent: 'background' | 'define';
}

interface PrecomputedContent {
  intent: 'background' | 'define';
  content: string;
  confidence: number;
  qualityMetrics: {
    accuracy: number;
    relevance: number;
    completeness: number;
    clarity: number;
    overall: number;
  };
  metadata: {
    tokensUsed: number;
    model: string;
    generatedAt: number;
    expiresAt: number;
  };
  sources: Array<{
    chapter_idx: number;
    start: number;
    end: number;
    similarity: number;
  }>;
}

interface ChapterConcepts {
  chapterId: string;
  concepts: Array<{
    text: string;
    conceptHash: string;
    frequency: number;
    importance: number;
    position: number;
  }>;
}

export class KnowledgePrecomputeService {
  private openai: OpenAI;
  private ragProcessor: RAGProcessor;
  private readonly CONCEPT_MIN_LENGTH = 10;
  private readonly CONCEPT_MAX_LENGTH = 200;
  private readonly CACHE_TTL_HOURS = 24 * 7; // 7 days
  private readonly BATCH_SIZE = 5;
  private readonly QUALITY_THRESHOLD = 0.7;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    this.ragProcessor = new RAGProcessor();
  }

  /**
   * Precompute knowledge enhancement content for a book
   * Main entry point for background processing
   */
  async precomputeBookKnowledge(
    bookId: string,
    userId: string,
    options: {
      chapterLimit?: number;
      conceptLimit?: number;
      intents?: Array<'background' | 'define'>;
      forceRecompute?: boolean;
    } = {}
  ): Promise<{
    chaptersProcessed: number;
    conceptsPrecomputed: number;
    backgroundGenerated: number;
    definitionsGenerated: number;
    totalTokensUsed: number;
    estimatedLatencyReduction: number;
  }> {
    const startTime = Date.now();

    console.log(`🧠 Starting knowledge precomputation for book ${bookId}`);

    // Verify book access and authorization
    await this.verifyBookAccess(bookId, userId);

    // Extract concepts from all chapters
    const chapterConcepts = await this.extractBookConcepts(bookId, options.chapterLimit);

    let backgroundGenerated = 0;
    let definitionsGenerated = 0;
    let totalTokens = 0;

    const intents = options.intents || ['background', 'define'];

    // Process concepts in batches to avoid overwhelming the API
    for (const chapterConcept of chapterConcepts) {
      const conceptsToProcess = chapterConcept.concepts
        .slice(0, options.conceptLimit || 20)
        .filter(c => c.importance > 0.5); // Only high-importance concepts

      // Process in smaller batches
      for (let i = 0; i < conceptsToProcess.length; i += this.BATCH_SIZE) {
        const batch = conceptsToProcess.slice(i, i + this.BATCH_SIZE);

        for (const intent of intents) {
          const batchResults = await Promise.allSettled(
            batch.map(concept =>
              this.precomputeConceptContent(
                bookId,
                chapterConcept.chapterId,
                concept,
                intent,
                options.forceRecompute
              )
            )
          );

          // Count successful generations
          batchResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
              totalTokens += result.value.tokensUsed;
              if (intent === 'background') backgroundGenerated++;
              if (intent === 'define') definitionsGenerated++;
            }
          });

          // Rate limiting: small delay between batches
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    const processingTime = Date.now() - startTime;
    const avgLatencyReduction = this.estimateLatencyReduction(
      backgroundGenerated + definitionsGenerated,
      totalTokens
    );

    console.log(`✅ Knowledge precomputation completed in ${processingTime}ms`);

    return {
      chaptersProcessed: chapterConcepts.length,
      conceptsPrecomputed: backgroundGenerated + definitionsGenerated,
      backgroundGenerated,
      definitionsGenerated,
      totalTokensUsed: totalTokens,
      estimatedLatencyReduction: avgLatencyReduction
    };
  }

  /**
   * Get precomputed content for a concept with fallback
   */
  async getPrecomputedContent(
    bookId: string,
    chapterId: string,
    conceptText: string,
    intent: 'background' | 'define'
  ): Promise<PrecomputedContent | null> {
    try {
      const conceptHash = this.hashConcept(conceptText);

      // Check cache first
      const cached = await this.getCachedContent({
        bookId,
        chapterId,
        conceptHash,
        intent
      });

      if (cached && this.isContentValid(cached)) {
        console.log(`💰 Using precomputed ${intent} for concept in chapter ${chapterId}`);
        return cached;
      }

      // Check for similar concepts in same chapter
      const similar = await this.findSimilarCachedContent(
        bookId,
        chapterId,
        conceptText,
        intent
      );

      if (similar && this.isContentValid(similar)) {
        console.log(`🔍 Using similar precomputed ${intent} for concept in chapter ${chapterId}`);
        return similar;
      }

      return null;
    } catch (error) {
      console.warn(`Failed to get precomputed content: ${error}`);
      return null;
    }
  }

  /**
   * Extract high-value concepts from book chapters
   */
  private async extractBookConcepts(
    bookId: string,
    chapterLimit?: number
  ): Promise<ChapterConcepts[]> {
    // Get chapters for the book
    const { data: chapters, error } = await supabaseAdmin
      .from('chapters')
      .select('id, idx, content, title')
      .eq('book_id', bookId)
      .order('idx')
      .limit(chapterLimit || 50);

    if (error || !chapters) {
      throw new Error(`Failed to load chapters: ${error?.message}`);
    }

    const conceptsPerChapter: ChapterConcepts[] = [];

    for (const chapter of chapters) {
      const concepts = await this.extractConceptsFromText(
        chapter.content,
        chapter.title || `Chapter ${chapter.idx + 1}`
      );

      conceptsPerChapter.push({
        chapterId: chapter.id,
        concepts: concepts.map(concept => ({
          ...concept,
          conceptHash: this.hashConcept(concept.text)
        }))
      });
    }

    return conceptsPerChapter;
  }

  /**
   * Extract key concepts from chapter text using NLP patterns
   */
  private async extractConceptsFromText(
    text: string,
    chapterTitle: string
  ): Promise<Array<{
    text: string;
    frequency: number;
    importance: number;
    position: number;
  }>> {
    // Use GPT to identify key concepts that would benefit from enhancement
    const systemPrompt = `You are a concept extraction expert. Identify key terms, concepts, and ideas from the given text that readers would commonly want definitions or background information for.

Focus on:
- Technical terms and jargon
- Historical figures, places, events
- Complex concepts or theories
- Important themes or ideas
- Specialized vocabulary

Return a JSON array of objects with:
- text: the concept text (10-200 characters)
- importance: score 0-1 indicating how valuable this concept is for enhancement
- reasoning: brief explanation of why this concept is important

Extract 5-15 concepts maximum. Focus on quality over quantity.`;

    const userPrompt = `Chapter: "${chapterTitle}"

Text:
${text.substring(0, 3000)}...

Extract key concepts that would benefit from definitions or background information.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      // Parse JSON response
      const concepts = JSON.parse(content);

      if (!Array.isArray(concepts)) return [];

      // Add frequency and position data
      return concepts
        .filter(c =>
          c.text &&
          c.text.length >= this.CONCEPT_MIN_LENGTH &&
          c.text.length <= this.CONCEPT_MAX_LENGTH &&
          c.importance > 0.3
        )
        .map((concept, index) => {
          const regex = new RegExp(concept.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          const matches = text.match(regex) || [];
          const frequency = matches.length;
          const firstOccurrence = text.toLowerCase().indexOf(concept.text.toLowerCase());
          const position = firstOccurrence >= 0 ? firstOccurrence / text.length : 1;

          return {
            text: concept.text,
            frequency,
            importance: concept.importance,
            position
          };
        })
        .sort((a, b) => b.importance - a.importance);

    } catch (error) {
      console.warn(`Failed to extract concepts: ${error}`);
      // Fallback to simple pattern-based extraction
      return this.fallbackConceptExtraction(text);
    }
  }

  /**
   * Fallback concept extraction using simple patterns
   */
  private fallbackConceptExtraction(text: string): Array<{
    text: string;
    frequency: number;
    importance: number;
    position: number;
  }> {
    const concepts: Map<string, { frequency: number; position: number }> = new Map();

    // Look for capitalized phrases, quoted terms, and technical patterns
    const patterns = [
      /[A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g, // Proper nouns
      /"([^"]{10,100})"/g, // Quoted terms
      /\b[A-Z][a-z]*(?:[- ][A-Z][a-z]*)*\b/g, // Capitalized terms
    ];

    patterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        const cleaned = match.replace(/[""]/g, '');
        if (cleaned.length >= this.CONCEPT_MIN_LENGTH && cleaned.length <= this.CONCEPT_MAX_LENGTH) {
          const existing = concepts.get(cleaned) || { frequency: 0, position: 1 };
          const position = text.indexOf(match) / text.length;
          concepts.set(cleaned, {
            frequency: existing.frequency + 1,
            position: Math.min(existing.position, position)
          });
        }
      });
    });

    return Array.from(concepts.entries())
      .map(([text, data]) => ({
        text,
        frequency: data.frequency,
        importance: Math.min(1, data.frequency * 0.3 + (1 - data.position) * 0.4),
        position: data.position
      }))
      .filter(c => c.importance > 0.2)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);
  }

  /**
   * Precompute content for a specific concept
   */
  private async precomputeConceptContent(
    bookId: string,
    chapterId: string,
    concept: { text: string; conceptHash: string; importance: number },
    intent: 'background' | 'define',
    forceRecompute: boolean = false
  ): Promise<{ tokensUsed: number } | null> {
    try {
      // Check if already cached and not expired
      if (!forceRecompute) {
        const existing = await this.getCachedContent({
          bookId,
          chapterId,
          conceptHash: concept.conceptHash,
          intent
        });

        if (existing && this.isContentValid(existing)) {
          return null; // Already cached
        }
      }

      // Generate enhanced context using RAG
      const context = await this.gatherConceptContext(bookId, concept.text, chapterId);

      // Generate intent-specific content
      const generated = await this.generateConceptContent(
        concept.text,
        context.content,
        context.sources,
        intent
      );

      // Assess quality
      const qualityMetrics = this.assessConceptQuality(
        generated.content,
        concept.text,
        intent,
        context.sources
      );

      // Only cache high-quality content
      if (qualityMetrics.overall >= this.QUALITY_THRESHOLD) {
        const precomputedContent: PrecomputedContent = {
          intent,
          content: generated.content,
          confidence: qualityMetrics.overall,
          qualityMetrics,
          metadata: {
            tokensUsed: generated.tokensUsed,
            model: generated.model,
            generatedAt: Date.now(),
            expiresAt: Date.now() + (this.CACHE_TTL_HOURS * 60 * 60 * 1000)
          },
          sources: context.sources
        };

        await this.setCachedContent({
          bookId,
          chapterId,
          conceptHash: concept.conceptHash,
          intent
        }, precomputedContent);

        console.log(`✨ Precomputed ${intent} for "${concept.text}" (quality: ${qualityMetrics.overall.toFixed(2)})`);

        return { tokensUsed: generated.tokensUsed };
      } else {
        console.log(`⚠️ Low quality ${intent} for "${concept.text}" (quality: ${qualityMetrics.overall.toFixed(2)}) - not cached`);
        return null;
      }

    } catch (error) {
      console.warn(`Failed to precompute ${intent} for "${concept.text}":`, error);
      return null;
    }
  }

  /**
   * Gather enhanced context for a concept using RAG
   */
  private async gatherConceptContext(
    bookId: string,
    conceptText: string,
    chapterId?: string
  ): Promise<{ content: string; sources: any[]; quality: number }> {
    try {
      // Check if book is processed for RAG
      const isProcessed = await this.ragProcessor.isBookProcessed(bookId);

      if (!isProcessed) {
        return {
          content: `Concept: "${conceptText}"`,
          sources: [],
          quality: 0.3
        };
      }

      // Build concept-specific query
      const enhancedQuery = `Provide context, background, and information about: "${conceptText}"`;

      // Use RAG processor to get relevant context
      const ragRequest = {
        book_id: bookId,
        message: enhancedQuery,
        selection: conceptText,
        chapter_idx: chapterId ? parseInt(chapterId) : undefined
      };

      // Collect context from RAG stream
      let context = '';
      let sources: any[] = [];

      const streamGenerator = this.ragProcessor.streamChatResponse(ragRequest);

      for await (const chunk of streamGenerator) {
        if (chunk.type === 'sources') {
          sources = chunk.data || [];
        } else if (chunk.type === 'token') {
          context += chunk.data;
        }
      }

      // Calculate context quality
      const quality = this.assessContextQuality(sources, context, conceptText);

      return {
        content: context || `Concept: "${conceptText}"`,
        sources: sources.map(source => ({
          ...source,
          relevance: this.calculateConceptRelevance(source, conceptText)
        })),
        quality
      };

    } catch (error) {
      console.warn('Failed to gather concept context:', error);
      return {
        content: `Concept: "${conceptText}"`,
        sources: [],
        quality: 0.2
      };
    }
  }

  /**
   * Generate content for a specific concept and intent
   */
  private async generateConceptContent(
    conceptText: string,
    context: string,
    sources: any[],
    intent: 'background' | 'define'
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    let systemPrompt: string;
    let userPrompt: string;
    let model = 'gpt-3.5-turbo';
    let maxTokens = 500;

    if (intent === 'background') {
      systemPrompt = `You are a scholarly assistant providing historical and cultural background.
Provide rich contextual information that enhances understanding of concepts.

Guidelines:
- Focus on historical context, cultural significance, and background
- Explain the broader circumstances or environment
- Include relevant historical events, cultural movements, or social contexts
- Connect to time period or cultural setting
- Be informative but engaging
- 150-250 words for optimal comprehension`;

      userPrompt = `Provide historical and cultural background for: "${conceptText}"

Context from book:
${context}

Sources: ${sources.length} relevant passages

Explain the historical context, cultural significance, and background information that helps understand this concept.`;

    } else { // define
      systemPrompt = `You are a precise assistant providing clear definitions and terminology.
Provide accurate, authoritative definitions of terms and concepts.

Guidelines:
- Identify key terms or concepts
- Provide precise, authoritative definitions
- Explain technical or specialized terminology
- Include etymology when relevant
- Distinguish between different meanings in different contexts
- Use examples to clarify meaning
- 100-200 words for clarity`;

      userPrompt = `Define the key terms and concepts in: "${conceptText}"

Context from book:
${context}

Sources: ${sources.length} relevant passages

Provide clear, precise definitions of the important terms or concepts, focusing on their meaning within this specific context.`;
    }

    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: intent === 'define' ? 0.2 : 0.3,
      max_tokens: maxTokens
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
      model
    };
  }

  /**
   * Cache management methods
   */
  private async getCachedContent(key: ConceptCacheKey): Promise<PrecomputedContent | null> {
    try {
      const cacheKey = this.buildCacheKey(key);

      const { data, error } = await supabaseAdmin
        .from('knowledge_cache')
        .select('content')
        .eq('cache_key', cacheKey)
        .single();

      if (error || !data) return null;

      return JSON.parse(data.content) as PrecomputedContent;
    } catch (error) {
      console.warn('Failed to get cached content:', error);
      return null;
    }
  }

  private async setCachedContent(key: ConceptCacheKey, content: PrecomputedContent): Promise<void> {
    try {
      const cacheKey = this.buildCacheKey(key);

      await supabaseAdmin
        .from('knowledge_cache')
        .upsert({
          cache_key: cacheKey,
          book_id: key.bookId,
          chapter_id: key.chapterId,
          intent: key.intent,
          content: JSON.stringify(content),
          expires_at: new Date(content.metadata.expiresAt).toISOString(),
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.warn('Failed to cache content:', error);
    }
  }

  private async findSimilarCachedContent(
    bookId: string,
    chapterId: string,
    conceptText: string,
    intent: 'background' | 'define'
  ): Promise<PrecomputedContent | null> {
    // Simple similarity search - could be enhanced with vector similarity
    try {
      const { data, error } = await supabaseAdmin
        .from('knowledge_cache')
        .select('content, cache_key')
        .eq('book_id', bookId)
        .eq('chapter_id', chapterId)
        .eq('intent', intent)
        .gte('expires_at', new Date().toISOString());

      if (error || !data || data.length === 0) return null;

      // Find best text similarity match
      let bestMatch: PrecomputedContent | null = null;
      let bestSimilarity = 0;

      for (const row of data) {
        const cached = JSON.parse(row.content) as PrecomputedContent;
        // Extract concept from cache key for similarity comparison
        const similarity = this.calculateTextSimilarity(conceptText, row.cache_key);

        if (similarity > bestSimilarity && similarity > 0.7) {
          bestSimilarity = similarity;
          bestMatch = cached;
        }
      }

      return bestMatch;
    } catch (error) {
      console.warn('Failed to find similar cached content:', error);
      return null;
    }
  }

  /**
   * Utility methods
   */
  private buildCacheKey(key: ConceptCacheKey): string {
    return `${key.bookId}:${key.chapterId}:${key.conceptHash}:${key.intent}`;
  }

  private hashConcept(text: string): string {
    // Simple hash function for concept normalization
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private isContentValid(content: PrecomputedContent): boolean {
    return content.metadata.expiresAt > Date.now() &&
           content.qualityMetrics.overall >= this.QUALITY_THRESHOLD;
  }

  private calculateConceptRelevance(source: any, conceptText: string): number {
    const sourceContent = (source.content || '').toLowerCase();
    const conceptLower = conceptText.toLowerCase();

    // Simple keyword matching - could be enhanced with embeddings
    const conceptWords = conceptLower.split(/\s+/).filter(w => w.length > 3);
    const matchingWords = conceptWords.filter(w => sourceContent.includes(w)).length;

    return matchingWords / Math.max(conceptWords.length, 1);
  }

  private assessContextQuality(sources: any[], context: string, conceptText: string): number {
    if (!sources.length || !context) return 0.1;

    const sourceQuality = Math.min(1.0, sources.length / 3) * 0.4;
    const contentWords = context.toLowerCase().split(/\s+/);
    const conceptWords = conceptText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const overlap = conceptWords.filter(w => contentWords.includes(w)).length;
    const relevanceQuality = (overlap / conceptWords.length) * 0.4;
    const lengthQuality = Math.min(1.0, context.length / 300) * 0.2;

    return sourceQuality + relevanceQuality + lengthQuality;
  }

  private assessConceptQuality(
    content: string,
    conceptText: string,
    intent: 'background' | 'define',
    sources: any[]
  ): {
    accuracy: number;
    relevance: number;
    completeness: number;
    clarity: number;
    overall: number;
  } {
    const contentLower = content.toLowerCase();
    const conceptLower = conceptText.toLowerCase();

    // Base accuracy
    let accuracy = 0.8;
    if (content.length < 50) accuracy -= 0.3;
    if (content.includes('\n') || content.includes(':')) accuracy += 0.1;

    // Relevance based on keyword overlap and intent appropriateness
    const conceptWords = conceptLower.split(/\s+/).filter(w => w.length > 3);
    const contentWords = contentLower.split(/\s+/);
    const overlap = conceptWords.filter(w => contentWords.includes(w)).length;
    let relevance = overlap / conceptWords.length;

    // Intent-specific boosts
    if (intent === 'background') {
      if (contentLower.includes('context') || contentLower.includes('historical') || contentLower.includes('background')) {
        relevance += 0.2;
      }
    } else if (intent === 'define') {
      if (contentLower.includes('definition') || contentLower.includes('means') || contentLower.includes('refers to')) {
        relevance += 0.2;
      }
    }

    // Completeness
    const wordCount = content.split(/\s+/).length;
    let completeness = Math.min(1.0, wordCount / 150);
    if (sources.length > 2) completeness += 0.1;

    // Clarity
    let clarity = 0.7;
    const sentences = content.split(/[.!?]/).filter(s => s.trim().length > 0);
    const avgSentenceLength = content.length / sentences.length;
    if (avgSentenceLength > 20 && avgSentenceLength < 100) clarity += 0.1;
    if (sentences.length >= 2) clarity += 0.1;
    if (content.includes('1.') || content.includes('•')) clarity += 0.1;

    const overall = (
      accuracy * 0.25 +
      relevance * 0.35 +
      completeness * 0.2 +
      clarity * 0.2
    );

    return {
      accuracy: Math.min(1.0, accuracy),
      relevance: Math.min(1.0, relevance),
      completeness: Math.min(1.0, completeness),
      clarity: Math.min(1.0, clarity),
      overall: Math.min(1.0, overall)
    };
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private estimateLatencyReduction(conceptsPrecomputed: number, tokensUsed: number): number {
    // Estimate latency reduction based on precomputed content
    // Avg knowledge enhancement latency: ~1200ms
    // Avg cache lookup latency: ~50ms
    // Reduction = (1200ms - 50ms) * cache_hit_rate
    const estimatedCacheHitRate = Math.min(0.8, conceptsPrecomputed / 100);
    return (1200 - 50) * estimatedCacheHitRate;
  }

  private async verifyBookAccess(bookId: string, userId: string): Promise<void> {
    const { data: book, error } = await supabaseAdmin
      .from('books')
      .select('id, owner_id')
      .eq('id', bookId)
      .eq('owner_id', userId)
      .single();

    if (error || !book) {
      throw new Error('Unauthorized access to book or book not found');
    }
  }
}

// Export singleton instance
export const knowledgePrecomputeService = new KnowledgePrecomputeService();