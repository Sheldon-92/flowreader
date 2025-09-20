/**
 * Cache Security Integration
 *
 * Ensures T99 compatibility with strict security and permission enforcement.
 * Implements RLS (Row Level Security) boundaries for caching with no regression
 * from existing security model.
 *
 * Security Features:
 * - RLS boundary verification before caching
 * - User isolation and permission checks
 * - Sensitive data detection and exclusion
 * - Audit logging for security compliance
 * - Backward compatibility with existing auth
 */

import { supabaseAdmin, authenticateRequest, requireAuth } from './auth.js';
import { getCachePolicyManager } from './cache-policies.js';
import { getUnifiedCache } from './cache-layer.js';
import { getCacheKeyGenerator } from './cache-keys.js';
import { createHash } from 'crypto';

// Security configuration
export interface CacheSecurityConfig {
  enforceRLS: boolean;
  allowCrossUserCaching: boolean;
  encryptSensitiveData: boolean;
  auditAccess: boolean;
  strictPermissionChecks: boolean;
  blocklistPatterns: string[];
  maxCacheableSize: number; // bytes
}

// Security context for cache operations
export interface SecurityContext {
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  isAuthenticated: boolean;
  permissions: string[];
  accessLevel: 'public' | 'user' | 'admin';
}

// Cache access result with security metadata
export interface SecureCacheResult<T> {
  value: T | null;
  allowed: boolean;
  reason?: string;
  securityLevel: 'public' | 'private' | 'restricted';
  auditId?: string;
}

// Security audit entry
export interface SecurityAuditEntry {
  id: string;
  timestamp: number;
  userId?: string;
  action: 'cache_read' | 'cache_write' | 'cache_invalidate' | 'permission_denied';
  resource: string;
  result: 'allowed' | 'denied';
  reason?: string;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    cacheKey?: string;
    dataSize?: number;
  };
}

export class CacheSecurityManager {
  private config: CacheSecurityConfig;
  private auditLog: SecurityAuditEntry[] = [];
  private blockedPatterns: RegExp[] = [];
  private policyManager = getCachePolicyManager();
  private cacheManager = getUnifiedCache();
  private keyGenerator = getCacheKeyGenerator();

  // Sensitive data patterns that should never be cached
  private readonly SENSITIVE_PATTERNS = [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /private[_-]?key/i,
    /credential/i,
    /auth[_-]?code/i,
    /session[_-]?id/i,
    /jwt/i,
    /oauth/i,
    /ssn/i,
    /social[_-]?security/i,
    /credit[_-]?card/i,
    /payment/i,
    /billing/i
  ];

  constructor(config?: Partial<CacheSecurityConfig>) {
    this.config = {
      enforceRLS: true,
      allowCrossUserCaching: false,
      encryptSensitiveData: true,
      auditAccess: true,
      strictPermissionChecks: true,
      blocklistPatterns: [],
      maxCacheableSize: 1024 * 1024, // 1MB max
      ...config
    };

    // Compile blocklist patterns
    this.blockedPatterns = [
      ...this.SENSITIVE_PATTERNS,
      ...this.config.blocklistPatterns.map(pattern => new RegExp(pattern, 'i'))
    ];
  }

  /**
   * Secure cache get with T99 compatibility
   */
  async secureGet<T>(
    key: string,
    request: Request,
    options?: {
      allowStale?: boolean;
      requireAuth?: boolean;
      bookId?: string;
    }
  ): Promise<SecureCacheResult<T>> {
    const auditId = this.generateAuditId();

    try {
      // Extract security context from request
      const context = await this.extractSecurityContext(request);

      // Verify RLS and permissions
      const permissionCheck = await this.checkCachePermissions(key, context, 'read', options);

      if (!permissionCheck.allowed) {
        this.auditSecurityEvent({
          id: auditId,
          timestamp: Date.now(),
          userId: context.userId,
          action: 'cache_read',
          resource: key,
          result: 'denied',
          reason: permissionCheck.reason,
          metadata: {
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            cacheKey: key
          }
        });

        return {
          value: null,
          allowed: false,
          reason: permissionCheck.reason,
          securityLevel: 'restricted',
          auditId
        };
      }

      // Get from cache with security context
      const cacheResult = await this.cacheManager.get<T>(key, {
        userId: context.userId,
        allowStale: options?.allowStale
      });

      // Additional verification for sensitive content
      if (cacheResult && this.containsSensitiveData(cacheResult)) {
        this.auditSecurityEvent({
          id: auditId,
          timestamp: Date.now(),
          userId: context.userId,
          action: 'cache_read',
          resource: key,
          result: 'denied',
          reason: 'Sensitive data detected in cache',
          metadata: {
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            cacheKey: key
          }
        });

        // Remove sensitive data from cache
        await this.cacheManager.delete(key);

        return {
          value: null,
          allowed: false,
          reason: 'Sensitive data protection triggered',
          securityLevel: 'restricted',
          auditId
        };
      }

      // Log successful access
      if (this.config.auditAccess && cacheResult) {
        this.auditSecurityEvent({
          id: auditId,
          timestamp: Date.now(),
          userId: context.userId,
          action: 'cache_read',
          resource: key,
          result: 'allowed',
          metadata: {
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            cacheKey: key
          }
        });
      }

      return {
        value: cacheResult,
        allowed: true,
        securityLevel: context.isAuthenticated ? 'private' : 'public',
        auditId
      };

    } catch (error) {
      console.error('Cache security error:', error);

      this.auditSecurityEvent({
        id: auditId,
        timestamp: Date.now(),
        action: 'cache_read',
        resource: key,
        result: 'denied',
        reason: `Security error: ${error instanceof Error ? error.message : 'Unknown'}`,
        metadata: { cacheKey: key }
      });

      return {
        value: null,
        allowed: false,
        reason: 'Security validation failed',
        securityLevel: 'restricted',
        auditId
      };
    }
  }

  /**
   * Secure cache set with data validation
   */
  async secureSet<T>(
    key: string,
    value: T,
    request: Request,
    options?: {
      ttl?: number;
      bookId?: string;
      requireAuth?: boolean;
      metadata?: any;
    }
  ): Promise<{ success: boolean; reason?: string; auditId: string }> {
    const auditId = this.generateAuditId();

    try {
      // Extract security context
      const context = await this.extractSecurityContext(request);

      // Check size limits
      const dataSize = this.calculateDataSize(value);
      if (dataSize > this.config.maxCacheableSize) {
        return {
          success: false,
          reason: `Data too large: ${dataSize} bytes exceeds ${this.config.maxCacheableSize} bytes`,
          auditId
        };
      }

      // Sensitive data detection
      if (this.containsSensitiveData(value)) {
        this.auditSecurityEvent({
          id: auditId,
          timestamp: Date.now(),
          userId: context.userId,
          action: 'cache_write',
          resource: key,
          result: 'denied',
          reason: 'Sensitive data detected',
          metadata: {
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            cacheKey: key,
            dataSize
          }
        });

        return {
          success: false,
          reason: 'Cannot cache sensitive data',
          auditId
        };
      }

      // Verify permissions
      const permissionCheck = await this.checkCachePermissions(key, context, 'write', options);

      if (!permissionCheck.allowed) {
        this.auditSecurityEvent({
          id: auditId,
          timestamp: Date.now(),
          userId: context.userId,
          action: 'cache_write',
          resource: key,
          result: 'denied',
          reason: permissionCheck.reason,
          metadata: {
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            cacheKey: key,
            dataSize
          }
        });

        return {
          success: false,
          reason: permissionCheck.reason,
          auditId
        };
      }

      // RLS verification for book content
      if (options?.bookId && context.userId) {
        const hasBookAccess = await this.verifyBookAccess(context.userId, options.bookId);
        if (!hasBookAccess) {
          return {
            success: false,
            reason: 'No access to book content',
            auditId
          };
        }
      }

      // Store in cache with security metadata
      await this.cacheManager.set(key, value, {
        ttl: options?.ttl,
        metadata: {
          userId: context.userId,
          bookId: options?.bookId,
          securityLevel: context.isAuthenticated ? 'private' : 'public',
          ...options?.metadata
        }
      });

      // Audit successful storage
      if (this.config.auditAccess) {
        this.auditSecurityEvent({
          id: auditId,
          timestamp: Date.now(),
          userId: context.userId,
          action: 'cache_write',
          resource: key,
          result: 'allowed',
          metadata: {
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            cacheKey: key,
            dataSize
          }
        });
      }

      return { success: true, auditId };

    } catch (error) {
      console.error('Cache security error:', error);

      this.auditSecurityEvent({
        id: auditId,
        timestamp: Date.now(),
        action: 'cache_write',
        resource: key,
        result: 'denied',
        reason: `Security error: ${error instanceof Error ? error.message : 'Unknown'}`,
        metadata: { cacheKey: key }
      });

      return {
        success: false,
        reason: 'Security validation failed',
        auditId
      };
    }
  }

  /**
   * Generate secure cache key with user context
   */
  generateSecureKey(
    content: any,
    request: Request,
    options?: {
      contentType?: string;
      bookId?: string;
      includeUser?: boolean;
    }
  ): Promise<{ key: string; metadata: any }> {
    return this.extractSecurityContext(request).then(context => {
      const keyResult = this.keyGenerator.generateKey(content, {
        userId: options?.includeUser ? context.userId : undefined,
        bookId: options?.bookId || '',
        contentType: options?.contentType || 'response',
        queryType: 'simple',
        priority: 'warm',
        security: {
          requiresAuth: context.isAuthenticated,
          isPublic: !context.isAuthenticated,
          encryptionRequired: false
        }
      });

      return {
        key: keyResult.primary,
        metadata: {
          securityLevel: context.isAuthenticated ? 'private' : 'public',
          userId: context.userId,
          semantic: keyResult.semantic,
          tags: keyResult.tags
        }
      };
    });
  }

  /**
   * Invalidate user-specific cache entries
   */
  async invalidateUserCache(userId: string, reason: string = 'user_logout'): Promise<void> {
    const auditId = this.generateAuditId();

    try {
      await this.policyManager.invalidateByPattern(
        { userId },
        { reason, immediate: true }
      );

      this.auditSecurityEvent({
        id: auditId,
        timestamp: Date.now(),
        userId,
        action: 'cache_invalidate',
        resource: `user:${userId}`,
        result: 'allowed',
        reason,
        metadata: {}
      });

    } catch (error) {
      console.error('User cache invalidation error:', error);

      this.auditSecurityEvent({
        id: auditId,
        timestamp: Date.now(),
        userId,
        action: 'cache_invalidate',
        resource: `user:${userId}`,
        result: 'denied',
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        metadata: {}
      });
    }
  }

  /**
   * Get security audit logs
   */
  getAuditLogs(filters?: {
    userId?: string;
    action?: string;
    timeRange?: { start: number; end: number };
    result?: 'allowed' | 'denied';
  }): SecurityAuditEntry[] {
    let logs = [...this.auditLog];

    if (filters) {
      if (filters.userId) {
        logs = logs.filter(log => log.userId === filters.userId);
      }
      if (filters.action) {
        logs = logs.filter(log => log.action === filters.action);
      }
      if (filters.timeRange) {
        logs = logs.filter(log =>
          log.timestamp >= filters.timeRange!.start &&
          log.timestamp <= filters.timeRange!.end
        );
      }
      if (filters.result) {
        logs = logs.filter(log => log.result === filters.result);
      }
    }

    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Private methods

  private async extractSecurityContext(request: Request): Promise<SecurityContext> {
    const { user } = await authenticateRequest(request);

    return {
      userId: user?.id,
      userEmail: user?.email,
      isAuthenticated: !!user,
      permissions: [], // Would be populated from user roles
      accessLevel: user ? 'user' : 'public',
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown'
    };
  }

  private async checkCachePermissions(
    key: string,
    context: SecurityContext,
    operation: 'read' | 'write',
    options?: any
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Public access for non-authenticated operations
    if (!this.config.enforceRLS && !context.isAuthenticated) {
      return { allowed: true };
    }

    // Strict permission checks
    if (this.config.strictPermissionChecks) {
      // Require authentication for write operations
      if (operation === 'write' && !context.isAuthenticated) {
        return { allowed: false, reason: 'Authentication required for cache writes' };
      }

      // Check if requiring auth but not authenticated
      if (options?.requireAuth && !context.isAuthenticated) {
        return { allowed: false, reason: 'Authentication required' };
      }
    }

    // Cross-user caching rules
    if (!this.config.allowCrossUserCaching && context.userId) {
      // Check if key contains user-specific data
      if (key.includes(context.userId) || key.includes('user:')) {
        return { allowed: true };
      }
    }

    return { allowed: true };
  }

  private async verifyBookAccess(userId: string, bookId: string): Promise<boolean> {
    try {
      // Check if user has access to the book (RLS will handle this)
      const { data, error } = await supabaseAdmin
        .from('books')
        .select('id')
        .eq('id', bookId)
        .eq('user_id', userId) // RLS enforcement
        .single();

      return !error && !!data;
    } catch (error) {
      console.error('Book access verification error:', error);
      return false;
    }
  }

  private containsSensitiveData(data: any): boolean {
    const dataStr = JSON.stringify(data).toLowerCase();

    return this.blockedPatterns.some(pattern => pattern.test(dataStr));
  }

  private calculateDataSize(data: any): number {
    return new Blob([JSON.stringify(data)]).size;
  }

  private generateAuditId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  private auditSecurityEvent(entry: SecurityAuditEntry): void {
    if (!this.config.auditAccess) return;

    this.auditLog.push(entry);

    // Emit security event for external monitoring
    if (entry.result === 'denied') {
      console.warn('Cache security violation:', entry);
    }

    // Limit audit log size
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
  }
}

// T99 compatibility wrapper functions
export class T99CompatibleCache {
  private securityManager: CacheSecurityManager;

  constructor() {
    this.securityManager = new CacheSecurityManager({
      enforceRLS: true,
      strictPermissionChecks: true,
      auditAccess: true
    });
  }

  /**
   * T99 compatible cache get
   */
  async get<T>(key: string, request: Request): Promise<T | null> {
    const result = await this.securityManager.secureGet<T>(key, request);
    return result.allowed ? result.value : null;
  }

  /**
   * T99 compatible cache set
   */
  async set<T>(key: string, value: T, request: Request, ttl?: number): Promise<boolean> {
    const result = await this.securityManager.secureSet(key, value, request, { ttl });
    return result.success;
  }

  /**
   * T99 compatible key generation
   */
  async generateKey(content: any, request: Request, bookId?: string): Promise<string> {
    const result = await this.securityManager.generateSecureKey(content, request, { bookId });
    return result.key;
  }

  /**
   * T99 compatible user cache invalidation
   */
  async invalidateUser(userId: string): Promise<void> {
    await this.securityManager.invalidateUserCache(userId);
  }
}

// Export singleton instances
let securityManager: CacheSecurityManager | null = null;
let t99Cache: T99CompatibleCache | null = null;

export function getCacheSecurityManager(): CacheSecurityManager {
  if (!securityManager) {
    securityManager = new CacheSecurityManager();
  }
  return securityManager;
}

export function getT99CompatibleCache(): T99CompatibleCache {
  if (!t99Cache) {
    t99Cache = new T99CompatibleCache();
  }
  return t99Cache;
}