// FlowReader Feedback System Types
// Privacy-first feedback collection with minimal data requirements

export interface FeedbackSubmission {
  id?: string;
  type: FeedbackType;
  rating: number; // 1-5 scale
  category: FeedbackCategory;
  description: string;
  sessionId: string; // Anonymous session tracking
  timestamp: string;
  userAgent?: string; // For technical debugging only
  route?: string; // Current page/feature context
}

export type FeedbackType = 'bug' | 'feature' | 'general' | 'praise';

export type FeedbackCategory =
  | 'usability'
  | 'performance'
  | 'ai-interaction'
  | 'reading-experience'
  | 'technical'
  | 'other';

export interface FeedbackFormData {
  type: FeedbackType;
  rating: number;
  category: FeedbackCategory;
  description: string;
}

// Feature toggle configuration
export interface FeedbackFeatureConfig {
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  maxSubmissionsPerSession: number;
  allowedRoutes?: string[]; // Optional route filtering
}

// Session tracking (anonymous)
export interface AnonymousSession {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  feedbackCount: number;
}

// API Response types
export interface FeedbackApiResponse {
  success: boolean;
  submissionId?: string;
  message?: string;
  error?: string;
}

export interface FeedbackStatsResponse {
  totalSubmissions: number;
  averageRating: number;
  submissionsByType: Record<FeedbackType, number>;
  submissionsByCategory: Record<FeedbackCategory, number>;
  recentSubmissions: FeedbackSubmission[];
}

// Validation schemas
export interface ValidationRule {
  field: keyof FeedbackFormData;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}