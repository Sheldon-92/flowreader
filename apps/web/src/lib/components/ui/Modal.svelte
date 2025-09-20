<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  
  export let open: boolean = false;
  export let title: string = '';
  export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  export let closable: boolean = true;
  export let showHeader: boolean = true;
  export let showFooter: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  // Size classes
  $: sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }[size];

  // Handle ESC key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && closable) {
      close();
    }
  }

  function close() {
    open = false;
    dispatch('close');
  }

  // Handle backdrop click
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget && closable) {
      close();
    }
  }

  // Trap focus within modal when open
  onMount(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (!open) return;
      
      if (e.key === 'Escape' && closable) {
        e.preventDefault();
        close();
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });

  // Prevent body scroll when modal is open
  $: if (typeof document !== 'undefined') {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    on:click={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? 'modal-title' : undefined}
  >
    <!-- Modal Content -->
    <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl {sizeClasses} w-full max-h-[90vh] overflow-hidden">
      {#if showHeader}
        <!-- Header -->
        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            {#if title}
              <h2 id="modal-title" class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h2>
            {:else}
              <div>
                <slot name="title" />
              </div>
            {/if}
            
            {#if closable}
              <button 
                on:click={close}
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close modal"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Body -->
      <div class="overflow-y-auto max-h-[calc(90vh-8rem)]">
        <slot />
      </div>

      {#if showFooter}
        <!-- Footer -->
        <div class="p-6 border-t border-gray-200 dark:border-gray-700">
          <slot name="footer" />
        </div>
      {/if}
    </div>
  </div>
{/if}