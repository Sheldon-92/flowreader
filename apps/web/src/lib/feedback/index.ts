// FlowReader Feedback System
// Privacy-first user feedback collection with operational controls

// Components
export { default as FeedbackForm } from './FeedbackForm.svelte';
export { default as FeedbackTrigger } from './FeedbackTrigger.svelte';
export { default as FeedbackDashboard } from './FeedbackDashboard.svelte';
export { default as FeedbackAdmin } from './FeedbackAdmin.svelte';

// A/B Testing Variants (Round 1 UX Improvements)
export * from './variants';

// API and utilities
export * from './api';
export * from './utils';
export * from './types';

// Convenience exports for easy integration
export {
  AnonymousSessionManager,
  FeedbackFeatureToggle,
  FeedbackValidator,
  PrivacyHelper
} from './utils';

export {
  submitFeedback,
  getFeedbackStats,
  isFeatureAvailable,
  getSessionInfo
} from './api';