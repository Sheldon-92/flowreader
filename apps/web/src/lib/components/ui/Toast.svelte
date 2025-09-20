<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  
  export let type: 'success' | 'error' | 'warning' | 'info' = 'info';
  export let title: string = '';
  export let message: string = '';
  export let duration: number = 5000; // 5 seconds
  export let dismissible: boolean = true;
  export let visible: boolean = true;

  const dispatch = createEventDispatcher<{ dismiss: void }>();

  let timeoutId: NodeJS.Timeout;

  // Icon mapping
  const icons = {
    success: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>`,
    error: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>`,
    warning: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>`,
    info: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
           </svg>`
  };

  // Style mapping
  $: styleClasses = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  }[type];

  $: iconColorClasses = {
    success: 'text-green-400',
    error: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400'
  }[type];

  function dismiss() {
    visible = false;
    dispatch('dismiss');
  }

  onMount(() => {
    if (duration > 0) {
      timeoutId = setTimeout(() => {
        dismiss();
      }, duration);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  });
</script>

{#if visible}
  <div 
    class="fixed top-4 right-4 max-w-md w-full border rounded-lg shadow-lg {styleClasses} z-50 animate-in slide-in-from-top-2"
    role="alert"
  >
    <div class="p-4">
      <div class="flex items-start">
        <div class="flex-shrink-0 {iconColorClasses}">
          {@html icons[type]}
        </div>
        <div class="ml-3 flex-1">
          {#if title}
            <h3 class="text-sm font-medium">
              {title}
            </h3>
          {/if}
          {#if message}
            <p class="text-sm {title ? 'mt-1' : ''}">
              {message}
            </p>
          {/if}
          <slot />
        </div>
        {#if dismissible}
          <div class="ml-4 flex-shrink-0">
            <button
              on:click={dismiss}
              class="inline-flex rounded-md p-1.5 hover:bg-black hover:bg-opacity-10 focus:outline-none focus:ring-2 focus:ring-offset-2"
              aria-label="Dismiss"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}