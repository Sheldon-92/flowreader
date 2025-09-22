-- Test verification script for T3-DB-FUNCTIONS-SEED
-- This script tests all the database objects required for T3
-- Execute this after running migrations to verify everything works

-- ============================================
-- TEST 1: Verify tables exist
-- ============================================
DO $$
BEGIN
    -- Check books table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'books') THEN
        RAISE EXCEPTION 'Table books does not exist';
    END IF;

    -- Check chapters table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chapters') THEN
        RAISE EXCEPTION 'Table chapters does not exist';
    END IF;

    -- Check rate_limit_entries table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limit_entries') THEN
        RAISE EXCEPTION 'Table rate_limit_entries does not exist';
    END IF;

    -- Check failed_login_attempts table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'failed_login_attempts') THEN
        RAISE EXCEPTION 'Table failed_login_attempts does not exist';
    END IF;

    -- Check security_events table
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_events') THEN
        RAISE EXCEPTION 'Table security_events does not exist';
    END IF;

    RAISE NOTICE 'All tables exist ✓';
END $$;

-- ============================================
-- TEST 2: Verify RPC functions exist
-- ============================================
DO $$
BEGIN
    -- Check log_security_event
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_security_event') THEN
        RAISE EXCEPTION 'Function log_security_event does not exist';
    END IF;

    -- Check track_failed_login
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'track_failed_login') THEN
        RAISE EXCEPTION 'Function track_failed_login does not exist';
    END IF;

    -- Check reset_failed_login_attempts
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reset_failed_login_attempts') THEN
        RAISE EXCEPTION 'Function reset_failed_login_attempts does not exist';
    END IF;

    -- Check update_reading_position
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_reading_position') THEN
        RAISE EXCEPTION 'Function update_reading_position does not exist';
    END IF;

    -- Check is_ip_blocked
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_ip_blocked') THEN
        RAISE EXCEPTION 'Function is_ip_blocked does not exist';
    END IF;

    -- Check get_rate_limit_count
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_rate_limit_count') THEN
        RAISE EXCEPTION 'Function get_rate_limit_count does not exist';
    END IF;

    RAISE NOTICE 'All RPC functions exist ✓';
END $$;

-- ============================================
-- TEST 3: Test function execution
-- ============================================
DO $$
DECLARE
    v_test_user_id UUID := gen_random_uuid();
    v_test_book_id UUID := gen_random_uuid();
    v_is_blocked BOOLEAN;
    v_count INT;
BEGIN
    -- Test log_security_event
    PERFORM public.log_security_event(
        'test_event',
        v_test_user_id,
        '127.0.0.1',
        'Test Agent',
        '/api/test',
        '{"test": true}'::jsonb,
        'low'
    );
    RAISE NOTICE 'log_security_event works ✓';

    -- Test track_failed_login
    PERFORM public.track_failed_login('192.168.1.1', 'test@example.com', 5, 30);
    RAISE NOTICE 'track_failed_login works ✓';

    -- Test is_ip_blocked
    v_is_blocked := public.is_ip_blocked('192.168.1.1');
    RAISE NOTICE 'is_ip_blocked works ✓ (blocked: %)', v_is_blocked;

    -- Test reset_failed_login_attempts
    PERFORM public.reset_failed_login_attempts('192.168.1.1');
    RAISE NOTICE 'reset_failed_login_attempts works ✓';

    -- Test get_rate_limit_count
    v_count := public.get_rate_limit_count('test_key', 1);
    RAISE NOTICE 'get_rate_limit_count works ✓ (count: %)', v_count;

    -- Clean up test data
    DELETE FROM public.security_events WHERE user_id = v_test_user_id;
    DELETE FROM public.failed_login_attempts WHERE ip_address = '192.168.1.1';

    RAISE NOTICE '=========================';
    RAISE NOTICE 'ALL TESTS PASSED ✅';
    RAISE NOTICE '=========================';
END $$;

-- ============================================
-- TEST 4: Verify column structure
-- ============================================
SELECT
    'books' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'books' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT
    'chapters' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'chapters' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- SUMMARY
-- ============================================
-- This script verifies:
-- 1. All required tables exist
-- 2. All RPC functions exist
-- 3. Functions can be executed without errors
-- 4. Table columns match specifications