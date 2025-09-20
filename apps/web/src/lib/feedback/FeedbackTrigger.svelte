<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui';
  import FeedbackForm from './FeedbackForm.svelte';
  import type { FeedbackType } from './types';
  import { isFeatureAvailable, getSessionInfo } from './api';
  import { FeedbackFeatureToggle, PrivacyHelper } from './utils';

  export let variant: 'button' | 'floating' | 'inline' = 'floating';
  export let trigger: FeedbackType = 'general';
  export let position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right';
  export let text: string = 'Feedback';
  export let showIcon: boolean = true;

  let showForm = false;
  let isAvailable = false;
  let sessionInfo: any = null;

  // Position classes for floating variant
  $: positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6'
  }[position];

  // Check if feedback feature is available on mount
  onMount(() => {
    checkAvailability();

    // Re-check periodically in case config changes
    const interval = setInterval(checkAvailability, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  });

  function checkAvailability() {
    isAvailable = isFeatureAvailable();
    if (isAvailable) {
      sessionInfo = getSessionInfo();
    }
  }

  function openFeedback() {
    // Double-check availability before opening
    if (!isFeatureAvailable()) {
      console.warn('Feedback feature is not available');
      return;
    }

    showForm = true;
  }

  function handleSuccess(event: CustomEvent<{ submissionId: string }>) {
    console.log('Feedback submitted successfully:', event.detail.submissionId);

    // Update session info
    checkAvailability();

    // Could trigger analytics event here
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'feedback_submitted', {
        feedback_type: trigger,
        session_id: sessionInfo?.sessionId
      });
    }
  }

  function handleError(event: CustomEvent<{ message: string }>) {
    console.error('Feedback submission error:', event.detail.message);

    // Could trigger error tracking here
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'feedback_error', {
        error_message: event.detail.message,
        feedback_type: trigger
      });
    }
  }

  // Don't render if feature is not available
  $: if (!isAvailable) {
    showForm = false;
  }
</script>

{#if isAvailable}
  <!-- Feedback Trigger Button -->
  {#if variant === 'floating'}
    <div class="fixed {positionClasses} z-40">
      <button
        on:click={openFeedback}
        class="bg-primary-600 hover:bg-primary-700 text-white rounded-full
               shadow-lg hover:shadow-xl transition-all duration-200
               flex items-center justify-center p-3
               focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        title="Share your feedback"
        aria-label="Open feedback form"
      >
        {#if showIcon}
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        {/if}
        {#if variant === 'floating' && text !== 'Feedback'}
          <span class="ml-2 text-sm font-medium">{text}</span>
        {/if}
      </button>
    </div>
  {:else if variant === 'button'}
    <Button
      variant="ghost"
      size="sm"
      on:click={openFeedback}
      class="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
    >
      {#if showIcon}
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
      {/if}
      {text}
    </Button>
  {:else if variant === 'inline'}
    <div class="inline-block">
      <button
        on:click={openFeedback}
        class="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300
               font-medium text-sm transition-colors duration-200
               focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
      >
        {#if showIcon}
          <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        {/if}
        {text}
      </button>
    </div>
  {/if}

  <!-- Feedback Form -->
  <FeedbackForm
    bind:open={showForm}
    initialType={trigger}
    on:success={handleSuccess}
    on:error={handleError}
  />
{/if}

<!-- Debug Info (only in development) -->
{#if PrivacyHelper.isLocalEnvironment() && sessionInfo}
  <div class="fixed bottom-0 left-0 bg-black/80 text-white p-2 text-xs font-mono rounded-tr z-50">
    Feedback: {sessionInfo.feedbackCount}/{sessionInfo.maxSubmissions} |
    Session: {sessionInfo.sessionId.slice(0, 8)}... |
    Enabled: {sessionInfo.isEnabled}
  </div>
{/if}

<style>
  /* Smooth animations for floating button */
  .fixed button {
    transform-origin: center;
    transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .fixed button:hover {
    transform: scale(1.05);
  }

  .fixed button:active {
    transform: scale(0.95);
  }
</style>