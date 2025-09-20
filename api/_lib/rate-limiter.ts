import { supabaseAdmin } from './auth.js';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...config
    };
  }

  async checkLimit(req: Request): Promise<RateLimitResult> {
    const key = this.config.keyGenerator?.(req) || this.getDefaultKey(req);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const resetTime = Math.ceil((now + this.config.windowMs) / 1000);

    try {
      // Clean up old entries first
      await supabaseAdmin
        .from('rate_limit_entries')
        .delete()
        .lt('timestamp', new Date(windowStart).toISOString());

      // Count current requests in window
      const { data: existingEntries, error: countError } = await supabaseAdmin
        .from('rate_limit_entries')
        .select('id', { count: 'exact' })
        .eq('key', key)
        .gte('timestamp', new Date(windowStart).toISOString());

      if (countError) {
        console.error('Rate limit count error:', countError);
        // SECURITY: Fail close - reject request if we can't check rate limit
        // This prevents bypass during database issues
        return {
          allowed: false,
          remaining: 0,
          resetTime,
          retryAfter: Math.ceil(this.config.windowMs / 1000)
        };
      }

      const currentCount = existingEntries?.length || 0;
      const remaining = Math.max(0, this.config.maxRequests - currentCount - 1);

      if (currentCount >= this.config.maxRequests) {
        const retryAfter = Math.ceil(this.config.windowMs / 1000);
        return {
          allowed: false,
          remaining: 0,
          resetTime,
          retryAfter
        };
      }

      // Record this request
      await supabaseAdmin
        .from('rate_limit_entries')
        .insert({
          key,
          timestamp: new Date(now).toISOString(),
          ip: this.extractIP(req),
          user_agent: req.headers.get('user-agent')?.substring(0, 255),
          endpoint: this.extractEndpoint(req)
        });

      return {
        allowed: true,
        remaining,
        resetTime
      };

    } catch (error) {
      console.error('Rate limiting error:', error);
      // SECURITY: Fail close - reject request if rate limiting fails
      // This ensures security even during system errors
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil(this.config.windowMs / 1000)
      };
    }
  }

  private getDefaultKey(req: Request): string {
    const ip = this.extractIP(req);
    const userAgent = req.headers.get('user-agent')?.substring(0, 50) || 'unknown';
    return `ip:${ip}:ua:${this.hashString(userAgent)}`;
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

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// Pre-configured rate limiters for different use cases
export const authRateLimiter = new RateLimiter({
  maxRequests: 5, // 5 auth attempts
  windowMs: 15 * 60 * 1000, // per 15 minutes
  keyGenerator: (req) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') || 'unknown';
    return `auth:${ip}`;
  }
});

export const apiRateLimiter = new RateLimiter({
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
  keyGenerator: (req) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') || 'unknown';
    return `api:${ip}`;
  }
});

export const uploadRateLimiter = new RateLimiter({
  maxRequests: 10, // 10 uploads
  windowMs: 60 * 60 * 1000, // per hour
  keyGenerator: (req) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') || 'unknown';
    return `upload:${ip}`;
  }
});

export const chatRateLimiter = new RateLimiter({
  maxRequests: 50, // 50 chat requests
  windowMs: 60 * 60 * 1000, // per hour
  keyGenerator: (req) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') || 'unknown';
    return `chat:${ip}`;
  }
});

export const autoNotesRateLimiter = new RateLimiter({
  maxRequests: 20, // 20 auto notes
  windowMs: 60 * 60 * 1000, // per hour
  keyGenerator: (req) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') || 'unknown';
    return `auto-notes:${ip}`;
  }
});

// Middleware wrapper for rate limiting
export function withRateLimit(rateLimiter: RateLimiter) {
  return function (handler: (req: Request) => Promise<Response>) {
    return async function (req: Request): Promise<Response> {
      const result = await rateLimiter.checkLimit(req);

      if (!result.allowed) {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': rateLimiter['config'].maxRequests.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetTime.toString(),
        };

        if (result.retryAfter) {
          headers['Retry-After'] = result.retryAfter.toString();
        }

        return new Response(
          JSON.stringify({
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests',
              retryAfter: result.retryAfter
            }
          }),
          {
            status: 429,
            headers
          }
        );
      }

      const response = await handler(req);

      // Add rate limit headers to successful responses
      response.headers.set('X-RateLimit-Limit', rateLimiter['config'].maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
      response.headers.set('X-RateLimit-Reset', result.resetTime.toString());

      return response;
    };
  };
}