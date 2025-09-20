import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthWithSecurity, convertVercelRequest, enhancedAuth } from '../_lib/auth-enhanced.js';
import { supabaseAdminAdmin } from '../_lib/auth.js';
import type {
  UserBehaviorMetrics,
  PersonalizationApiResponse
} from '../../apps/web/src/lib/personalization/types.js';

/**
 * Anonymous Behavior Tracking API
 * Collects anonymous user behavior data for personalization
 */

interface BehaviorRequest {
  sessionId: string;
  behaviors: Partial<UserBehaviorMetrics>[];
}

interface BehaviorResponse {
  recorded: boolean;
  behaviorCount: number;
  sessionMetrics?: {
    totalBehaviors: number;
    uniquePatterns: number;
    lastUpdate: string;
  };
}

class BehaviorTrackingService {
  private readonly MAX_BEHAVIORS_PER_REQUEST = 50;
  private readonly SESSION_RETENTION_HOURS = 24;

  /**
   * Track anonymous user behavior
   */
  async trackBehavior(request: BehaviorRequest): Promise<BehaviorResponse> {
    const { sessionId, behaviors } = request;

    try {
      // Validate request
      if (behaviors.length > this.MAX_BEHAVIORS_PER_REQUEST) {
        throw new Error(`Too many behaviors in request. Maximum: ${this.MAX_BEHAVIORS_PER_REQUEST}`);
      }

      // Scrub and validate each behavior
      const cleanBehaviors = behaviors.map(behavior => this.scrubBehaviorData(behavior));

      // Store behaviors in database (anonymous session-based storage)
      const recordedCount = await this.storeBehaviors(sessionId, cleanBehaviors);

      // Get session metrics
      const sessionMetrics = await this.getSessionMetrics(sessionId);

      return {
        recorded: recordedCount > 0,
        behaviorCount: recordedCount,
        sessionMetrics
      };

    } catch (error) {
      console.error('Failed to track behavior:', error);
      throw error;
    }
  }

  /**
   * Scrub PII from behavior data
   */
  private scrubBehaviorData(behavior: Partial<UserBehaviorMetrics>): Partial<UserBehaviorMetrics> {
    const cleaned: Partial<UserBehaviorMetrics> = {
      sessionId: behavior.sessionId,
      timestamp: behavior.timestamp || new Date().toISOString()
    };

    // Scrub reading patterns
    if (behavior.readingPatterns) {
      cleaned.readingPatterns = behavior.readingPatterns.map(pattern => ({
        documentType: pattern.documentType,
        averageReadingSpeed: Math.min(Math.max(pattern.averageReadingSpeed || 200, 50), 1000), // Clamp to reasonable range
        preferredTextDensity: pattern.preferredTextDensity || 'medium',
        sessionDuration: Math.min(pattern.sessionDuration || 0, 480), // Max 8 hours
        engagementLevel: Math.min(Math.max(pattern.engagementLevel || 0.5, 0), 1), // 0-1 range
        timeOfDay: this.scrubTimeOfDay(pattern.timeOfDay),
        deviceType: pattern.deviceType || 'desktop'
      }));
    }

    // Scrub interaction metrics
    if (behavior.interactionMetrics) {
      cleaned.interactionMetrics = {
        knowledgeEnhancementUsage: Math.min(behavior.interactionMetrics.knowledgeEnhancementUsage || 0, 100),
        feedbackFrequency: Math.min(behavior.interactionMetrics.feedbackFrequency || 0, 20),
        navigationPatterns: (behavior.interactionMetrics.navigationPatterns || [])
          .slice(-10) // Keep only last 10 routes
          .map(route => this.scrubRoute(route)),
        featureAdoption: this.scrubFeatureAdoption(behavior.interactionMetrics.featureAdoption || {}),
        errorRecoveryTime: Math.min(behavior.interactionMetrics.errorRecoveryTime || 0, 60000) // Max 1 minute
      };
    }

    // Scrub preference signals
    if (behavior.preferenceSignals) {
      cleaned.preferenceSignals = {
        preferredKnowledgeIntents: behavior.preferenceSignals.preferredKnowledgeIntents || [],
        interfacePreferences: this.scrubInterfacePreferences(behavior.preferenceSignals.interfacePreferences || {}),
        contentPreferences: this.scrubContentPreferences(behavior.preferenceSignals.contentPreferences || {}),
        timingPreferences: this.scrubTimingPreferences(behavior.preferenceSignals.timingPreferences || {})
      };
    }

    // Scrub satisfaction scores
    if (behavior.satisfactionScores) {
      cleaned.satisfactionScores = behavior.satisfactionScores
        .slice(-10) // Keep only last 10 scores
        .map(score => ({
          score: Math.min(Math.max(score.score, 1), 5), // 1-5 scale
          category: score.category,
          timestamp: score.timestamp,
          context: score.context ? this.scrubContext(score.context) : undefined
        }));
    }

    return cleaned;
  }

  /**
   * Scrub time of day to remove precise timing information
   */
  private scrubTimeOfDay(timeOfDay?: string): string {
    if (!timeOfDay) return new Date().toISOString();

    const date = new Date(timeOfDay);
    const hour = date.getHours();

    // Group into time periods instead of exact times
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Scrub route to remove sensitive path information
   */
  private scrubRoute(route: string): string {
    // Remove query parameters and IDs
    const cleanRoute = route.split('?')[0];

    // Replace dynamic segments with placeholders
    return cleanRoute
      .replace(/\/books\/[^\/]+/g, '/books/[id]')
      .replace(/\/users\/[^\/]+/g, '/users/[id]')
      .replace(/\/\d+/g, '/[id]')
      .substring(0, 100); // Limit length
  }

  /**
   * Scrub feature adoption data
   */
  private scrubFeatureAdoption(features: Record<string, number>): Record<string, number> {
    const cleaned: Record<string, number> = {};
    const allowedFeatures = [
      'knowledge_enhancement',
      'feedback_system',
      'reading_progress',
      'notes_taking',
      'search_functionality',
      'tts_feature'
    ];

    for (const [feature, count] of Object.entries(features)) {
      if (allowedFeatures.includes(feature)) {
        cleaned[feature] = Math.min(count, 1000); // Reasonable max
      }
    }

    return cleaned;
  }

  /**
   * Scrub interface preferences
   */
  private scrubInterfacePreferences(prefs: any): any {
    return {
      layoutDensity: prefs.layoutDensity || 'comfortable',
      colorScheme: prefs.colorScheme || 'light',
      fontSize: prefs.fontSize || 'medium',
      animationsEnabled: Boolean(prefs.animationsEnabled),
      sidebarPosition: prefs.sidebarPosition || 'left'
    };
  }

  /**
   * Scrub content preferences
   */
  private scrubContentPreferences(prefs: any): any {
    return {
      recommendationTypes: (prefs.recommendationTypes || []).slice(0, 10),
      contextHintFrequency: prefs.contextHintFrequency || 'moderate',
      explanationDepth: prefs.explanationDepth || 'detailed',
      backgroundInfoLevel: prefs.backgroundInfoLevel || 'intermediate'
    };
  }

  /**
   * Scrub timing preferences
   */
  private scrubTimingPreferences(prefs: any): any {
    return {
      knowledgeDelay: Math.min(Math.max(prefs.knowledgeDelay || 1000, 0), 10000),
      recommendationFrequency: Math.min(Math.max(prefs.recommendationFrequency || 24, 1), 168),
      feedbackPromptTiming: prefs.feedbackPromptTiming || 'delayed'
    };
  }

  /**
   * Scrub context information
   */
  private scrubContext(context: string): string {
    // Remove any potential PII from context strings
    return context
      .replace(/\b[\w\.-]+@[\w\.-]+\.\w+\b/g, '[EMAIL]') // Remove emails
      .replace(/\b\d{3,}\b/g, '[NUMBER]') // Remove long numbers
      .substring(0, 200); // Limit length
  }

  /**
   * Store behaviors in database
   */
  private async storeBehaviors(
    sessionId: string,
    behaviors: Partial<UserBehaviorMetrics>[]
  ): Promise<number> {
    try {
      // In a real implementation, this would store in a proper analytics database
      // For now, we'll use Supabase with a dedicated anonymous_behaviors table

      const behaviorRecords = behaviors.map(behavior => ({
        session_id: sessionId,
        behavior_data: behavior,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + this.SESSION_RETENTION_HOURS * 60 * 60 * 1000).toISOString()
      }));

      // Create table if it doesn't exist (in real implementation, this would be a migration)
      await this.ensureBehaviorTable();

      // Insert behaviors
      const { data, error } = await supabaseAdminAdmin
        .from('anonymous_behaviors')
        .insert(behaviorRecords);

      if (error) {
        console.error('Failed to store behaviors:', error);
        return 0;
      }

      return behaviorRecords.length;

    } catch (error) {
      console.error('Error storing behaviors:', error);
      return 0;
    }
  }

  /**
   * Get session metrics
   */
  private async getSessionMetrics(sessionId: string): Promise<any> {
    try {
      const { data, error } = await supabaseAdminAdmin
        .from('anonymous_behaviors')
        .select('*')
        .eq('session_id', sessionId)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Failed to get session metrics:', error);
        return null;
      }

      const totalBehaviors = data?.length || 0;
      const uniquePatterns = new Set(data?.map(b =>
        b.behavior_data?.readingPatterns?.[0]?.documentType || 'unknown'
      )).size;

      const lastUpdate = data?.length > 0
        ? data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
        : new Date().toISOString();

      return {
        totalBehaviors,
        uniquePatterns,
        lastUpdate
      };

    } catch (error) {
      console.error('Error getting session metrics:', error);
      return null;
    }
  }

  /**
   * Ensure behavior table exists
   */
  private async ensureBehaviorTable(): Promise<void> {
    try {
      // This would typically be handled by database migrations
      // For now, we'll create the table if it doesn't exist
      const { error } = await supabaseAdminAdmin.rpc('create_table_if_not_exists', {
        table_name: 'anonymous_behaviors',
        table_definition: `
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          behavior_data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        `
      });

      if (error && !error.message.includes('already exists')) {
        console.error('Failed to ensure behavior table:', error);
      }
    } catch (error) {
      // Table might already exist, which is fine
      console.log('Behavior table creation handled via existing schema');
    }
  }

  /**
   * Clean up expired behaviors
   */
  async cleanupExpiredBehaviors(): Promise<number> {
    try {
      const { data, error } = await supabaseAdminAdmin
        .from('anonymous_behaviors')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Failed to cleanup expired behaviors:', error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Error cleaning up behaviors:', error);
      return 0;
    }
  }
}

/**
 * API handler for behavior tracking
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    // Convert VercelRequest to standard Request for enhanced auth
    const standardReq = convertVercelRequest(req);

    // Enhanced authentication (required for behavior tracking)
    let user;
    try {
      user = await requireAuthWithSecurity(standardReq);
    } catch (authError: any) {
      const statusCode = authError.message?.includes('Rate limit') ? 429 : 401;
      return res.status(statusCode).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: authError.message || 'Authentication required'
        }
      });
    }

    const { sessionId, behaviors } = req.body as BehaviorRequest;

    // Validate required fields
    if (!sessionId || !Array.isArray(behaviors)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields: sessionId, behaviors (array)'
        }
      });
    }

    // Validate behaviors array
    if (behaviors.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Behaviors array cannot be empty'
        }
      });
    }

    // Initialize behavior tracking service
    const behaviorService = new BehaviorTrackingService();

    // Track behaviors
    const data = await behaviorService.trackBehavior({ sessionId, behaviors });

    const response: PersonalizationApiResponse<BehaviorResponse> = {
      success: true,
      data,
      metadata: {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - Date.now() // Will be calculated properly
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Behavior tracking API error:', error);

    // Log security event for system errors
    try {
      const standardReq = convertVercelRequest(req);
      await enhancedAuth.logSecurityEvent(
        'system_error',
        null,
        {
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          endpoint: 'POST /api/personalization/behavior'
        },
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        },
        'low'
      );
    } catch (logError) {
      console.error('Failed to log security event:', logError);
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      }
    });
  }
}