-- FlowReader Feedback System Database Schema
-- Privacy-first feedback collection with minimal data storage
-- Migration: 005_feedback_system.sql

-- Create feedback submissions table
CREATE TABLE IF NOT EXISTS feedback_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('bug', 'feature', 'general', 'praise')),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    category VARCHAR(30) NOT NULL CHECK (category IN ('usability', 'performance', 'ai-interaction', 'reading-experience', 'technical', 'other')),
    description TEXT NOT NULL CHECK (LENGTH(description) >= 10 AND LENGTH(description) <= 1000),

    -- Anonymous tracking (no PII)
    session_id VARCHAR(64) NOT NULL, -- Anonymous session identifier
    ip_hash VARCHAR(16), -- Hashed IP for abuse detection
    user_agent VARCHAR(50), -- Sanitized browser info for debugging
    route VARCHAR(100), -- Sanitized route for context

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes for performance
    CONSTRAINT feedback_submissions_description_not_empty CHECK (TRIM(description) != '')
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_created_at ON feedback_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_type ON feedback_submissions(type);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_category ON feedback_submissions(category);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_rating ON feedback_submissions(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_session_id ON feedback_submissions(session_id);

-- Create a partial index for recent submissions (last 30 days) for faster dashboard queries
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_recent
ON feedback_submissions(created_at DESC, type, category)
WHERE created_at > NOW() - INTERVAL '30 days';

-- RLS Policy: Public read access for stats, no user-level access needed
-- Since this is anonymous feedback, we don't tie it to user accounts
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous submissions (INSERT only)
CREATE POLICY feedback_submissions_insert_policy ON feedback_submissions
    FOR INSERT
    WITH CHECK (true); -- Allow any anonymous submission

-- Policy: Allow reading for authenticated users with admin role (for dashboard)
-- Note: This assumes an admin role system - adjust based on your auth setup
CREATE POLICY feedback_submissions_read_policy ON feedback_submissions
    FOR SELECT
    USING (
        auth.role() = 'authenticated'
        -- Add additional admin check here when role system is implemented
        -- AND auth.jwt() ->> 'role' = 'admin'
    );

-- Create a view for feedback statistics (public access for dashboard)
CREATE OR REPLACE VIEW feedback_stats AS
SELECT
    COUNT(*) as total_submissions,
    ROUND(AVG(rating), 2) as average_rating,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as submissions_last_24h,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as submissions_last_7d,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as submissions_last_30d,

    -- Type distribution
    COUNT(*) FILTER (WHERE type = 'bug') as bug_reports,
    COUNT(*) FILTER (WHERE type = 'feature') as feature_requests,
    COUNT(*) FILTER (WHERE type = 'general') as general_feedback,
    COUNT(*) FILTER (WHERE type = 'praise') as praise_feedback,

    -- Category distribution
    COUNT(*) FILTER (WHERE category = 'usability') as usability_feedback,
    COUNT(*) FILTER (WHERE category = 'performance') as performance_feedback,
    COUNT(*) FILTER (WHERE category = 'ai-interaction') as ai_feedback,
    COUNT(*) FILTER (WHERE category = 'reading-experience') as reading_feedback,
    COUNT(*) FILTER (WHERE category = 'technical') as technical_feedback,
    COUNT(*) FILTER (WHERE category = 'other') as other_feedback,

    -- Rating distribution
    COUNT(*) FILTER (WHERE rating = 1) as rating_1_count,
    COUNT(*) FILTER (WHERE rating = 2) as rating_2_count,
    COUNT(*) FILTER (WHERE rating = 3) as rating_3_count,
    COUNT(*) FILTER (WHERE rating = 4) as rating_4_count,
    COUNT(*) FILTER (WHERE rating = 5) as rating_5_count,

    -- Session insights
    COUNT(DISTINCT session_id) as unique_sessions,
    ROUND(COUNT(*)::decimal / NULLIF(COUNT(DISTINCT session_id), 0), 2) as avg_submissions_per_session
FROM feedback_submissions
WHERE created_at > NOW() - INTERVAL '30 days'; -- Focus on recent data

-- Allow authenticated users to read the stats view
CREATE POLICY feedback_stats_read_policy ON feedback_stats
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Create a function to get daily submission counts for charts
CREATE OR REPLACE FUNCTION get_daily_feedback_counts(days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    submission_date DATE,
    submission_count BIGINT,
    avg_rating NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE(created_at) as submission_date,
        COUNT(*) as submission_count,
        ROUND(AVG(rating), 2) as avg_rating
    FROM feedback_submissions
    WHERE created_at > NOW() - (days_back || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY submission_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_daily_feedback_counts TO authenticated;

-- Create a function to get route popularity for analytics
CREATE OR REPLACE FUNCTION get_feedback_route_stats(days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    route VARCHAR(100),
    submission_count BIGINT,
    avg_rating NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(f.route, 'unknown') as route,
        COUNT(*) as submission_count,
        ROUND(AVG(f.rating), 2) as avg_rating
    FROM feedback_submissions f
    WHERE f.created_at > NOW() - (days_back || ' days')::INTERVAL
      AND f.route IS NOT NULL
      AND f.route != ''
    GROUP BY f.route
    HAVING COUNT(*) >= 2 -- Only include routes with multiple submissions
    ORDER BY submission_count DESC, avg_rating DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_feedback_route_stats TO authenticated;

-- Create a function for basic feedback analytics (privacy-conscious)
CREATE OR REPLACE FUNCTION get_feedback_insights(days_back INTEGER DEFAULT 30)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'summary', (
            SELECT json_build_object(
                'total_submissions', COUNT(*),
                'unique_sessions', COUNT(DISTINCT session_id),
                'avg_rating', ROUND(AVG(rating), 2),
                'completion_rate', ROUND(
                    (COUNT(*) * 100.0) / GREATEST(COUNT(DISTINCT session_id) * 3, 1), 2
                ) -- Assume max 3 submissions per session
            )
            FROM feedback_submissions
            WHERE created_at > NOW() - (days_back || ' days')::INTERVAL
        ),
        'trends', (
            SELECT json_agg(
                json_build_object(
                    'date', DATE(created_at),
                    'count', daily_count,
                    'avg_rating', daily_avg_rating
                ) ORDER BY DATE(created_at) DESC
            )
            FROM (
                SELECT
                    created_at,
                    COUNT(*) as daily_count,
                    ROUND(AVG(rating), 2) as daily_avg_rating
                FROM feedback_submissions
                WHERE created_at > NOW() - (days_back || ' days')::INTERVAL
                GROUP BY DATE(created_at)
                ORDER BY DATE(created_at) DESC
                LIMIT 30
            ) daily_stats
        ),
        'satisfaction', (
            SELECT json_build_object(
                'positive_feedback', COUNT(*) FILTER (WHERE rating >= 4),
                'neutral_feedback', COUNT(*) FILTER (WHERE rating = 3),
                'negative_feedback', COUNT(*) FILTER (WHERE rating <= 2),
                'nps_score', ROUND(
                    (COUNT(*) FILTER (WHERE rating >= 4) * 100.0 / GREATEST(COUNT(*), 1)) -
                    (COUNT(*) FILTER (WHERE rating <= 2) * 100.0 / GREATEST(COUNT(*), 1)), 2
                )
            )
            FROM feedback_submissions
            WHERE created_at > NOW() - (days_back || ' days')::INTERVAL
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_feedback_insights TO authenticated;

-- Create a cleanup function to automatically remove old feedback (data retention)
CREATE OR REPLACE FUNCTION cleanup_old_feedback()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete feedback older than 1 year (configurable retention period)
    DELETE FROM feedback_submissions
    WHERE created_at < NOW() - INTERVAL '1 year';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Log the cleanup action
    INSERT INTO feedback_submissions (
        type, rating, category, description, session_id, user_agent, route, created_at
    ) VALUES (
        'general', 5, 'technical',
        'Automatic cleanup: Removed ' || deleted_count || ' old feedback records',
        'system-cleanup', 'System/1.0', '/admin/cleanup', NOW()
    );

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a comment documenting the privacy measures
COMMENT ON TABLE feedback_submissions IS 'Anonymous feedback collection table. No PII stored. Session IDs are ephemeral and not linked to user accounts.';
COMMENT ON COLUMN feedback_submissions.session_id IS 'Anonymous session identifier, rotated every 24 hours, not linked to user accounts';
COMMENT ON COLUMN feedback_submissions.ip_hash IS 'Hashed IP address for basic abuse detection, not reversible to original IP';
COMMENT ON COLUMN feedback_submissions.user_agent IS 'Sanitized browser information (name/version only) for technical debugging';
COMMENT ON COLUMN feedback_submissions.route IS 'Sanitized route information with sensitive parameters removed';

-- Insert initial test data (optional, for development)
-- Uncomment the following lines for development environment only
/*
INSERT INTO feedback_submissions (type, rating, category, description, session_id, user_agent, route) VALUES
    ('feature', 4, 'ai-interaction', 'The AI responses are helpful but could be faster', 'dev-session-001', 'Chrome/91', '/read/[bookId]'),
    ('bug', 2, 'performance', 'Page loading is slow on mobile devices', 'dev-session-002', 'Safari/14', '/library'),
    ('praise', 5, 'reading-experience', 'Love the reading interface! Very clean and intuitive.', 'dev-session-003', 'Firefox/89', '/read/[bookId]'),
    ('general', 3, 'usability', 'The navigation could be more intuitive for new users', 'dev-session-004', 'Edge/91', '/'),
    ('feature', 4, 'other', 'Would love to see dark mode support', 'dev-session-005', 'Chrome/91', '/library');
*/