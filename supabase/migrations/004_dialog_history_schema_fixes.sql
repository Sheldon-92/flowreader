-- Dialog History Schema Fixes
-- Fixes content length validation and adds missing targetLang field

-- Increase content length limit from 4000 to 10000 characters as per API spec
ALTER TABLE dialog_messages
DROP CONSTRAINT IF EXISTS dialog_messages_content_check;

ALTER TABLE dialog_messages
ADD CONSTRAINT dialog_messages_content_check
CHECK (length(content) > 0 AND length(content) <= 10000);

-- Add missing target_lang field for translation intents
ALTER TABLE dialog_messages
ADD COLUMN IF NOT EXISTS target_lang TEXT
CHECK (target_lang ~ '^[a-z]{2}(-[A-Z]{2})?$');

-- Add comment for the new field
COMMENT ON COLUMN dialog_messages.target_lang IS 'Target language for translation (ISO 639-1 format)';

-- Update dialog message stats view to account for new field
CREATE OR REPLACE VIEW dialog_message_stats AS
SELECT
    user_id,
    book_id,
    COUNT(*) as total_messages,
    COUNT(CASE WHEN role = 'user' THEN 1 END) as user_messages,
    COUNT(CASE WHEN role = 'assistant' THEN 1 END) as assistant_messages,
    COUNT(CASE WHEN intent IS NOT NULL THEN 1 END) as messages_with_intent,
    COUNT(CASE WHEN target_lang IS NOT NULL THEN 1 END) as translation_messages,
    MIN(created_at) as first_message_at,
    MAX(created_at) as last_message_at
FROM dialog_messages
GROUP BY user_id, book_id;

-- Update the paginated function to include target_lang
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
    target_lang TEXT,
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
        dm.target_lang,
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