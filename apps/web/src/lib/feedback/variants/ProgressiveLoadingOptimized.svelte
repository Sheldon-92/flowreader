<!-- Progressive Loading Optimized Variant (B) -->
<!-- Enhanced loading experience with progressive content loading and better user feedback -->

<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { trackEvent } from './ABTestManager';

  export let contentType: 'book' | 'library' | 'images' = 'book';
  export let totalItems: number = 1;
  export let loadingText: string = 'Loading content...';

  const dispatch = createEventDispatcher();

  let loadingState: 'idle' | 'loading' | 'streaming' | 'complete' | 'error' = 'idle';
  let loadedItems = 0;
  let progressPercentage = 0;
  let estimatedTimeRemaining = 0;
  let loadingStartTime = 0;
  let currentStage = '';
  let detailedProgress: Array<{stage: string, completed: boolean, duration?: number}> = [];

  // Progressive loading stages
  const loadingStages = {
    book: [
      { stage: 'Fetching metadata', weight: 15 },
      { stage: 'Loading text content', weight: 40 },
      { stage: 'Processing images', weight: 25 },
      { stage: 'Optimizing layout', weight: 15 },
      { stage: 'Finalizing', weight: 5 }
    ],
    library: [
      { stage: 'Loading library index', weight: 20 },
      { stage: 'Fetching book covers', weight: 50 },
      { stage: 'Loading metadata', weight: 25 },
      { stage: 'Sorting and filtering', weight: 5 }
    ],
    images: [
      { stage: 'Preparing images', weight: 10 },
      { stage: 'Progressive loading', weight: 70 },
      { stage: 'Optimizing quality', weight: 15 },
      { stage: 'Cache optimization', weight: 5 }
    ]
  };

  let currentStageIndex = 0;
  let currentStageProgress = 0;

  onMount(() => {
    trackEvent('progressive_loading_initialized', {
      testId: 'performance_loading_v1',
      variantId: 'progressive',
      contentType,
      totalItems,
      timestamp: Date.now()
    });

    return () => {
      if (loadingState === 'loading' || loadingState === 'streaming') {
        trackEvent('progressive_loading_interrupted', {
          testId: 'performance_loading_v1',
          variantId: 'progressive',
          contentType,
          progress: progressPercentage,
          stage: currentStage,
          duration: Date.now() - loadingStartTime
        });
      }
    };
  });

  export function startLoading() {
    loadingState = 'loading';
    loadingStartTime = Date.now();
    loadedItems = 0;
    progressPercentage = 0;
    currentStageIndex = 0;
    currentStageProgress = 0;
    detailedProgress = [];

    const stages = loadingStages[contentType] || loadingStages.book;
    currentStage = stages[0].stage;

    trackEvent('progressive_loading_started', {
      testId: 'performance_loading_v1',
      variantId: 'progressive',
      contentType,
      totalItems,
      expectedStages: stages.length
    });

    // Simulate progressive loading
    simulateProgressiveLoading();
  }

  export function updateProgress(items: number, stage?: string) {
    loadedItems = Math.min(items, totalItems);
    progressPercentage = (loadedItems / totalItems) * 100;

    if (stage && stage !== currentStage) {
      completeCurrentStage();
      currentStage = stage;
    }

    calculateTimeEstimate();

    trackEvent('progressive_loading_progress', {
      testId: 'performance_loading_v1',
      variantId: 'progressive',
      progress: progressPercentage,
      loadedItems,
      totalItems,
      stage: currentStage,
      duration: Date.now() - loadingStartTime
    });

    if (loadedItems >= totalItems) {
      completeLoading();
    }
  }

  export function setError(errorMessage: string) {
    loadingState = 'error';

    trackEvent('progressive_loading_error', {
      testId: 'performance_loading_v1',
      variantId: 'progressive',
      error: errorMessage,
      progress: progressPercentage,
      stage: currentStage,
      duration: Date.now() - loadingStartTime
    });

    dispatch('error', { message: errorMessage });
  }

  function completeCurrentStage() {
    if (detailedProgress.length <= currentStageIndex) {
      detailedProgress.push({
        stage: currentStage,
        completed: true,
        duration: Date.now() - loadingStartTime
      });
    } else {
      detailedProgress[currentStageIndex] = {
        ...detailedProgress[currentStageIndex],
        completed: true,
        duration: Date.now() - loadingStartTime
      };
    }

    currentStageIndex++;
  }

  function completeLoading() {
    loadingState = 'complete';
    progressPercentage = 100;

    const totalDuration = Date.now() - loadingStartTime;

    trackEvent('progressive_loading_completed', {
      testId: 'performance_loading_v1',
      variantId: 'progressive',
      contentType,
      totalItems,
      totalDuration,
      stages: detailedProgress.length,
      averageStageTime: totalDuration / Math.max(detailedProgress.length, 1)
    });

    dispatch('complete', {
      duration: totalDuration,
      stages: detailedProgress
    });

    // Auto-hide after completion
    setTimeout(() => {
      if (loadingState === 'complete') {
        loadingState = 'idle';
      }
    }, 1500);
  }

  function calculateTimeEstimate() {
    if (progressPercentage > 0 && progressPercentage < 100) {
      const elapsed = Date.now() - loadingStartTime;
      const rate = progressPercentage / elapsed;
      const remaining = (100 - progressPercentage) / rate;
      estimatedTimeRemaining = Math.max(0, remaining / 1000); // Convert to seconds
    }
  }

  // Simulated progressive loading for demo purposes
  async function simulateProgressiveLoading() {
    const stages = loadingStages[contentType] || loadingStages.book;
    let totalProgress = 0;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      currentStage = stage.stage;
      currentStageIndex = i;

      // Simulate stage loading
      const stageSteps = 10;
      for (let step = 0; step < stageSteps; step++) {
        if (loadingState !== 'loading') return; // Handle interruption

        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

        currentStageProgress = ((step + 1) / stageSteps) * 100;
        const stageContribution = ((step + 1) / stageSteps) * stage.weight;
        progressPercentage = totalProgress + stageContribution;

        loadedItems = Math.floor((progressPercentage / 100) * totalItems);
        calculateTimeEstimate();
      }

      totalProgress += stage.weight;
      completeCurrentStage();
    }

    if (loadingState === 'loading') {
      completeLoading();
    }
  }

  // Format time estimation
  function formatTimeEstimate(seconds: number): string {
    if (seconds < 1) return 'Almost done';
    if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')} remaining`;
  }

  // Retry functionality
  function retryLoading() {
    startLoading();
  }
</script>

{#if loadingState !== 'idle'}
  <div class="progressive-loading-optimized fixed inset-0 bg-white bg-opacity-95 backdrop-blur-sm z-50 flex items-center justify-center">
    <div class="w-full max-w-md mx-4">
      <!-- Loading Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          {#if loadingState === 'loading' || loadingState === 'streaming'}
            <svg class="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {:else if loadingState === 'complete'}
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          {:else if loadingState === 'error'}
            <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          {/if}
        </div>

        <h2 class="text-xl font-semibold text-gray-900 mb-2">
          {#if loadingState === 'complete'}
            Content Ready!
          {:else if loadingState === 'error'}
            Loading Failed
          {:else}
            {loadingText}
          {/if}
        </h2>

        {#if loadingState === 'loading' || loadingState === 'streaming'}
          <p class="text-sm text-gray-600">
            {currentStage}
            {#if totalItems > 1}
              • {loadedItems} of {totalItems} items
            {/if}
          </p>
        {/if}
      </div>

      <!-- Progress Visualization -->
      {#if loadingState === 'loading' || loadingState === 'streaming'}
        <!-- Main Progress Bar -->
        <div class="mb-6">
          <div class="flex justify-between text-sm text-gray-600 mb-2">
            <span>{Math.round(progressPercentage)}% complete</span>
            {#if estimatedTimeRemaining > 0}
              <span>{formatTimeEstimate(estimatedTimeRemaining)}</span>
            {/if}
          </div>

          <div class="relative">
            <!-- Background -->
            <div class="w-full bg-gray-200 rounded-full h-3">
              <!-- Progress -->
              <div
                class="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                style="width: {progressPercentage}%"
              >
                <!-- Animated shimmer effect -->
                <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white via-transparent opacity-25 animate-pulse"></div>
              </div>
            </div>

            <!-- Stage indicator -->
            {#if currentStageProgress > 0}
              <div class="absolute top-0 right-0 h-3 bg-blue-400 rounded-r-full transition-all duration-300"
                   style="width: {(currentStageProgress / 100) * 10}%"></div>
            {/if}
          </div>
        </div>

        <!-- Detailed Stage Progress -->
        <div class="space-y-3 mb-6">
          {#each loadingStages[contentType] || loadingStages.book as stage, index}
            <div class="flex items-center space-x-3">
              <!-- Stage Status Icon -->
              <div class="flex-shrink-0">
                {#if index < currentStageIndex || (index === currentStageIndex && detailedProgress[index]?.completed)}
                  <div class="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                {:else if index === currentStageIndex}
                  <div class="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                    <div class="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  </div>
                {:else}
                  <div class="w-6 h-6 bg-gray-300 rounded-full"></div>
                {/if}
              </div>

              <!-- Stage Info -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate">
                  {stage.stage}
                </p>
                {#if index === currentStageIndex && currentStageProgress > 0}
                  <div class="w-full bg-gray-200 rounded-full h-1 mt-1">
                    <div
                      class="bg-blue-500 h-1 rounded-full transition-all duration-300"
                      style="width: {currentStageProgress}%"
                    ></div>
                  </div>
                {/if}
              </div>

              <!-- Stage Duration -->
              {#if detailedProgress[index]?.duration}
                <div class="text-xs text-gray-500">
                  {Math.round(detailedProgress[index].duration / 1000)}s
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Loading Tips -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex">
            <svg class="w-5 h-5 text-blue-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <h4 class="text-sm font-medium text-blue-900 mb-1">Did you know?</h4>
              <p class="text-sm text-blue-700">
                {#if contentType === 'book'}
                  We're optimizing your reading experience by pre-loading content and enhancing image quality.
                {:else if contentType === 'library'}
                  Your library is being organized and book covers are loading progressively for faster browsing.
                {:else}
                  Images are being optimized for your device to ensure the best quality and performance.
                {/if}
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Error State -->
      {#if loadingState === 'error'}
        <div class="text-center">
          <p class="text-gray-600 mb-6">
            Something went wrong while loading your content. Please try again.
          </p>
          <button
            on:click={retryLoading}
            class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Retry Loading
          </button>
        </div>
      {/if}

      <!-- Success State -->
      {#if loadingState === 'complete'}
        <div class="text-center">
          <p class="text-gray-600 mb-4">
            Content loaded successfully! Preparing your experience...
          </p>
          <div class="flex items-center justify-center space-x-2 text-sm text-gray-500">
            <span>Loaded in {Math.round((Date.now() - loadingStartTime) / 1000)}s</span>
            <span>•</span>
            <span>{totalItems} items</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .progressive-loading-optimized {
    /* Ensure smooth animations */
  }

  /* Enhanced animation for progress bar */
  .progressive-loading-optimized .bg-gradient-to-r {
    background-size: 200% 100%;
    animation: shimmer 2s infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  /* Smooth transitions for all elements */
  .progressive-loading-optimized * {
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Backdrop blur support */
  .backdrop-blur-sm {
    backdrop-filter: blur(4px);
  }

  /* Loading spinner enhancement */
  .progressive-loading-optimized .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>