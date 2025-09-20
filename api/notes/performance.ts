import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuthWithSecurity } from '../_lib/auth-enhanced.js';
import { supabaseAdmin } from '../_lib/auth.js';

interface PerformanceMetrics {
  search: {
    totalQueries: number;
    averageResponseTime: number;
    cacheHitRate: number;
    slowQueries: number;
    errorRate: number;
  };
  database: {
    indexUsage: Record<string, number>;
    queryPlans: string[];
    tableStats: {
      totalNotes: number;
      indexedNotes: number;
      avgContentLength: number;
    };
  };
  system: {
    memoryUsage: number;
    cpuUsage: number;
    timestamp: string;
  };
}

interface SearchBenchmark {
  queryType: string;
  parameters: Record<string, any>;
  responseTime: number;
  resultCount: number;
  indexesUsed: string[];
  timestamp: string;
}

class NotesSearchPerformanceMonitor {
  private static instance: NotesSearchPerformanceMonitor;
  private metrics: Map<string, any> = new Map();
  private benchmarks: SearchBenchmark[] = [];
  private maxBenchmarks = 1000; // Keep last 1000 benchmarks

  static getInstance(): NotesSearchPerformanceMonitor {
    if (!NotesSearchPerformanceMonitor.instance) {
      NotesSearchPerformanceMonitor.instance = new NotesSearchPerformanceMonitor();
    }
    return NotesSearchPerformanceMonitor.instance;
  }

  async recordSearchBenchmark(
    queryType: string,
    parameters: Record<string, any>,
    responseTime: number,
    resultCount: number,
    indexesUsed: string[] = []
  ): Promise<void> {
    const benchmark: SearchBenchmark = {
      queryType,
      parameters,
      responseTime,
      resultCount,
      indexesUsed,
      timestamp: new Date().toISOString()
    };

    this.benchmarks.push(benchmark);

    // Keep only recent benchmarks
    if (this.benchmarks.length > this.maxBenchmarks) {
      this.benchmarks = this.benchmarks.slice(-this.maxBenchmarks);
    }

    // Update running metrics
    this.updateMetrics(benchmark);
  }

  private updateMetrics(benchmark: SearchBenchmark): void {
    const key = `${benchmark.queryType}:metrics`;
    const existing = this.metrics.get(key) || {
      count: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      avgTime: 0
    };

    existing.count += 1;
    existing.totalTime += benchmark.responseTime;
    existing.minTime = Math.min(existing.minTime, benchmark.responseTime);
    existing.maxTime = Math.max(existing.maxTime, benchmark.responseTime);
    existing.avgTime = existing.totalTime / existing.count;

    this.metrics.set(key, existing);
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      // Get database statistics
      const { data: dbStats } = await supabaseAdmin
        .rpc('get_notes_search_stats');

      // Calculate search metrics from benchmarks
      const recentBenchmarks = this.benchmarks.filter(
        b => Date.now() - new Date(b.timestamp).getTime() < 3600000 // Last hour
      );

      const averageResponseTime = recentBenchmarks.length > 0
        ? recentBenchmarks.reduce((sum, b) => sum + b.responseTime, 0) / recentBenchmarks.length
        : 0;

      const slowQueries = recentBenchmarks.filter(b => b.responseTime > 1000).length;
      const errorRate = 0; // Would be tracked separately in production

      // Get table statistics
      const { data: tableStats } = await supabaseAdmin
        .from('notes_search_performance')
        .select('*')
        .single();

      return {
        search: {
          totalQueries: this.benchmarks.length,
          averageResponseTime,
          cacheHitRate: 0, // Would implement caching separately
          slowQueries,
          errorRate
        },
        database: {
          indexUsage: this.calculateIndexUsage(),
          queryPlans: [], // Would collect from EXPLAIN queries
          tableStats: {
            totalNotes: tableStats?.total_notes || 0,
            indexedNotes: tableStats?.indexed_notes || 0,
            avgContentLength: tableStats?.avg_content_length || 0
          }
        },
        system: {
          memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
          cpuUsage: 0, // Would require system monitoring
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      throw error;
    }
  }

  private calculateIndexUsage(): Record<string, number> {
    const usage: Record<string, number> = {};

    this.benchmarks.forEach(benchmark => {
      benchmark.indexesUsed.forEach(index => {
        usage[index] = (usage[index] || 0) + 1;
      });
    });

    return usage;
  }

  async runPerformanceBenchmark(): Promise<SearchBenchmark[]> {
    const benchmarkSuites = [
      {
        name: 'full_text_search',
        params: { q: 'knowledge enhancement', limit: 20 }
      },
      {
        name: 'filtered_search',
        params: { source: 'auto', type: 'enhance', limit: 20 }
      },
      {
        name: 'paginated_search',
        params: { limit: 50, offset: 100 }
      },
      {
        name: 'confidence_filtered',
        params: { source: 'auto', minConfidence: 0.8, limit: 20 }
      },
      {
        name: 'tag_search',
        params: { hasSelection: true, limit: 20 }
      }
    ];

    const results: SearchBenchmark[] = [];

    for (const suite of benchmarkSuites) {
      const startTime = Date.now();

      try {
        // Simulate search query (in real implementation, would call actual search)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        const benchmark: SearchBenchmark = {
          queryType: suite.name,
          parameters: suite.params,
          responseTime,
          resultCount: Math.floor(Math.random() * 50), // Simulated
          indexesUsed: ['idx_notes_search_vector', 'idx_notes_user_book_created'],
          timestamp: new Date().toISOString()
        };

        results.push(benchmark);
        await this.recordSearchBenchmark(
          benchmark.queryType,
          benchmark.parameters,
          benchmark.responseTime,
          benchmark.resultCount,
          benchmark.indexesUsed
        );
      } catch (error) {
        console.error(`Benchmark failed for ${suite.name}:`, error);
      }
    }

    return results;
  }

  getBenchmarkHistory(queryType?: string, limit = 100): SearchBenchmark[] {
    let filtered = this.benchmarks;

    if (queryType) {
      filtered = filtered.filter(b => b.queryType === queryType);
    }

    return filtered.slice(-limit);
  }

  getPerformanceReport(): any {
    const report = {
      summary: {
        totalBenchmarks: this.benchmarks.length,
        queryTypes: [...new Set(this.benchmarks.map(b => b.queryType))],
        timeRange: {
          start: this.benchmarks[0]?.timestamp,
          end: this.benchmarks[this.benchmarks.length - 1]?.timestamp
        }
      },
      metrics: Object.fromEntries(this.metrics),
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Analyze performance patterns
    const avgResponseTimes = Array.from(this.metrics.entries())
      .filter(([key]) => key.endsWith(':metrics'))
      .map(([key, value]) => ({ type: key.replace(':metrics', ''), avgTime: value.avgTime }));

    avgResponseTimes.forEach(({ type, avgTime }) => {
      if (avgTime > 500) {
        recommendations.push(`Consider optimizing ${type} queries - average response time is ${avgTime.toFixed(2)}ms`);
      }
    });

    const slowQueries = this.benchmarks.filter(b => b.responseTime > 1000);
    if (slowQueries.length > this.benchmarks.length * 0.1) {
      recommendations.push('High number of slow queries detected - review database indexes and query patterns');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance metrics look good - no immediate optimizations needed');
    }

    return recommendations;
  }
}

async function performanceHandler(req: Request): Promise<Response> {
  const user = await requireAuthWithSecurity(req);
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'metrics';

  const monitor = NotesSearchPerformanceMonitor.getInstance();

  try {
    switch (action) {
      case 'metrics':
        const metrics = await monitor.getPerformanceMetrics();
        return createSuccessResponse(metrics, 200);

      case 'benchmark':
        const benchmarks = await monitor.runPerformanceBenchmark();
        return createSuccessResponse({ benchmarks }, 200);

      case 'history':
        const queryType = url.searchParams.get('queryType');
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const history = monitor.getBenchmarkHistory(queryType || undefined, limit);
        return createSuccessResponse({ history }, 200);

      case 'report':
        const report = monitor.getPerformanceReport();
        return createSuccessResponse(report, 200);

      default:
        return ApiErrorHandler.badRequest('Invalid action parameter');
    }
  } catch (error) {
    console.error('Performance monitoring error:', error);
    return ApiErrorHandler.internalServerError('Failed to retrieve performance data');
  }
}

// Export the performance monitor instance for use in search API
export { NotesSearchPerformanceMonitor };
export default withErrorHandling(performanceHandler);