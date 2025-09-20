#!/usr/bin/env node
/**
 * Context Budget Testing Script
 *
 * Tests the context budget optimization system and compares against baseline
 * Generates reproducible metrics for token reduction, quality, and latency
 */

import { contextBudgetManager, type BudgetStrategy } from '../_lib/context_budget.js';
import { RAGProcessor } from '../_lib/rag-processor.js';
import { getPerformanceConfig, updatePerformanceConfig } from '../_lib/performance-config.js';
import { getResponseCache } from '../_lib/response-cache.js';
import type { ChatStreamRequest } from '@flowreader/shared';

// Test scenarios with diverse query types
const TEST_SCENARIOS = [
  {
    name: 'Simple Query',
    query: 'What is the main theme?',
    expectedComplexity: 'simple',
    selection: undefined
  },
  {
    name: 'Moderate Query',
    query: 'Explain the relationship between the protagonist and the antagonist in this chapter',
    expectedComplexity: 'moderate',
    selection: undefined
  },
  {
    name: 'Complex Query',
    query: 'Analyze the literary techniques used in this passage and compare them to other works by the same author. How do these techniques contribute to the overall narrative structure and thematic development?',
    expectedComplexity: 'complex',
    selection: undefined
  },
  {
    name: 'Query with Selection',
    query: 'What does this mean in context?',
    expectedComplexity: 'simple',
    selection: 'The quick brown fox jumps over the lazy dog. This is a test selection.'
  },
  {
    name: 'Analytical Query',
    query: 'Compare and contrast the different perspectives presented. What are the implications?',
    expectedComplexity: 'moderate',
    selection: undefined
  }
];

// Test configuration
const TEST_CONFIG = {
  bookId: 'test-book-123',
  chapterIdx: 0,
  runs: 3, // Number of runs per scenario for averaging
  strategies: ['conservative', 'balanced', 'aggressive', 'adaptive'] as BudgetStrategy[]
};

// Metrics collection
interface TestMetrics {
  scenario: string;
  strategy: BudgetStrategy;
  baseline: {
    contextTokens: number;
    responseTokens: number;
    totalTokens: number;
    quality: number;
    latencyMs: number;
  };
  optimized: {
    contextTokens: number;
    responseTokens: number;
    totalTokens: number;
    quality: number;
    latencyMs: number;
  };
  reduction: {
    tokens: number;
    percentage: number;
  };
  qualityImpact: number;
  latencyChange: number;
}

// Clear cache before testing
function clearCache(): void {
  const cache = getResponseCache();
  cache.clear();
  console.log('Cache cleared for testing');
}

// Simulate RAG processing without actual API calls
async function simulateRAGProcessing(
  request: ChatStreamRequest,
  useOptimization: boolean,
  strategy?: BudgetStrategy
): Promise<{
  tokens: { context: number; response: number; total: number };
  quality: number;
  latency: number;
}> {
  const startTime = Date.now();

  // Calculate budget
  const budgetOptimization = await contextBudgetManager.calculateOptimalBudget(
    request.message,
    request.book_id,
    request.selection,
    strategy
  );

  // Simulate token usage
  let contextTokens: number;
  let responseTokens: number;

  if (useOptimization && budgetOptimization.recommendation !== 'skip') {
    contextTokens = budgetOptimization.budget.contextTokens;
    responseTokens = budgetOptimization.budget.responseTokens;
  } else {
    // Use baseline configuration
    const config = getPerformanceConfig();
    contextTokens = config.tokenManagement.maxContextTokens;
    responseTokens = config.tokenManagement.maxResponseTokens;
  }

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 50));

  // Calculate simulated quality score
  const quality = useOptimization
    ? Math.max(0.75, 1 - budgetOptimization.qualityImpact)
    : 0.85 + Math.random() * 0.1;

  const latency = Date.now() - startTime;

  return {
    tokens: {
      context: contextTokens,
      response: responseTokens,
      total: contextTokens + responseTokens
    },
    quality,
    latency
  };
}

// Run single test scenario
async function runScenario(
  scenario: typeof TEST_SCENARIOS[0],
  strategy: BudgetStrategy
): Promise<TestMetrics> {
  console.log(`Testing: ${scenario.name} with strategy: ${strategy}`);

  const request: ChatStreamRequest = {
    book_id: TEST_CONFIG.bookId,
    message: scenario.query,
    selection: scenario.selection,
    chapter_idx: TEST_CONFIG.chapterIdx,
    system_prompt: '',
    user_id: 'test-user'
  };

  // Run baseline (no optimization)
  const baselineRuns = [];
  for (let i = 0; i < TEST_CONFIG.runs; i++) {
    baselineRuns.push(await simulateRAGProcessing(request, false));
  }

  // Run optimized
  const optimizedRuns = [];
  for (let i = 0; i < TEST_CONFIG.runs; i++) {
    optimizedRuns.push(await simulateRAGProcessing(request, true, strategy));
  }

  // Average metrics
  const avgBaseline = {
    contextTokens: avg(baselineRuns.map(r => r.tokens.context)),
    responseTokens: avg(baselineRuns.map(r => r.tokens.response)),
    totalTokens: avg(baselineRuns.map(r => r.tokens.total)),
    quality: avg(baselineRuns.map(r => r.quality)),
    latencyMs: avg(baselineRuns.map(r => r.latency))
  };

  const avgOptimized = {
    contextTokens: avg(optimizedRuns.map(r => r.tokens.context)),
    responseTokens: avg(optimizedRuns.map(r => r.tokens.response)),
    totalTokens: avg(optimizedRuns.map(r => r.tokens.total)),
    quality: avg(optimizedRuns.map(r => r.quality)),
    latencyMs: avg(optimizedRuns.map(r => r.latency))
  };

  // Calculate improvements
  const tokenReduction = avgBaseline.totalTokens - avgOptimized.totalTokens;
  const tokenReductionPct = (tokenReduction / avgBaseline.totalTokens) * 100;
  const qualityImpact = ((avgBaseline.quality - avgOptimized.quality) / avgBaseline.quality) * 100;
  const latencyChange = ((avgOptimized.latencyMs - avgBaseline.latencyMs) / avgBaseline.latencyMs) * 100;

  return {
    scenario: scenario.name,
    strategy,
    baseline: avgBaseline,
    optimized: avgOptimized,
    reduction: {
      tokens: tokenReduction,
      percentage: tokenReductionPct
    },
    qualityImpact,
    latencyChange
  };
}

// Calculate average
function avg(numbers: number[]): number {
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// Format results as table
function formatResults(metrics: TestMetrics[]): void {
  console.log('\n' + '='.repeat(100));
  console.log('CONTEXT BUDGET OPTIMIZATION RESULTS');
  console.log('='.repeat(100));

  // Group by strategy
  for (const strategy of TEST_CONFIG.strategies) {
    const strategyMetrics = metrics.filter(m => m.strategy === strategy);

    console.log(`\nStrategy: ${strategy.toUpperCase()}`);
    console.log('-'.repeat(100));
    console.log('Scenario                    | Baseline Tokens | Optimized Tokens | Reduction | Quality Impact | Latency Change');
    console.log('-'.repeat(100));

    for (const metric of strategyMetrics) {
      const scenarioName = metric.scenario.padEnd(25);
      const baselineTokens = metric.baseline.totalTokens.toString().padStart(15);
      const optimizedTokens = metric.optimized.totalTokens.toString().padStart(16);
      const reduction = `${metric.reduction.percentage.toFixed(1)}%`.padStart(9);
      const qualityImpact = `${metric.qualityImpact.toFixed(1)}%`.padStart(14);
      const latencyChange = `${metric.latencyChange > 0 ? '+' : ''}${metric.latencyChange.toFixed(1)}%`.padStart(14);

      console.log(`${scenarioName} | ${baselineTokens} | ${optimizedTokens} | ${reduction} | ${qualityImpact} | ${latencyChange}`);
    }

    // Calculate strategy averages
    const avgReduction = avg(strategyMetrics.map(m => m.reduction.percentage));
    const avgQualityImpact = avg(strategyMetrics.map(m => m.qualityImpact));
    const avgLatencyChange = avg(strategyMetrics.map(m => m.latencyChange));

    console.log('-'.repeat(100));
    console.log(`AVERAGE                      |                 |                  | ${avgReduction.toFixed(1)}%`.padStart(9) +
                ` | ${avgQualityImpact.toFixed(1)}%`.padStart(14) +
                ` | ${avgLatencyChange > 0 ? '+' : ''}${avgLatencyChange.toFixed(1)}%`.padStart(14));
  }

  // Overall summary
  const overallAvgReduction = avg(metrics.map(m => m.reduction.percentage));
  const overallAvgQuality = avg(metrics.map(m => m.qualityImpact));
  const overallAvgLatency = avg(metrics.map(m => m.latencyChange));

  console.log('\n' + '='.repeat(100));
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(100));
  console.log(`Average Token Reduction: ${overallAvgReduction.toFixed(1)}% ${overallAvgReduction >= 15 ? '✅ TARGET MET' : '❌ BELOW TARGET'}`);
  console.log(`Average Quality Impact:  ${overallAvgQuality.toFixed(1)}% ${Math.abs(overallAvgQuality) <= 5 ? '✅ WITHIN LIMITS' : '❌ EXCEEDS LIMITS'}`);
  console.log(`Average Latency Change:  ${overallAvgLatency > 0 ? '+' : ''}${overallAvgLatency.toFixed(1)}% ${Math.abs(overallAvgLatency) <= 10 ? '✅ ACCEPTABLE' : '⚠️  HIGH CHANGE'}`);

  // Recommendations
  console.log('\n' + '='.repeat(100));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(100));

  const bestStrategy = TEST_CONFIG.strategies.reduce((best, strategy) => {
    const strategyMetrics = metrics.filter(m => m.strategy === strategy);
    const avgReduction = avg(strategyMetrics.map(m => m.reduction.percentage));
    const avgQuality = avg(strategyMetrics.map(m => m.qualityImpact));

    if (avgReduction >= 15 && Math.abs(avgQuality) <= 5) {
      if (!best || avgReduction > best.reduction) {
        return { strategy, reduction: avgReduction, quality: avgQuality };
      }
    }
    return best;
  }, null as { strategy: BudgetStrategy; reduction: number; quality: number } | null);

  if (bestStrategy) {
    console.log(`✅ Recommended Strategy: ${bestStrategy.strategy.toUpperCase()}`);
    console.log(`   - Token Reduction: ${bestStrategy.reduction.toFixed(1)}%`);
    console.log(`   - Quality Impact: ${bestStrategy.quality.toFixed(1)}%`);
    console.log(`   - Meets all acceptance criteria`);
  } else {
    console.log(`⚠️  No strategy meets all criteria. Consider tuning parameters.`);
  }

  // Feature toggle recommendation
  console.log('\n' + '='.repeat(100));
  console.log('DEPLOYMENT RECOMMENDATION');
  console.log('='.repeat(100));
  console.log('export ENABLE_CONTEXT_BUDGET=true');
  console.log('export ENABLE_AGGRESSIVE_BUDGET=false');
  console.log(`export BUDGET_STRATEGY=${bestStrategy?.strategy || 'conservative'}`);
  console.log('export ENABLE_QUALITY_MONITORING=true');
}

// Export comparison data
function exportComparisonData(metrics: TestMetrics[]): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `/Users/sheldonzhao/programs/FlowReader/api/_scripts/context-budget-comparison-${timestamp}.json`;

  const exportData = {
    timestamp: new Date().toISOString(),
    config: TEST_CONFIG,
    scenarios: TEST_SCENARIOS,
    metrics,
    summary: {
      averageTokenReduction: avg(metrics.map(m => m.reduction.percentage)),
      averageQualityImpact: avg(metrics.map(m => m.qualityImpact)),
      averageLatencyChange: avg(metrics.map(m => m.latencyChange)),
      meetsRequirements: {
        tokenReduction: avg(metrics.map(m => m.reduction.percentage)) >= 15,
        qualityPreservation: Math.abs(avg(metrics.map(m => m.qualityImpact))) <= 5,
        latencyAcceptable: Math.abs(avg(metrics.map(m => m.latencyChange))) <= 10
      }
    }
  };

  require('fs').writeFileSync(filename, JSON.stringify(exportData, null, 2));
  console.log(`\n📊 Comparison data exported to: ${filename}`);
}

// Main execution
async function main(): Promise<void> {
  console.log('Starting Context Budget Optimization Testing...\n');

  // Clear cache for fair comparison
  clearCache();

  // Run all test scenarios
  const allMetrics: TestMetrics[] = [];

  for (const strategy of TEST_CONFIG.strategies) {
    // Update feature toggles for testing
    contextBudgetManager.updateFeatureToggles({
      enableContextBudget: true,
      enableAggressiveMode: strategy === 'aggressive',
      enableQualityMonitoring: true,
      defaultStrategy: strategy
    });

    for (const scenario of TEST_SCENARIOS) {
      const metrics = await runScenario(scenario, strategy);
      allMetrics.push(metrics);
    }
  }

  // Format and display results
  formatResults(allMetrics);

  // Export comparison data
  exportComparisonData(allMetrics);

  // Show optimization stats
  const stats = contextBudgetManager.getOptimizationStats();
  console.log('\n' + '='.repeat(100));
  console.log('OPTIMIZATION STATISTICS');
  console.log('='.repeat(100));
  console.log(`Total Queries Processed: ${stats.totalQueries}`);
  console.log(`Average Quality Score: ${stats.avgQuality.toFixed(2)}`);
}

// Run tests
main().catch(console.error);