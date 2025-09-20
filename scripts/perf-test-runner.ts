/**
 * Performance Test Runner
 * Part of T8-PERF-COST optimization baseline measurement infrastructure
 *
 * This TypeScript runner provides:
 * - Statistical analysis of endpoint performance
 * - Token consumption tracking
 * - Cost estimation
 * - Concurrent testing capabilities
 * - Detailed metrics collection
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import { EventSource } from 'eventsource';

// Types for performance metrics
interface PerformanceMetrics {
  endpoint: string;
  timestamp: string;
  samples: number;
  concurrent: number;
  metadata: {
    endpoint: string;
    samples: number;
    concurrent: number;
    timestamp: string;
    apiBase: string;
    scenarios: number;
  };
  metrics: {
    latency: LatencyMetrics;
    tokens: TokenMetrics;
    cost: CostMetrics;
    quality?: QualityMetrics;
    ttft?: LatencyMetrics; // Time to First Token
    throughput: ThroughputMetrics;
  };
  rawData: TestResult[];
}

interface LatencyMetrics {
  mean: number;
  median: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  stdDev: number;
}

interface TokenMetrics {
  meanInput: number;
  meanOutput: number;
  total: number;
  inputTokens: number;
  outputTokens: number;
  tokensPerSecond: number;
}

interface CostMetrics {
  perRequest: number;
  per1000: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
}

interface QualityMetrics {
  score: number;
  baseline: number;
  regression: boolean;
}

interface ThroughputMetrics {
  requestsPerSecond: number;
  tokensPerSecond: number;
  bytesPerSecond: number;
}

interface TestResult {
  requestId: string;
  startTime: number;
  endTime: number;
  ttft?: number; // Time to first token
  latency: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  success: boolean;
  error?: string;
  response?: {
    content: string;
    sources?: any[];
    usage?: any;
  };
}

interface TestScenario {
  name: string;
  bookId: string;
  intent?: 'translate' | 'explain' | 'analyze' | 'ask' | 'enhance';
  query?: string;
  selection?: {
    text: string;
    start?: number;
    end?: number;
    chapterId?: string;
  };
  targetLang?: string;
  enhanceType?: 'concept' | 'historical' | 'cultural' | 'general';
  weight: number; // For weighted testing
}

interface TestConfig {
  apiBase: string;
  endpoint: string;
  samples: number;
  concurrent: number;
  timeout: number;
  authToken?: string;
  scenarios: TestScenario[];
  outputFile: string;
  verbose: boolean;
}

// Cost calculation constants
const PRICING = {
  'gpt-3.5-turbo': {
    input: 0.0005,  // per 1K tokens
    output: 0.0015  // per 1K tokens
  },
  'gpt-4-turbo-preview': {
    input: 0.01,    // per 1K tokens
    output: 0.03    // per 1K tokens
  }
};

// Default test scenarios
const DEFAULT_SCENARIOS: TestScenario[] = [
  {
    name: "Simple Chat",
    bookId: "test-book-001",
    intent: "ask",
    query: "What is the main theme of this book?",
    weight: 0.3
  },
  {
    name: "Knowledge Enhancement",
    bookId: "test-book-001",
    intent: "enhance",
    selection: {
      text: "Democracy in America was written by Alexis de Tocqueville in 1835.",
      start: 0,
      end: 69
    },
    enhanceType: "historical",
    weight: 0.25
  },
  {
    name: "Translation Request",
    bookId: "test-book-001",
    intent: "translate",
    selection: {
      text: "Hello world, this is a test translation.",
      start: 0,
      end: 40
    },
    targetLang: "zh-CN",
    weight: 0.2
  },
  {
    name: "Text Explanation",
    bookId: "test-book-001",
    intent: "explain",
    selection: {
      text: "The concept of natural selection was revolutionary for its time.",
      start: 0,
      end: 63
    },
    weight: 0.15
  },
  {
    name: "Literary Analysis",
    bookId: "test-book-001",
    intent: "analyze",
    selection: {
      text: "It was the best of times, it was the worst of times.",
      start: 0,
      end: 52
    },
    weight: 0.1
  }
];

class PerformanceTestRunner {
  private config: TestConfig;
  private results: TestResult[] = [];

  constructor(config: TestConfig) {
    this.config = config;
  }

  /**
   * Run complete performance test suite
   */
  async run(): Promise<PerformanceMetrics> {
    console.log(`🚀 Starting performance test for ${this.config.endpoint}`);
    console.log(`📊 Samples: ${this.config.samples}, Concurrent: ${this.config.concurrent}`);

    const startTime = performance.now();

    // Run tests with configured concurrency
    await this.runConcurrentTests();

    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    // Calculate metrics
    const metrics = this.calculateMetrics(totalDuration);

    // Save results
    await this.saveResults(metrics);

    console.log(`✅ Performance test completed in ${(totalDuration / 1000).toFixed(2)}s`);

    return metrics;
  }

  /**
   * Run tests with specified concurrency
   */
  private async runConcurrentTests(): Promise<void> {
    const scenarios = this.config.scenarios;
    const testsPerBatch = Math.max(1, Math.floor(this.config.concurrent));
    const totalTests = this.config.samples;

    let completed = 0;

    while (completed < totalTests) {
      const batchSize = Math.min(testsPerBatch, totalTests - completed);
      const batchPromises: Promise<TestResult>[] = [];

      for (let i = 0; i < batchSize; i++) {
        // Select scenario based on weight
        const scenario = this.selectScenario(scenarios);
        const requestId = `req-${completed + i + 1}-${Date.now()}`;

        batchPromises.push(this.runSingleTest(requestId, scenario));
      }

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          this.results.push(result.value);
        } else {
          console.error(`Test ${completed + index + 1} failed:`, result.reason);
          // Add failed result
          this.results.push({
            requestId: `failed-${completed + index + 1}`,
            startTime: Date.now(),
            endTime: Date.now(),
            latency: 0,
            tokens: { input: 0, output: 0, total: 0 },
            cost: 0,
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });

      completed += batchSize;

      if (this.config.verbose) {
        console.log(`📈 Progress: ${completed}/${totalTests} tests completed`);
      }

      // Small delay between batches to avoid overwhelming the server
      if (completed < totalTests) {
        await this.sleep(100);
      }
    }
  }

  /**
   * Select test scenario based on weights
   */
  private selectScenario(scenarios: TestScenario[]): TestScenario {
    const totalWeight = scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
    const random = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const scenario of scenarios) {
      currentWeight += scenario.weight;
      if (random <= currentWeight) {
        return scenario;
      }
    }

    // Fallback to first scenario
    return scenarios[0];
  }

  /**
   * Run a single performance test
   */
  private async runSingleTest(requestId: string, scenario: TestScenario): Promise<TestResult> {
    const startTime = performance.now();
    let ttft: number | undefined;
    let firstTokenReceived = false;

    try {
      const url = `${this.config.apiBase}/${this.config.endpoint}`;
      const payload = this.buildRequestPayload(scenario);

      if (this.config.verbose) {
        console.log(`🔍 Testing ${requestId}: ${scenario.name}`);
      }

      const response = await this.makeStreamingRequest(url, payload, (token) => {
        if (!firstTokenReceived) {
          ttft = performance.now() - startTime;
          firstTokenReceived = true;
        }
      });

      const endTime = performance.now();
      const latency = endTime - startTime;

      return {
        requestId,
        startTime,
        endTime,
        ttft,
        latency,
        tokens: response.tokens,
        cost: this.calculateRequestCost(response.tokens),
        success: true,
        response: {
          content: response.content,
          sources: response.sources,
          usage: response.usage
        }
      };

    } catch (error) {
      const endTime = performance.now();

      return {
        requestId,
        startTime,
        endTime,
        latency: endTime - startTime,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Build request payload for scenario
   */
  private buildRequestPayload(scenario: TestScenario): any {
    const payload: any = {
      bookId: scenario.bookId
    };

    if (scenario.intent) {
      payload.intent = scenario.intent;
    }

    if (scenario.query) {
      payload.query = scenario.query;
    }

    if (scenario.selection) {
      payload.selection = scenario.selection;
    }

    if (scenario.targetLang) {
      payload.targetLang = scenario.targetLang;
    }

    if (scenario.enhanceType) {
      payload.enhanceType = scenario.enhanceType;
    }

    return payload;
  }

  /**
   * Make streaming request to endpoint
   */
  private async makeStreamingRequest(
    url: string,
    payload: any,
    onToken?: (token: string) => void
  ): Promise<{
    content: string;
    tokens: { input: number; output: number; total: number };
    sources?: any[];
    usage?: any;
  }> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      let content = '';
      let sources: any[] = [];
      let usage: any = {};
      let tokens = { input: 0, output: 0, total: 0 };

      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authToken ? { 'Authorization': this.config.authToken } : {})
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const pump = (): Promise<void> => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              clearTimeout(timeout);
              resolve({ content, tokens, sources, usage });
              return;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (line.startsWith('event: token') && data.token) {
                    content += data.token;
                    tokens.output++;
                    onToken?.(data.token);
                  } else if (line.startsWith('event: sources') && data.sources) {
                    sources = data.sources;
                  } else if (line.startsWith('event: usage')) {
                    usage = data;
                    if (data.prompt_tokens) tokens.input = data.prompt_tokens;
                    if (data.completion_tokens) tokens.output = data.completion_tokens;
                    if (data.total_tokens) tokens.total = data.total_tokens;
                  }
                } catch (e) {
                  // Ignore JSON parse errors for malformed chunks
                }
              }
            }

            return pump();
          });
        };

        return pump();
      })
      .catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Calculate request cost based on token usage
   */
  private calculateRequestCost(tokens: { input: number; output: number; total: number }): number {
    // Assume GPT-3.5-turbo for most requests (can be configured later)
    const pricing = PRICING['gpt-3.5-turbo'];

    const inputCost = (tokens.input / 1000) * pricing.input;
    const outputCost = (tokens.output / 1000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Calculate comprehensive performance metrics
   */
  private calculateMetrics(totalDuration: number): PerformanceMetrics {
    const successfulResults = this.results.filter(r => r.success);
    const latencies = successfulResults.map(r => r.latency);
    const ttfts = successfulResults.map(r => r.ttft).filter(t => t !== undefined) as number[];

    // Calculate latency statistics
    const latencyStats = this.calculateStats(latencies);
    const ttftStats = ttfts.length > 0 ? this.calculateStats(ttfts) : undefined;

    // Calculate token statistics
    const inputTokens = successfulResults.reduce((sum, r) => sum + r.tokens.input, 0);
    const outputTokens = successfulResults.reduce((sum, r) => sum + r.tokens.output, 0);
    const totalTokens = inputTokens + outputTokens;

    // Calculate cost statistics
    const totalCost = successfulResults.reduce((sum, r) => sum + r.cost, 0);
    const avgRequestCost = totalCost / Math.max(1, successfulResults.length);

    // Calculate throughput
    const durationSeconds = totalDuration / 1000;
    const requestsPerSecond = this.results.length / durationSeconds;
    const tokensPerSecond = totalTokens / durationSeconds;

    return {
      endpoint: this.config.endpoint,
      timestamp: new Date().toISOString(),
      samples: this.results.length,
      concurrent: this.config.concurrent,
      metadata: {
        endpoint: this.config.endpoint,
        samples: this.results.length,
        concurrent: this.config.concurrent,
        timestamp: new Date().toISOString(),
        apiBase: this.config.apiBase,
        scenarios: this.config.scenarios.length
      },
      metrics: {
        latency: latencyStats,
        ...(ttftStats && { ttft: ttftStats }),
        tokens: {
          meanInput: inputTokens / Math.max(1, successfulResults.length),
          meanOutput: outputTokens / Math.max(1, successfulResults.length),
          total: totalTokens,
          inputTokens,
          outputTokens,
          tokensPerSecond
        },
        cost: {
          perRequest: avgRequestCost,
          per1000: avgRequestCost * 1000,
          totalCost,
          inputCost: (inputTokens / 1000) * PRICING['gpt-3.5-turbo'].input,
          outputCost: (outputTokens / 1000) * PRICING['gpt-3.5-turbo'].output
        },
        throughput: {
          requestsPerSecond,
          tokensPerSecond,
          bytesPerSecond: 0 // Can be calculated if needed
        }
      },
      rawData: this.results
    };
  }

  /**
   * Calculate statistical measures for a dataset
   */
  private calculateStats(values: number[]): LatencyMetrics {
    if (values.length === 0) {
      return {
        mean: 0, median: 0, p50: 0, p95: 0, p99: 0,
        min: 0, max: 0, stdDev: 0
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;

    // Calculate standard deviation
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean: Number(mean.toFixed(2)),
      median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
      p50: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(2)),
      p95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
      p99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
      min: Number(sorted[0].toFixed(2)),
      max: Number(sorted[sorted.length - 1].toFixed(2)),
      stdDev: Number(stdDev.toFixed(2))
    };
  }

  /**
   * Save results to file
   */
  private async saveResults(metrics: PerformanceMetrics): Promise<void> {
    const outputPath = path.resolve(this.config.outputFile);
    const outputDir = path.dirname(outputPath);

    // Ensure directory exists
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    await fs.writeFile(outputPath, JSON.stringify(metrics, null, 2));

    if (this.config.verbose) {
      console.log(`💾 Results saved to: ${outputPath}`);
    }
  }

  /**
   * Utility function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const config: TestConfig = {
    apiBase: 'http://localhost:3001/api',
    endpoint: 'chat/stream',
    samples: 30,
    concurrent: 1,
    timeout: 30000,
    scenarios: DEFAULT_SCENARIOS,
    outputFile: './perf-results.json',
    verbose: false
  };

  for (let i = 0; i < args.length; i += 2) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case '--endpoint':
        config.endpoint = value;
        break;
      case '--samples':
        config.samples = parseInt(value, 10);
        break;
      case '--concurrent':
        config.concurrent = parseInt(value, 10);
        break;
      case '--api-base':
        config.apiBase = value;
        break;
      case '--output':
        config.outputFile = value;
        break;
      case '--auth-token':
        config.authToken = value;
        break;
      case '--timeout':
        config.timeout = parseInt(value, 10);
        break;
      case '--scenarios':
        try {
          const scenariosData = await fs.readFile(value, 'utf-8');
          config.scenarios = JSON.parse(scenariosData);
        } catch (error) {
          console.error(`Failed to load scenarios from ${value}:`, error);
          process.exit(1);
        }
        break;
      case '--verbose':
        config.verbose = true;
        i--; // No value for this flag
        break;
    }
  }

  // Validate configuration
  if (config.samples <= 0) {
    console.error('Sample count must be positive');
    process.exit(1);
  }

  if (config.concurrent <= 0) {
    console.error('Concurrency must be positive');
    process.exit(1);
  }

  // Run performance test
  try {
    const runner = new PerformanceTestRunner(config);
    const metrics = await runner.run();

    console.log('\n📊 Performance Test Summary:');
    console.log(`Success Rate: ${((metrics.rawData.filter(r => r.success).length / metrics.rawData.length) * 100).toFixed(1)}%`);
    console.log(`Average Latency: ${metrics.metrics.latency.mean}ms`);
    console.log(`P95 Latency: ${metrics.metrics.latency.p95}ms`);
    console.log(`Average Tokens: ${metrics.metrics.tokens.meanInput + metrics.metrics.tokens.meanOutput}`);
    console.log(`Average Cost: $${metrics.metrics.cost.perRequest.toFixed(4)}`);
    console.log(`Throughput: ${metrics.metrics.throughput.requestsPerSecond.toFixed(2)} req/s`);

  } catch (error) {
    console.error('Performance test failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { PerformanceTestRunner, type PerformanceMetrics, type TestConfig, type TestScenario };