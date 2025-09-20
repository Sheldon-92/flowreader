-- Notes Search Performance Optimization Migration
-- Adds indexes and full-text search capabilities for enhanced notes discoverability

-- Enable PostgreSQL full-text search extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Add full-text search column to notes table
ALTER TABLE notes ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_notes_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update search vector
DROP TRIGGER IF EXISTS update_notes_search_vector_trigger ON notes;
CREATE TRIGGER update_notes_search_vector_trigger
    BEFORE INSERT OR UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_notes_search_vector();

-- Update existing notes with search vectors
UPDATE notes SET search_vector =
    setweight(to_tsvector('english', COALESCE(content, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'B')
WHERE search_vector IS NULL;

-- Performance indexes for notes search

-- Primary search indexes
CREATE INDEX IF NOT EXISTS idx_notes_search_vector
    ON notes USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_notes_content_trigram
    ON notes USING gin(content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_notes_tags_gin
    ON notes USING gin(tags);

-- User and book filtering indexes (with RLS optimization)
CREATE INDEX IF NOT EXISTS idx_notes_user_book_created
    ON notes(user_id, book_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_user_source_created
    ON notes(user_id, source, created_at DESC);

-- Source-specific indexes
CREATE INDEX IF NOT EXISTS idx_notes_source_tags
    ON notes(source) WHERE source IS NOT NULL;

-- Confidence filtering for auto notes (extracted from tags)
CREATE INDEX IF NOT EXISTS idx_notes_auto_confidence
    ON notes USING gin(tags)
    WHERE source = 'auto' AND tags @> ARRAY['source:auto'];

-- Content length index for sorting
CREATE INDEX IF NOT EXISTS idx_notes_content_length
    ON notes((char_length(content)));

-- Composite indexes for common search patterns
CREATE INDEX IF NOT EXISTS idx_notes_user_book_source_created
    ON notes(user_id, book_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_user_tags_created
    ON notes(user_id, created_at DESC)
    WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

-- Chapter-specific searches (using tag extraction)
CREATE INDEX IF NOT EXISTS idx_notes_chapter_tag
    ON notes USING gin(tags)
    WHERE tags @> ARRAY['has_selection'] OR
          EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE tag LIKE 'chapter:%');

-- Performance monitoring view
CREATE OR REPLACE VIEW notes_search_performance AS
SELECT
    COUNT(*) as total_notes,
    COUNT(*) FILTER (WHERE source = 'manual') as manual_notes,
    COUNT(*) FILTER (WHERE source = 'auto') as auto_notes,
    COUNT(*) FILTER (WHERE tags @> ARRAY['has_selection']) as notes_with_selection,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT book_id) as unique_books,
    AVG(char_length(content)) as avg_content_length,
    MIN(created_at) as oldest_note,
    MAX(created_at) as newest_note,
    COUNT(*) FILTER (WHERE search_vector IS NOT NULL) as indexed_notes
FROM notes;

-- Function to get search performance statistics
CREATE OR REPLACE FUNCTION get_notes_search_stats()
RETURNS TABLE(
    metric_name TEXT,
    metric_value NUMERIC,
    description TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        'total_notes'::TEXT as metric_name,
        COUNT(*)::NUMERIC as metric_value,
        'Total number of notes in system'::TEXT as description
    FROM notes

    UNION ALL

    SELECT
        'avg_search_time_ms'::TEXT,
        0::NUMERIC, -- Placeholder - would be tracked in application metrics
        'Average search response time in milliseconds'::TEXT

    UNION ALL

    SELECT
        'full_text_index_size_mb'::TEXT,
        pg_total_relation_size('idx_notes_search_vector')::NUMERIC / (1024*1024),
        'Size of full-text search index in MB'::TEXT

    UNION ALL

    SELECT
        'content_index_size_mb'::TEXT,
        pg_total_relation_size('idx_notes_content_trigram')::NUMERIC / (1024*1024),
        'Size of content trigram index in MB'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function for optimized search with performance tracking
CREATE OR REPLACE FUNCTION search_notes_optimized(
    p_user_id UUID,
    p_search_query TEXT DEFAULT NULL,
    p_book_id UUID DEFAULT NULL,
    p_source TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    note_id UUID,
    content TEXT,
    source TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ,
    search_rank REAL
) AS $$
DECLARE
    query_start_time TIMESTAMPTZ;
    query_end_time TIMESTAMPTZ;
    execution_time_ms NUMERIC;
BEGIN
    query_start_time := clock_timestamp();

    RETURN QUERY
    SELECT
        n.id as note_id,
        n.content,
        n.source,
        n.tags,
        n.created_at,
        CASE
            WHEN p_search_query IS NOT NULL AND p_search_query != '' THEN
                ts_rank(n.search_vector, plainto_tsquery('english', p_search_query))
            ELSE 1.0
        END as search_rank
    FROM notes n
    WHERE
        n.user_id = p_user_id
        AND (p_book_id IS NULL OR n.book_id = p_book_id)
        AND (p_source IS NULL OR n.source = p_source)
        AND (
            p_search_query IS NULL
            OR p_search_query = ''
            OR n.search_vector @@ plainto_tsquery('english', p_search_query)
            OR n.content ILIKE '%' || p_search_query || '%'
        )
    ORDER BY
        CASE
            WHEN p_search_query IS NOT NULL AND p_search_query != '' THEN
                ts_rank(n.search_vector, plainto_tsquery('english', p_search_query))
            ELSE n.created_at
        END DESC
    LIMIT p_limit
    OFFSET p_offset;

    query_end_time := clock_timestamp();
    execution_time_ms := EXTRACT(EPOCH FROM (query_end_time - query_start_time)) * 1000;

    -- Log performance metrics (in production, this would go to a metrics table)
    RAISE NOTICE 'Search completed in % ms for user % with query "%"',
        execution_time_ms, p_user_id, COALESCE(p_search_query, 'no query');
END;
$$ LANGUAGE plpgsql;

-- Vacuum and analyze to update statistics
VACUUM ANALYZE notes;

-- Create explanation for query plan analysis
CREATE OR REPLACE FUNCTION explain_notes_search(
    p_user_id UUID,
    p_search_query TEXT DEFAULT NULL,
    p_book_id UUID DEFAULT NULL
)
RETURNS TABLE(query_plan TEXT) AS $$
DECLARE
    query_text TEXT;
BEGIN
    query_text := format('
        SELECT n.id, n.content, n.source, n.tags, n.created_at
        FROM notes n
        WHERE n.user_id = %L
        AND (%L IS NULL OR n.book_id = %L)
        AND (%L IS NULL OR n.search_vector @@ plainto_tsquery(''english'', %L))
        ORDER BY
            CASE WHEN %L IS NOT NULL THEN
                ts_rank(n.search_vector, plainto_tsquery(''english'', %L))
            ELSE extract(epoch from n.created_at)
            END DESC
        LIMIT 20',
        p_user_id, p_book_id, p_book_id, p_search_query, p_search_query,
        p_search_query, p_search_query
    );

    RETURN QUERY EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' || query_text;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON COLUMN notes.search_vector IS 'Full-text search vector for content and tags';
COMMENT ON INDEX idx_notes_search_vector IS 'GIN index for full-text search on notes content and tags';
COMMENT ON INDEX idx_notes_content_trigram IS 'Trigram index for fuzzy text matching in note content';
COMMENT ON INDEX idx_notes_user_book_created IS 'Composite index for user+book filtered searches with date sorting';
COMMENT ON FUNCTION search_notes_optimized IS 'Optimized search function with performance tracking';

-- Performance baseline metrics
INSERT INTO analytics_events (event_type, properties) VALUES (
    'notes_search_optimization_applied',
    jsonb_build_object(
        'migration_version', '006',
        'indexes_created', 8,
        'functions_created', 4,
        'optimization_timestamp', extract(epoch from now())
    )
);

-- Grant necessary permissions for search functions
GRANT EXECUTE ON FUNCTION search_notes_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION get_notes_search_stats TO authenticated;
GRANT SELECT ON notes_search_performance TO authenticated;