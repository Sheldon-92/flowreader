-- Knowledge Cache Migration for Precomputed Content
-- Supports chapter and concept-level caching with privacy compliance

-- Create knowledge cache table for precomputed content
CREATE TABLE IF NOT EXISTS knowledge_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key TEXT NOT NULL UNIQUE,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL,
    intent TEXT NOT NULL CHECK (intent IN ('background', 'define')),
    content JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_cache_book_chapter
ON knowledge_cache(book_id, chapter_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_cache_intent
ON knowledge_cache(intent);

CREATE INDEX IF NOT EXISTS idx_knowledge_cache_expires
ON knowledge_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_cache_cache_key
ON knowledge_cache(cache_key);

-- RLS Policies for privacy compliance
ALTER TABLE knowledge_cache ENABLE ROW LEVEL SECURITY;

-- Users can only access cache for their own books
CREATE POLICY "knowledge_cache_select_own_books" ON knowledge_cache
    FOR SELECT USING (
        book_id IN (
            SELECT id FROM books WHERE owner_id = auth.uid()
        )
    );

-- Only the system can insert/update cache entries (via service role)
CREATE POLICY "knowledge_cache_insert_service" ON knowledge_cache
    FOR INSERT WITH CHECK (
        -- Only allow inserts from service role or if user owns the book
        auth.role() = 'service_role' OR
        book_id IN (
            SELECT id FROM books WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "knowledge_cache_update_service" ON knowledge_cache
    FOR UPDATE USING (
        auth.role() = 'service_role' OR
        book_id IN (
            SELECT id FROM books WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "knowledge_cache_delete_service" ON knowledge_cache
    FOR DELETE USING (
        auth.role() = 'service_role' OR
        book_id IN (
            SELECT id FROM books WHERE owner_id = auth.uid()
        )
    );

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_knowledge_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM knowledge_cache
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup to run daily (if pg_cron is available)
-- SELECT cron.schedule('cleanup-knowledge-cache', '0 2 * * *', 'SELECT cleanup_expired_knowledge_cache();');

-- Create function to get cache statistics for monitoring
CREATE OR REPLACE FUNCTION get_knowledge_cache_stats()
RETURNS TABLE (
    total_entries BIGINT,
    entries_by_intent JSONB,
    entries_by_book JSONB,
    expired_entries BIGINT,
    cache_size_mb NUMERIC,
    avg_content_size NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_entries,
        jsonb_object_agg(intent, intent_count) as entries_by_intent,
        jsonb_object_agg(book_id, book_count) as entries_by_book,
        COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_entries,
        ROUND((pg_total_relation_size('knowledge_cache') / 1024.0 / 1024.0)::NUMERIC, 2) as cache_size_mb,
        ROUND(AVG(length(content::text))::NUMERIC, 0) as avg_content_size
    FROM (
        SELECT
            intent,
            book_id,
            content,
            expires_at,
            COUNT(*) OVER (PARTITION BY intent) as intent_count,
            COUNT(*) OVER (PARTITION BY book_id) as book_count
        FROM knowledge_cache
    ) stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE knowledge_cache IS 'Stores precomputed knowledge enhancement content with chapter-level granularity';
COMMENT ON COLUMN knowledge_cache.cache_key IS 'Unique key: bookId:chapterId:conceptHash:intent';
COMMENT ON COLUMN knowledge_cache.content IS 'JSONB containing PrecomputedContent with quality metrics and metadata';
COMMENT ON COLUMN knowledge_cache.expires_at IS 'Expiration timestamp for cache invalidation';
COMMENT ON FUNCTION cleanup_expired_knowledge_cache() IS 'Removes expired cache entries, returns count of deleted rows';
COMMENT ON FUNCTION get_knowledge_cache_stats() IS 'Returns cache usage statistics for monitoring';

-- Create precomputation status tracking table
CREATE TABLE IF NOT EXISTS knowledge_precompute_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    progress JSONB DEFAULT '{}',
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(book_id, user_id)
);

-- Indexes for job tracking
CREATE INDEX IF NOT EXISTS idx_precompute_jobs_book_user
ON knowledge_precompute_jobs(book_id, user_id);

CREATE INDEX IF NOT EXISTS idx_precompute_jobs_status
ON knowledge_precompute_jobs(status);

-- RLS for job tracking
ALTER TABLE knowledge_precompute_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precompute_jobs_own_data" ON knowledge_precompute_jobs
    FOR ALL USING (
        user_id = auth.uid() OR auth.role() = 'service_role'
    );

COMMENT ON TABLE knowledge_precompute_jobs IS 'Tracks background precomputation jobs for knowledge enhancement';

-- Create function to start precomputation job
CREATE OR REPLACE FUNCTION start_knowledge_precompute_job(
    p_book_id UUID,
    p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
    job_id UUID;
BEGIN
    -- Check if user owns the book
    IF NOT EXISTS (
        SELECT 1 FROM books
        WHERE id = p_book_id AND owner_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User does not own this book';
    END IF;

    -- Insert or update job record
    INSERT INTO knowledge_precompute_jobs (book_id, user_id, status, started_at)
    VALUES (p_book_id, p_user_id, 'pending', NOW())
    ON CONFLICT (book_id, user_id)
    DO UPDATE SET
        status = 'pending',
        started_at = NOW(),
        completed_at = NULL,
        error_message = NULL
    RETURNING id INTO job_id;

    RETURN job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION start_knowledge_precompute_job IS 'Creates or resets a precomputation job for a book';

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON knowledge_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_cache TO service_role;
GRANT SELECT, INSERT, UPDATE ON knowledge_precompute_jobs TO authenticated;
GRANT ALL ON knowledge_precompute_jobs TO service_role;