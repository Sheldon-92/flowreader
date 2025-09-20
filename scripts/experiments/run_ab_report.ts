#!/usr/bin/env node

/**
 * A/B Test Reporting Script
 *
 * Command-line tool for generating experiment reports, analyzing results,
 * and managing experiment lifecycle.
 */

import { program } from 'commander';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// Import experiment framework (in real implementation, these would be proper imports)
interface ExperimentConfig {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  startDate: string;
  endDate?: string;
}

interface ExperimentResults {
  experimentId: string;
  generatedAt: string;
  summary: {
    totalParticipants: number;
    duration: number;
    confidenceLevel: number;
    primaryMetricWinner?: string;
    overallRecommendation: string;
  };
  variants: any[];
  metrics: any[];
  recommendations: any[];
}

interface ReportOptions {
  experimentId?: string;
  timeRange?: string;
  format: 'json' | 'csv' | 'html' | 'markdown';
  output?: string;
  verbose: boolean;
  includeRawData: boolean;
  interactive: boolean;
}

/**
 * Experiment reporting service
 */
class ExperimentReportingService {
  private configPath: string;
  private dataPath: string;

  constructor() {
    this.configPath = join(process.cwd(), 'experiments.config.json');
    this.dataPath = join(process.cwd(), 'experiment-data');
  }

  /**
   * Generate comprehensive experiment report
   */
  async generateReport(options: ReportOptions): Promise<void> {
    try {
      console.log('🔬 FlowReader Experiment Report Generator\n');

      if (options.experimentId) {
        await this.generateSingleExperimentReport(options.experimentId, options);
      } else {
        await this.generateAllExperimentsReport(options);
      }

    } catch (error) {
      console.error('❌ Failed to generate report:', error);
      process.exit(1);
    }
  }

  /**
   * Generate report for specific experiment
   */
  private async generateSingleExperimentReport(
    experimentId: string,
    options: ReportOptions
  ): Promise<void> {
    console.log(`📊 Generating report for experiment: ${experimentId}\n`);

    // Load experiment configuration
    const config = await this.loadExperimentConfig(experimentId);
    if (!config) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    console.log(`Experiment: ${config.name}`);
    console.log(`Status: ${config.status}`);
    console.log(`Started: ${new Date(config.startDate).toLocaleDateString()}`);

    if (config.endDate) {
      console.log(`Ended: ${new Date(config.endDate).toLocaleDateString()}`);
    }

    console.log('');

    // Generate analysis
    const results = await this.analyzeExperiment(experimentId, options);

    // Output results
    await this.outputResults(results, options);

    console.log('✅ Report generated successfully!');
  }

  /**
   * Generate report for all experiments
   */
  private async generateAllExperimentsReport(options: ReportOptions): Promise<void> {
    console.log('📈 Generating summary report for all experiments\n');

    const experiments = await this.listAllExperiments();

    if (experiments.length === 0) {
      console.log('ℹ️  No experiments found');
      return;
    }

    // Summary statistics
    const activeExperiments = experiments.filter(e => e.status === 'active');
    const completedExperiments = experiments.filter(e => e.status === 'completed');

    console.log('📋 Experiment Summary:');
    console.log(`   Total Experiments: ${experiments.length}`);
    console.log(`   Active: ${activeExperiments.length}`);
    console.log(`   Completed: ${completedExperiments.length}`);
    console.log('');

    // Active experiments details
    if (activeExperiments.length > 0) {
      console.log('🟢 Active Experiments:');
      for (const exp of activeExperiments) {
        const duration = Math.floor((Date.now() - new Date(exp.startDate).getTime()) / (1000 * 60 * 60 * 24));
        console.log(`   • ${exp.name} (${exp.id}) - ${duration} days running`);
      }
      console.log('');
    }

    // Recently completed experiments
    if (completedExperiments.length > 0) {
      console.log('✅ Recently Completed Experiments:');
      const recentlyCompleted = completedExperiments
        .filter(e => e.endDate && (Date.now() - new Date(e.endDate).getTime()) < 7 * 24 * 60 * 60 * 1000)
        .slice(0, 5);

      for (const exp of recentlyCompleted) {
        console.log(`   • ${exp.name} (${exp.id})`);
      }
      console.log('');
    }

    // Generate detailed reports if requested
    if (options.verbose) {
      for (const exp of experiments) {
        if (exp.status === 'active' || exp.status === 'completed') {
          console.log(`\n📊 Detailed Analysis: ${exp.name}`);
          console.log('─'.repeat(50));
          await this.generateSingleExperimentReport(exp.id, { ...options, output: undefined });
        }
      }
    }
  }

  /**
   * Analyze experiment data and generate insights
   */
  private async analyzeExperiment(
    experimentId: string,
    options: ReportOptions
  ): Promise<ExperimentResults> {
    // In real implementation, this would query the actual metrics database
    const mockResults: ExperimentResults = {
      experimentId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalParticipants: 1247,
        duration: 14,
        confidenceLevel: 0.95,
        primaryMetricWinner: 'treatment',
        overallRecommendation: 'deploy_winner'
      },
      variants: [
        {
          id: 'control',
          name: 'Control',
          participants: 623,
          metrics: {
            conversion_rate: { value: 0.12, confidenceInterval: [0.10, 0.14] },
            engagement_time: { value: 45.2, confidenceInterval: [42.1, 48.3] }
          }
        },
        {
          id: 'treatment',
          name: 'Treatment',
          participants: 624,
          metrics: {
            conversion_rate: { value: 0.16, confidenceInterval: [0.14, 0.18] },
            engagement_time: { value: 52.8, confidenceInterval: [49.5, 56.1] }
          }
        }
      ],
      metrics: [
        {
          id: 'conversion_rate',
          name: 'Conversion Rate',
          winner: 'treatment',
          statisticalSignificance: 0.97,
          improvement: 33.3
        },
        {
          id: 'engagement_time',
          name: 'Engagement Time',
          winner: 'treatment',
          statisticalSignificance: 0.89,
          improvement: 16.8
        }
      ],
      recommendations: [
        {
          type: 'deploy',
          confidence: 'high',
          reason: 'Treatment variant shows significant improvement',
          actions: ['Deploy treatment variant', 'Monitor post-deployment metrics']
        }
      ]
    };

    // Apply time range filtering if specified
    if (options.timeRange) {
      mockResults.summary = this.filterByTimeRange(mockResults.summary, options.timeRange);
    }

    // Print analysis
    this.printAnalysis(mockResults, options);

    return mockResults;
  }

  /**
   * Print analysis results to console
   */
  private printAnalysis(results: ExperimentResults, options: ReportOptions): void {
    const { summary, variants, metrics, recommendations } = results;

    // Summary
    console.log('📈 Summary:');
    console.log(`   Participants: ${summary.totalParticipants.toLocaleString()}`);
    console.log(`   Duration: ${summary.duration} days`);
    console.log(`   Confidence: ${(summary.confidenceLevel * 100).toFixed(1)}%`);
    console.log(`   Recommendation: ${summary.overallRecommendation.replace('_', ' ')}`);
    console.log('');

    // Variants performance
    console.log('🎯 Variant Performance:');
    for (const variant of variants) {
      console.log(`   ${variant.name} (${variant.participants} participants):`);
      for (const [metricId, metric] of Object.entries(variant.metrics as any)) {
        const improvement = variant.id === 'control' ? '' :
          ` (${this.calculateImprovement(variant.metrics[metricId].value, variants[0].metrics[metricId].value)}% vs control)`;
        console.log(`     • ${metricId}: ${this.formatMetricValue(metricId, metric.value)}${improvement}`);
      }
      console.log('');
    }

    // Statistical significance
    console.log('📊 Statistical Analysis:');
    for (const metric of metrics) {
      const significance = (metric.statisticalSignificance * 100).toFixed(1);
      const winner = metric.winner === 'treatment' ? '🏆 Treatment' : '🏆 Control';
      console.log(`   ${metric.name}: ${winner} (+${metric.improvement.toFixed(1)}%, ${significance}% confidence)`);
    }
    console.log('');

    // Recommendations
    console.log('💡 Recommendations:');
    for (const rec of recommendations) {
      console.log(`   ${this.getRecommendationIcon(rec.type)} ${rec.reason}`);
      if (options.verbose) {
        for (const action of rec.actions) {
          console.log(`     • ${action}`);
        }
      }
    }
    console.log('');
  }

  /**
   * Output results in specified format
   */
  private async outputResults(results: ExperimentResults, options: ReportOptions): Promise<void> {
    if (!options.output) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = options.output.replace('{timestamp}', timestamp);

    let content: string;

    switch (options.format) {
      case 'json':
        content = JSON.stringify(results, null, 2);
        break;

      case 'csv':
        content = this.convertToCSV(results);
        break;

      case 'html':
        content = this.convertToHTML(results);
        break;

      case 'markdown':
        content = this.convertToMarkdown(results);
        break;

      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }

    writeFileSync(filename, content);
    console.log(`📄 Report saved to: ${filename}`);
  }

  /**
   * Interactive report mode
   */
  async runInteractive(): Promise<void> {
    console.log('🔬 FlowReader Experiment Interactive Dashboard\n');

    const experiments = await this.listAllExperiments();

    if (experiments.length === 0) {
      console.log('ℹ️  No experiments found. Create experiments first.');
      return;
    }

    // Interactive menu (simplified implementation)
    console.log('Available commands:');
    console.log('  1. View all experiments');
    console.log('  2. Analyze specific experiment');
    console.log('  3. Export data');
    console.log('  4. Check experiment health');
    console.log('  5. Exit');
    console.log('');

    // In a real implementation, this would use a proper CLI library like inquirer
    console.log('💡 Use --experiment-id <id> to analyze a specific experiment');
    console.log('💡 Use --list to see all experiments');
    console.log('💡 Use --health to check experiment health');
  }

  /**
   * Check experiment health and alerts
   */
  async checkHealth(): Promise<void> {
    console.log('🏥 Experiment Health Check\n');

    const experiments = await this.listAllExperiments();
    const activeExperiments = experiments.filter(e => e.status === 'active');

    if (activeExperiments.length === 0) {
      console.log('✅ No active experiments to monitor');
      return;
    }

    for (const exp of activeExperiments) {
      console.log(`🔍 Checking: ${exp.name}`);

      const health = await this.assessExperimentHealth(exp.id);

      if (health.alerts.length === 0) {
        console.log('   ✅ Healthy');
      } else {
        console.log('   ⚠️  Issues detected:');
        for (const alert of health.alerts) {
          console.log(`     • ${alert}`);
        }
      }

      console.log(`   📊 Participants: ${health.participants}`);
      console.log(`   ⏱️  Running: ${health.daysSinceStart} days`);
      console.log('');
    }
  }

  // Helper methods

  private async loadExperimentConfig(experimentId: string): Promise<ExperimentConfig | null> {
    // In real implementation, load from database or config files
    const mockConfigs: ExperimentConfig[] = [
      {
        id: 'knowledge_latency_optimization',
        name: 'Knowledge Enhancement Latency Optimization',
        status: 'active',
        startDate: '2024-01-15T00:00:00Z'
      },
      {
        id: 'feedback_smart_triggers',
        name: 'Smart Feedback Triggers',
        status: 'completed',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-14T23:59:59Z'
      }
    ];

    return mockConfigs.find(c => c.id === experimentId) || null;
  }

  private async listAllExperiments(): Promise<ExperimentConfig[]> {
    // Mock data - in real implementation, query database
    return [
      {
        id: 'knowledge_latency_optimization',
        name: 'Knowledge Enhancement Latency Optimization',
        status: 'active',
        startDate: '2024-01-15T00:00:00Z'
      },
      {
        id: 'feedback_smart_triggers',
        name: 'Smart Feedback Triggers',
        status: 'completed',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-14T23:59:59Z'
      },
      {
        id: 'reading_interface_optimization',
        name: 'Reading Interface Optimization',
        status: 'active',
        startDate: '2024-01-20T00:00:00Z'
      }
    ];
  }

  private async assessExperimentHealth(experimentId: string): Promise<{
    participants: number;
    daysSinceStart: number;
    alerts: string[];
  }> {
    // Mock health assessment
    const participants = Math.floor(Math.random() * 1000) + 100;
    const daysSinceStart = Math.floor(Math.random() * 30) + 1;
    const alerts: string[] = [];

    if (participants < 100) {
      alerts.push('Low participant count');
    }

    if (daysSinceStart > 30) {
      alerts.push('Long-running experiment (>30 days)');
    }

    if (Math.random() < 0.3) {
      alerts.push('Statistical significance not yet reached');
    }

    return { participants, daysSinceStart, alerts };
  }

  private filterByTimeRange(summary: any, timeRange: string): any {
    // Simple time range filtering logic
    return summary;
  }

  private calculateImprovement(value: number, baseline: number): string {
    const improvement = ((value - baseline) / baseline) * 100;
    return improvement > 0 ? `+${improvement.toFixed(1)}` : improvement.toFixed(1);
  }

  private formatMetricValue(metricId: string, value: number): string {
    if (metricId.includes('rate') || metricId.includes('conversion')) {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (metricId.includes('time')) {
      return `${value.toFixed(1)}s`;
    }
    return value.toFixed(2);
  }

  private getRecommendationIcon(type: string): string {
    switch (type) {
      case 'deploy': return '🚀';
      case 'continue': return '⏳';
      case 'stop': return '🛑';
      default: return '💡';
    }
  }

  private convertToCSV(results: ExperimentResults): string {
    const lines = [];

    // Header
    lines.push('Metric,Variant,Value,Confidence_Lower,Confidence_Upper,Improvement');

    // Data rows
    for (const variant of results.variants) {
      for (const [metricId, metric] of Object.entries(variant.metrics as any)) {
        const improvement = variant.id === 'control' ? '0' :
          this.calculateImprovement(metric.value, results.variants[0].metrics[metricId].value);

        lines.push(`${metricId},${variant.name},${metric.value},${metric.confidenceInterval[0]},${metric.confidenceInterval[1]},${improvement}`);
      }
    }

    return lines.join('\n');
  }

  private convertToHTML(results: ExperimentResults): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Experiment Report: ${results.experimentId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .metric { margin: 20px 0; }
        .variant { background: #f5f5f5; padding: 10px; margin: 10px 0; }
        .recommendation { background: #e8f5e9; padding: 15px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>Experiment Report</h1>
    <h2>${results.experimentId}</h2>
    <p>Generated: ${new Date(results.generatedAt).toLocaleDateString()}</p>

    <h3>Summary</h3>
    <p>Participants: ${results.summary.totalParticipants}</p>
    <p>Duration: ${results.summary.duration} days</p>
    <p>Recommendation: ${results.summary.overallRecommendation}</p>

    <h3>Variants</h3>
    ${results.variants.map(v => `<div class="variant"><strong>${v.name}</strong> (${v.participants} participants)</div>`).join('')}

    <h3>Recommendations</h3>
    ${results.recommendations.map(r => `<div class="recommendation">${r.reason}</div>`).join('')}
</body>
</html>
    `;
  }

  private convertToMarkdown(results: ExperimentResults): string {
    return `
# Experiment Report: ${results.experimentId}

**Generated:** ${new Date(results.generatedAt).toLocaleDateString()}

## Summary

- **Participants:** ${results.summary.totalParticipants}
- **Duration:** ${results.summary.duration} days
- **Confidence:** ${(results.summary.confidenceLevel * 100).toFixed(1)}%
- **Recommendation:** ${results.summary.overallRecommendation.replace('_', ' ')}

## Variants

${results.variants.map(v => `### ${v.name}\n- Participants: ${v.participants}\n`).join('\n')}

## Metrics

${results.metrics.map(m => `### ${m.name}\n- Winner: ${m.winner}\n- Improvement: ${m.improvement.toFixed(1)}%\n- Confidence: ${(m.statisticalSignificance * 100).toFixed(1)}%\n`).join('\n')}

## Recommendations

${results.recommendations.map(r => `- **${r.type.toUpperCase()}:** ${r.reason}`).join('\n')}
    `;
  }
}

// CLI Setup
program
  .name('run_ab_report')
  .description('FlowReader A/B Test Reporting Tool')
  .version('1.0.0');

program
  .option('-e, --experiment-id <id>', 'Specific experiment ID to analyze')
  .option('-t, --time-range <range>', 'Time range for analysis (e.g., --last-7d, --last-30d)', 'all')
  .option('-f, --format <format>', 'Output format', 'json')
  .option('-o, --output <file>', 'Output file path')
  .option('-v, --verbose', 'Verbose output', false)
  .option('--include-raw-data', 'Include raw event data', false)
  .option('-i, --interactive', 'Run in interactive mode', false)
  .option('--list', 'List all experiments')
  .option('--health', 'Check experiment health')
  .action(async (options) => {
    const service = new ExperimentReportingService();

    try {
      if (options.interactive) {
        await service.runInteractive();
      } else if (options.health) {
        await service.checkHealth();
      } else if (options.list) {
        await service.generateAllExperimentsReport({ ...options, verbose: false });
      } else {
        await service.generateReport(options);
      }
    } catch (error) {
      console.error('❌ Error:', error);
      process.exit(1);
    }
  });

// Specific time range commands
program
  .command('last-7d')
  .description('Generate report for last 7 days')
  .option('-e, --experiment-id <id>', 'Specific experiment ID')
  .option('-f, --format <format>', 'Output format', 'json')
  .action(async (options) => {
    const service = new ExperimentReportingService();
    await service.generateReport({ ...options, timeRange: 'last-7d' });
  });

program
  .command('last-30d')
  .description('Generate report for last 30 days')
  .option('-e, --experiment-id <id>', 'Specific experiment ID')
  .option('-f, --format <format>', 'Output format', 'json')
  .action(async (options) => {
    const service = new ExperimentReportingService();
    await service.generateReport({ ...options, timeRange: 'last-30d' });
  });

program
  .command('health-check')
  .description('Check health of all active experiments')
  .action(async () => {
    const service = new ExperimentReportingService();
    await service.checkHealth();
  });

// Parse command line arguments
if (require.main === module) {
  program.parse();
}

export { ExperimentReportingService };