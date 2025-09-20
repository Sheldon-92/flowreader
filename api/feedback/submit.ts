// FlowReader Feedback Submission API
// Privacy-first feedback collection with rate limiting and validation

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { RateLimiter } from '../_lib/rate-limiter';
import { inputValidator } from '../_lib/input-validator';

interface FeedbackSubmission {
  id?: string;
  type: 'bug' | 'feature' | 'general' | 'praise';
  rating: number;
  category: 'usability' | 'performance' | 'ai-interaction' | 'reading-experience' | 'technical' | 'other';
  description: string;
  sessionId: string;
  timestamp: string;
  userAgent?: string;
  route?: string;
}

interface FeedbackResponse {
  success: boolean;
  submissionId?: string;
  message?: string;
  error?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
    return;
  }

  try {
    // Rate limiting
    const rateLimiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
      keyGenerator: (req) => {
        const ip = req.headers['x-forwarded-for'] ||
                   req.headers['x-real-ip'] ||
                   req.connection?.remoteAddress ||
                   'unknown';
        return `feedback:${Array.isArray(ip) ? ip[0] : ip}`;
      }
    });

    const rateLimit = await rateLimiter.checkLimit(req);
    if (!rateLimit.allowed) {
      res.status(429).json({
        success: false,
        error: 'Too many feedback submissions. Please try again later.',
        retryAfter: Math.ceil(rateLimit.resetTime / 1000)
      });
      return;
    }

    // Validate input
    const validation = inputValidator.validateFeedback(req.body);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: validation.errors[0] || 'Invalid input data'
      });
      return;
    }

    const submission: FeedbackSubmission = req.body;

    // Additional server-side validation
    if (!submission.sessionId || submission.sessionId.length < 16) {
      res.status(400).json({
        success: false,
        error: 'Invalid session ID'
      });
      return;
    }

    if (submission.rating < 1 || submission.rating > 5) {
      res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
      return;
    }

    if (!submission.description || submission.description.trim().length < 10) {
      res.status(400).json({
        success: false,
        error: 'Description must be at least 10 characters'
      });
      return;
    }

    if (submission.description.length > 1000) {
      res.status(400).json({
        success: false,
        error: 'Description must be no more than 1000 characters'
      });
      return;
    }

    // Check for potential PII in description
    const piiPatterns = [
      /\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b/i, // Email
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
      /\b\d{3}-\d{3}-\d{4}\b/ // Phone number
    ];

    for (const pattern of piiPatterns) {
      if (pattern.test(submission.description)) {
        res.status(400).json({
          success: false,
          error: 'Please do not include personal information in your feedback'
        });
        return;
      }
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Prepare data for storage
    const feedbackData = {
      type: submission.type,
      rating: submission.rating,
      category: submission.category,
      description: submission.description.trim(),
      session_id: submission.sessionId,
      user_agent: sanitizeUserAgent(submission.userAgent || ''),
      route: sanitizeRoute(submission.route || ''),
      created_at: new Date().toISOString(),
      ip_hash: hashIP(req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '')
    };

    // Insert feedback into database
    const { data, error: dbError } = await supabase
      .from('feedback_submissions')
      .insert([feedbackData])
      .select('id')
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      res.status(500).json({
        success: false,
        error: 'Failed to save feedback'
      });
      return;
    }

    // Success response
    const response: FeedbackResponse = {
      success: true,
      submissionId: data.id,
      message: 'Thank you for your feedback!'
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Utility functions
function sanitizeUserAgent(userAgent: string): string {
  // Only keep browser name and major version
  const patterns = [
    { name: 'Chrome', pattern: /Chrome\/(\d+)/ },
    { name: 'Firefox', pattern: /Firefox\/(\d+)/ },
    { name: 'Safari', pattern: /Safari\/[\d.]+.*Version\/(\d+)/ },
    { name: 'Edge', pattern: /Edg\/(\d+)/ }
  ];

  for (const { name, pattern } of patterns) {
    const match = userAgent.match(pattern);
    if (match) {
      return `${name}/${match[1]}`;
    }
  }

  return 'Unknown';
}

function sanitizeRoute(route: string): string {
  // Remove sensitive parameters while keeping structure
  return route
    .replace(/\/read\/[a-zA-Z0-9-]+/, '/read/[bookId]')
    .replace(/\/[a-f0-9-]{36}/, '/[id]') // Generic UUID pattern
    .substring(0, 100); // Limit length
}

function hashIP(ip: string | string[]): string {
  if (!ip) return 'unknown';

  const ipString = Array.isArray(ip) ? ip[0] : ip;

  // Simple hash for IP (for abuse detection while preserving privacy)
  let hash = 0;
  for (let i = 0; i < ipString.length; i++) {
    const char = ipString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}