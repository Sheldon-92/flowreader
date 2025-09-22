-- Migration: Security and Rate Limiting Tables and Functions
-- Created: 2025-09-21
-- Purpose: Support rate limiting, failed login tracking, and security event logging

-- ============================================
-- 1. RATE LIMIT ENTRIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.rate_limit_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ip TEXT,
    user_agent TEXT,
    endpoint TEXT
);

-- Indexes for rate_limit_entries
CREATE INDEX IF NOT EXISTS idx_rate_limit_key ON public.rate_limit_entries(key);
CREATE INDEX IF NOT EXISTS idx_rate_limit_timestamp ON public.rate_limit_entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_rate_limit_key_timestamp ON public.rate_limit_entries(key, timestamp);

-- Cleanup old entries (optional, can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_rate_limit_entries()
RETURNS void AS $$
BEGIN
    DELETE FROM public.rate_limit_entries
    WHERE timestamp < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. FAILED LOGIN ATTEMPTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
    ip_address TEXT PRIMARY KEY,
    attempt_count INT NOT NULL DEFAULT 0,
    blocked_until TIMESTAMP WITH TIME ZONE,
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    email TEXT
);

-- Indexes for failed_login_attempts
CREATE INDEX IF NOT EXISTS idx_failed_login_blocked_until ON public.failed_login_attempts(blocked_until);
CREATE INDEX IF NOT EXISTS idx_failed_login_last_attempt ON public.failed_login_attempts(last_attempt_at);

-- ============================================
-- 3. SECURITY EVENTS TABLE (for audit logging)
-- ============================================
CREATE TABLE IF NOT EXISTS public.security_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_type TEXT NOT NULL,
    user_id UUID,
    ip_address TEXT,
    user_agent TEXT,
    endpoint TEXT,
    details JSONB,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

-- Index for security_events
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON public.security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON public.security_events(event_type);

-- ============================================
-- 4. RPC FUNCTIONS
-- ============================================

-- Function: log_security_event
-- Purpose: Log security-related events for auditing
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_event_type TEXT,
    p_user_id UUID DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_endpoint TEXT DEFAULT NULL,
    p_details JSONB DEFAULT NULL,
    p_severity TEXT DEFAULT 'low'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.security_events (
        event_type,
        user_id,
        ip_address,
        user_agent,
        endpoint,
        details,
        severity
    ) VALUES (
        p_event_type,
        p_user_id,
        p_ip_address,
        p_user_agent,
        p_endpoint,
        p_details,
        p_severity
    );
END;
$$;

-- Function: track_failed_login
-- Purpose: Track failed login attempts and block IPs after threshold
CREATE OR REPLACE FUNCTION public.track_failed_login(
    p_ip_address TEXT,
    p_email TEXT DEFAULT NULL,
    p_max_attempts INT DEFAULT 5,
    p_block_duration_minutes INT DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_attempts INT;
BEGIN
    -- Insert or update the failed login record
    INSERT INTO public.failed_login_attempts (
        ip_address,
        email,
        attempt_count,
        last_attempt_at
    ) VALUES (
        p_ip_address,
        p_email,
        1,
        NOW()
    )
    ON CONFLICT (ip_address) DO UPDATE SET
        attempt_count = failed_login_attempts.attempt_count + 1,
        last_attempt_at = NOW(),
        email = COALESCE(p_email, failed_login_attempts.email);

    -- Get current attempt count
    SELECT attempt_count INTO v_current_attempts
    FROM public.failed_login_attempts
    WHERE ip_address = p_ip_address;

    -- Block if threshold exceeded
    IF v_current_attempts >= p_max_attempts THEN
        UPDATE public.failed_login_attempts
        SET blocked_until = NOW() + (p_block_duration_minutes || ' minutes')::INTERVAL
        WHERE ip_address = p_ip_address;
    END IF;
END;
$$;

-- Function: reset_failed_login_attempts
-- Purpose: Clear failed login attempts for an IP
CREATE OR REPLACE FUNCTION public.reset_failed_login_attempts(
    p_ip_address TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.failed_login_attempts
    WHERE ip_address = p_ip_address;
END;
$$;

-- Function: update_reading_position
-- Purpose: Update user's reading position in a book
CREATE OR REPLACE FUNCTION public.update_reading_position(
    p_user_id UUID,
    p_book_id UUID,
    p_chapter_idx INT DEFAULT NULL,
    p_cfi_position TEXT DEFAULT NULL,
    p_percentage NUMERIC DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update the reading_progress JSONB in books table
    UPDATE public.books
    SET
        reading_progress = jsonb_build_object(
            'current_chapter', COALESCE(p_chapter_idx, (reading_progress->>'current_chapter')::INT),
            'current_cfi', COALESCE(p_cfi_position, reading_progress->>'current_cfi'),
            'percentage', COALESCE(p_percentage, (reading_progress->>'percentage')::NUMERIC),
            'last_read', NOW()::TEXT
        ),
        updated_at = NOW()
    WHERE id = p_book_id
    AND owner_id = p_user_id;

    -- Log the reading position update
    PERFORM public.log_security_event(
        'reading_position_updated',
        p_user_id,
        NULL,
        NULL,
        '/api/position/update',
        jsonb_build_object(
            'book_id', p_book_id,
            'chapter_idx', p_chapter_idx,
            'percentage', p_percentage
        ),
        'low'
    );
END;
$$;

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function: is_ip_blocked
-- Purpose: Check if an IP is currently blocked
CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip_address TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_blocked_until TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT blocked_until INTO v_blocked_until
    FROM public.failed_login_attempts
    WHERE ip_address = p_ip_address;

    IF v_blocked_until IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN v_blocked_until > NOW();
END;
$$;

-- Function: get_rate_limit_count
-- Purpose: Get the number of requests for a key in a time window
CREATE OR REPLACE FUNCTION public.get_rate_limit_count(
    p_key TEXT,
    p_window_minutes INT DEFAULT 1
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.rate_limit_entries
    WHERE key = p_key
    AND timestamp > NOW() - (p_window_minutes || ' minutes')::INTERVAL;

    RETURN v_count;
END;
$$;

-- ============================================
-- 6. GRANTS (minimal necessary permissions)
-- ============================================

-- Grant usage on functions to authenticated users
GRANT EXECUTE ON FUNCTION public.log_security_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_failed_login TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_failed_login_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_reading_position TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ip_blocked TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rate_limit_count TO anon, authenticated;

-- Note: Tables do not have RLS enabled by default as requested
-- If RLS is needed later, it can be enabled with appropriate policies

-- ============================================
-- 7. COMMENTS
-- ============================================

COMMENT ON TABLE public.rate_limit_entries IS 'Tracks API requests for rate limiting';
COMMENT ON TABLE public.failed_login_attempts IS 'Tracks failed login attempts for security';
COMMENT ON TABLE public.security_events IS 'Audit log for security-related events';
COMMENT ON FUNCTION public.log_security_event IS 'Logs security events for auditing';
COMMENT ON FUNCTION public.track_failed_login IS 'Tracks failed login attempts and blocks IPs';
COMMENT ON FUNCTION public.reset_failed_login_attempts IS 'Clears failed login attempts for an IP';
COMMENT ON FUNCTION public.update_reading_position IS 'Updates user reading position in a book';