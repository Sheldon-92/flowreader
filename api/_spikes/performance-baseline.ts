/**
 * Performance Baseline Data Collection
 * Part of T8-PERF-COST optimization baseline measurement infrastructure
 *
 * This module provides:
 * - Baseline performance data collection for chat/stream endpoint
 * - Integration with existing RAG processor metrics
 * - Quality measurement integration
 * - Historical performance tracking
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import { RAGProcessor } from '../_lib/rag-processor.js';
import { KnowledgeEnhancer } from '../_lib/knowledge-enhancer.js';

// Performance measurement interfaces
interface BaselineRequest {
  endpoint: string;
  scenario: string;
  payload: any;
  metadata?: {
    bookId?: string;
    intent?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    expectedLatency?: number;
    expectedTokens?: number;
  };
}

interface BaselineMeasurement {
  requestId: string;
  timestamp: string;
  endpoint: string;
  scenario: string;
  metrics: {
    latency: {
      total: number;
      ttft?: number; // Time to first token
      processing: number;
      network: number;
    };
    tokens: {
      input: number;
      output: number;
      total: number;
      efficiency: number; // tokens per second
    };
    cost: {
      estimated: number;
      breakdown: {
        input: number;
        output: number;
      };
    };
    quality?: {
      score: number;
      confidence: number;
      relevance: number;
    };
    rag?: {
      chunksRetrieved: number;
      embeddingLatency: number;
      retrievalLatency: number;
      rerankingLatency?: number;
    };
  };
  success: boolean;
  error?: string;
  rawResponse?: {
    content: string;
    sources?: any[];
    usage?: any;
  };
}

interface BaselineCollection {
  metadata: {
    collectionId: string;
    timestamp: string;
    version: string;
    environment: string;
    configuration: any;
  };
  measurements: BaselineMeasurement[];
  summary: {
    totalSamples: number;
    successRate: number;
    averageLatency: number;
    averageTokens: number;
    averageCost: number;
    qualityScore?: number;
  };
}

export class PerformanceBaselineCollector {
  private ragProcessor: RAGProcessor;
  private knowledgeEnhancer: KnowledgeEnhancer;
  private measurements: BaselineMeasurement[] = [];

  constructor() {
    this.ragProcessor = new RAGProcessor();
    this.knowledgeEnhancer = new KnowledgeEnhancer();
  }

  /**
   * Collect baseline measurements for chat/stream endpoint
   */
  async collectChatStreamBaseline(
    scenarios: BaselineRequest[],
    options: {
      concurrent?: number;
      warmupRequests?: number;
      cooldownMs?: number;
    } = {}
  ): Promise<BaselineCollection> {
    console.log(`🎯 Starting baseline collection for chat/stream endpoint`);
    console.log(`📊 Scenarios: ${scenarios.length}`);

    const { concurrent = 1, warmupRequests = 3, cooldownMs = 1000 } = options;

    // Perform warmup requests
    if (warmupRequests > 0) {
      console.log(`🔥 Running ${warmupRequests} warmup requests...`);
      await this.runWarmupRequests(scenarios[0], warmupRequests);
    }

    // Collect measurements
    const startTime = Date.now();

    for (const scenario of scenarios) {
      console.log(`📈 Measuring scenario: ${scenario.scenario}`);

      const measurement = await this.measureChatStreamRequest(scenario);
      this.measurements.push(measurement);

      // Cooldown between requests
      if (cooldownMs > 0) {
        await this.sleep(cooldownMs);
      }
    }

    const endTime = Date.now();
    console.log(`⏱️ Collection completed in ${(endTime - startTime) / 1000}s`);

    // Generate baseline collection
    return this.generateBaselineCollection();
  }

  /**
   * Measure a single chat/stream request
   */
  async measureChatStreamRequest(request: BaselineRequest): Promise<BaselineMeasurement> {
    const requestId = `baseline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    try {
      let ttft: number | undefined;
      let firstTokenReceived = false;
      let processingStartTime = performance.now();

      console.log(`🔍 Measuring request: ${requestId} (${request.scenario})`);

      // Simulate the chat/stream endpoint flow
      const result = await this.simulateChatStreamFlow(
        request.payload,
        (token) => {
          if (!firstTokenReceived) {
            ttft = performance.now() - startTime;
            firstTokenReceived = true;
          }
        }
      );

      const endTime = performance.now();
      const totalLatency = endTime - startTime;
      const processingLatency = endTime - processingStartTime;

      // Calculate quality score if available
      let qualityMetrics;
      if (result.content && request.metadata?.intent) {
        qualityMetrics = await this.assessResponseQuality(
          result.content,
          request.payload,
          request.metadata.intent
        );
      }

      return {
        requestId,
        timestamp: new Date().toISOString(),
        endpoint: request.endpoint,
        scenario: request.scenario,
        metrics: {
          latency: {
            total: Number(totalLatency.toFixed(2)),
            ttft: ttft ? Number(ttft.toFixed(2)) : undefined,
            processing: Number(processingLatency.toFixed(2)),
            network: Number((totalLatency - processingLatency).toFixed(2))
          },
          tokens: {
            input: result.tokens.input,
            output: result.tokens.output,
            total: result.tokens.total,
            efficiency: Number((result.tokens.total / (totalLatency / 1000)).toFixed(2))
          },
          cost: {
            estimated: result.cost,
            breakdown: {
              input: (result.tokens.input / 1000) * 0.0005, // GPT-3.5-turbo input pricing
              output: (result.tokens.output / 1000) * 0.0015 // GPT-3.5-turbo output pricing
            }
          },
          quality: qualityMetrics,
          rag: result.ragMetrics
        },
        success: true,
        rawResponse: {
          content: result.content,
          sources: result.sources,
          usage: result.usage
        }
      };

    } catch (error) {
      const endTime = performance.now();

      console.error(`❌ Request ${requestId} failed:`, error);

      return {
        requestId,
        timestamp: new Date().toISOString(),
        endpoint: request.endpoint,
        scenario: request.scenario,
        metrics: {
          latency: {
            total: Number((endTime - startTime).toFixed(2)),
            processing: 0,
            network: 0
          },
          tokens: {
            input: 0,
            output: 0,
            total: 0,
            efficiency: 0
          },
          cost: {
            estimated: 0,
            breakdown: { input: 0, output: 0 }
          }
        },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Simulate the chat/stream endpoint flow for measurement
   */
  private async simulateChatStreamFlow(
    payload: any,
    onToken?: (token: string) => void
  ): Promise<{
    content: string;
    tokens: { input: number; output: number; total: number };
    cost: number;
    sources?: any[];
    usage?: any;
    ragMetrics?: {
      chunksRetrieved: number;
      embeddingLatency: number;
      retrievalLatency: number;
      rerankingLatency?: number;
    };
  }> {
    const { bookId, intent, selection, query, targetLang, enhanceType } = payload;

    // Handle knowledge enhancement separately
    if (intent === 'enhance') {
      return await this.measureKnowledgeEnhancement(payload, onToken);
    }

    // Check if book is processed for RAG
    const ragStartTime = performance.now();
    const isProcessed = await this.ragProcessor.isBookProcessed(bookId);
    let ragMetrics;

    if (isProcessed) {
      // Measure RAG performance
      const ragRequest = {
        book_id: bookId,
        message: query || `${intent}: ${selection?.text || ''}`,
        selection: selection?.text || '',
        chapter_idx: selection?.chapterId ? parseInt(selection.chapterId) : undefined
      };

      let content = '';
      let sources: any[] = [];
      let usage: any = {};
      let tokens = { input: 0, output: 0, total: 0 };
      let chunksRetrieved = 0;

      const streamGenerator = this.ragProcessor.streamChatResponse(ragRequest);

      for await (const chunk of streamGenerator) {
        if (chunk.type === 'sources') {
          sources = chunk.data;
          chunksRetrieved = chunk.data.length;
        } else if (chunk.type === 'token') {
          content += chunk.data;
          tokens.output++;
          onToken?.(chunk.data);
        } else if (chunk.type === 'usage') {
          usage = chunk.data;
          tokens = {
            input: chunk.data.prompt_tokens || 0,
            output: chunk.data.completion_tokens || 0,
            total: chunk.data.total_tokens || 0
          };
        }
      }

      const ragEndTime = performance.now();

      ragMetrics = {
        chunksRetrieved,
        embeddingLatency: 0, // Would need to instrument RAG processor
        retrievalLatency: Number((ragEndTime - ragStartTime).toFixed(2)),
        rerankingLatency: 0 // Would need to instrument RAG processor
      };

      const cost = this.calculateRequestCost(tokens);

      return { content, tokens, cost, sources, usage, ragMetrics };

    } else {
      // Fallback to simulated response
      return await this.generateSimulatedResponse(payload, onToken);
    }
  }

  /**
   * Measure knowledge enhancement performance
   */
  private async measureKnowledgeEnhancement(
    payload: any,
    onToken?: (token: string) => void
  ): Promise<{
    content: string;
    tokens: { input: number; output: number; total: number };
    cost: number;
    sources?: any[];
    usage?: any;
  }> {
    const enhanceRequest = {
      bookId: payload.bookId,
      intent: 'enhance' as const,
      selection: payload.selection,
      enhanceType: payload.enhanceType
    };

    let content = '';
    let sources: any[] = [];
    let usage: any = {};
    let tokens = { input: 0, output: 0, total: 0 };

    const streamGenerator = this.knowledgeEnhancer.enhanceKnowledge(enhanceRequest);

    for await (const chunk of streamGenerator) {
      if (chunk.type === 'sources') {
        sources = chunk.data.sources || [];
      } else if (chunk.type === 'enhancement') {
        // Knowledge enhancement returns structured data, convert to text
        content = JSON.stringify(chunk.data, null, 2);
        tokens.output = content.split(' ').length; // Rough estimate
        onToken?.(content);
      } else if (chunk.type === 'usage') {
        usage = chunk.data;
        tokens = {
          input: chunk.data.tokens_used * 0.7, // Estimate
          output: chunk.data.tokens_used * 0.3, // Estimate
          total: chunk.data.tokens_used || 0
        };
      }
    }

    const cost = this.calculateRequestCost(tokens);

    return { content, tokens, cost, sources, usage };
  }

  /**
   * Generate simulated response for testing
   */
  private async generateSimulatedResponse(
    payload: any,
    onToken?: (token: string) => void
  ): Promise<{
    content: string;
    tokens: { input: number; output: number; total: number };
    cost: number;
    sources?: any[];
    usage?: any;
  }> {
    const { intent, selection, query, targetLang } = payload;

    let content = '';
    const baseTokens = Math.floor(Math.random() * 50) + 50; // 50-100 tokens

    switch (intent) {
      case 'translate':
        content = `Simulated translation to ${targetLang}: ${selection?.text || 'text'}`;
        break;
      case 'explain':
        content = `Simulated explanation: This passage "${selection?.text?.substring(0, 30)}..." represents...`;
        break;
      case 'analyze':
        content = `Simulated analysis: The literary elements in "${selection?.text?.substring(0, 30)}..." include...`;
        break;
      case 'ask':
        content = `Simulated response to: "${query}" - This is a comprehensive answer...`;
        break;
      default:
        content = 'Simulated AI response for performance testing';
    }

    // Simulate streaming
    const words = content.split(' ');
    for (const word of words) {
      onToken?.(word + ' ');
      await this.sleep(10); // Small delay to simulate streaming
    }

    const tokens = {
      input: baseTokens,
      output: words.length,
      total: baseTokens + words.length
    };

    const cost = this.calculateRequestCost(tokens);

    return {
      content,
      tokens,
      cost,
      sources: [{ title: 'Test Book', type: 'book' }],
      usage: { ...tokens }
    };
  }

  /**
   * Assess response quality
   */
  private async assessResponseQuality(
    content: string,
    originalPayload: any,
    intent: string
  ): Promise<{
    score: number;
    confidence: number;
    relevance: number;
  }> {
    // Simplified quality assessment based on response characteristics
    let score = 0.7; // Base score
    let confidence = 0.8;
    let relevance = 0.7;

    // Length-based quality indicators
    const wordCount = content.split(' ').length;
    if (wordCount < 10) {
      score -= 0.2;
      confidence -= 0.1;
    } else if (wordCount > 100 && wordCount < 300) {
      score += 0.1;
    }

    // Intent-specific quality checks
    switch (intent) {
      case 'translate':
        // Check if translation looks reasonable
        if (originalPayload.targetLang === 'zh-CN' && /[\u4e00-\u9fff]/.test(content)) {
          score += 0.1;
          relevance += 0.2;
        }
        break;
      case 'explain':
        // Check for explanatory terms
        if (/explain|because|since|therefore|meaning/.test(content.toLowerCase())) {
          score += 0.1;
          relevance += 0.1;
        }
        break;
      case 'analyze':
        // Check for analytical terms
        if (/analysis|theme|symbol|literary|technique/.test(content.toLowerCase())) {
          score += 0.1;
          relevance += 0.1;
        }
        break;
    }

    // Ensure scores are within bounds
    score = Math.max(0, Math.min(1, score));
    confidence = Math.max(0, Math.min(1, confidence));
    relevance = Math.max(0, Math.min(1, relevance));

    return {
      score: Number(score.toFixed(3)),
      confidence: Number(confidence.toFixed(3)),
      relevance: Number(relevance.toFixed(3))
    };
  }

  /**
   * Calculate request cost based on token usage
   */
  private calculateRequestCost(tokens: { input: number; output: number; total: number }): number {
    // GPT-3.5-turbo pricing
    const inputCost = (tokens.input / 1000) * 0.0005;
    const outputCost = (tokens.output / 1000) * 0.0015;
    return Number((inputCost + outputCost).toFixed(6));
  }

  /**
   * Run warmup requests to stabilize performance
   */
  private async runWarmupRequests(scenario: BaselineRequest, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      try {
        await this.simulateChatStreamFlow(scenario.payload);
        await this.sleep(500);
      } catch (error) {
        console.warn(`Warmup request ${i + 1} failed:`, error);
      }
    }
  }

  /**
   * Generate baseline collection summary
   */
  private generateBaselineCollection(): BaselineCollection {
    const successfulMeasurements = this.measurements.filter(m => m.success);
    const totalSamples = this.measurements.length;
    const successRate = successfulMeasurements.length / totalSamples;

    const averageLatency = successfulMeasurements.reduce(
      (sum, m) => sum + m.metrics.latency.total, 0
    ) / Math.max(1, successfulMeasurements.length);

    const averageTokens = successfulMeasurements.reduce(
      (sum, m) => sum + m.metrics.tokens.total, 0
    ) / Math.max(1, successfulMeasurements.length);

    const averageCost = successfulMeasurements.reduce(
      (sum, m) => sum + m.metrics.cost.estimated, 0
    ) / Math.max(1, successfulMeasurements.length);

    const qualityScores = successfulMeasurements
      .map(m => m.metrics.quality?.score)
      .filter(score => score !== undefined) as number[];

    const qualityScore = qualityScores.length > 0
      ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length
      : undefined;

    return {
      metadata: {
        collectionId: `baseline-${Date.now()}`,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        configuration: {
          ragProcessor: 'enabled',
          knowledgeEnhancer: 'enabled',
          mockResponses: 'fallback'
        }
      },
      measurements: this.measurements,
      summary: {
        totalSamples,
        successRate: Number(successRate.toFixed(3)),
        averageLatency: Number(averageLatency.toFixed(2)),
        averageTokens: Number(averageTokens.toFixed(1)),
        averageCost: Number(averageCost.toFixed(6)),
        qualityScore: qualityScore ? Number(qualityScore.toFixed(3)) : undefined
      }
    };
  }

  /**
   * Save baseline collection to file
   */
  async saveBaseline(
    collection: BaselineCollection,
    outputPath: string
  ): Promise<void> {
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(collection, null, 2));
    console.log(`💾 Baseline saved to: ${outputPath}`);
  }

  /**
   * Utility function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset measurements for new collection
   */
  reset(): void {
    this.measurements = [];
  }
}

// CLI interface for standalone usage
async function main(): Promise<void> {
  const collector = new PerformanceBaselineCollector();

  // Default baseline scenarios
  const scenarios: BaselineRequest[] = [
    {
      endpoint: 'chat/stream',
      scenario: 'simple_question',
      payload: {
        bookId: 'test-book-001',
        intent: 'ask',
        query: 'What is the main theme of this book?'
      },
      metadata: {
        complexity: 'simple',
        expectedLatency: 1000,
        expectedTokens: 150
      }
    },
    {
      endpoint: 'chat/stream',
      scenario: 'knowledge_enhancement',
      payload: {
        bookId: 'test-book-001',
        intent: 'enhance',
        selection: {
          text: 'Democracy in America was written by Alexis de Tocqueville in 1835.',
          start: 0,
          end: 65
        },
        enhanceType: 'historical'
      },
      metadata: {
        complexity: 'complex',
        expectedLatency: 2000,
        expectedTokens: 300
      }
    },
    {
      endpoint: 'chat/stream',
      scenario: 'translation',
      payload: {
        bookId: 'test-book-001',
        intent: 'translate',
        selection: {
          text: 'Hello world, this is a test translation.',
          start: 0,
          end: 39
        },
        targetLang: 'zh-CN'
      },
      metadata: {
        complexity: 'medium',
        expectedLatency: 1500,
        expectedTokens: 100
      }
    }
  ];

  try {
    console.log('🎯 Starting performance baseline collection...');

    const collection = await collector.collectChatStreamBaseline(scenarios, {
      concurrent: 1,
      warmupRequests: 2,
      cooldownMs: 1000
    });

    const outputPath = path.resolve('./perf-results/baseline-collection.json');
    await collector.saveBaseline(collection, outputPath);

    console.log('\n📊 Baseline Collection Summary:');
    console.log(`Total Samples: ${collection.summary.totalSamples}`);
    console.log(`Success Rate: ${(collection.summary.successRate * 100).toFixed(1)}%`);
    console.log(`Average Latency: ${collection.summary.averageLatency.toFixed(2)}ms`);
    console.log(`Average Tokens: ${collection.summary.averageTokens.toFixed(1)}`);
    console.log(`Average Cost: $${collection.summary.averageCost.toFixed(6)}`);
    if (collection.summary.qualityScore) {
      console.log(`Quality Score: ${(collection.summary.qualityScore * 100).toFixed(1)}%`);
    }

  } catch (error) {
    console.error('❌ Baseline collection failed:', error);
    process.exit(1);
  }
}

// Export for use in other modules
export {
  PerformanceBaselineCollector,
  type BaselineRequest,
  type BaselineMeasurement,
  type BaselineCollection
};

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}