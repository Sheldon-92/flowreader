/**
 * Knowledge Enhancement Implementation
 *
 * Provides structured knowledge extraction and enhancement for FlowReader's AI reading companion.
 * Builds upon the enhanced RAG processor to deliver high-quality explanations of concepts,
 * historical background, and cultural references.
 */

import OpenAI from 'openai';
import { RAGProcessor } from './rag-processor.js';
import type { ChatStreamRequest } from '@flowreader/shared';
import { getPerformanceConfig, PerformanceConfigManager } from './performance-config.js';
import { getResponseCache } from './response-cache.js';

// Knowledge enhancement types
export type EnhanceType = 'concept' | 'historical' | 'cultural' | 'general';

export interface KnowledgeEnhanceRequest {
  bookId: string;
  intent: 'enhance';
  selection: {
    text: string;
    start?: number;
    end?: number;
    chapterId?: string;
  };
  enhanceType?: EnhanceType;
}

export interface KnowledgeConcept {
  term: string;
  definition: string;
  context: string;
}

export interface HistoricalReference {
  event: string;
  date: string;
  relevance: string;
}

export interface CulturalReference {
  reference: string;
  origin: string;
  significance: string;
}

export interface KnowledgeConnection {
  topic: string;
  relationship: string;
}

export interface KnowledgeEnhancement {
  type: 'enhancement';
  data: {
    concepts?: KnowledgeConcept[];
    historical?: HistoricalReference[];
    cultural?: CulturalReference[];
    connections?: KnowledgeConnection[];
  };
  summary: string;
  confidence: number;
  enhanceType: EnhanceType;
}

export interface KnowledgeQualityMetrics {
  accuracy: number;
  relevance: number;
  completeness: number;
  clarity: number;
  overall: number;
}

export class KnowledgeEnhancer {
  private openai: OpenAI;
  private ragProcessor: RAGProcessor;
  private responseCache = getResponseCache();
  private configManager = PerformanceConfigManager.getInstance();

  // Dynamic quality thresholds from config
  private get CONFIDENCE_THRESHOLD() { return 0.7; }
  private get MAX_CONCEPTS() {
    const config = this.configManager.getConfig();
    return config.promptOptimization.useConcisePrompts ? 3 : 5;
  }
  private get MAX_HISTORICAL() {
    const config = this.configManager.getConfig();
    return config.promptOptimization.useConcisePrompts ? 2 : 3;
  }
  private get MAX_CULTURAL() {
    const config = this.configManager.getConfig();
    return config.promptOptimization.useConcisePrompts ? 2 : 3;
  }
  private get MAX_CONNECTIONS() {
    const config = this.configManager.getConfig();
    return config.promptOptimization.useConcisePrompts ? 2 : 4;
  }

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    this.ragProcessor = new RAGProcessor();
  }

  /**
   * Generate knowledge enhancement for selected text
   */
  async *enhanceKnowledge(request: KnowledgeEnhanceRequest): AsyncGenerator<{
    type: 'sources' | 'enhancement' | 'usage' | 'done' | 'error';
    data: any;
  }> {
    try {
      console.log(`🧠 Starting knowledge enhancement for "${request.selection.text.substring(0, 50)}..."`);

      // Check cache first
      const cachedResponse = await this.responseCache.getCachedResponse({
        bookId: request.bookId,
        selection: request.selection.text,
        enhanceType: request.enhanceType
      });

      if (cachedResponse) {
        console.log(`✨ Using cached enhancement, saved tokens`);

        // Parse and yield cached enhancement
        const enhancement = JSON.parse(cachedResponse.response);
        yield {
          type: 'enhancement',
          data: enhancement
        };

        yield {
          type: 'usage',
          data: {
            tokens_used: cachedResponse.tokens.total,
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

      // Detect enhancement type if not specified
      const enhanceType = request.enhanceType || await this.detectEnhancementType(request.selection.text);

      // Gather enhanced context using RAG
      const context = await this.gatherEnhancedContext(request.bookId, request.selection, enhanceType);

      // Emit sources
      yield {
        type: 'sources',
        data: {
          enhanceType,
          contextSources: context.sources.length,
          bookId: request.bookId
        }
      };

      // Generate structured knowledge enhancement with optimization
      const config = this.configManager.getConfig();
      const optimizedText = config.promptOptimization.useConcisePrompts
        ? request.selection.text.substring(0, 200)
        : request.selection.text;

      const enhancement = await this.generateStructuredEnhancement(
        optimizedText,
        context.content,
        enhanceType
      );

      // Validate and score the enhancement
      const qualityScore = this.assessEnhancementQuality(enhancement, request.selection.text);

      // Apply quality threshold
      if (qualityScore.overall < this.CONFIDENCE_THRESHOLD) {
        // Fallback to general explanation if quality is too low
        const fallbackEnhancement = await this.generateFallbackEnhancement(
          request.selection.text,
          context.content
        );

        yield {
          type: 'enhancement',
          data: {
            ...fallbackEnhancement,
            confidence: qualityScore.overall,
            qualityMetrics: qualityScore
          }
        };
      } else {
        const enhancementData = {
          ...enhancement,
          confidence: qualityScore.overall,
          qualityMetrics: qualityScore
        };

        yield {
          type: 'enhancement',
          data: enhancementData
        };

        // Cache the enhancement
        await this.responseCache.setCachedResponse({
          bookId: request.bookId,
          selection: request.selection.text,
          enhanceType,
          response: JSON.stringify(enhancementData),
          tokens: {
            input: context.tokensUsed,
            output: 200,
            total: context.tokensUsed + 200
          },
          confidence: qualityScore.overall
        });
      }

      // Emit usage information
      yield {
        type: 'usage',
        data: {
          tokens_used: context.tokensUsed + 200,
          cost_usd: this.calculateCost(context.tokensUsed + 200),
          enhancement_type: enhanceType,
          cached: false
        }
      };

      yield {
        type: 'done',
        data: { completed_at: Date.now() }
      };

      console.log(`✅ Knowledge enhancement completed with ${qualityScore.overall.toFixed(2)} confidence`);

    } catch (error) {
      console.error('Knowledge enhancement failed:', error);
      yield {
        type: 'error',
        data: {
          code: 'KNOWLEDGE_ENHANCEMENT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Detect the appropriate enhancement type based on text content
   */
  private async detectEnhancementType(text: string): Promise<EnhanceType> {
    // Simple keyword-based detection with ML potential
    const textLower = text.toLowerCase();

    // Historical indicators
    const historicalKeywords = [
      'war', 'battle', 'century', 'empire', 'revolution', 'dynasty', 'ancient',
      'medieval', 'renaissance', 'colonial', 'industrial', 'founded', 'established',
      'treaty', 'invasion', 'conquest', 'kingdom', 'republic', 'democracy'
    ];

    // Cultural indicators
    const culturalKeywords = [
      'tradition', 'custom', 'ritual', 'mythology', 'folklore', 'legend', 'symbol',
      'ceremony', 'festival', 'cultural', 'religious', 'spiritual', 'belief',
      'philosophy', 'art', 'literature', 'music', 'dance', 'food', 'cuisine'
    ];

    // Concept indicators (technical, academic, abstract)
    const conceptKeywords = [
      'theory', 'principle', 'concept', 'definition', 'mechanism', 'process',
      'system', 'method', 'approach', 'technique', 'algorithm', 'formula',
      'hypothesis', 'analysis', 'framework', 'model', 'structure'
    ];

    const historicalMatches = historicalKeywords.filter(keyword => textLower.includes(keyword)).length;
    const culturalMatches = culturalKeywords.filter(keyword => textLower.includes(keyword)).length;
    const conceptMatches = conceptKeywords.filter(keyword => textLower.includes(keyword)).length;

    // Return the type with the highest match count
    if (historicalMatches >= culturalMatches && historicalMatches >= conceptMatches) {
      return 'historical';
    } else if (culturalMatches >= conceptMatches) {
      return 'cultural';
    } else if (conceptMatches > 0) {
      return 'concept';
    }

    return 'general';
  }

  /**
   * Gather enhanced context using RAG processor
   */
  private async gatherEnhancedContext(
    bookId: string,
    selection: { text: string; chapterId?: string },
    enhanceType: EnhanceType
  ): Promise<{ content: string; sources: any[]; tokensUsed: number }> {
    try {
      // Check if book is processed for RAG
      const isProcessed = await this.ragProcessor.isBookProcessed(bookId);

      if (!isProcessed) {
        console.warn(`Book ${bookId} not processed for RAG, using limited context`);
        return {
          content: `Selected text: "${selection.text}"`,
          sources: [],
          tokensUsed: 50
        };
      }

      // Build enhanced query based on enhancement type and selection
      const enhancedQuery = this.buildEnhancementQuery(selection.text, enhanceType);

      // Use RAG processor to get relevant context
      const ragRequest: ChatStreamRequest = {
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
          sources = chunk.data;
        } else if (chunk.type === 'token') {
          context += chunk.data;
        } else if (chunk.type === 'usage') {
          tokensUsed = chunk.data.total_tokens || 0;
        }
      }

      return {
        content: context || `Selected text: "${selection.text}"`,
        sources,
        tokensUsed
      };

    } catch (error) {
      console.warn('Failed to gather enhanced context:', error);
      return {
        content: `Selected text: "${selection.text}"`,
        sources: [],
        tokensUsed: 50
      };
    }
  }

  /**
   * Build enhancement query based on type
   */
  private buildEnhancementQuery(selectionText: string, enhanceType: EnhanceType): string {
    const baseQuery = `Analyze and provide context for: "${selectionText}"`;

    switch (enhanceType) {
      case 'concept':
        return `${baseQuery} - Focus on technical concepts, definitions, principles, and theoretical frameworks mentioned or implied.`;

      case 'historical':
        return `${baseQuery} - Focus on historical events, dates, periods, figures, and historical context that relates to this text.`;

      case 'cultural':
        return `${baseQuery} - Focus on cultural references, traditions, social context, religious or philosophical elements, and cultural significance.`;

      case 'general':
      default:
        return `${baseQuery} - Provide comprehensive context including any relevant concepts, historical background, or cultural significance.`;
    }
  }

  /**
   * Generate structured knowledge enhancement using OpenAI
   */
  private async generateStructuredEnhancement(
    selectionText: string,
    context: string,
    enhanceType: EnhanceType
  ): Promise<KnowledgeEnhancement> {
    const systemPrompt = this.buildEnhancementSystemPrompt(enhanceType);
    const userPrompt = this.buildEnhancementUserPrompt(selectionText, context, enhanceType);

    try {
      const config = this.configManager.getConfig();
      const model = config.modelSelection.fallbackToGPT35 ? 'gpt-3.5-turbo' : 'gpt-4-turbo-preview';
      const maxTokens = config.tokenManagement.maxResponseTokens || 1000;

      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      });

      const rawResponse = response.choices[0]?.message?.content;
      if (!rawResponse) {
        throw new Error('Empty response from OpenAI');
      }

      const parsedResponse = JSON.parse(rawResponse);

      return {
        type: 'enhancement',
        data: this.validateAndLimitEnhancementData(parsedResponse, enhanceType),
        summary: parsedResponse.summary || 'Knowledge enhancement provided.',
        confidence: 0.8, // Will be overridden by quality assessment
        enhanceType
      };

    } catch (error) {
      console.error('Failed to generate structured enhancement:', error);
      throw new Error('Failed to generate knowledge enhancement');
    }
  }

  /**
   * Build system prompt for knowledge enhancement
   */
  private buildEnhancementSystemPrompt(enhanceType: EnhanceType): string {
    const config = this.configManager.getConfig();

    const basePrompt = config.promptOptimization.useConcisePrompts
      ? `Knowledge AI. Provide structured JSON for text understanding.`
      : `You are a knowledge enhancement AI that provides structured, accurate information to help readers understand complex texts. You must respond with valid JSON only.`;

    const typeSpecificInstructions = {
      concept: `Focus on explaining technical concepts, definitions, principles, and theoretical frameworks. Break down complex ideas into understandable components.`,

      historical: `Focus on historical events, dates, periods, figures, and historical context. Provide chronological context and explain historical significance.`,

      cultural: `Focus on cultural references, traditions, social context, religious/philosophical elements, and cultural significance. Explain cultural background and meaning.`,

      general: `Provide comprehensive enhancement covering concepts, historical background, and cultural significance as applicable.`
    };

    return `${basePrompt}

${typeSpecificInstructions[enhanceType]}

Response format:
{
  "concepts": [{"term": "string", "definition": "string", "context": "string"}],
  "historical": [{"event": "string", "date": "string", "relevance": "string"}],
  "cultural": [{"reference": "string", "origin": "string", "significance": "string"}],
  "connections": [{"topic": "string", "relationship": "string"}],
  "summary": "string"
}

Guidelines:
- Include only relevant sections
- Be accurate and concise
- Limits: concepts ${this.MAX_CONCEPTS}, historical ${this.MAX_HISTORICAL}, cultural ${this.MAX_CULTURAL}, connections ${this.MAX_CONNECTIONS}`;
  }

  /**
   * Build user prompt for knowledge enhancement
   */
  private buildEnhancementUserPrompt(
    selectionText: string,
    context: string,
    enhanceType: EnhanceType
  ): string {
    return `Selected text to enhance: "${selectionText}"

Book context:
${context}

Enhancement type: ${enhanceType}

Provide structured enhancement using book context. Focus on understanding.`;
  }

  /**
   * Validate and limit enhancement data according to constraints
   */
  private validateAndLimitEnhancementData(data: any, enhanceType: EnhanceType): any {
    const result: any = {};

    // Validate and limit concepts
    if (data.concepts && Array.isArray(data.concepts)) {
      result.concepts = data.concepts
        .slice(0, this.MAX_CONCEPTS)
        .filter((concept: any) =>
          concept.term && concept.definition && concept.context
        );
    }

    // Validate and limit historical references
    if (data.historical && Array.isArray(data.historical)) {
      result.historical = data.historical
        .slice(0, this.MAX_HISTORICAL)
        .filter((hist: any) =>
          hist.event && hist.date && hist.relevance
        );
    }

    // Validate and limit cultural references
    if (data.cultural && Array.isArray(data.cultural)) {
      result.cultural = data.cultural
        .slice(0, this.MAX_CULTURAL)
        .filter((cult: any) =>
          cult.reference && cult.origin && cult.significance
        );
    }

    // Validate and limit connections
    if (data.connections && Array.isArray(data.connections)) {
      result.connections = data.connections
        .slice(0, this.MAX_CONNECTIONS)
        .filter((conn: any) =>
          conn.topic && conn.relationship
        );
    }

    // Ensure we have at least some content
    const hasContent = Object.keys(result).some(key =>
      result[key] && result[key].length > 0
    );

    if (!hasContent) {
      // Fallback to basic structure
      result.concepts = [{
        term: "Content Analysis",
        definition: "Analysis of the selected text content",
        context: "General understanding of the text"
      }];
    }

    return result;
  }

  /**
   * Generate fallback enhancement when quality is low
   */
  private async generateFallbackEnhancement(
    selectionText: string,
    context: string
  ): Promise<KnowledgeEnhancement> {
    const systemPrompt = `You are a helpful reading assistant. Provide a clear, concise explanation of the selected text to help the reader understand it better. Respond with JSON only.`;

    const userPrompt = `Please explain this text passage: "${selectionText}"

Context: ${context}

Provide a helpful explanation in this JSON format:
{
  "concepts": [{"term": "string", "definition": "string", "context": "string"}],
  "summary": "string"
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const rawResponse = response.choices[0]?.message?.content;
      if (!rawResponse) {
        throw new Error('Empty fallback response');
      }

      const parsedResponse = JSON.parse(rawResponse);

      return {
        type: 'enhancement',
        data: {
          concepts: parsedResponse.concepts || [{
            term: "Selected Text",
            definition: "General explanation of the selected passage",
            context: "Basic understanding"
          }]
        },
        summary: parsedResponse.summary || 'Basic explanation provided for the selected text.',
        confidence: 0.6,
        enhanceType: 'general'
      };

    } catch (error) {
      console.error('Fallback enhancement failed:', error);

      // Ultimate fallback
      return {
        type: 'enhancement',
        data: {
          concepts: [{
            term: "Selected Text",
            definition: `The selected text: "${selectionText}"`,
            context: "Requires further analysis for deeper understanding"
          }]
        },
        summary: 'Selected text identified for further analysis.',
        confidence: 0.4,
        enhanceType: 'general'
      };
    }
  }

  /**
   * Assess the quality of generated enhancement
   */
  private assessEnhancementQuality(
    enhancement: KnowledgeEnhancement,
    originalText: string
  ): KnowledgeQualityMetrics {
    let accuracy = 0.8; // Base accuracy score
    let relevance = 0.0;
    let completeness = 0.0;
    let clarity = 0.0;

    const data = enhancement.data;

    // Calculate relevance based on content alignment
    const textWords = originalText.toLowerCase().split(/\s+/);
    let relevantTerms = 0;
    let totalTerms = 0;

    if (data.concepts) {
      data.concepts.forEach(concept => {
        totalTerms++;
        const termWords = concept.term.toLowerCase().split(/\s+/);
        if (termWords.some(word => textWords.includes(word))) {
          relevantTerms++;
        }
      });
    }

    if (data.historical) {
      data.historical.forEach(hist => {
        totalTerms++;
        const eventWords = hist.event.toLowerCase().split(/\s+/);
        if (eventWords.some(word => textWords.includes(word))) {
          relevantTerms++;
        }
      });
    }

    if (data.cultural) {
      data.cultural.forEach(cult => {
        totalTerms++;
        const refWords = cult.reference.toLowerCase().split(/\s+/);
        if (refWords.some(word => textWords.includes(word))) {
          relevantTerms++;
        }
      });
    }

    relevance = totalTerms > 0 ? relevantTerms / totalTerms : 0.5;

    // Calculate completeness based on content richness
    const conceptCount = data.concepts?.length || 0;
    const historicalCount = data.historical?.length || 0;
    const culturalCount = data.cultural?.length || 0;
    const connectionCount = data.connections?.length || 0;

    const totalContent = conceptCount + historicalCount + culturalCount + connectionCount;
    completeness = Math.min(1.0, totalContent / 4); // Expect at least 4 items for full completeness

    // Calculate clarity based on definition lengths and structure
    let clarityScore = 0;
    let clarityItems = 0;

    if (data.concepts) {
      data.concepts.forEach(concept => {
        if (concept.definition && concept.definition.length > 20 && concept.definition.length < 200) {
          clarityScore++;
        }
        clarityItems++;
      });
    }

    if (data.historical) {
      data.historical.forEach(hist => {
        if (hist.relevance && hist.relevance.length > 10) {
          clarityScore++;
        }
        clarityItems++;
      });
    }

    if (data.cultural) {
      data.cultural.forEach(cult => {
        if (cult.significance && cult.significance.length > 10) {
          clarityScore++;
        }
        clarityItems++;
      });
    }

    clarity = clarityItems > 0 ? clarityScore / clarityItems : 0.7;

    // Calculate overall score with weights
    const overall = (
      accuracy * 0.2 +
      relevance * 0.3 +
      completeness * 0.25 +
      clarity * 0.25
    );

    return {
      accuracy,
      relevance,
      completeness,
      clarity,
      overall
    };
  }

  /**
   * Calculate cost for knowledge enhancement
   */
  private calculateCost(tokens: number): number {
    const config = this.configManager.getConfig();

    if (config.modelSelection.fallbackToGPT35) {
      // GPT-3.5 pricing: ~$0.001 per 1K tokens input, ~$0.002 per 1K tokens output
      const inputTokens = tokens * 0.7;
      const outputTokens = tokens * 0.3;
      return (inputTokens / 1000) * 0.001 + (outputTokens / 1000) * 0.002;
    } else {
      // GPT-4 pricing: ~$0.03 per 1K tokens input, ~$0.06 per 1K tokens output
      const inputTokens = tokens * 0.7;
      const outputTokens = tokens * 0.3;
      return (inputTokens / 1000) * 0.03 + (outputTokens / 1000) * 0.06;
    }
  }

  /**
   * Batch enhance multiple selections (for evaluation)
   */
  async batchEnhance(
    bookId: string,
    selections: Array<{ text: string; enhanceType?: EnhanceType }>
  ): Promise<Array<{
    selection: string;
    enhancement: KnowledgeEnhancement;
    metrics: KnowledgeQualityMetrics;
  }>> {
    const results = [];

    for (const selection of selections) {
      try {
        const request: KnowledgeEnhanceRequest = {
          bookId,
          intent: 'enhance',
          selection: { text: selection.text },
          enhanceType: selection.enhanceType
        };

        let enhancement: KnowledgeEnhancement | null = null;

        // Collect enhancement from stream
        const streamGenerator = this.enhanceKnowledge(request);
        for await (const chunk of streamGenerator) {
          if (chunk.type === 'enhancement') {
            enhancement = chunk.data;
            break;
          }
        }

        if (enhancement) {
          const metrics = this.assessEnhancementQuality(enhancement, selection.text);
          results.push({
            selection: selection.text,
            enhancement,
            metrics
          });
        }

      } catch (error) {
        console.error(`Failed to enhance selection "${selection.text.substring(0, 30)}...":`, error);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}