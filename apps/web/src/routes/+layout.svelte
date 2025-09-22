<!-- Main application layout -->
<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { page } from '$app/stores';

  export let data;

  $: ({ session } = data);

  onMount(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (newSession?.expires_at !== session?.expires_at) {
        invalidate('supabase:auth');
      }
    });

    return () => subscription.unsubscribe();
  });
</script>

<svelte:head>
  <title>FlowReader - Multi-modal Reading Experience</title>
  <meta name="description" content="Experience books like never before with FlowReader's AI companion and audio-text synchronization" />
</svelte:head>

<!-- Application shell -->
<div class="min-h-screen bg-white dark:bg-reading-dark">
  <slot />
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }
  
  :global(body) {
    font-family: 'Inter', system-ui, sans-serif;
  }
</style>