import { VercelRequest, VercelResponse } from '@vercel/node';
import { RAGProcessor } from '../_lib/rag-processor.js';
import { requireAuthWithSecurity, convertVercelRequest, enhancedAuth } from '../_lib/auth-enhanced.js';
import { chatRateLimiter } from '../_lib/rate-limiter.js';
import { supabaseAdmin } from '../_lib/auth.js';
import { knowledgePrecomputeService } from '../_lib/knowledge-precompute.js';
import OpenAI from 'openai';

// Knowledge intent types
export type KnowledgeIntent = 'explain' | 'background' | 'define';

// Request interface for knowledge API
interface KnowledgeRequest {
  bookId: string;
  intent: KnowledgeIntent;
  selection: {
    text: string;
    start?: number;
    end?: number;
    chapterId?: string;
  };
  featureToggle?: boolean; // For gradual rollout
}

// Enhanced response with source and confidence
interface KnowledgeResponse {
  intent: KnowledgeIntent;
  content: string;
  sources: Array<{
    chapter_idx: number;
    start: number;
    end: number;
    similarity: number;
    relevance: number;
  }>;
  confidence: number;
  qualityMetrics: {
    accuracy: number;
    relevance: number;
    completeness: number;
    clarity: number;
    overall: number;
  };
  metadata: {
    processingTime: number;
    tokensUsed: number;
    costUsd: number;
    model: string;
  };
}

// Feature toggle configuration
const KNOWLEDGE_FEATURE_CONFIG = {
  enabled: process.env.KNOWLEDGE_ENHANCEMENT_ENABLED !== 'false',
  rolloutPercentage: parseInt(process.env.KNOWLEDGE_ROLLOUT_PERCENTAGE || '100', 10),
  qualityThreshold: parseFloat(process.env.KNOWLEDGE_QUALITY_THRESHOLD || '0.7'),
  latencyThreshold: parseInt(process.env.KNOWLEDGE_LATENCY_THRESHOLD || '5000', 10) // ms
};

class KnowledgeEnhancementProcessor {
  private openai: OpenAI;
  private ragProcessor: RAGProcessor;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    this.ragProcessor = new RAGProcessor();
  }

  /**
   * Process knowledge enhancement request with progressive filling and early return
   */
  async *processKnowledgeRequest(request: KnowledgeRequest, userId: string): AsyncGenerator<{
    type: 'sources' | 'content' | 'usage' | 'done' | 'error' | 'early_content' | 'progressive_fill';
    data: any;
  }> {
    const startTime = Date.now();
    const firstByteTargetMs = 150; // Target: first byte in 150ms

    try {
      // Validate feature toggle
      if (!this.isFeatureEnabled(userId)) {
        yield {
          type: 'error',
          data: {
            code: 'FEATURE_DISABLED',
            message: 'Knowledge enhancement feature is not available'
          }
        };
        return;
      }

      // PROGRESSIVE FILLING STRATEGY 1: Check precomputed cache first (fastest)
      let precomputedContent = null;
      if (request.intent === 'background' || request.intent === 'define') {
        precomputedContent = await knowledgePrecomputeService.getPrecomputedContent(
          request.bookId,
          request.selection.chapterId || 'unknown',
          request.selection.text,
          request.intent
        );

        if (precomputedContent) {
          const firstByteTime = Date.now() - startTime;
          console.log(`⚡ First byte time: ${firstByteTime}ms (precomputed cache)`);

          // Emit early content immediately
          yield {
            type: 'early_content',
            data: {
              intent: request.intent,
              content: precomputedContent.content,
              sources: precomputedContent.sources,
              confidence: precomputedContent.confidence,
              qualityMetrics: precomputedContent.qualityMetrics,
              strategy: 'precomputed',
              firstByteTime
            }
          };

          // Still emit sources for consistency
          yield {
            type: 'sources',
            data: {
              sources: precomputedContent.sources,
              intent: request.intent,
              contextQuality: precomputedContent.qualityMetrics.overall,
              cached: true
            }
          };

          yield {
            type: 'usage',
            data: {
              tokensUsed: precomputedContent.metadata.tokensUsed,
              costUsd: this.calculateCost(precomputedContent.metadata.tokensUsed),
              processingTime: Date.now() - startTime,
              model: precomputedContent.metadata.model,
              qualityScore: precomputedContent.qualityMetrics.overall,
              strategy: 'precomputed_cache',
              firstByteTime,
              cached: true
            }
          };

          yield {
            type: 'done',
            data: {
              completed_at: Date.now(),
              processingTime: Date.now() - startTime,
              success: true,
              strategy: 'precomputed_cache'
            }
          };
          return;
        }
      }

      // PROGRESSIVE FILLING STRATEGY 2: Parallel context gathering + early sources
      const contextPromise = this.gatherContext(request.bookId, request.selection, request.intent);

      // Start with minimal context for early response (if within first byte target)
      let earlyResponseGenerated = false;

      // Set up a timeout to emit early response if context takes too long
      const earlyResponseTimeout = setTimeout(async () => {
        if (!earlyResponseGenerated && Date.now() - startTime > firstByteTargetMs) {
          try {
            // Generate basic response with minimal context
            const basicResponse = await this.generateBasicResponse(
              request.intent,
              request.selection.text
            );

            const firstByteTime = Date.now() - startTime;
            console.log(`⚡ First byte time: ${firstByteTime}ms (basic response)`);

            yield {
              type: 'early_content',
              data: {
                intent: request.intent,
                content: basicResponse.content,
                sources: [],
                confidence: 0.6,
                qualityMetrics: {
                  accuracy: 0.6,
                  relevance: 0.7,
                  completeness: 0.5,
                  clarity: 0.7,
                  overall: 0.6
                },
                strategy: 'basic_fast',
                firstByteTime,
                isProgressive: true
              }
            };

            earlyResponseGenerated = true;
          } catch (error) {
            console.warn('Early response generation failed:', error);
          }
        }
      }, firstByteTargetMs);

      // Await context gathering
      const context = await contextPromise;
      clearTimeout(earlyResponseTimeout);

      const contextGatherTime = Date.now() - startTime;

      // Emit sources (always beneficial to show sources early)
      yield {
        type: 'sources',
        data: {
          sources: context.sources,
          intent: request.intent,
          contextQuality: context.quality,
          gatherTime: contextGatherTime
        }
      };

      // PROGRESSIVE FILLING STRATEGY 3: Enhanced response if context is good
      let finalResponse: any;
      let qualityMetrics: any;

      if (context.quality > 0.6 && !earlyResponseGenerated) {
        // High-quality context available and no early response sent - generate full response
        finalResponse = await this.generateIntentResponse(
          request.intent,
          request.selection.text,
          context.content,
          context.sources
        );

        qualityMetrics = this.assessResponseQuality(
          finalResponse.content,
          request.selection.text,
          request.intent,
          context.sources
        );

        const firstByteTime = Date.now() - startTime;
        console.log(`⚡ First byte time: ${firstByteTime}ms (enhanced response)`);

      } else if (context.quality > 0.6 && earlyResponseGenerated) {
        // Enhanced response to improve on the early response
        finalResponse = await this.generateIntentResponse(
          request.intent,
          request.selection.text,
          context.content,
          context.sources
        );

        qualityMetrics = this.assessResponseQuality(
          finalResponse.content,
          request.selection.text,
          request.intent,
          context.sources
        );

        yield {
          type: 'progressive_fill',
          data: {
            intent: request.intent,
            content: finalResponse.content,
            sources: context.sources,
            confidence: qualityMetrics.overall,
            qualityMetrics,
            strategy: 'enhanced_progressive',
            improvementTime: Date.now() - startTime
          }
        };

      } else {
        // Low-quality context - generate fallback
        finalResponse = await this.generateFallbackResponse(
          request.intent,
          request.selection.text,
          context.content
        );

        qualityMetrics = this.assessResponseQuality(
          finalResponse.content,
          request.selection.text,
          request.intent,
          context.sources
        );

        if (!earlyResponseGenerated) {
          const firstByteTime = Date.now() - startTime;
          console.log(`⚡ First byte time: ${firstByteTime}ms (fallback response)`);
        }
      }

      // Emit final content (only if not already sent via progressive filling)
      if (!earlyResponseGenerated || (earlyResponseGenerated && context.quality > 0.6)) {
        yield {
          type: 'content',
          data: {
            intent: request.intent,
            content: finalResponse.content,
            sources: context.sources,
            confidence: qualityMetrics.overall,
            qualityMetrics,
            fallback: qualityMetrics.overall < KNOWLEDGE_FEATURE_CONFIG.qualityThreshold,
            strategy: earlyResponseGenerated ? 'progressive_enhanced' : 'standard'
          }
        };
      }

      const processingTime = Date.now() - startTime;

      // Emit usage information
      yield {
        type: 'usage',
        data: {
          tokensUsed: finalResponse.tokensUsed,
          costUsd: this.calculateCost(finalResponse.tokensUsed),
          processingTime,
          model: finalResponse.model,
          qualityScore: qualityMetrics.overall,
          strategy: earlyResponseGenerated ? 'progressive' : 'standard',
          firstByteTime: contextGatherTime < firstByteTargetMs ? contextGatherTime : firstByteTargetMs,
          contextGatherTime
        }
      };

      yield {
        type: 'done',
        data: {
          completed_at: Date.now(),
          processingTime,
          success: true
        }
      };

    } catch (error) {
      console.error('Knowledge enhancement failed:', error);
      yield {
        type: 'error',
        data: {
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Explain intent handler - provides clear explanations of concepts
   */
  private async generateExplainResponse(
    text: string,
    context: string,
    sources: any[]
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    const systemPrompt = `You are a knowledgeable reading assistant specializing in clear explanations.
Your task is to explain concepts, passages, or ideas in an accessible and comprehensive way.

Guidelines:
- Provide clear, structured explanations
- Use examples when helpful
- Break down complex ideas into understandable parts
- Connect to broader context when relevant
- Be precise but not overly technical
- Include why the concept matters

Response structure:
1. Core explanation (what it is)
2. Context and significance (why it matters)
3. Key relationships or examples
4. Practical implications if applicable

Keep explanations between 150-300 words for optimal comprehension.`;

    const userPrompt = `Please explain this text passage: "${text}"

Book context:
${context}

Sources used: ${sources.length} relevant passages from the book

Provide a comprehensive explanation that helps the reader understand the meaning, significance, and broader context of this passage.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
      model: 'gpt-4-turbo-preview'
    };
  }

  /**
   * Background intent handler - provides historical and cultural context
   */
  private async generateBackgroundResponse(
    text: string,
    context: string,
    sources: any[]
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    const systemPrompt = `You are a scholarly assistant specializing in historical and cultural background.
Your task is to provide rich contextual information that enhances understanding.

Guidelines:
- Focus on historical context, cultural significance, and background information
- Explain the broader circumstances or environment
- Include relevant historical events, cultural movements, or social contexts
- Connect to the time period or cultural setting
- Provide context that helps readers understand why things are as they are
- Be informative but engaging

Response structure:
1. Historical/cultural setting
2. Relevant background events or movements
3. Social or intellectual context
4. Connections to broader themes or patterns
5. Why this background matters for understanding

Aim for 200-350 words to provide substantial context.`;

    const userPrompt = `Please provide historical and cultural background for: "${text}"

Book context:
${context}

Sources used: ${sources.length} relevant passages from the book

Explain the historical context, cultural significance, and background information that would help a reader better understand this passage.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 900
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
      model: 'gpt-4-turbo-preview'
    };
  }

  /**
   * Define intent handler - provides precise definitions and terminology
   */
  private async generateDefineResponse(
    text: string,
    context: string,
    sources: any[]
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    const systemPrompt = `You are a precise assistant specializing in definitions and terminology.
Your task is to provide clear, accurate definitions of terms, concepts, and ideas.

Guidelines:
- Identify key terms or concepts in the text
- Provide precise, authoritative definitions
- Explain technical or specialized terminology
- Include etymology when relevant
- Distinguish between different meanings in different contexts
- Be concise but comprehensive
- Use examples to clarify meaning

Response structure:
1. Primary definition(s) of key terms
2. Context-specific meaning in this text
3. Alternative or related meanings if relevant
4. Examples or applications
5. Common usage or importance

Keep definitions clear and focused, typically 100-250 words.`;

    const userPrompt = `Please define the key terms and concepts in: "${text}"

Book context:
${context}

Sources used: ${sources.length} relevant passages from the book

Provide clear, precise definitions of the important terms or concepts in this passage, focusing on their meaning within this specific context.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2, // Lower temperature for more precise definitions
      max_tokens: 700
    });

    return {
      content: response.choices[0]?.message?.content || '',
      tokensUsed: response.usage?.total_tokens || 0,
      model: 'gpt-4-turbo-preview'
    };
  }

  /**
   * Generate intent-specific response using appropriate handler
   */
  private async generateIntentResponse(
    intent: KnowledgeIntent,
    text: string,
    context: string,
    sources: any[]
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    switch (intent) {
      case 'explain':
        return this.generateExplainResponse(text, context, sources);
      case 'background':
        return this.generateBackgroundResponse(text, context, sources);
      case 'define':
        return this.generateDefineResponse(text, context, sources);
      default:
        throw new Error(`Unsupported intent: ${intent}`);
    }
  }

  /**
   * Gather enhanced context using RAG processor
   */
  private async gatherContext(
    bookId: string,
    selection: { text: string; chapterId?: string },
    intent: KnowledgeIntent
  ): Promise<{ content: string; sources: any[]; quality: number }> {
    try {
      // Check if book is processed for RAG
      const isProcessed = await this.ragProcessor.isBookProcessed(bookId);

      if (!isProcessed) {
        console.warn(`Book ${bookId} not processed for RAG, using limited context`);
        return {
          content: `Selected text: "${selection.text}"`,
          sources: [],
          quality: 0.3
        };
      }

      // Build intent-specific query
      const enhancedQuery = this.buildIntentQuery(selection.text, intent);

      // Use RAG processor to get relevant context
      const ragRequest = {
        book_id: bookId,
        message: enhancedQuery,
        selection: selection.text,
        chapter_idx: selection.chapterId ? parseInt(selection.chapterId) : undefined
      };

      // Collect context from RAG stream
      let context = '';
      let sources: any[] = [];
      let tokensUsed = 0;

      const streamGenerator = this.ragProcessor.streamChatResponse(ragRequest);

      for await (const chunk of streamGenerator) {
        if (chunk.type === 'sources') {
          sources = chunk.data || [];
        } else if (chunk.type === 'token') {
          context += chunk.data;
        } else if (chunk.type === 'usage') {
          tokensUsed = chunk.data.total_tokens || 0;
        }
      }

      // Calculate context quality based on sources and relevance
      const quality = this.assessContextQuality(sources, context, selection.text);

      return {
        content: context || `Selected text: "${selection.text}"`,
        sources: sources.map(source => ({
          ...source,
          relevance: this.calculateSourceRelevance(source, selection.text, intent)
        })),
        quality
      };

    } catch (error) {
      console.warn('Failed to gather enhanced context:', error);
      return {
        content: `Selected text: "${selection.text}"`,
        sources: [],
        quality: 0.2
      };
    }
  }

  /**
   * Build intent-specific queries for better RAG retrieval
   */
  private buildIntentQuery(text: string, intent: KnowledgeIntent): string {
    const baseQuery = `Provide context for: "${text}"`;

    switch (intent) {
      case 'explain':
        return `${baseQuery} - Focus on explanations, meanings, significance, and how this concept or passage relates to the broader work.`;

      case 'background':
        return `${baseQuery} - Focus on historical context, cultural background, setting, and circumstances that provide deeper understanding.`;

      case 'define':
        return `${baseQuery} - Focus on definitions, terminology, technical concepts, and precise meanings of key terms.`;

      default:
        return baseQuery;
    }
  }

  /**
   * Calculate relevance score for sources based on intent
   */
  private calculateSourceRelevance(source: any, selectionText: string, intent: KnowledgeIntent): number {
    let relevance = source.similarity || 0.5;

    // Boost relevance based on intent-specific keywords
    const sourceContent = (source.content || '').toLowerCase();
    const selectionLower = selectionText.toLowerCase();

    switch (intent) {
      case 'explain':
        // Boost for explanatory terms
        const explainKeywords = ['because', 'therefore', 'means', 'refers to', 'example', 'instance'];
        const explainMatches = explainKeywords.filter(kw => sourceContent.includes(kw)).length;
        relevance += explainMatches * 0.1;
        break;

      case 'background':
        // Boost for contextual terms
        const backgroundKeywords = ['historical', 'context', 'period', 'era', 'during', 'time', 'cultural'];
        const backgroundMatches = backgroundKeywords.filter(kw => sourceContent.includes(kw)).length;
        relevance += backgroundMatches * 0.1;
        break;

      case 'define':
        // Boost for definitional terms
        const defineKeywords = ['definition', 'term', 'concept', 'refers to', 'means', 'called'];
        const defineMatches = defineKeywords.filter(kw => sourceContent.includes(kw)).length;
        relevance += defineMatches * 0.1;
        break;
    }

    // Boost if source contains words from selection
    const selectionWords = selectionLower.split(/\s+/).filter(w => w.length > 3);
    const matchingWords = selectionWords.filter(w => sourceContent.includes(w)).length;
    relevance += (matchingWords / selectionWords.length) * 0.2;

    return Math.min(1.0, relevance);
  }

  /**
   * Assess quality of gathered context
   */
  private assessContextQuality(sources: any[], context: string, selectionText: string): number {
    if (!sources.length || !context) return 0.1;

    // Base quality from number and quality of sources
    const sourceQuality = Math.min(1.0, sources.length / 5) * 0.4;

    // Content relevance
    const contentWords = context.toLowerCase().split(/\s+/);
    const selectionWords = selectionText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const overlap = selectionWords.filter(w => contentWords.includes(w)).length;
    const relevanceQuality = (overlap / selectionWords.length) * 0.4;

    // Content length and structure
    const lengthQuality = Math.min(1.0, context.length / 500) * 0.2;

    return sourceQuality + relevanceQuality + lengthQuality;
  }

  /**
   * Generate basic response for early return (minimal latency)
   */
  private async generateBasicResponse(
    intent: KnowledgeIntent,
    text: string
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    const systemPrompt = `You are a helpful reading assistant. Provide a brief, clear response without external context.`;

    let userPrompt = '';
    switch (intent) {
      case 'explain':
        userPrompt = `Briefly explain: "${text}"`;
        break;
      case 'background':
        userPrompt = `Provide basic background for: "${text}"`;
        break;
      case 'define':
        userPrompt = `Define key terms in: "${text}"`;
        break;
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 150 // Minimal tokens for speed
    });

    return {
      content: response.choices[0]?.message?.content || 'Unable to provide response.',
      tokensUsed: response.usage?.total_tokens || 0,
      model: 'gpt-3.5-turbo'
    };
  }

  /**
   * Generate fallback response for low-quality cases
   */
  private async generateFallbackResponse(
    intent: KnowledgeIntent,
    text: string,
    context: string
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    const systemPrompt = `You are a helpful reading assistant. Provide a clear, concise response based on the intent type and available context.`;

    let userPrompt = '';
    switch (intent) {
      case 'explain':
        userPrompt = `Please provide a basic explanation of: "${text}"\n\nContext: ${context}`;
        break;
      case 'background':
        userPrompt = `Please provide basic background information for: "${text}"\n\nContext: ${context}`;
        break;
      case 'define':
        userPrompt = `Please provide basic definitions for key terms in: "${text}"\n\nContext: ${context}`;
        break;
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 400
    });

    return {
      content: response.choices[0]?.message?.content || 'Unable to provide response.',
      tokensUsed: response.usage?.total_tokens || 0,
      model: 'gpt-3.5-turbo'
    };
  }

  /**
   * Assess quality of generated response
   */
  private assessResponseQuality(
    content: string,
    originalText: string,
    intent: KnowledgeIntent,
    sources: any[]
  ): {
    accuracy: number;
    relevance: number;
    completeness: number;
    clarity: number;
    overall: number;
  } {
    const contentLower = content.toLowerCase();
    const originalLower = originalText.toLowerCase();

    // Calculate accuracy based on content quality indicators
    let accuracy = 0.8; // Base accuracy

    // Reduce if content is too short
    if (content.length < 100) accuracy -= 0.2;

    // Boost if content has good structure
    if (content.includes('\n') || content.includes('•') || content.includes(':')) {
      accuracy += 0.1;
    }

    // Calculate relevance based on keyword overlap and intent appropriateness
    const originalWords = originalLower.split(/\s+/).filter(w => w.length > 3);
    const contentWords = contentLower.split(/\s+/);
    const overlap = originalWords.filter(w => contentWords.includes(w)).length;
    let relevance = overlap / originalWords.length;

    // Intent-specific relevance adjustments
    switch (intent) {
      case 'explain':
        if (contentLower.includes('explain') || contentLower.includes('meaning') || contentLower.includes('refers to')) {
          relevance += 0.2;
        }
        break;
      case 'background':
        if (contentLower.includes('context') || contentLower.includes('historical') || contentLower.includes('background')) {
          relevance += 0.2;
        }
        break;
      case 'define':
        if (contentLower.includes('definition') || contentLower.includes('means') || contentLower.includes('term')) {
          relevance += 0.2;
        }
        break;
    }

    // Calculate completeness based on content depth and source usage
    const wordCount = content.split(/\s+/).length;
    let completeness = Math.min(1.0, wordCount / 200); // Expect at least 200 words for full completeness

    // Boost if multiple sources were used effectively
    if (sources.length > 2) completeness += 0.1;
    if (sources.length > 4) completeness += 0.1;

    // Calculate clarity based on structure and readability
    let clarity = 0.7; // Base clarity

    // Check for good structure
    const sentences = content.split(/[.!?]/).filter(s => s.trim().length > 0);
    const avgSentenceLength = content.length / sentences.length;

    if (avgSentenceLength > 20 && avgSentenceLength < 100) {
      clarity += 0.1; // Good sentence length
    }

    if (sentences.length >= 3) {
      clarity += 0.1; // Multiple sentences for depth
    }

    if (content.includes('1.') || content.includes('•') || content.includes('First,')) {
      clarity += 0.1; // Structured presentation
    }

    // Calculate overall score with weights
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

  /**
   * Calculate cost for API usage
   */
  private calculateCost(tokens: number): number {
    // GPT-4 pricing: ~$0.03 per 1K tokens input, ~$0.06 per 1K tokens output
    // Estimate 70% input, 30% output
    const inputTokens = tokens * 0.7;
    const outputTokens = tokens * 0.3;
    return (inputTokens / 1000) * 0.03 + (outputTokens / 1000) * 0.06;
  }

  /**
   * Check if feature is enabled for user (feature toggle)
   */
  private isFeatureEnabled(userId: string): boolean {
    if (!KNOWLEDGE_FEATURE_CONFIG.enabled) {
      return false;
    }

    // Simple hash-based rollout
    const hash = this.simpleHash(userId);
    const userPercentile = hash % 100;

    return userPercentile < KNOWLEDGE_FEATURE_CONFIG.rolloutPercentage;
  }

  /**
   * Simple hash function for consistent user assignment
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * API endpoint handler for knowledge enhancement
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Convert VercelRequest to standard Request for enhanced auth
    const standardReq = convertVercelRequest(req);

    // Apply rate limiting
    const rateLimitResult = await chatRateLimiter.checkLimit(standardReq);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          retryAfter: rateLimitResult.retryAfter
        }
      });
    }

    // Enhanced authentication
    let user;
    try {
      user = await requireAuthWithSecurity(standardReq);
    } catch (authError: any) {
      const statusCode = authError.message?.includes('Rate limit') ? 429 : 401;
      return res.status(statusCode).json({
        error: authError.message || 'Authentication required'
      });
    }

    const { bookId, intent, selection, featureToggle } = req.body as KnowledgeRequest;

    // Validate required fields
    if (!bookId || !intent || !selection?.text) {
      return res.status(400).json({
        error: 'Missing required fields: bookId, intent, and selection.text'
      });
    }

    // Validate intent
    if (!['explain', 'background', 'define'].includes(intent)) {
      return res.status(422).json({
        error: 'Invalid intent. Must be one of: explain, background, define'
      });
    }

    // Validate selection text length
    if (selection.text.length > 1000) {
      return res.status(422).json({
        error: 'Selection text too long. Maximum 1000 characters allowed'
      });
    }

    if (selection.text.length < 10) {
      return res.status(422).json({
        error: 'Selection text too short. Minimum 10 characters required'
      });
    }

    // Verify book access
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('owner_id', user.id)
      .single();

    if (bookError || !book) {
      // Log security event
      await enhancedAuth.logSecurityEvent(
        'unauthorized_book_access',
        user.id,
        {
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          endpoint: 'POST /api/chat/knowledge'
        },
        {
          book_id: bookId,
          error: bookError?.message || 'Book not found'
        },
        'medium'
      );

      const statusCode = bookError?.code === 'PGRST116' ? 404 : 403;
      return res.status(statusCode).json({
        error: statusCode === 404 ? 'Book not found' : 'Access denied'
      });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Initialize knowledge processor
    const processor = new KnowledgeEnhancementProcessor();

    // Process knowledge request
    const streamGenerator = processor.processKnowledgeRequest({
      bookId,
      intent,
      selection,
      featureToggle
    }, user.id);

    for await (const chunk of streamGenerator) {
      switch (chunk.type) {
        case 'sources':
          res.write('event: sources\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;

        case 'content':
          res.write('event: content\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;

        case 'usage':
          res.write('event: usage\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;

        case 'done':
          res.write('event: done\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;

        case 'error':
          res.write('event: error\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;
      }

      if (res.destroyed) {
        break;
      }
    }

    res.end();

  } catch (error) {
    console.error('Knowledge API error:', error);

    // Log security event for system errors
    try {
      const standardReq = convertVercelRequest(req);
      await enhancedAuth.logSecurityEvent(
        'system_error',
        null,
        {
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          endpoint: 'POST /api/chat/knowledge'
        },
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        },
        'critical'
      );
    } catch (logError) {
      console.error('Failed to log security event:', logError);
    }

    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write('event: error\n');
      res.write('data: {"error": "Internal server error"}\n\n');
      res.end();
    }
  }
}