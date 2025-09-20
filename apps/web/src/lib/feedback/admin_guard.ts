// FlowReader Admin Access Control Guard
// Enterprise-grade access control for feedback stats and management interfaces
// SOC 2 Type II Compliance: Access Control (CC6.1, CC6.2, CC6.3)

import type { User } from '@supabase/supabase-js';

/**
 * Admin role definitions for SOC 2 compliance
 */
export interface AdminRole {
  id: string;
  name: string;
  permissions: AdminPermission[];
  description: string;
}

export interface AdminPermission {
  resource: string;
  actions: string[];
  conditions?: Record<string, any>;
}

/**
 * Pre-defined admin roles with specific permissions
 */
export const ADMIN_ROLES: Record<string, AdminRole> = {
  SUPER_ADMIN: {
    id: 'super_admin',
    name: 'Super Administrator',
    permissions: [
      {
        resource: 'feedback_stats',
        actions: ['read', 'export', 'delete']
      },
      {
        resource: 'user_management',
        actions: ['read', 'create', 'update', 'delete']
      },
      {
        resource: 'system_configuration',
        actions: ['read', 'update']
      }
    ],
    description: 'Full system access for senior administrators'
  },
  SECURITY_ADMIN: {
    id: 'security_admin',
    name: 'Security Administrator',
    permissions: [
      {
        resource: 'feedback_stats',
        actions: ['read', 'export']
      },
      {
        resource: 'audit_logs',
        actions: ['read', 'export']
      },
      {
        resource: 'security_events',
        actions: ['read', 'respond']
      }
    ],
    description: 'Security monitoring and compliance access'
  },
  FEEDBACK_ADMIN: {
    id: 'feedback_admin',
    name: 'Feedback Administrator',
    permissions: [
      {
        resource: 'feedback_stats',
        actions: ['read']
      },
      {
        resource: 'feedback_submissions',
        actions: ['read', 'update']
      }
    ],
    description: 'Feedback system management access'
  }
};

/**
 * Access control audit event types
 */
export interface AccessAuditEvent {
  timestamp: string;
  user_id: string;
  user_email: string;
  action: string;
  resource: string;
  result: 'granted' | 'denied';
  reason?: string;
  ip_address: string;
  user_agent: string;
  session_id: string;
}

/**
 * Admin access control guard class
 * Implements enterprise-grade access control with audit logging
 */
export class AdminAccessGuard {
  private auditEvents: AccessAuditEvent[] = [];

  /**
   * Check if user has admin access to feedback stats
   * @param user - Authenticated user object
   * @param action - Requested action (read, export, delete)
   * @param context - Request context for audit logging
   * @returns Promise<AccessResult>
   */
  async checkFeedbackStatsAccess(
    user: User | null,
    action: string,
    context: {
      ip_address: string;
      user_agent: string;
      session_id: string;
    }
  ): Promise<{
    allowed: boolean;
    reason?: string;
    required_role?: string;
  }> {
    const auditEvent: AccessAuditEvent = {
      timestamp: new Date().toISOString(),
      user_id: user?.id || 'anonymous',
      user_email: user?.email || 'unknown',
      action,
      resource: 'feedback_stats',
      result: 'denied',
      ip_address: context.ip_address,
      user_agent: context.user_agent,
      session_id: context.session_id
    };

    try {
      // Step 1: Authentication check
      if (!user) {
        auditEvent.reason = 'User not authenticated';
        await this.logAuditEvent(auditEvent);

        return {
          allowed: false,
          reason: 'Authentication required for admin access',
          required_role: 'Any admin role'
        };
      }

      // Step 2: Get user admin roles
      const userRoles = await this.getUserAdminRoles(user.id);

      if (userRoles.length === 0) {
        auditEvent.reason = 'User has no admin roles';
        await this.logAuditEvent(auditEvent);

        return {
          allowed: false,
          reason: 'Admin role required for feedback stats access',
          required_role: 'feedback_admin, security_admin, or super_admin'
        };
      }

      // Step 3: Permission check
      const hasPermission = this.checkPermission(userRoles, 'feedback_stats', action);

      if (!hasPermission) {
        auditEvent.reason = `Insufficient permissions for action: ${action}`;
        await this.logAuditEvent(auditEvent);

        return {
          allowed: false,
          reason: `Permission denied for action: ${action}`,
          required_role: action === 'delete' ? 'super_admin' : 'feedback_admin or higher'
        };
      }

      // Step 4: Additional security checks
      const securityCheckResult = await this.performSecurityChecks(user, context);

      if (!securityCheckResult.passed) {
        auditEvent.reason = securityCheckResult.reason;
        await this.logAuditEvent(auditEvent);

        return {
          allowed: false,
          reason: securityCheckResult.reason
        };
      }

      // Access granted
      auditEvent.result = 'granted';
      auditEvent.reason = `Access granted with roles: ${userRoles.join(', ')}`;
      await this.logAuditEvent(auditEvent);

      return {
        allowed: true
      };

    } catch (error) {
      console.error('Admin access check error:', error);
      auditEvent.reason = 'System error during access check';
      await this.logAuditEvent(auditEvent);

      // Fail secure - deny access on system errors
      return {
        allowed: false,
        reason: 'System error - access denied for security'
      };
    }
  }

  /**
   * Get admin roles for a user from the database
   * @param userId - User ID to check
   * @returns Promise<string[]> - Array of role names
   */
  private async getUserAdminRoles(userId: string): Promise<string[]> {
    try {
      // In a real implementation, this would query the database
      // For now, we'll use environment variables for admin users
      const adminUsers = process.env.ADMIN_USERS?.split(',') || [];
      const superAdminUsers = process.env.SUPER_ADMIN_USERS?.split(',') || [];
      const securityAdminUsers = process.env.SECURITY_ADMIN_USERS?.split(',') || [];

      const roles: string[] = [];

      if (superAdminUsers.includes(userId)) {
        roles.push('super_admin');
      } else if (securityAdminUsers.includes(userId)) {
        roles.push('security_admin');
      } else if (adminUsers.includes(userId)) {
        roles.push('feedback_admin');
      }

      return roles;
    } catch (error) {
      console.error('Error fetching user roles:', error);
      return [];
    }
  }

  /**
   * Check if user roles have permission for a specific resource and action
   * @param userRoles - User's admin roles
   * @param resource - Resource to access
   * @param action - Action to perform
   * @returns boolean
   */
  private checkPermission(userRoles: string[], resource: string, action: string): boolean {
    for (const roleName of userRoles) {
      const role = ADMIN_ROLES[roleName.toUpperCase()];
      if (!role) continue;

      for (const permission of role.permissions) {
        if (permission.resource === resource && permission.actions.includes(action)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Perform additional security checks
   * @param user - User object
   * @param context - Request context
   * @returns Promise<{passed: boolean, reason?: string}>
   */
  private async performSecurityChecks(
    user: User,
    context: { ip_address: string; user_agent: string; session_id: string }
  ): Promise<{ passed: boolean; reason?: string }> {
    // Check 1: Rate limiting for admin actions
    const isRateLimited = await this.checkAdminRateLimit(user.id, context.ip_address);
    if (isRateLimited) {
      return {
        passed: false,
        reason: 'Admin action rate limit exceeded'
      };
    }

    // Check 2: Suspicious activity detection
    const isSuspicious = await this.detectSuspiciousActivity(user.id, context);
    if (isSuspicious) {
      return {
        passed: false,
        reason: 'Suspicious activity detected - access temporarily restricted'
      };
    }

    // Check 3: IP allowlist (if configured)
    const isIPAllowed = await this.checkIPAllowlist(context.ip_address);
    if (!isIPAllowed) {
      return {
        passed: false,
        reason: 'IP address not in admin allowlist'
      };
    }

    return { passed: true };
  }

  /**
   * Check admin action rate limiting
   * @param userId - User ID
   * @param ipAddress - IP address
   * @returns Promise<boolean> - true if rate limited
   */
  private async checkAdminRateLimit(userId: string, ipAddress: string): Promise<boolean> {
    // Implement admin-specific rate limiting
    // For now, we'll use a simple in-memory store
    const key = `admin_rate_limit:${userId}:${ipAddress}`;
    const now = Date.now();
    const windowMs = 5 * 60 * 1000; // 5 minutes
    const maxActions = 10; // 10 admin actions per 5 minutes

    // In production, this would use Redis or database
    return false; // Placeholder - not rate limited
  }

  /**
   * Detect suspicious admin activity patterns
   * @param userId - User ID
   * @param context - Request context
   * @returns Promise<boolean> - true if suspicious
   */
  private async detectSuspiciousActivity(
    userId: string,
    context: { ip_address: string; user_agent: string; session_id: string }
  ): Promise<boolean> {
    // Check for:
    // - Multiple failed access attempts
    // - Access from unusual locations
    // - Unusual access patterns
    // - Concurrent sessions from different IPs

    return false; // Placeholder - not suspicious
  }

  /**
   * Check if IP is in admin allowlist
   * @param ipAddress - IP address to check
   * @returns Promise<boolean> - true if allowed
   */
  private async checkIPAllowlist(ipAddress: string): Promise<boolean> {
    const allowlist = process.env.ADMIN_IP_ALLOWLIST?.split(',') || [];

    // If no allowlist is configured, allow all IPs
    if (allowlist.length === 0) {
      return true;
    }

    return allowlist.includes(ipAddress);
  }

  /**
   * Log audit event for compliance tracking
   * @param event - Audit event to log
   */
  private async logAuditEvent(event: AccessAuditEvent): Promise<void> {
    try {
      // Store audit event in database for compliance
      this.auditEvents.push(event);

      // In production, this would write to a dedicated audit log table
      console.log('Admin access audit:', JSON.stringify(event));

      // For SOC 2 compliance, these logs should be:
      // 1. Immutable (append-only)
      // 2. Encrypted at rest
      // 3. Backed up regularly
      // 4. Monitored for suspicious patterns

    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Audit logging failure should not block the operation
      // but should trigger alerts for security team
    }
  }

  /**
   * Generate audit report for compliance
   * @param startDate - Report start date
   * @param endDate - Report end date
   * @returns Promise<AccessAuditEvent[]>
   */
  async generateAuditReport(startDate: Date, endDate: Date): Promise<AccessAuditEvent[]> {
    return this.auditEvents.filter(event => {
      const eventDate = new Date(event.timestamp);
      return eventDate >= startDate && eventDate <= endDate;
    });
  }
}

/**
 * Default admin access guard instance
 */
export const adminGuard = new AdminAccessGuard();

/**
 * Express/Vercel middleware for protecting admin endpoints
 * @param requiredAction - Required action for access
 * @returns Middleware function
 */
export function requireAdminAccess(requiredAction: string = 'read') {
  return async function(req: any, res: any, next: any) {
    try {
      const context = {
        ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] ||
                   req.connection?.remoteAddress ||
                   'unknown',
        user_agent: req.headers['user-agent'] || 'unknown',
        session_id: req.headers['x-session-id'] || req.sessionID || 'unknown'
      };

      const accessResult = await adminGuard.checkFeedbackStatsAccess(
        req.user, // Assumes user is attached to request by auth middleware
        requiredAction,
        context
      );

      if (!accessResult.allowed) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required',
          details: accessResult.reason,
          required_role: accessResult.required_role
        });
      }

      // Access granted - continue to endpoint
      next();

    } catch (error) {
      console.error('Admin access middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Access control system error'
      });
    }
  };
}