// FlowReader Feedback Statistics API
// Operations dashboard data endpoint with privacy-conscious aggregation

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest } from '../_lib/auth-enhanced';
import { adminGuard } from '../../apps/web/src/lib/feedback/admin_guard';

interface FeedbackStatsResponse {
  totalSubmissions: number;
  averageRating: number;
  submissionsByType: Record<string, number>;
  submissionsByCategory: Record<string, number>;
  ratingDistribution: Record<number, number>;
  submissionsByDay: Array<{ date: string; count: number }>;
  recentSubmissions: Array<{
    id: string;
    type: string;
    rating: number;
    category: string;
    description: string;
    created_at: string;
    route?: string;
  }>;
  sessionStats: {
    uniqueSessions: number;
    avgSubmissionsPerSession: number;
    topRoutes: Array<{ route: string; count: number }>;
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
    return;
  }

  try {
    // Authentication - require admin access for stats
    const authResult = await authenticateRequest(req);
    if (!authResult.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // SECURITY: Enterprise-grade admin access control
    const requestContext = {
      ip_address: req.headers['x-forwarded-for']?.toString()?.split(',')[0]?.trim() ||
                 req.headers['x-real-ip']?.toString() ||
                 'unknown',
      user_agent: req.headers['user-agent']?.toString() || 'unknown',
      session_id: req.headers['x-session-id']?.toString() || 'unknown'
    };

    const accessResult = await adminGuard.checkFeedbackStatsAccess(
      authResult.user,
      'read', // Reading feedback stats
      requestContext
    );

    if (!accessResult.allowed) {
      res.status(403).json({
        success: false,
        error: 'Admin access required',
        details: accessResult.reason,
        required_role: accessResult.required_role
      });
      return;
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get query parameters for filtering
    const daysBack = parseInt(req.query.days as string) || 30;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - daysBack);

    // Get all feedback submissions within the time range
    const { data: submissions, error: submissionsError } = await supabase
      .from('feedback_submissions')
      .select('*')
      .gte('created_at', dateFilter.toISOString())
      .order('created_at', { ascending: false });

    if (submissionsError) {
      console.error('Database error:', submissionsError);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch feedback data'
      });
      return;
    }

    // Calculate statistics
    const stats: FeedbackStatsResponse = {
      totalSubmissions: submissions.length,
      averageRating: submissions.length > 0
        ? submissions.reduce((sum, s) => sum + s.rating, 0) / submissions.length
        : 0,
      submissionsByType: {},
      submissionsByCategory: {},
      ratingDistribution: {},
      submissionsByDay: [],
      recentSubmissions: [],
      sessionStats: {
        uniqueSessions: 0,
        avgSubmissionsPerSession: 0,
        topRoutes: []
      }
    };

    // Process submissions for statistics
    const sessionCounts = new Map<string, number>();
    const routeCounts = new Map<string, number>();
    const dailyCounts = new Map<string, number>();

    for (const submission of submissions) {
      // Type distribution
      stats.submissionsByType[submission.type] = (stats.submissionsByType[submission.type] || 0) + 1;

      // Category distribution
      stats.submissionsByCategory[submission.category] = (stats.submissionsByCategory[submission.category] || 0) + 1;

      // Rating distribution
      stats.ratingDistribution[submission.rating] = (stats.ratingDistribution[submission.rating] || 0) + 1;

      // Session tracking
      const sessionId = submission.session_id;
      if (sessionId) {
        sessionCounts.set(sessionId, (sessionCounts.get(sessionId) || 0) + 1);
      }

      // Route tracking
      const route = submission.route || 'unknown';
      if (route !== 'unknown') {
        routeCounts.set(route, (routeCounts.get(route) || 0) + 1);
      }

      // Daily counts
      const date = new Date(submission.created_at).toISOString().split('T')[0];
      dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
    }

    // Session statistics
    stats.sessionStats.uniqueSessions = sessionCounts.size;
    stats.sessionStats.avgSubmissionsPerSession = sessionCounts.size > 0
      ? submissions.length / sessionCounts.size
      : 0;

    // Top routes
    stats.sessionStats.topRoutes = Array.from(routeCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([route, count]) => ({ route, count }));

    // Daily submissions (last 30 days)
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    stats.submissionsByDay = last30Days.map(date => ({
      date,
      count: dailyCounts.get(date) || 0
    }));

    // Recent submissions (anonymized)
    stats.recentSubmissions = submissions
      .slice(0, limit)
      .map(submission => ({
        id: submission.id,
        type: submission.type,
        rating: submission.rating,
        category: submission.category,
        description: submission.description.length > 100
          ? submission.description.substring(0, 100) + '...'
          : submission.description,
        created_at: submission.created_at,
        route: submission.route
      }));

    res.status(200).json(stats);

  } catch (error) {
    console.error('Feedback stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}