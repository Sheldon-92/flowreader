-- Dialog History Migration
-- Implements dialog message storage and retrieval with RLS security

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Dialog Messages table for storing user-AI conversations
-- This table stores individual dialog messages without conversation grouping
-- for simpler API access patterns and better performance
CREATE TABLE dialog_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 4000),
    intent TEXT CHECK (intent IN ('translate', 'explain', 'analyze', 'ask', 'enhance')),
    selection JSONB,
    metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for optimal query performance
-- Primary index: user + book + timestamp DESC for paginated dialog retrieval
CREATE INDEX idx_dialog_messages_user_book_time ON dialog_messages(user_id, book_id, created_at DESC);

-- Secondary index: user + timestamp DESC for cross-book user queries
CREATE INDEX idx_dialog_messages_user_time ON dialog_messages(user_id, created_at DESC);

-- Optional index for intent-based filtering (if needed for analytics)
CREATE INDEX idx_dialog_messages_intent ON dialog_messages(intent) WHERE intent IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE dialog_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user isolation

-- SELECT Policy: Users can only read their own dialog messages
CREATE POLICY "Users can view own dialog messages" ON dialog_messages
    FOR SELECT USING (auth.uid() = user_id);

-- INSERT Policy: Users can only create dialog messages for themselves
-- Also enforces that user_id must match authenticated user
CREATE POLICY "Users can insert own dialog messages" ON dialog_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE Policy: Users can only update their own dialog messages
-- (Limited update scenarios - mainly for metrics updates)
CREATE POLICY "Users can update own dialog messages" ON dialog_messages
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- DELETE Policy: Users can only delete their own dialog messages
CREATE POLICY "Users can delete own dialog messages" ON dialog_messages
    FOR DELETE USING (auth.uid() = user_id);

-- Data validation function for JSONB fields
CREATE OR REPLACE FUNCTION validate_dialog_message_jsonb()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate selection JSONB structure if present
    IF NEW.selection IS NOT NULL THEN
        -- Ensure selection has required fields for text selection
        IF NOT (NEW.selection ? 'text' OR NEW.selection ? 'startContainer' OR NEW.selection ? 'range') THEN
            RAISE EXCEPTION 'Invalid selection JSONB structure';
        END IF;
    END IF;

    -- Validate metrics JSONB structure if present
    IF NEW.metrics IS NOT NULL THEN
        -- Ensure metrics contains only expected numeric fields
        IF NOT (jsonb_typeof(NEW.metrics) = 'object') THEN
            RAISE EXCEPTION 'Metrics must be a JSON object';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for JSONB validation
CREATE TRIGGER validate_dialog_message_data
    BEFORE INSERT OR UPDATE ON dialog_messages
    FOR EACH ROW
    EXECUTE FUNCTION validate_dialog_message_jsonb();

-- Function to get paginated dialog messages for a user and book
CREATE OR REPLACE FUNCTION get_dialog_messages_paginated(
    p_user_id UUID,
    p_book_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_before_timestamp TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    role TEXT,
    content TEXT,
    intent TEXT,
    selection JSONB,
    metrics JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dm.id,
        dm.role,
        dm.content,
        dm.intent,
        dm.selection,
        dm.metrics,
        dm.created_at
    FROM dialog_messages dm
    WHERE dm.user_id = p_user_id
        AND dm.book_id = p_book_id
        AND (p_before_timestamp IS NULL OR dm.created_at < p_before_timestamp)
    ORDER BY dm.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent dialog context (last N messages)
CREATE OR REPLACE FUNCTION get_recent_dialog_context(
    p_user_id UUID,
    p_book_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    role TEXT,
    content TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dm.role,
        dm.content,
        dm.created_at
    FROM dialog_messages dm
    WHERE dm.user_id = p_user_id
        AND dm.book_id = p_book_id
    ORDER BY dm.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old dialog messages (data retention)
CREATE OR REPLACE FUNCTION cleanup_old_dialog_messages(
    p_retention_days INTEGER DEFAULT 365
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM dialog_messages
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Log cleanup activity
    INSERT INTO analytics_events (event_type, properties, timestamp)
    VALUES (
        'dialog_cleanup',
        jsonb_build_object(
            'deleted_count', deleted_count,
            'retention_days', p_retention_days
        ),
        NOW()
    );

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add table comment for documentation
COMMENT ON TABLE dialog_messages IS 'Stores individual dialog messages between users and AI assistant for each book';
COMMENT ON COLUMN dialog_messages.role IS 'Message role: user or assistant';
COMMENT ON COLUMN dialog_messages.content IS 'Message content (max 4000 characters)';
COMMENT ON COLUMN dialog_messages.intent IS 'Optional user intent: translate, explain, analyze, ask, enhance';
COMMENT ON COLUMN dialog_messages.selection IS 'Optional JSONB containing text selection data';
COMMENT ON COLUMN dialog_messages.metrics IS 'Optional JSONB containing performance/usage metrics';

-- Create a view for message statistics (useful for analytics)
CREATE VIEW dialog_message_stats AS
SELECT
    user_id,
    book_id,
    COUNT(*) as total_messages,
    COUNT(CASE WHEN role = 'user' THEN 1 END) as user_messages,
    COUNT(CASE WHEN role = 'assistant' THEN 1 END) as assistant_messages,
    COUNT(CASE WHEN intent IS NOT NULL THEN 1 END) as messages_with_intent,
    MIN(created_at) as first_message_at,
    MAX(created_at) as last_message_at
FROM dialog_messages
GROUP BY user_id, book_id;

-- RLS policy for the view
ALTER VIEW dialog_message_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own dialog stats" ON dialog_message_stats
    FOR SELECT USING (auth.uid() = user_id);