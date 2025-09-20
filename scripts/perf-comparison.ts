/**
 * Performance Comparison and Reporting
 * Part of T8-PERF-COST optimization baseline measurement infrastructure
 *
 * This module provides:
 * - Baseline vs optimized performance comparison
 * - Statistical significance testing
 * - Regression detection
 * - Detailed performance reports
 */

import fs from 'fs/promises';
import path from 'path';

// Import performance metrics types
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
    ttft?: LatencyMetrics;
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
  ttft?: number;
  latency: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  success: boolean;
  error?: string;
}

// Comparison result interfaces
interface ComparisonResult {
  metadata: {
    comparisonId: string;
    timestamp: string;
    baselineFile: string;
    currentFile: string;
    baselineTimestamp: string;
    currentTimestamp: string;
  };
  summary: {
    overallImprovement: number;
    significantChanges: string[];
    regressions: string[];
    achievements: {
      tokenReduction: {
        achieved: number;
        target: number;
        met: boolean;
      };
      latencyReduction: {
        achieved: number;
        target: number;
        met: boolean;
      };
      costReduction: {
        achieved: number;
        target: number;
        met: boolean;
      };
      qualityMaintained: boolean;
    };
  };
  detailed: {
    latency: MetricComparison;
    tokens: MetricComparison;
    cost: MetricComparison;
    quality?: MetricComparison;
    throughput: MetricComparison;
  };
  recommendations: string[];
}

interface MetricComparison {
  baseline: any;
  current: any;
  change: {
    absolute: number;
    percentage: number;
    direction: 'improvement' | 'regression' | 'neutral';
  };
  significance: {
    isSignificant: boolean;
    confidence: number;
    pValue?: number;
  };
}

export class PerformanceComparator {
  private readonly SIGNIFICANCE_THRESHOLD = 0.05;
  private readonly IMPROVEMENT_THRESHOLDS = {
    tokenReduction: 0.10,     // 10% token reduction target
    latencyReduction: 0.15,   // 15% latency reduction target
    costReduction: 0.12,      // 12% cost reduction target
    qualityMaintenance: -0.02 // -2% quality regression threshold
  };

  /**
   * Compare current performance against baseline
   */
  async comparePerformance(
    currentFile: string,
    baselineFile: string,
    outputFile: string,
    format: 'json' | 'csv' | 'table' = 'json'
  ): Promise<ComparisonResult> {
    console.log(`📊 Comparing performance...`);
    console.log(`Current: ${currentFile}`);
    console.log(`Baseline: ${baselineFile}`);

    // Load performance data
    const currentData = await this.loadPerformanceData(currentFile);
    const baselineData = await this.loadPerformanceData(baselineFile);

    // Perform comparison
    const comparison = await this.performComparison(currentData, baselineData);

    // Save results
    await this.saveComparison(comparison, outputFile, format);

    console.log(`✅ Comparison completed: ${outputFile}`);
    return comparison;
  }

  /**
   * Load performance data from file
   */
  private async loadPerformanceData(filePath: string): Promise<PerformanceMetrics> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load performance data from ${filePath}: ${error}`);
    }
  }

  /**
   * Perform detailed performance comparison
   */
  private async performComparison(
    current: PerformanceMetrics,
    baseline: PerformanceMetrics
  ): Promise<ComparisonResult> {
    // Compare latency metrics
    const latencyComparison = this.compareLatencyMetrics(
      current.metrics.latency,
      baseline.metrics.latency,
      current.rawData.map(r => r.latency),
      baseline.rawData.map(r => r.latency)
    );

    // Compare token metrics
    const tokenComparison = this.compareTokenMetrics(
      current.metrics.tokens,
      baseline.metrics.tokens
    );

    // Compare cost metrics
    const costComparison = this.compareCostMetrics(
      current.metrics.cost,
      baseline.metrics.cost
    );

    // Compare quality metrics (if available)
    let qualityComparison: MetricComparison | undefined;
    if (current.metrics.quality && baseline.metrics.quality) {
      qualityComparison = this.compareQualityMetrics(
        current.metrics.quality,
        baseline.metrics.quality
      );
    }

    // Compare throughput metrics
    const throughputComparison = this.compareThroughputMetrics(
      current.metrics.throughput,
      baseline.metrics.throughput
    );

    // Calculate overall improvement
    const overallImprovement = this.calculateOverallImprovement(
      latencyComparison,
      tokenComparison,
      costComparison,
      qualityComparison
    );

    // Identify significant changes and regressions
    const significantChanges = this.identifySignificantChanges({
      latency: latencyComparison,
      tokens: tokenComparison,
      cost: costComparison,
      quality: qualityComparison,
      throughput: throughputComparison
    });

    const regressions = this.identifyRegressions({
      latency: latencyComparison,
      tokens: tokenComparison,
      cost: costComparison,
      quality: qualityComparison,
      throughput: throughputComparison
    });

    // Check if optimization targets are met
    const achievements = this.assessOptimizationAchievements(
      tokenComparison,
      latencyComparison,
      costComparison,
      qualityComparison
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      latencyComparison,
      tokenComparison,
      costComparison,
      qualityComparison,
      achievements
    );

    return {
      metadata: {
        comparisonId: `comp-${Date.now()}`,
        timestamp: new Date().toISOString(),
        baselineFile: baseline.timestamp,
        currentFile: current.timestamp,
        baselineTimestamp: baseline.timestamp,
        currentTimestamp: current.timestamp
      },
      summary: {
        overallImprovement,
        significantChanges,
        regressions,
        achievements
      },
      detailed: {
        latency: latencyComparison,
        tokens: tokenComparison,
        cost: costComparison,
        quality: qualityComparison,
        throughput: throughputComparison
      },
      recommendations
    };
  }

  /**
   * Compare latency metrics with statistical significance
   */
  private compareLatencyMetrics(
    current: LatencyMetrics,
    baseline: LatencyMetrics,
    currentSamples: number[],
    baselineSamples: number[]
  ): MetricComparison {
    const p95Change = ((current.p95 - baseline.p95) / baseline.p95) * 100;
    const meanChange = ((current.mean - baseline.mean) / baseline.mean) * 100;

    // Perform t-test for statistical significance
    const significance = this.performTTest(currentSamples, baselineSamples);

    // Determine direction (negative is better for latency)
    let direction: 'improvement' | 'regression' | 'neutral' = 'neutral';
    if (Math.abs(p95Change) > 5) {
      direction = p95Change < 0 ? 'improvement' : 'regression';
    }

    return {
      baseline: baseline,
      current: current,
      change: {
        absolute: current.p95 - baseline.p95,
        percentage: Number(p95Change.toFixed(2)),
        direction
      },
      significance
    };
  }

  /**
   * Compare token metrics
   */
  private compareTokenMetrics(
    current: TokenMetrics,
    baseline: TokenMetrics
  ): MetricComparison {
    const totalChange = ((current.total - baseline.total) / baseline.total) * 100;
    const outputChange = ((current.meanOutput - baseline.meanOutput) / baseline.meanOutput) * 100;

    // Token reduction is an improvement (negative is better)
    let direction: 'improvement' | 'regression' | 'neutral' = 'neutral';
    if (Math.abs(totalChange) > 5) {
      direction = totalChange < 0 ? 'improvement' : 'regression';
    }

    return {
      baseline: baseline,
      current: current,
      change: {
        absolute: current.total - baseline.total,
        percentage: Number(totalChange.toFixed(2)),
        direction
      },
      significance: {
        isSignificant: Math.abs(totalChange) > 10,
        confidence: Math.abs(totalChange) > 10 ? 0.95 : 0.8
      }
    };
  }

  /**
   * Compare cost metrics
   */
  private compareCostMetrics(
    current: CostMetrics,
    baseline: CostMetrics
  ): MetricComparison {
    const costChange = ((current.perRequest - baseline.perRequest) / baseline.perRequest) * 100;

    // Cost reduction is an improvement (negative is better)
    let direction: 'improvement' | 'regression' | 'neutral' = 'neutral';
    if (Math.abs(costChange) > 3) {
      direction = costChange < 0 ? 'improvement' : 'regression';
    }

    return {
      baseline: baseline,
      current: current,
      change: {
        absolute: current.perRequest - baseline.perRequest,
        percentage: Number(costChange.toFixed(2)),
        direction
      },
      significance: {
        isSignificant: Math.abs(costChange) > 5,
        confidence: Math.abs(costChange) > 5 ? 0.95 : 0.8
      }
    };
  }

  /**
   * Compare quality metrics
   */
  private compareQualityMetrics(
    current: QualityMetrics,
    baseline: QualityMetrics
  ): MetricComparison {
    const qualityChange = ((current.score - baseline.score) / baseline.score) * 100;

    // Quality increase is an improvement (positive is better)
    let direction: 'improvement' | 'regression' | 'neutral' = 'neutral';
    if (Math.abs(qualityChange) > 2) {
      direction = qualityChange > 0 ? 'improvement' : 'regression';
    }

    return {
      baseline: baseline,
      current: current,
      change: {
        absolute: current.score - baseline.score,
        percentage: Number(qualityChange.toFixed(2)),
        direction
      },
      significance: {
        isSignificant: Math.abs(qualityChange) > 3,
        confidence: Math.abs(qualityChange) > 3 ? 0.95 : 0.8
      }
    };
  }

  /**
   * Compare throughput metrics
   */
  private compareThroughputMetrics(
    current: ThroughputMetrics,
    baseline: ThroughputMetrics
  ): MetricComparison {
    const throughputChange = ((current.requestsPerSecond - baseline.requestsPerSecond) / baseline.requestsPerSecond) * 100;

    // Throughput increase is an improvement (positive is better)
    let direction: 'improvement' | 'regression' | 'neutral' = 'neutral';
    if (Math.abs(throughputChange) > 10) {
      direction = throughputChange > 0 ? 'improvement' : 'regression';
    }

    return {
      baseline: baseline,
      current: current,
      change: {
        absolute: current.requestsPerSecond - baseline.requestsPerSecond,
        percentage: Number(throughputChange.toFixed(2)),
        direction
      },
      significance: {
        isSignificant: Math.abs(throughputChange) > 15,
        confidence: Math.abs(throughputChange) > 15 ? 0.95 : 0.8
      }
    };
  }

  /**
   * Perform statistical t-test
   */
  private performTTest(sample1: number[], sample2: number[]): {
    isSignificant: boolean;
    confidence: number;
    pValue?: number;
  } {
    if (sample1.length < 5 || sample2.length < 5) {
      return { isSignificant: false, confidence: 0.5 };
    }

    // Calculate means
    const mean1 = sample1.reduce((a, b) => a + b, 0) / sample1.length;
    const mean2 = sample2.reduce((a, b) => a + b, 0) / sample2.length;

    // Calculate standard deviations
    const variance1 = sample1.reduce((a, b) => a + Math.pow(b - mean1, 2), 0) / (sample1.length - 1);
    const variance2 = sample2.reduce((a, b) => a + Math.pow(b - mean2, 2), 0) / (sample2.length - 1);

    // Calculate pooled standard error
    const pooledSE = Math.sqrt(variance1 / sample1.length + variance2 / sample2.length);

    // Calculate t-statistic
    const tStat = Math.abs(mean1 - mean2) / pooledSE;

    // Degrees of freedom (simplified)
    const df = sample1.length + sample2.length - 2;

    // Simplified p-value estimation (would use proper t-distribution in production)
    const pValue = tStat > 2 ? 0.01 : tStat > 1.5 ? 0.05 : 0.1;

    return {
      isSignificant: pValue < this.SIGNIFICANCE_THRESHOLD,
      confidence: 1 - pValue,
      pValue
    };
  }

  /**
   * Calculate overall improvement score
   */
  private calculateOverallImprovement(
    latency: MetricComparison,
    tokens: MetricComparison,
    cost: MetricComparison,
    quality?: MetricComparison
  ): number {
    let score = 0;
    let weight = 0;

    // Latency improvement (30% weight)
    if (latency.change.direction === 'improvement') {
      score += Math.abs(latency.change.percentage) * 0.3;
    } else if (latency.change.direction === 'regression') {
      score -= Math.abs(latency.change.percentage) * 0.3;
    }
    weight += 0.3;

    // Token reduction (25% weight)
    if (tokens.change.direction === 'improvement') {
      score += Math.abs(tokens.change.percentage) * 0.25;
    } else if (tokens.change.direction === 'regression') {
      score -= Math.abs(tokens.change.percentage) * 0.25;
    }
    weight += 0.25;

    // Cost reduction (25% weight)
    if (cost.change.direction === 'improvement') {
      score += Math.abs(cost.change.percentage) * 0.25;
    } else if (cost.change.direction === 'regression') {
      score -= Math.abs(cost.change.percentage) * 0.25;
    }
    weight += 0.25;

    // Quality maintenance (20% weight)
    if (quality) {
      if (quality.change.direction === 'improvement') {
        score += Math.abs(quality.change.percentage) * 0.2;
      } else if (quality.change.direction === 'regression') {
        score -= Math.abs(quality.change.percentage) * 0.2;
      }
      weight += 0.2;
    }

    return Number((score / weight).toFixed(2));
  }

  /**
   * Identify significant changes
   */
  private identifySignificantChanges(comparisons: {
    latency: MetricComparison;
    tokens: MetricComparison;
    cost: MetricComparison;
    quality?: MetricComparison;
    throughput: MetricComparison;
  }): string[] {
    const changes: string[] = [];

    Object.entries(comparisons).forEach(([metric, comparison]) => {
      if (comparison && comparison.significance.isSignificant) {
        const direction = comparison.change.direction;
        const percentage = Math.abs(comparison.change.percentage);
        changes.push(`${metric}: ${percentage.toFixed(1)}% ${direction}`);
      }
    });

    return changes;
  }

  /**
   * Identify performance regressions
   */
  private identifyRegressions(comparisons: {
    latency: MetricComparison;
    tokens: MetricComparison;
    cost: MetricComparison;
    quality?: MetricComparison;
    throughput: MetricComparison;
  }): string[] {
    const regressions: string[] = [];

    Object.entries(comparisons).forEach(([metric, comparison]) => {
      if (comparison && comparison.change.direction === 'regression' && comparison.significance.isSignificant) {
        const percentage = Math.abs(comparison.change.percentage);
        regressions.push(`${metric}: ${percentage.toFixed(1)}% regression`);
      }
    });

    return regressions;
  }

  /**
   * Assess optimization target achievements
   */
  private assessOptimizationAchievements(
    tokens: MetricComparison,
    latency: MetricComparison,
    cost: MetricComparison,
    quality?: MetricComparison
  ) {
    const tokenReductionAchieved = tokens.change.direction === 'improvement'
      ? Math.abs(tokens.change.percentage) / 100
      : 0;

    const latencyReductionAchieved = latency.change.direction === 'improvement'
      ? Math.abs(latency.change.percentage) / 100
      : 0;

    const costReductionAchieved = cost.change.direction === 'improvement'
      ? Math.abs(cost.change.percentage) / 100
      : 0;

    const qualityMaintained = quality
      ? quality.change.percentage >= this.IMPROVEMENT_THRESHOLDS.qualityMaintenance * 100
      : true; // Assume maintained if not measured

    return {
      tokenReduction: {
        achieved: Number(tokenReductionAchieved.toFixed(3)),
        target: this.IMPROVEMENT_THRESHOLDS.tokenReduction,
        met: tokenReductionAchieved >= this.IMPROVEMENT_THRESHOLDS.tokenReduction
      },
      latencyReduction: {
        achieved: Number(latencyReductionAchieved.toFixed(3)),
        target: this.IMPROVEMENT_THRESHOLDS.latencyReduction,
        met: latencyReductionAchieved >= this.IMPROVEMENT_THRESHOLDS.latencyReduction
      },
      costReduction: {
        achieved: Number(costReductionAchieved.toFixed(3)),
        target: this.IMPROVEMENT_THRESHOLDS.costReduction,
        met: costReductionAchieved >= this.IMPROVEMENT_THRESHOLDS.costReduction
      },
      qualityMaintained
    };
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    latency: MetricComparison,
    tokens: MetricComparison,
    cost: MetricComparison,
    quality?: MetricComparison,
    achievements: any
  ): string[] {
    const recommendations: string[] = [];

    // Latency recommendations
    if (!achievements.latencyReduction.met) {
      if (latency.change.direction === 'regression') {
        recommendations.push('CRITICAL: Latency has regressed. Review recent changes and consider rollback.');
      } else {
        recommendations.push('Consider implementing response streaming optimization or reducing processing overhead.');
      }
    }

    // Token recommendations
    if (!achievements.tokenReduction.met) {
      if (tokens.change.direction === 'regression') {
        recommendations.push('Token usage has increased. Review prompt optimization and context window management.');
      } else {
        recommendations.push('Explore prompt compression, context pruning, or model efficiency improvements.');
      }
    }

    // Cost recommendations
    if (!achievements.costReduction.met) {
      recommendations.push('Consider model optimization, caching strategies, or batch processing to reduce costs.');
    }

    // Quality recommendations
    if (quality && !achievements.qualityMaintained) {
      recommendations.push('IMPORTANT: Quality has degraded below threshold. Review optimization impact on response quality.');
    }

    // Success recommendations
    if (achievements.tokenReduction.met && achievements.latencyReduction.met) {
      recommendations.push('Excellent progress! Consider applying optimizations to other endpoints.');
    }

    return recommendations;
  }

  /**
   * Save comparison results
   */
  private async saveComparison(
    comparison: ComparisonResult,
    outputFile: string,
    format: 'json' | 'csv' | 'table'
  ): Promise<void> {
    const outputDir = path.dirname(outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    switch (format) {
      case 'json':
        await fs.writeFile(outputFile, JSON.stringify(comparison, null, 2));
        break;
      case 'csv':
        await this.saveComparisonCSV(comparison, outputFile);
        break;
      case 'table':
        await this.saveComparisonTable(comparison, outputFile);
        break;
    }
  }

  /**
   * Save comparison as CSV
   */
  private async saveComparisonCSV(comparison: ComparisonResult, outputFile: string): Promise<void> {
    const rows = [
      ['metric', 'baseline', 'current', 'change_abs', 'change_pct', 'direction', 'significant'],
      ['latency_p95', comparison.detailed.latency.baseline.p95, comparison.detailed.latency.current.p95,
       comparison.detailed.latency.change.absolute, comparison.detailed.latency.change.percentage,
       comparison.detailed.latency.change.direction, comparison.detailed.latency.significance.isSignificant],
      // Add more rows for other metrics...
    ];

    const csvContent = rows.map(row => row.join(',')).join('\n');
    await fs.writeFile(outputFile, csvContent);
  }

  /**
   * Save comparison as table
   */
  private async saveComparisonTable(comparison: ComparisonResult, outputFile: string): Promise<void> {
    const content = `
Performance Comparison Report
============================
Generated: ${comparison.metadata.timestamp}
Baseline: ${comparison.metadata.baselineTimestamp}
Current: ${comparison.metadata.currentTimestamp}

SUMMARY
-------
Overall Improvement: ${comparison.summary.overallImprovement.toFixed(1)}%
Significant Changes: ${comparison.summary.significantChanges.length}
Regressions: ${comparison.summary.regressions.length}

OPTIMIZATION TARGETS
-------------------
Token Reduction: ${(comparison.summary.achievements.tokenReduction.achieved * 100).toFixed(1)}% / ${(comparison.summary.achievements.tokenReduction.target * 100).toFixed(1)}% ${comparison.summary.achievements.tokenReduction.met ? '✅' : '❌'}
Latency Reduction: ${(comparison.summary.achievements.latencyReduction.achieved * 100).toFixed(1)}% / ${(comparison.summary.achievements.latencyReduction.target * 100).toFixed(1)}% ${comparison.summary.achievements.latencyReduction.met ? '✅' : '❌'}
Cost Reduction: ${(comparison.summary.achievements.costReduction.achieved * 100).toFixed(1)}% / ${(comparison.summary.achievements.costReduction.target * 100).toFixed(1)}% ${comparison.summary.achievements.costReduction.met ? '✅' : '❌'}
Quality Maintained: ${comparison.summary.achievements.qualityMaintained ? '✅' : '❌'}

DETAILED METRICS
---------------
Latency (P95): ${comparison.detailed.latency.baseline.p95}ms → ${comparison.detailed.latency.current.p95}ms (${comparison.detailed.latency.change.percentage.toFixed(1)}%)
Tokens (Total): ${comparison.detailed.tokens.baseline.total} → ${comparison.detailed.tokens.current.total} (${comparison.detailed.tokens.change.percentage.toFixed(1)}%)
Cost (Per Request): $${comparison.detailed.cost.baseline.perRequest.toFixed(6)} → $${comparison.detailed.cost.current.perRequest.toFixed(6)} (${comparison.detailed.cost.change.percentage.toFixed(1)}%)
${comparison.detailed.quality ? `Quality Score: ${(comparison.detailed.quality.baseline.score * 100).toFixed(1)}% → ${(comparison.detailed.quality.current.score * 100).toFixed(1)}% (${comparison.detailed.quality.change.percentage.toFixed(1)}%)` : ''}

RECOMMENDATIONS
--------------
${comparison.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

REGRESSIONS
-----------
${comparison.summary.regressions.length > 0 ? comparison.summary.regressions.map((reg, i) => `${i + 1}. ${reg}`).join('\n') : 'None detected'}
`;

    await fs.writeFile(outputFile, content.trim());
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 6) {
    console.error('Usage: tsx perf-comparison.ts --current <file> --baseline <file> --output <file> [--format json|csv|table]');
    process.exit(1);
  }

  let currentFile = '';
  let baselineFile = '';
  let outputFile = '';
  let format: 'json' | 'csv' | 'table' = 'json';

  for (let i = 0; i < args.length; i += 2) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case '--current':
        currentFile = value;
        break;
      case '--baseline':
        baselineFile = value;
        break;
      case '--output':
        outputFile = value;
        break;
      case '--format':
        format = value as 'json' | 'csv' | 'table';
        break;
    }
  }

  if (!currentFile || !baselineFile || !outputFile) {
    console.error('Missing required arguments');
    process.exit(1);
  }

  try {
    const comparator = new PerformanceComparator();
    const result = await comparator.comparePerformance(currentFile, baselineFile, outputFile, format);

    console.log('\n📊 Performance Comparison Summary:');
    console.log(`Overall Improvement: ${result.summary.overallImprovement.toFixed(1)}%`);
    console.log(`Targets Met: ${Object.values(result.summary.achievements).filter(Boolean).length}/4`);
    if (result.summary.regressions.length > 0) {
      console.log(`⚠️  Regressions Detected: ${result.summary.regressions.length}`);
    }

  } catch (error) {
    console.error('❌ Comparison failed:', error);
    process.exit(1);
  }
}

// Export for use in other modules
export { PerformanceComparator, type ComparisonResult };

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}