<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button, Input, Modal } from '$lib/components/ui';
  import type { FeedbackFormData, FeedbackType, FeedbackCategory } from './types';
  import { FeedbackValidator } from './utils';
  import { submitFeedback } from './api';

  export let open: boolean = false;
  export let initialType: FeedbackType = 'general';

  const dispatch = createEventDispatcher<{
    close: void;
    success: { submissionId: string };
    error: { message: string };
  }>();

  // Form state
  let formData: FeedbackFormData = {
    type: initialType,
    rating: 3,
    category: 'other',
    description: ''
  };

  let errors: Record<string, string> = {};
  let isSubmitting = false;
  let submitSuccess = false;

  // Reactive validation
  $: {
    if (formData.description.length > 0) {
      const validation = FeedbackValidator.validateForm(formData);
      errors = validation.errors;
    }
  }

  // Form options
  const feedbackTypes: { value: FeedbackType; label: string; description: string }[] = [
    { value: 'bug', label: 'Bug Report', description: 'Something isn\'t working correctly' },
    { value: 'feature', label: 'Feature Request', description: 'Suggest a new feature or improvement' },
    { value: 'praise', label: 'Positive Feedback', description: 'Share what you love about FlowReader' },
    { value: 'general', label: 'General Feedback', description: 'Other thoughts or suggestions' }
  ];

  const categories: { value: FeedbackCategory; label: string }[] = [
    { value: 'usability', label: 'Usability & Design' },
    { value: 'performance', label: 'Performance & Speed' },
    { value: 'ai-interaction', label: 'AI Conversations' },
    { value: 'reading-experience', label: 'Reading Experience' },
    { value: 'technical', label: 'Technical Issues' },
    { value: 'other', label: 'Other' }
  ];

  const ratingLabels = [
    { value: 1, label: 'Poor', emoji: '😞' },
    { value: 2, label: 'Fair', emoji: '😐' },
    { value: 3, label: 'Good', emoji: '🙂' },
    { value: 4, label: 'Great', emoji: '😊' },
    { value: 5, label: 'Excellent', emoji: '🤩' }
  ];

  async function handleSubmit() {
    const validation = FeedbackValidator.validateForm(formData);

    if (!validation.isValid) {
      errors = validation.errors;
      return;
    }

    isSubmitting = true;
    errors = {};

    try {
      const result = await submitFeedback(formData);

      if (result.success && result.submissionId) {
        submitSuccess = true;
        dispatch('success', { submissionId: result.submissionId });

        // Auto-close after success message
        setTimeout(() => {
          close();
        }, 2000);
      } else {
        errors.submit = result.error || 'Failed to submit feedback';
        dispatch('error', { message: errors.submit });
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
      errors.submit = 'Network error. Please try again.';
      dispatch('error', { message: errors.submit });
    } finally {
      isSubmitting = false;
    }
  }

  function close() {
    open = false;
    dispatch('close');

    // Reset form after close
    setTimeout(() => {
      formData = {
        type: initialType,
        rating: 3,
        category: 'other',
        description: ''
      };
      errors = {};
      submitSuccess = false;
      isSubmitting = false;
    }, 300);
  }

  function handleRatingClick(rating: number) {
    formData.rating = rating;
  }
</script>

<Modal {open} title="Share Your Feedback" size="md" on:close={close}>
  <div class="p-6">
    {#if submitSuccess}
      <!-- Success State -->
      <div class="text-center py-8">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Thank you for your feedback!
        </h3>
        <p class="text-gray-600 dark:text-gray-400">
          Your input helps us make FlowReader better for everyone.
        </p>
      </div>
    {:else}
      <!-- Form State -->
      <form on:submit|preventDefault={handleSubmit} class="space-y-6">
        <!-- Feedback Type -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            What type of feedback would you like to share?
          </label>
          <div class="grid grid-cols-1 gap-2">
            {#each feedbackTypes as type}
              <label class="relative">
                <input
                  type="radio"
                  name="feedbackType"
                  value={type.value}
                  bind:group={formData.type}
                  class="sr-only"
                />
                <div class="border rounded-lg p-3 cursor-pointer transition-colors {
                  formData.type === type.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }">
                  <div class="font-medium text-gray-900 dark:text-gray-100">
                    {type.label}
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {type.description}
                  </div>
                </div>
              </label>
            {/each}
          </div>
          {#if errors.type}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.type}</p>
          {/if}
        </div>

        <!-- Rating -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            How would you rate your overall experience?
          </label>
          <div class="flex items-center space-x-2">
            {#each ratingLabels as { value, label, emoji }}
              <button
                type="button"
                on:click={() => handleRatingClick(value)}
                class="flex flex-col items-center p-2 rounded-lg transition-colors {
                  formData.rating === value
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                }"
                title={label}
              >
                <span class="text-2xl mb-1">{emoji}</span>
                <span class="text-xs font-medium">{label}</span>
              </button>
            {/each}
          </div>
          {#if errors.rating}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.rating}</p>
          {/if}
        </div>

        <!-- Category -->
        <div>
          <label for="category" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Category
          </label>
          <select
            id="category"
            bind:value={formData.category}
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {#each categories as category}
              <option value={category.value}>{category.label}</option>
            {/each}
          </select>
          {#if errors.category}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.category}</p>
          {/if}
        </div>

        <!-- Description -->
        <div>
          <label for="description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Your feedback *
          </label>
          <textarea
            id="description"
            bind:value={formData.description}
            placeholder="Please share your thoughts, suggestions, or describe any issues you've experienced..."
            rows="4"
            maxlength="1000"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                   resize-none"
          ></textarea>
          <div class="flex justify-between items-center mt-1">
            <div>
              {#if errors.description}
                <p class="text-sm text-red-600 dark:text-red-400">{errors.description}</p>
              {/if}
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {formData.description.length}/1000
            </p>
          </div>
        </div>

        <!-- Privacy Notice -->
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div class="flex items-start">
            <svg class="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div class="text-sm text-blue-800 dark:text-blue-200">
              <strong>Privacy Notice:</strong> Your feedback is collected anonymously. We do not store any personal information.
              Please avoid including email addresses, names, or other personal details in your message.
            </div>
          </div>
        </div>

        <!-- Submit Error -->
        {#if errors.submit}
          <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p class="text-sm text-red-800 dark:text-red-200">{errors.submit}</p>
          </div>
        {/if}

        <!-- Form Actions -->
        <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="ghost"
            type="button"
            on:click={close}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting || Object.keys(errors).length > 0}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </div>
      </form>
    {/if}
  </div>
</Modal>

<style>
  /* Custom focus styles for better accessibility */
  input[type="radio"]:focus-visible + div {
    @apply ring-2 ring-primary-500 ring-offset-2;
  }

  /* Smooth transitions */
  * {
    transition-property: background-color, border-color, color, fill, stroke;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 150ms;
  }
</style>