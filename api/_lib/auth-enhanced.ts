import { jwtVerify } from 'jose';
import { supabaseAdmin } from './auth.js';
import { authRateLimiter, type RateLimitResult } from './rate-limiter.js';

interface AuthResult {
  user: { id: string; email: string } | null;
  error?: string;
  rateLimitInfo?: RateLimitResult;
}

interface SecurityContext {
  ip: string;
  userAgent: string;
  endpoint: string;
}

export class EnhancedAuth {
  private static instance: EnhancedAuth;

  static getInstance(): EnhancedAuth {
    if (!EnhancedAuth.instance) {
      EnhancedAuth.instance = new EnhancedAuth();
    }
    return EnhancedAuth.instance;
  }

  /**
   * Enhanced authentication with rate limiting and security logging
   */
  async authenticateWithSecurity(req: Request): Promise<AuthResult> {
    const context = this.extractSecurityContext(req);

    try {
      // Apply rate limiting first
      const rateLimitResult = await authRateLimiter.checkLimit(req);

      if (!rateLimitResult.allowed) {
        await this.logSecurityEvent('rate_limit_exceeded', null, context, {
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime
        }, 'high');

        return {
          user: null,
          error: 'Rate limit exceeded',
          rateLimitInfo: rateLimitResult
        };
      }

      // Extract and validate JWT token
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        await this.logSecurityEvent('auth_attempt', null, context, {
          reason: 'missing_auth_header'
        }, 'medium');

        return {
          user: null,
          error: 'Missing or invalid authorization header',
          rateLimitInfo: rateLimitResult
        };
      }

      const token = authHeader.replace('Bearer ', '');

      // Validate JWT token
      const { user, error } = await this.validateJWT(token);

      if (error || !user) {
        await this.logSecurityEvent('auth_failure', null, context, {
          reason: error || 'invalid_token',
          token_prefix: token.substring(0, 10) + '...'
        }, 'high');

        // Track failed login attempt
        await this.trackFailedLogin(context.ip, null);

        return {
          user: null,
          error: error || 'Invalid token',
          rateLimitInfo: rateLimitResult
        };
      }

      // Log successful authentication
      await this.logSecurityEvent('auth_success', user.id, context, {
        user_email: user.email
      }, 'low');

      // Reset failed login attempts on successful auth
      await this.resetFailedLoginAttempts(context.ip);

      return {
        user,
        rateLimitInfo: rateLimitResult
      };

    } catch (error) {
      console.error('Authentication error:', error);

      await this.logSecurityEvent('auth_failure', null, context, {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'critical');

      return {
        user: null,
        error: 'Authentication failed'
      };
    }
  }

  /**
   * Validate JWT token using Supabase auth
   */
  private async validateJWT(token: string): Promise<{
    user: { id: string; email: string } | null;
    error?: string;
  }> {
    try {
      // Use Supabase auth to validate the token
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        return { user: null, error: 'Invalid token' };
      }

      // Validate token structure and claims
      if (!user.id || !user.email) {
        return { user: null, error: 'Invalid token claims' };
      }

      // Check if user exists in our database
      const { data: dbUser, error: dbError } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .eq('id', user.id)
        .single();

      if (dbError || !dbUser) {
        return { user: null, error: 'User not found' };
      }

      return { user: { id: user.id, email: user.email } };

    } catch (error) {
      console.error('JWT validation error:', error);
      return { user: null, error: 'Token validation failed' };
    }
  }

  /**
   * Alternative JWT validation using jose library for additional security
   */
  private async validateJWTWithSecret(token: string): Promise<{
    valid: boolean;
    payload?: any;
    error?: string;
  }> {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET not configured');
      }

      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);

      return { valid: true, payload };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid token'
      };
    }
  }

  /**
   * Track failed login attempts with IP blocking
   */
  private async trackFailedLogin(ipAddress: string, email?: string): Promise<void> {
    try {
      await supabaseAdmin.rpc('track_failed_login', {
        p_ip_address: ipAddress,
        p_email: email,
        p_max_attempts: 5,
        p_block_duration_minutes: 15
      });
    } catch (error) {
      console.error('Failed to track login attempt:', error);
    }
  }

  /**
   * Reset failed login attempts for IP
   */
  private async resetFailedLoginAttempts(ipAddress: string): Promise<void> {
    try {
      await supabaseAdmin.rpc('reset_failed_login_attempts', {
        p_ip_address: ipAddress
      });
    } catch (error) {
      console.error('Failed to reset login attempts:', error);
    }
  }

  /**
   * Log security events for audit trail
   */
  async logSecurityEvent(
    eventType: string,
    userId: string | null,
    context: SecurityContext,
    details: Record<string, any> = {},
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Promise<void> {
    try {
      await supabaseAdmin.rpc('log_security_event', {
        p_event_type: eventType,
        p_user_id: userId,
        p_ip_address: context.ip,
        p_user_agent: context.userAgent,
        p_endpoint: context.endpoint,
        p_details: details,
        p_severity: severity
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Extract security context from request
   */
  private extractSecurityContext(req: Request): SecurityContext {
    const ip = this.extractIP(req);
    const userAgent = req.headers.get('user-agent')?.substring(0, 255) || 'unknown';
    const endpoint = this.extractEndpoint(req);

    return { ip, userAgent, endpoint };
  }

  private extractIP(req: Request): string {
    return (
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-client-ip') ||
      'unknown'
    );
  }

  private extractEndpoint(req: Request): string {
    try {
      const url = new URL(req.url);
      return `${req.method} ${url.pathname}`;
    } catch {
      return `${req.method} unknown`;
    }
  }

  /**
   * Check if IP is currently blocked
   */
  async isIPBlocked(req: Request): Promise<{
    blocked: boolean;
    blockedUntil?: Date;
    attemptCount?: number;
  }> {
    const ip = this.extractIP(req);

    try {
      const { data, error } = await supabaseAdmin
        .from('failed_login_attempts')
        .select('attempt_count, blocked_until')
        .eq('ip_address', ip)
        .single();

      if (error || !data) {
        return { blocked: false };
      }

      const blockedUntil = data.blocked_until ? new Date(data.blocked_until) : null;
      const isBlocked = blockedUntil && blockedUntil > new Date();

      return {
        blocked: isBlocked || false,
        blockedUntil: blockedUntil || undefined,
        attemptCount: data.attempt_count
      };

    } catch (error) {
      console.error('Failed to check IP block status:', error);
      return { blocked: false };
    }
  }
}

// Convenience functions for backward compatibility
export const enhancedAuth = EnhancedAuth.getInstance();

export async function requireAuthWithSecurity(req: Request) {
  const result = await enhancedAuth.authenticateWithSecurity(req);

  if (!result.user) {
    const error = new Error(result.error || 'Authentication required');
    (error as any).rateLimitInfo = result.rateLimitInfo;
    throw error;
  }

  return result.user;
}

export async function authenticateRequestWithSecurity(req: Request): Promise<AuthResult> {
  return enhancedAuth.authenticateWithSecurity(req);
}

/**
 * Convert VercelRequest to standard Request for compatibility with enhanced auth
 */
export function convertVercelRequest(vercelReq: any): Request {
  const { method, headers, url, body } = vercelReq;

  // Create proper URL - Vercel provides the full URL in req.url for API routes
  const requestUrl = url || `https://${headers.host || 'localhost'}${vercelReq.path || '/'}`;

  // Convert headers to Headers object
  const requestHeaders = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    if (value && typeof value === 'string') {
      requestHeaders.set(key, value);
    } else if (Array.isArray(value)) {
      // Handle array values by joining with comma
      requestHeaders.set(key, value.join(', '));
    }
  });

  // Create Request object
  const init: RequestInit = {
    method: method || 'GET',
    headers: requestHeaders,
  };

  // Add body for POST/PUT/PATCH requests
  if (body && ['POST', 'PUT', 'PATCH'].includes(method?.toUpperCase())) {
    if (typeof body === 'string') {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      requestHeaders.set('content-type', 'application/json');
    }
  }

  return new Request(requestUrl, init);
}