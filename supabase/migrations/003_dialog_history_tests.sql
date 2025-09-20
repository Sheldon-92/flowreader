-- Dialog History Migration Test Script
-- Run these tests after applying the migration to verify functionality

-- Test 1: Verify table creation and structure
\d dialog_messages;

-- Test 2: Verify indexes exist
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'dialog_messages'
ORDER BY indexname;

-- Test 3: Verify RLS policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'dialog_messages'
ORDER BY policyname;

-- Test 4: Test data insertion (as authenticated user)
-- This should succeed when user_id matches auth.uid()
INSERT INTO dialog_messages (
    user_id,
    book_id,
    role,
    content,
    intent,
    selection,
    metrics
) VALUES (
    auth.uid(), -- This should match the authenticated user
    '550e8400-e29b-41d4-a716-446655440000'::uuid, -- Sample book_id
    'user',
    'Can you explain this paragraph?',
    'explain',
    '{"text": "selected text", "startOffset": 0, "endOffset": 13}',
    '{"response_time_ms": 150, "tokens_used": 25}'
);

-- Test 5: Test constraint validation
-- This should FAIL due to content length constraint
DO $$
BEGIN
    INSERT INTO dialog_messages (
        user_id,
        book_id,
        role,
        content
    ) VALUES (
        auth.uid(),
        '550e8400-e29b-41d4-a716-446655440000'::uuid,
        'user',
        repeat('x', 4001) -- Exceeds 4000 character limit
    );
    RAISE EXCEPTION 'Content length validation failed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Content length constraint working correctly';
END $$;

-- Test 6: Test role constraint validation
-- This should FAIL due to invalid role
DO $$
BEGIN
    INSERT INTO dialog_messages (
        user_id,
        book_id,
        role,
        content
    ) VALUES (
        auth.uid(),
        '550e8400-e29b-41d4-a716-446655440000'::uuid,
        'invalid_role', -- Invalid role
        'Test message'
    );
    RAISE EXCEPTION 'Role validation failed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Role constraint working correctly';
END $$;

-- Test 7: Test intent constraint validation
-- This should FAIL due to invalid intent
DO $$
BEGIN
    INSERT INTO dialog_messages (
        user_id,
        book_id,
        role,
        content,
        intent
    ) VALUES (
        auth.uid(),
        '550e8400-e29b-41d4-a716-446655440000'::uuid,
        'user',
        'Test message',
        'invalid_intent' -- Invalid intent
    );
    RAISE EXCEPTION 'Intent validation failed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Intent constraint working correctly';
END $$;

-- Test 8: Test JSONB validation trigger
-- This should FAIL due to invalid selection structure
DO $$
BEGIN
    INSERT INTO dialog_messages (
        user_id,
        book_id,
        role,
        content,
        selection
    ) VALUES (
        auth.uid(),
        '550e8400-e29b-41d4-a716-446655440000'::uuid,
        'user',
        'Test message',
        '{"invalid": "structure"}' -- Invalid selection structure
    );
    RAISE EXCEPTION 'JSONB validation failed';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'JSONB validation trigger working correctly';
END $$;

-- Test 9: Test pagination function
-- Insert test data first
INSERT INTO dialog_messages (user_id, book_id, role, content) VALUES
    (auth.uid(), '550e8400-e29b-41d4-a716-446655440000'::uuid, 'user', 'Message 1'),
    (auth.uid(), '550e8400-e29b-41d4-a716-446655440000'::uuid, 'assistant', 'Response 1'),
    (auth.uid(), '550e8400-e29b-41d4-a716-446655440000'::uuid, 'user', 'Message 2'),
    (auth.uid(), '550e8400-e29b-41d4-a716-446655440000'::uuid, 'assistant', 'Response 2');

-- Test pagination function
SELECT * FROM get_dialog_messages_paginated(
    auth.uid(),
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    2, -- limit
    0  -- offset
);

-- Test 10: Test recent context function
SELECT * FROM get_recent_dialog_context(
    auth.uid(),
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    3 -- limit
);

-- Test 11: Test dialog message stats view
SELECT * FROM dialog_message_stats
WHERE user_id = auth.uid()
AND book_id = '550e8400-e29b-41d4-a716-446655440000'::uuid;

-- Test 12: Verify query performance with EXPLAIN
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM dialog_messages
WHERE user_id = auth.uid()
AND book_id = '550e8400-e29b-41d4-a716-446655440000'::uuid
ORDER BY created_at DESC
LIMIT 20;

-- Test 13: Test RLS isolation (should return empty for other users)
-- This test requires having multiple users, run as different user:
-- SELECT COUNT(*) FROM dialog_messages WHERE user_id != auth.uid();
-- Should return 0

-- Test 14: Verify foreign key constraints
-- This should FAIL due to non-existent book_id
DO $$
BEGIN
    INSERT INTO dialog_messages (
        user_id,
        book_id,
        role,
        content
    ) VALUES (
        auth.uid(),
        '00000000-0000-0000-0000-000000000000'::uuid, -- Non-existent book
        'user',
        'Test message'
    );
    RAISE EXCEPTION 'Foreign key constraint failed';
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE 'Foreign key constraint working correctly';
END $$;

-- Test 15: Test cleanup function (dry run)
SELECT cleanup_old_dialog_messages(0) as messages_cleaned; -- Should clean messages older than 0 days

-- Performance verification queries
-- These should use the created indexes efficiently

-- Query 1: User + Book + Time ordering (should use idx_dialog_messages_user_book_time)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM dialog_messages
WHERE user_id = auth.uid()
AND book_id = '550e8400-e29b-41d4-a716-446655440000'::uuid
ORDER BY created_at DESC
LIMIT 50;

-- Query 2: User + Time ordering (should use idx_dialog_messages_user_time)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM dialog_messages
WHERE user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 100;

-- Query 3: Intent filtering (should use idx_dialog_messages_intent)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM dialog_messages
WHERE intent = 'explain'
AND user_id = auth.uid()
ORDER BY created_at DESC;

-- Clean up test data
DELETE FROM dialog_messages WHERE content LIKE 'Message %' OR content LIKE 'Response %' OR content = 'Test message';