-- Security Hardening Migration
-- Add rate limiting and security enhancements

-- Rate limiting table
CREATE TABLE rate_limit_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip TEXT,
    user_agent TEXT,
    endpoint TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rate limiting performance
CREATE INDEX idx_rate_limit_key_timestamp ON rate_limit_entries(key, timestamp);
CREATE INDEX idx_rate_limit_cleanup ON rate_limit_entries(timestamp);

-- Security audit log table
CREATE TABLE security_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'auth_attempt', 'auth_success', 'auth_failure',
        'rate_limit_exceeded', 'suspicious_activity',
        'data_access', 'privilege_escalation_attempt',
        'security_policy_violation'
    )),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address TEXT,
    user_agent TEXT,
    endpoint TEXT,
    details JSONB DEFAULT '{}',
    severity TEXT DEFAULT 'info' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX idx_security_audit_timestamp ON security_audit_log(timestamp);
CREATE INDEX idx_security_audit_user_id ON security_audit_log(user_id);
CREATE INDEX idx_security_audit_event_type ON security_audit_log(event_type);
CREATE INDEX idx_security_audit_severity ON security_audit_log(severity);

-- Failed login attempts tracking
CREATE TABLE failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address TEXT NOT NULL,
    email TEXT,
    attempt_count INTEGER DEFAULT 1,
    first_attempt TIMESTAMPTZ DEFAULT NOW(),
    last_attempt TIMESTAMPTZ DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint for IP tracking
CREATE UNIQUE INDEX idx_failed_login_ip ON failed_login_attempts(ip_address);
CREATE INDEX idx_failed_login_blocked_until ON failed_login_attempts(blocked_until);

-- Function to clean up old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_rate_limit_entries()
RETURNS void AS $$
BEGIN
    DELETE FROM rate_limit_entries
    WHERE timestamp < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type TEXT,
    p_user_id UUID DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_endpoint TEXT DEFAULT NULL,
    p_details JSONB DEFAULT '{}',
    p_severity TEXT DEFAULT 'info'
) RETURNS void AS $$
BEGIN
    INSERT INTO security_audit_log (
        event_type, user_id, ip_address, user_agent,
        endpoint, details, severity
    ) VALUES (
        p_event_type, p_user_id, p_ip_address, p_user_agent,
        p_endpoint, p_details, p_severity
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track failed login attempts
CREATE OR REPLACE FUNCTION track_failed_login(
    p_ip_address TEXT,
    p_email TEXT DEFAULT NULL,
    p_max_attempts INTEGER DEFAULT 5,
    p_block_duration_minutes INTEGER DEFAULT 15
) RETURNS JSONB AS $$
DECLARE
    current_attempts INTEGER;
    is_blocked BOOLEAN := FALSE;
    block_until TIMESTAMPTZ;
BEGIN
    -- Check if IP is currently blocked
    SELECT blocked_until INTO block_until
    FROM failed_login_attempts
    WHERE ip_address = p_ip_address
    AND blocked_until > NOW();

    IF block_until IS NOT NULL THEN
        RETURN jsonb_build_object(
            'blocked', true,
            'blocked_until', block_until,
            'message', 'IP address is temporarily blocked'
        );
    END IF;

    -- Update or insert failed attempt record
    INSERT INTO failed_login_attempts (ip_address, email, attempt_count, last_attempt)
    VALUES (p_ip_address, p_email, 1, NOW())
    ON CONFLICT (ip_address)
    DO UPDATE SET
        attempt_count = failed_login_attempts.attempt_count + 1,
        last_attempt = NOW(),
        email = COALESCE(p_email, failed_login_attempts.email);

    -- Get current attempt count
    SELECT attempt_count INTO current_attempts
    FROM failed_login_attempts
    WHERE ip_address = p_ip_address;

    -- Block IP if max attempts exceeded
    IF current_attempts >= p_max_attempts THEN
        UPDATE failed_login_attempts
        SET blocked_until = NOW() + (p_block_duration_minutes || ' minutes')::INTERVAL
        WHERE ip_address = p_ip_address;

        -- Log security event
        PERFORM log_security_event(
            'rate_limit_exceeded',
            NULL,
            p_ip_address,
            NULL,
            'auth/login',
            jsonb_build_object(
                'attempt_count', current_attempts,
                'email', p_email,
                'block_duration_minutes', p_block_duration_minutes
            ),
            'high'
        );

        RETURN jsonb_build_object(
            'blocked', true,
            'attempt_count', current_attempts,
            'blocked_until', NOW() + (p_block_duration_minutes || ' minutes')::INTERVAL,
            'message', 'Too many failed attempts. IP blocked temporarily.'
        );
    END IF;

    RETURN jsonb_build_object(
        'blocked', false,
        'attempt_count', current_attempts,
        'remaining_attempts', p_max_attempts - current_attempts
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset failed login attempts on successful login
CREATE OR REPLACE FUNCTION reset_failed_login_attempts(p_ip_address TEXT)
RETURNS void AS $$
BEGIN
    DELETE FROM failed_login_attempts WHERE ip_address = p_ip_address;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced user session tracking
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for session management
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    UPDATE user_sessions
    SET is_active = FALSE
    WHERE expires_at < NOW() AND is_active = TRUE;

    DELETE FROM user_sessions
    WHERE expires_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced RLS policies for security tables
ALTER TABLE rate_limit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can access rate limiting data
CREATE POLICY "Service role access only" ON rate_limit_entries
    FOR ALL USING (current_setting('role') = 'service_role');

-- Only service role can access security audit log
CREATE POLICY "Service role access only" ON security_audit_log
    FOR ALL USING (current_setting('role') = 'service_role');

-- Only service role can access failed login attempts
CREATE POLICY "Service role access only" ON failed_login_attempts
    FOR ALL USING (current_setting('role') = 'service_role');

-- Users can view their own sessions, service role can access all
CREATE POLICY "Users can view own sessions" ON user_sessions
    FOR SELECT USING (auth.uid() = user_id OR current_setting('role') = 'service_role');

CREATE POLICY "Service role can manage all sessions" ON user_sessions
    FOR ALL USING (current_setting('role') = 'service_role');

-- Scheduled cleanup jobs (requires pg_cron extension in production)
-- These would be run as cron jobs in production environment

-- Create a function to be called by external scheduler
CREATE OR REPLACE FUNCTION security_maintenance()
RETURNS void AS $$
BEGIN
    -- Clean up old rate limit entries (keep last 24 hours)
    DELETE FROM rate_limit_entries
    WHERE timestamp < NOW() - INTERVAL '24 hours';

    -- Clean up old audit logs (keep last 90 days)
    DELETE FROM security_audit_log
    WHERE timestamp < NOW() - INTERVAL '90 days';

    -- Clean up old failed login attempts (keep last 7 days)
    DELETE FROM failed_login_attempts
    WHERE first_attempt < NOW() - INTERVAL '7 days'
    AND (blocked_until IS NULL OR blocked_until < NOW());

    -- Clean up expired sessions
    PERFORM cleanup_expired_sessions();

    -- Log maintenance completion
    PERFORM log_security_event(
        'security_maintenance',
        NULL,
        NULL,
        NULL,
        'system/maintenance',
        jsonb_build_object('completed_at', NOW()),
        'info'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add constraints to prevent data bloat
-- Rate limit entries: auto-delete after 48 hours
CREATE OR REPLACE FUNCTION delete_old_rate_limit_entries()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM rate_limit_entries
    WHERE timestamp < NOW() - INTERVAL '48 hours';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_rate_limit_entries
    AFTER INSERT ON rate_limit_entries
    FOR EACH STATEMENT
    EXECUTE FUNCTION delete_old_rate_limit_entries();

COMMENT ON TABLE rate_limit_entries IS 'Stores rate limiting data with automatic cleanup';
COMMENT ON TABLE security_audit_log IS 'Security event audit trail';
COMMENT ON TABLE failed_login_attempts IS 'Tracks failed authentication attempts for rate limiting';
COMMENT ON TABLE user_sessions IS 'Enhanced session tracking for security monitoring';