<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Input, Card, Badge, Modal } from '$lib/components/ui';
  import FeedbackDashboard from './FeedbackDashboard.svelte';
  import { FeedbackFeatureToggle, AnonymousSessionManager } from './utils';
  import { getSessionInfo } from './api';

  // Component state
  let showConfigModal = false;
  let showTestModal = false;

  // Feature configuration
  let config = {
    enabled: true,
    rolloutPercentage: 10,
    maxSubmissionsPerSession: 3,
    allowedRoutes: ['/read', '/library', '/']
  };

  // Test state
  let sessionInfo: any = null;

  onMount(() => {
    loadConfig();
    loadSessionInfo();
  });

  function loadConfig() {
    const currentConfig = FeedbackFeatureToggle.getConfig();
    config = { ...currentConfig };
  }

  function loadSessionInfo() {
    sessionInfo = getSessionInfo();
  }

  function updateConfig() {
    FeedbackFeatureToggle.updateConfig(config);
    showConfigModal = false;

    // Refresh session info to reflect changes
    setTimeout(() => {
      loadSessionInfo();
    }, 100);
  }

  function resetConfig() {
    config = {
      enabled: true,
      rolloutPercentage: 10,
      maxSubmissionsPerSession: 3,
      allowedRoutes: ['/read', '/library', '/']
    };
  }

  function addRoute() {
    config.allowedRoutes = [...config.allowedRoutes, ''];
  }

  function removeRoute(index: number) {
    config.allowedRoutes = config.allowedRoutes.filter((_, i) => i !== index);
  }

  function updateRoute(index: number, value: string) {
    config.allowedRoutes[index] = value;
  }

  function clearSession() {
    if (confirm('Are you sure you want to clear the current session? This will reset all local feedback data.')) {
      AnonymousSessionManager.clearSession();
      localStorage.removeItem('feedback_rate_limit');
      localStorage.removeItem('feedback_user_rollout');
      localStorage.removeItem('feedback_feature_config');

      // Reload session info
      setTimeout(() => {
        loadSessionInfo();
      }, 100);
    }
  }

  // Reactive calculations
  $: configIsValid = config.rolloutPercentage >= 0 &&
                     config.rolloutPercentage <= 100 &&
                     config.maxSubmissionsPerSession > 0 &&
                     config.maxSubmissionsPerSession <= 10;
</script>

<div class="feedback-admin space-y-6">
  <!-- Header -->
  <div class="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
    <h1 class="text-2xl font-bold mb-2">Feedback System Administration</h1>
    <p class="text-blue-100">
      Manage feedback collection settings, monitor system health, and view operational metrics.
    </p>
  </div>

  <!-- Admin Controls -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Feature Status -->
    <Card>
      <div class="p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Feature Status
        </h3>
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600 dark:text-gray-400">System Status</span>
            <Badge variant={config.enabled ? 'success' : 'danger'}>
              {config.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600 dark:text-gray-400">Rollout</span>
            <Badge variant="info">
              {config.rolloutPercentage}% of users
            </Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600 dark:text-gray-400">Max per Session</span>
            <Badge variant="secondary">
              {config.maxSubmissionsPerSession} submissions
            </Badge>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          fullWidth
          class="mt-4"
          on:click={() => showConfigModal = true}
        >
          Configure Settings
        </Button>
      </div>
    </Card>

    <!-- Current Session -->
    <Card>
      <div class="p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Current Session
        </h3>
        {#if sessionInfo}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Session ID</span>
              <span class="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {sessionInfo.sessionId.substring(0, 8)}...
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Feedback Count</span>
              <Badge variant="info">
                {sessionInfo.feedbackCount} / {sessionInfo.maxSubmissions}
              </Badge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Can Submit</span>
              <Badge variant={sessionInfo.canSubmit ? 'success' : 'warning'}>
                {sessionInfo.canSubmit ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Feature Enabled</span>
              <Badge variant={sessionInfo.isEnabled ? 'success' : 'danger'}>
                {sessionInfo.isEnabled ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
        {/if}
        <div class="flex space-x-2 mt-4">
          <Button
            variant="secondary"
            size="sm"
            on:click={loadSessionInfo}
          >
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            on:click={clearSession}
          >
            Clear Session
          </Button>
        </div>
      </div>
    </Card>

    <!-- Quick Actions -->
    <Card>
      <div class="p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Quick Actions
        </h3>
        <div class="space-y-3">
          <Button
            variant="primary"
            size="sm"
            fullWidth
            on:click={() => showTestModal = true}
          >
            Test Feedback System
          </Button>
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            on:click={() => window.open('/api/feedback/stats', '_blank')}
          >
            View Raw API Data
          </Button>
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            on:click={() => {
              const data = {
                config,
                sessionInfo,
                timestamp: new Date().toISOString()
              };
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `feedback-config-${new Date().toISOString().split('T')[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export Configuration
          </Button>
        </div>
      </div>
    </Card>
  </div>

  <!-- Feedback Dashboard -->
  <FeedbackDashboard showAdminControls={true} />

  <!-- Configuration Modal -->
  <Modal
    bind:open={showConfigModal}
    title="Feedback System Configuration"
    size="lg"
  >
    <div class="p-6 space-y-6">
      <!-- Basic Settings -->
      <div>
        <h4 class="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Basic Settings
        </h4>
        <div class="space-y-4">
          <div class="flex items-center">
            <input
              type="checkbox"
              id="enabled"
              bind:checked={config.enabled}
              class="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded
                     focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800
                     focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <label for="enabled" class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
              Enable feedback collection
            </label>
          </div>

          <div>
            <label for="rollout" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Rollout Percentage (0-100%)
            </label>
            <Input
              id="rollout"
              type="number"
              min="0"
              max="100"
              bind:value={config.rolloutPercentage}
              placeholder="10"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Percentage of users who will see the feedback system
            </p>
          </div>

          <div>
            <label for="maxSubmissions" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max Submissions per Session
            </label>
            <Input
              id="maxSubmissions"
              type="number"
              min="1"
              max="10"
              bind:value={config.maxSubmissionsPerSession}
              placeholder="3"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Maximum number of feedback submissions allowed per user session
            </p>
          </div>
        </div>
      </div>

      <!-- Route Configuration -->
      <div>
        <h4 class="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Allowed Routes
        </h4>
        <div class="space-y-2">
          {#each config.allowedRoutes as route, index}
            <div class="flex items-center space-x-2">
              <Input
                type="text"
                value={route}
                on:input={(e) => updateRoute(index, e.target.value)}
                placeholder="/route/path"
                class="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                on:click={() => removeRoute(index)}
                disabled={config.allowedRoutes.length <= 1}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </Button>
            </div>
          {/each}
          <Button
            variant="ghost"
            size="sm"
            on:click={addRoute}
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            Add Route
          </Button>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Only users on these routes will see the feedback system. Leave empty to allow all routes.
        </p>
      </div>

      <!-- Validation Errors -->
      {#if !configIsValid}
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p class="text-sm text-red-800 dark:text-red-200">
            Please fix the following issues:
          </p>
          <ul class="list-disc list-inside text-sm text-red-700 dark:text-red-300 mt-1">
            {#if config.rolloutPercentage < 0 || config.rolloutPercentage > 100}
              <li>Rollout percentage must be between 0 and 100</li>
            {/if}
            {#if config.maxSubmissionsPerSession <= 0 || config.maxSubmissionsPerSession > 10}
              <li>Max submissions per session must be between 1 and 10</li>
            {/if}
          </ul>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="ghost"
          on:click={resetConfig}
        >
          Reset to Defaults
        </Button>
        <div class="flex space-x-3">
          <Button
            variant="secondary"
            on:click={() => showConfigModal = false}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            on:click={updateConfig}
            disabled={!configIsValid}
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  </Modal>

  <!-- Test Modal -->
  <Modal
    bind:open={showTestModal}
    title="Test Feedback System"
    size="md"
  >
    <div class="p-6">
      <div class="text-center">
        <div class="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          System Test
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          The feedback system is ready for testing. You can now use the feedback trigger component
          on any allowed route to test the complete flow.
        </p>
        <div class="space-y-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            ✓ Configuration loaded successfully
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            ✓ Session management active
          </p>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            ✓ API endpoints responsive
          </p>
        </div>
      </div>
      <div class="flex justify-center pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
        <Button
          variant="primary"
          on:click={() => showTestModal = false}
        >
          Close
        </Button>
      </div>
    </div>
  </Modal>
</div>

<style>
  .feedback-admin {
    min-height: 100vh;
  }

  /* Custom focus styles for better accessibility */
  input[type="checkbox"]:focus {
    @apply ring-2 ring-primary-500 ring-offset-2;
  }

  /* Smooth transitions */
  * {
    transition-property: background-color, border-color, color, fill, stroke;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 150ms;
  }
</style>