<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let visible = false;
  export let x = 0;
  export let y = 0;
  export let selectedText = '';

  const dispatch = createEventDispatcher();

  function handleAction(intent: string) {
    dispatch('action', {
      intent,
      selectedText,
      selection: {
        text: selectedText,
        start: 0, // Would be calculated from actual selection
        end: selectedText.length
      }
    });
    visible = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (!event.target || !(event.target as Element).closest('.selection-popover')) {
      visible = false;
    }
  }

  $: if (visible && typeof window !== 'undefined') {
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
  } else if (typeof window !== 'undefined') {
    document.removeEventListener('click', handleClickOutside);
  }
</script>

{#if visible}
  <div
    class="selection-popover fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2"
    style="left: {x}px; top: {y - 60}px;"
  >
    <div class="flex space-x-1">
      <button
        on:click={() => handleAction('translate')}
        class="flex items-center space-x-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Translate selected text"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
        </svg>
        <span>Translate</span>
      </button>

      <button
        on:click={() => handleAction('explain')}
        class="flex items-center space-x-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Explain selected text"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>Explain</span>
      </button>

      <button
        on:click={() => handleAction('analyze')}
        class="flex items-center space-x-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Analyze selected text"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
        <span>Analyze</span>
      </button>

      <button
        on:click={() => handleAction('ask')}
        class="flex items-center space-x-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Ask about selected text"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
        <span>Ask</span>
      </button>

      <button
        on:click={() => handleAction('enhance')}
        class="flex items-center space-x-1 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 rounded-md transition-colors border border-blue-200"
        title="Generate enhanced auto note"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
        <span>Auto Note</span>
      </button>

      <button
        on:click={() => handleAction('save_note')}
        class="flex items-center space-x-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Save as manual note"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
        </svg>
        <span>Manual Note</span>
      </button>
    </div>

    <!-- Arrow pointing down -->
    <div class="absolute top-full left-1/2 transform -translate-x-1/2">
      <div class="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-gray-200"></div>
      <div class="w-0 h-0 border-l-7 border-r-7 border-t-7 border-l-transparent border-r-transparent border-t-white absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-px"></div>
    </div>
  </div>
{/if}

<style>
  .selection-popover {
    min-width: 380px;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>