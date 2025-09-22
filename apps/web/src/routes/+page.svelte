<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // Always redirect to library for personal use - no authentication required
  onMount(() => {
    goto('/library');
  });
</script>

<svelte:head>
  <title>FlowReader - Loading...</title>
</svelte:head>

<!-- Simple loading state while redirecting to library -->
<div class="min-h-screen bg-gradient-to-br from-primary-50 to-accent-50 flex items-center justify-center">
  <div class="text-center">
    <div class="w-16 h-16 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
      <span class="text-white font-bold text-2xl">F</span>
    </div>
    <h1 class="text-2xl font-bold text-primary-900 mb-2">FlowReader</h1>
    <p class="text-gray-600">Loading your library...</p>
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mt-4"></div>
  </div>
</div>