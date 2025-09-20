<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Card, Badge, Loading } from '$lib/components/ui';
  import type { FeedbackStatsResponse } from './types';
  import { getFeedbackStats } from './api';

  export let showAdminControls: boolean = false;

  // State management
  let stats: FeedbackStatsResponse | null = null;
  let loading = true;
  let error: string | null = null;
  let selectedTimeRange = 30; // days
  let refreshInterval: number;

  const timeRangeOptions = [
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' }
  ];

  onMount(() => {
    loadStats();

    // Auto-refresh every 5 minutes
    refreshInterval = setInterval(loadStats, 5 * 60 * 1000);

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  });

  async function loadStats() {
    try {
      loading = true;
      error = null;

      const result = await getFeedbackStats();
      if (result) {
        stats = result;
      } else {
        error = 'Failed to load feedback statistics';
      }
    } catch (err) {
      console.error('Error loading feedback stats:', err);
      error = 'Unable to load feedback data';
    } finally {
      loading = false;
    }
  }

  function handleTimeRangeChange() {
    loadStats();
  }

  function getVariantForRating(rating: number): "success" | "warning" | "danger" | "default" {
    if (rating >= 4) return 'success';
    if (rating >= 3) return 'warning';
    if (rating >= 2) return 'danger';
    return 'default';
  }

  function getVariantForType(type: string): "primary" | "secondary" | "success" | "warning" | "danger" | "info" | "default" {
    switch (type) {
      case 'bug': return 'danger';
      case 'feature': return 'primary';
      case 'praise': return 'success';
      case 'general': return 'secondary';
      default: return 'default';
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // Calculate NPS score
  $: npsScore = stats ? (() => {
    const total = stats.totalSubmissions;
    if (total === 0) return 0;

    const promoters = Object.entries(stats.submissionsByType)
      .filter(([_, count]) => count >= 4)
      .reduce((sum, [_, count]) => sum + count, 0);

    const detractors = Object.entries(stats.submissionsByType)
      .filter(([_, count]) => count <= 2)
      .reduce((sum, [_, count]) => sum + count, 0);

    return Math.round(((promoters - detractors) / total) * 100);
  })() : 0;
</script>

<div class="feedback-dashboard space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Feedback Dashboard
      </h2>
      <p class="text-gray-600 dark:text-gray-400 mt-1">
        Monitor user feedback and satisfaction metrics
      </p>
    </div>

    <div class="flex items-center space-x-3">
      <!-- Time Range Selector -->
      <select
        bind:value={selectedTimeRange}
        on:change={handleTimeRangeChange}
        class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
               bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
               focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {#each timeRangeOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      <!-- Refresh Button -->
      <Button
        variant="ghost"
        size="sm"
        on:click={loadStats}
        disabled={loading}
      >
        <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
      </Button>
    </div>
  </div>

  {#if loading && !stats}
    <!-- Loading State -->
    <div class="flex items-center justify-center py-12">
      <Loading />
      <span class="ml-3 text-gray-600 dark:text-gray-400">Loading feedback data...</span>
    </div>
  {:else if error}
    <!-- Error State -->
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <div class="flex items-center">
        <svg class="w-5 h-5 text-red-600 dark:text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="text-red-800 dark:text-red-200">{error}</span>
      </div>
    </div>
  {:else if stats}
    <!-- Dashboard Content -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- Total Submissions -->
      <Card>
        <div class="p-6">
          <div class="flex items-center">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Submissions
              </p>
              <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.totalSubmissions.toLocaleString()}
              </p>
            </div>
            <div class="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
            </div>
          </div>
        </div>
      </Card>

      <!-- Average Rating -->
      <Card>
        <div class="p-6">
          <div class="flex items-center">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
                Average Rating
              </p>
              <div class="flex items-center space-x-2">
                <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.averageRating.toFixed(1)}
                </p>
                <div class="flex">
                  {#each Array(5) as _, i}
                    <svg
                      class="w-4 h-4 {i < Math.round(stats.averageRating) ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  {/each}
                </div>
              </div>
            </div>
            <Badge variant={getVariantForRating(stats.averageRating)}>
              {stats.averageRating >= 4 ? 'Excellent' : stats.averageRating >= 3 ? 'Good' : 'Needs Improvement'}
            </Badge>
          </div>
        </div>
      </Card>

      <!-- Unique Sessions -->
      <Card>
        <div class="p-6">
          <div class="flex items-center">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
                Unique Sessions
              </p>
              <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.sessionStats.uniqueSessions.toLocaleString()}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Avg {stats.sessionStats.avgSubmissionsPerSession.toFixed(1)} per session
              </p>
            </div>
            <div class="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
              </svg>
            </div>
          </div>
        </div>
      </Card>

      <!-- NPS Score -->
      <Card>
        <div class="p-6">
          <div class="flex items-center">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
                NPS Score
              </p>
              <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {npsScore > 0 ? '+' : ''}{npsScore}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {npsScore >= 50 ? 'Excellent' : npsScore >= 0 ? 'Good' : 'Needs Improvement'}
              </p>
            </div>
            <Badge variant={npsScore >= 50 ? 'success' : npsScore >= 0 ? 'warning' : 'danger'}>
              {npsScore >= 50 ? 'Promoters' : npsScore >= 0 ? 'Passive' : 'Detractors'}
            </Badge>
          </div>
        </div>
      </Card>
    </div>

    <!-- Charts and Analysis -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Submission Types -->
      <Card>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Feedback Types
          </h3>
          <div class="space-y-3">
            {#each Object.entries(stats.submissionsByType) as [type, count]}
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <Badge variant={getVariantForType(type)} size="sm">
                    {type}
                  </Badge>
                  <span class="text-sm text-gray-600 dark:text-gray-400 capitalize">
                    {type.replace('-', ' ')}
                  </span>
                </div>
                <div class="flex items-center space-x-2">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {count}
                  </span>
                  <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      class="bg-primary-600 h-2 rounded-full"
                      style="width: {(count / stats.totalSubmissions) * 100}%"
                    ></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </Card>

      <!-- Categories -->
      <Card>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Feedback Categories
          </h3>
          <div class="space-y-3">
            {#each Object.entries(stats.submissionsByCategory) as [category, count]}
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {category.replace('-', ' ')}
                </span>
                <div class="flex items-center space-x-2">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {count}
                  </span>
                  <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      class="bg-blue-600 h-2 rounded-full"
                      style="width: {(count / stats.totalSubmissions) * 100}%"
                    ></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </Card>
    </div>

    <!-- Recent Submissions -->
    <Card>
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recent Feedback
          </h3>
          <Badge variant="secondary">
            Last {stats.recentSubmissions.length} submissions
          </Badge>
        </div>

        {#if stats.recentSubmissions.length === 0}
          <div class="text-center py-8 text-gray-500 dark:text-gray-400">
            No recent feedback submissions
          </div>
        {:else}
          <div class="space-y-4">
            {#each stats.recentSubmissions as submission}
              <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-2">
                      <Badge variant={getVariantForType(submission.type)} size="sm">
                        {submission.type}
                      </Badge>
                      <span class="text-sm text-gray-500 dark:text-gray-400">
                        {submission.category}
                      </span>
                      <div class="flex">
                        {#each Array(5) as _, i}
                          <svg
                            class="w-3 h-3 {i < submission.rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                          </svg>
                        {/each}
                      </div>
                    </div>
                    <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {truncateText(submission.description, 200)}
                    </p>
                    <div class="flex items-center text-xs text-gray-500 dark:text-gray-400 space-x-4">
                      <span>{formatDate(submission.created_at)}</span>
                      {#if submission.route}
                        <span>Route: {submission.route}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </Card>

    <!-- Top Routes -->
    {#if stats.sessionStats.topRoutes.length > 0}
      <Card>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Feedback by Route
          </h3>
          <div class="space-y-3">
            {#each stats.sessionStats.topRoutes as route}
              <div class="flex items-center justify-between">
                <span class="text-sm font-mono text-gray-600 dark:text-gray-400">
                  {route.route}
                </span>
                <Badge variant="secondary">
                  {route.count} submission{route.count !== 1 ? 's' : ''}
                </Badge>
              </div>
            {/each}
          </div>
        </div>
      </Card>
    {/if}
  {/if}
</div>

<style>
  .feedback-dashboard {
    min-height: 100vh;
  }

  /* Smooth transitions */
  * {
    transition-property: background-color, border-color, color, fill, stroke;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 150ms;
  }
</style>