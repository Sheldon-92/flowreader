-- Dialog History Performance Analysis
-- Query patterns and index utilization analysis

-- Expected Query Pattern 1: Paginated dialog retrieval (90% of queries)
-- This should use idx_dialog_messages_user_book_time efficiently
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, role, content, intent, selection, metrics, created_at
FROM dialog_messages
WHERE user_id = $1 -- auth.uid()
  AND book_id = $2
ORDER BY created_at DESC
LIMIT 50
OFFSET 0;

-- Expected Query Pattern 2: Recent context for AI (frequent)
-- This should also use idx_dialog_messages_user_book_time
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT role, content, created_at
FROM dialog_messages
WHERE user_id = $1 -- auth.uid()
  AND book_id = $2
ORDER BY created_at DESC
LIMIT 10;

-- Expected Query Pattern 3: User activity across books (10% of queries)
-- This should use idx_dialog_messages_user_time
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT book_id, content, created_at
FROM dialog_messages
WHERE user_id = $1 -- auth.uid()
ORDER BY created_at DESC
LIMIT 100;

-- Expected Query Pattern 4: Intent-based analytics (rare but important)
-- This should use idx_dialog_messages_intent
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT user_id, book_id, content, created_at
FROM dialog_messages
WHERE intent = 'explain'
  AND user_id = $1 -- auth.uid()
ORDER BY created_at DESC;

-- Index size analysis query
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_total_relation_size(indexname::regclass)) as size,
    pg_total_relation_size(indexname::regclass) as size_bytes
FROM pg_indexes
WHERE tablename = 'dialog_messages'
ORDER BY pg_total_relation_size(indexname::regclass) DESC;

-- Table statistics query
SELECT
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename = 'dialog_messages';

-- Index usage statistics
SELECT
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan as scans
FROM pg_stat_user_indexes
WHERE tablename = 'dialog_messages'
ORDER BY idx_scan DESC;

-- Query to identify missing indexes (run after production usage)
SELECT
    query,
    calls,
    total_time,
    mean_time,
    stddev_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE query LIKE '%dialog_messages%'
  AND calls > 10
ORDER BY total_time DESC
LIMIT 20;

-- Performance baseline expectations:
-- 1. Pagination queries with user_id + book_id filter: < 5ms for < 10K records per book
-- 2. Recent context queries: < 2ms (small LIMIT)
-- 3. Cross-book user queries: < 50ms for typical user activity
-- 4. Intent filtering: < 10ms with selective intent values

-- Index cardinality analysis
SELECT
    attname as column_name,
    n_distinct,
    correlation,
    most_common_vals[1:5] as top_values,
    most_common_freqs[1:5] as frequencies
FROM pg_stats
WHERE tablename = 'dialog_messages'
  AND schemaname = 'public'
ORDER BY n_distinct DESC;

-- Estimated query costs for different scenarios
-- Small dataset (< 1K messages per user/book)
EXPLAIN (COSTS, FORMAT JSON)
SELECT * FROM dialog_messages
WHERE user_id = $1 AND book_id = $2
ORDER BY created_at DESC LIMIT 50;

-- Medium dataset (1K-10K messages per user/book)
-- This would require actual data to test accurately

-- Large dataset (> 10K messages per user/book)
-- Consider partitioning at this scale

-- JSONB query performance tests
-- Selection field queries (if needed for analytics)
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM dialog_messages
WHERE user_id = $1
  AND selection ? 'text';

-- Metrics field queries
EXPLAIN (ANALYZE, BUFFERS)
SELECT avg((metrics->>'response_time_ms')::numeric)
FROM dialog_messages
WHERE user_id = $1
  AND metrics ? 'response_time_ms';

-- Recommendations based on query patterns:
/*
1. Primary Index (user_id, book_id, created_at DESC):
   - Covers 90%+ of queries efficiently
   - Supports both pagination and recent context
   - Size overhead: ~15-20% of table size

2. Secondary Index (user_id, created_at DESC):
   - Covers cross-book queries
   - Lower usage but important for user dashboards
   - Size overhead: ~10-15% of table size

3. Partial Index on intent:
   - Space-efficient for optional field
   - Only creates entries for non-null values
   - Minimal size overhead: ~2-5% of table size

4. Potential future indexes (add only if needed):
   - GIN index on content for full-text search
   - GIN index on selection JSONB for complex queries
   - Composite index on (book_id, created_at) for book-level analytics
*/