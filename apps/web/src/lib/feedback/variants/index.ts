// FlowReader A/B Testing Variants Export
// Centralized export for all experiment variants and management tools

export { ABTestManager, trackEvent, isInVariant, getVariantForTest, getUserTestStatus } from './ABTestManager';
export { default as ExperimentWrapper } from './ExperimentWrapper.svelte';
export { default as AIInteractionOptimized } from './AIInteractionOptimized.svelte';
export { default as MobileNavigationEnhanced } from './MobileNavigationEnhanced.svelte';
export { default as ProgressiveLoadingOptimized } from './ProgressiveLoadingOptimized.svelte';

// Type exports
export type {
  ABTestConfig,
  ABTestVariant,
  ABTestAssignment
} from './ABTestManager';

// Experiment configuration helper
export const ExperimentConfig = {
  AI_INTERACTION: {
    testId: 'ai_interaction_v1',
    name: 'AI Interaction Optimization',
    trafficAllocation: 20,
    variants: ['control', 'optimized']
  },
  MOBILE_NAVIGATION: {
    testId: 'navigation_mobile_v1',
    name: 'Mobile Navigation Enhancement',
    trafficAllocation: 15,
    variants: ['control', 'enhanced']
  },
  PROGRESSIVE_LOADING: {
    testId: 'performance_loading_v1',
    name: 'Progressive Loading Optimization',
    trafficAllocation: 10,
    variants: ['control', 'progressive']
  }
} as const;

// Quick access functions for each experiment type
export function createAIInteractionExperiment(props: any) {
  return {
    component: ExperimentWrapper,
    props: {
      experimentType: 'ai_interaction',
      componentProps: props
    }
  };
}

export function createMobileNavigationExperiment(props: any) {
  return {
    component: ExperimentWrapper,
    props: {
      experimentType: 'mobile_navigation',
      componentProps: props
    }
  };
}

export function createProgressiveLoadingExperiment(props: any) {
  return {
    component: ExperimentWrapper,
    props: {
      experimentType: 'progressive_loading',
      componentProps: props
    }
  };
}

// Experiment status helper
export function getExperimentStatus() {
  return {
    aiInteraction: {
      ...ExperimentConfig.AI_INTERACTION,
      userVariant: getVariantForTest(ExperimentConfig.AI_INTERACTION.testId)
    },
    mobileNavigation: {
      ...ExperimentConfig.MOBILE_NAVIGATION,
      userVariant: getVariantForTest(ExperimentConfig.MOBILE_NAVIGATION.testId)
    },
    progressiveLoading: {
      ...ExperimentConfig.PROGRESSIVE_LOADING,
      userVariant: getVariantForTest(ExperimentConfig.PROGRESSIVE_LOADING.testId)
    }
  };
}