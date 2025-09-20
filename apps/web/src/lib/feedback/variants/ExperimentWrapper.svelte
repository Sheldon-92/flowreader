<!-- Experiment Wrapper Component -->
<!-- Handles A/B test variant selection and gradual rollout with tracking -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { ABTestManager, trackEvent, isInVariant } from './ABTestManager';
  import AIInteractionOptimized from './AIInteractionOptimized.svelte';
  import MobileNavigationEnhanced from './MobileNavigationEnhanced.svelte';
  import ProgressiveLoadingOptimized from './ProgressiveLoadingOptimized.svelte';

  export let experimentType: 'ai_interaction' | 'mobile_navigation' | 'progressive_loading';
  export let fallbackComponent: any = null; // Original component to show for control group
  export let componentProps: Record<string, any> = {};

  // Test configuration mapping
  const testMapping = {
    ai_interaction: {
      testId: 'ai_interaction_v1',
      optimizedComponent: AIInteractionOptimized,
      trafficLimit: 20
    },
    mobile_navigation: {
      testId: 'navigation_mobile_v1',
      optimizedComponent: MobileNavigationEnhanced,
      trafficLimit: 15
    },
    progressive_loading: {
      testId: 'performance_loading_v1',
      optimizedComponent: ProgressiveLoadingOptimized,
      trafficLimit: 10
    }
  };

  let selectedVariant: string | null = null;
  let isInExperiment = false;
  let experimentConfig = testMapping[experimentType];
  let componentToRender: any = null;
  let trackingEnabled = true;

  onMount(() => {
    if (!experimentConfig) {
      console.warn(`Unknown experiment type: ${experimentType}`);
      return;
    }

    // Get user's variant assignment
    selectedVariant = ABTestManager.getVariantForTest(experimentConfig.testId);
    isInExperiment = selectedVariant !== null;

    // Determine which component to render
    if (isInExperiment && selectedVariant === 'optimized') {
      componentToRender = experimentConfig.optimizedComponent;
    } else if (isInExperiment && selectedVariant === 'enhanced') {
      componentToRender = experimentConfig.optimizedComponent;
    } else if (isInExperiment && selectedVariant === 'progressive') {
      componentToRender = experimentConfig.optimizedComponent;
    } else {
      componentToRender = fallbackComponent;
    }

    // Track experiment exposure
    if (isInExperiment) {
      trackEvent('experiment_exposure', {
        testId: experimentConfig.testId,
        variantId: selectedVariant,
        experimentType,
        componentRendered: componentToRender ? 'optimized' : 'fallback',
        trafficLimit: experimentConfig.trafficLimit,
        userAgent: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
      });
    }

    // Monitor experiment performance
    startPerformanceMonitoring();
  });

  function startPerformanceMonitoring() {
    if (!isInExperiment || !trackingEnabled) return;

    // Track interaction metrics
    const startTime = Date.now();

    // Component render time
    setTimeout(() => {
      trackEvent('component_render_time', {
        testId: experimentConfig.testId,
        variantId: selectedVariant,
        experimentType,
        renderTime: Date.now() - startTime
      });
    }, 0);

    // Track component errors
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handlePromiseRejection);

    // Cleanup on component destroy
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
    };
  }

  function handleError(event: ErrorEvent) {
    if (!isInExperiment) return;

    trackEvent('experiment_error', {
      testId: experimentConfig.testId,
      variantId: selectedVariant,
      experimentType,
      errorMessage: event.message,
      errorSource: event.filename,
      errorLine: event.lineno,
      errorColumn: event.colno
    });
  }

  function handlePromiseRejection(event: PromiseRejectionEvent) {
    if (!isInExperiment) return;

    trackEvent('experiment_promise_rejection', {
      testId: experimentConfig.testId,
      variantId: selectedVariant,
      experimentType,
      rejectionReason: event.reason?.toString() || 'Unknown'
    });
  }

  // Track user interactions
  function trackInteraction(eventType: string, details: Record<string, any> = {}) {
    if (!isInExperiment || !trackingEnabled) return;

    trackEvent(`experiment_interaction_${eventType}`, {
      testId: experimentConfig.testId,
      variantId: selectedVariant,
      experimentType,
      ...details,
      timestamp: Date.now()
    });
  }

  // Handle component events
  function handleComponentEvent(event: CustomEvent) {
    const { type, detail } = event;

    // Track specific component events
    trackInteraction('component_event', {
      eventType: type,
      eventDetail: detail
    });

    // Forward event to parent
    dispatch(type, detail);
  }

  // Emergency rollback function
  function forceRollback() {
    if (!isInExperiment) return;

    trackEvent('experiment_rollback', {
      testId: experimentConfig.testId,
      variantId: selectedVariant,
      experimentType,
      rollbackReason: 'manual_trigger',
      rollbackTime: Date.now()
    });

    // Switch to fallback component
    componentToRender = fallbackComponent;
    isInExperiment = false;
    selectedVariant = null;
  }

  // Export rollback function for emergency use
  export { forceRollback };

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<!-- Render appropriate component based on experiment assignment -->
{#if componentToRender}
  <svelte:component
    this={componentToRender}
    {...componentProps}
    on:*={handleComponentEvent}
    {isInExperiment}
    {selectedVariant}
    {experimentType}
  />
{:else if fallbackComponent}
  <svelte:component
    this={fallbackComponent}
    {...componentProps}
    on:*={handleComponentEvent}
    isInExperiment={false}
    selectedVariant="control"
    {experimentType}
  />
{:else}
  <!-- Fallback UI if no component is available -->
  <div class="experiment-fallback p-4 bg-gray-50 border border-gray-200 rounded-lg">
    <div class="text-center text-gray-600">
      <div class="text-sm font-medium mb-2">Component Loading</div>
      <div class="text-xs">
        Experiment: {experimentType}
        {#if isInExperiment}
          • Variant: {selectedVariant}
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Development debug panel (only in dev mode) -->
{#if typeof window !== 'undefined' && window.location.hostname === 'localhost'}
  <div class="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded z-50 max-w-xs">
    <div class="font-bold mb-1">A/B Test Debug</div>
    <div>Experiment: {experimentType}</div>
    <div>In Test: {isInExperiment ? 'Yes' : 'No'}</div>
    {#if isInExperiment}
      <div>Variant: {selectedVariant}</div>
      <div>Traffic Limit: {experimentConfig?.trafficLimit}%</div>
    {/if}
    <div>Component: {componentToRender?.name || 'Fallback'}</div>
    {#if isInExperiment}
      <button
        on:click={forceRollback}
        class="mt-2 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
      >
        Force Rollback
      </button>
    {/if}
  </div>
{/if}

<style>
  .experiment-fallback {
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Hide debug panel in production */
  :global(body[data-env="production"]) .fixed.bottom-4.right-4 {
    display: none;
  }
</style>