<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';

  export let visible = false;
  export let loading = false;
  export let response = '';
  export let intent = '';
  export let selectedText = '';
  export let targetLang = 'zh-CN';

  const dispatch = createEventDispatcher();

  let eventSource: EventSource | null = null;
  let askQuery = '';
  let isStreaming = false;
  let sources: any[] = [];
  let usage: any = null;

  // Language options for translation
  const languageOptions = [
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'zh-TW', name: 'Chinese (Traditional)' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'ru', name: 'Russian' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hi', name: 'Hindi' }
  ];

  function close() {
    visible = false;
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    dispatch('close');
  }

  function handleAction(actionIntent: string, query?: string) {
    if (isStreaming) return;

    response = '';
    sources = [];
    usage = null;
    isStreaming = true;

    const requestBody = {
      bookId: 'current-book-id', // This would come from context
      intent: actionIntent,
      selection: {
        text: selectedText,
        start: 0,
        end: selectedText.length
      }
    };

    if (actionIntent === 'translate') {
      (requestBody as any).targetLang = targetLang;
    }

    if (actionIntent === 'ask' && query) {
      (requestBody as any).query = query;
    }

    // Start streaming request
    fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer demo-token'
      },
      body: JSON.stringify(requestBody)
    }).then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();

      function readChunk(): Promise<any> {
        return reader.read().then(({ done, value }) => {
          if (done) {
            isStreaming = false;
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (line.includes('event: token')) {
                  response += data.token;
                } else if (line.includes('event: sources')) {
                  sources = data.sources || [];
                } else if (line.includes('event: usage')) {
                  usage = data;
                } else if (line.includes('event: done')) {
                  isStreaming = false;
                  return;
                } else if (line.includes('event: error')) {
                  console.error('Stream error:', data);
                  isStreaming = false;
                  return;
                }
              } catch (e) {
                // Ignore parse errors for partial chunks
              }
            }
          }

          return readChunk();
        });
      }

      return readChunk();
    }).catch(error => {
      console.error('Request failed:', error);
      response = 'Sorry, there was an error processing your request.';
      isStreaming = false;
    });
  }

  function handleAskSubmit() {
    if (askQuery.trim()) {
      handleAction('ask', askQuery.trim());
      askQuery = '';
    }
  }

  onDestroy(() => {
    if (eventSource) {
      eventSource.close();
    }
  });

  // Auto-trigger action when opened with an intent
  $: if (visible && intent && selectedText && !isStreaming && !response) {
    handleAction(intent);
  }
</script>

{#if visible}
  <div class="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-gray-200 z-40 transform transition-transform duration-300">
    <!-- Header -->
    <div class="p-4 border-b border-gray-200 bg-gray-50">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900">Context Actions</h3>
        <button
          on:click={close}
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {#if selectedText}
        <div class="mt-3 p-3 bg-white rounded border text-sm text-gray-600">
          <div class="font-medium text-gray-800 mb-1">Selected text:</div>
          <div class="line-clamp-3">"{selectedText}"</div>
        </div>
      {/if}
    </div>

    <!-- Content -->
    <div class="flex-1 flex flex-col h-full overflow-hidden">
      <!-- Action Buttons -->
      <div class="p-4 border-b border-gray-200">
        <div class="grid grid-cols-2 gap-2">
          <button
            on:click={() => handleAction('translate')}
            class="flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-colors hover:bg-blue-50 hover:border-blue-200"
            class:bg-blue-50={intent === 'translate'}
            class:border-blue-200={intent === 'translate'}
            disabled={isStreaming || !selectedText}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
            </svg>
            <span class="text-sm">Translate</span>
          </button>

          <button
            on:click={() => handleAction('explain')}
            class="flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-colors hover:bg-green-50 hover:border-green-200"
            class:bg-green-50={intent === 'explain'}
            class:border-green-200={intent === 'explain'}
            disabled={isStreaming || !selectedText}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span class="text-sm">Explain</span>
          </button>

          <button
            on:click={() => handleAction('analyze')}
            class="flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-colors hover:bg-purple-50 hover:border-purple-200"
            class:bg-purple-50={intent === 'analyze'}
            class:border-purple-200={intent === 'analyze'}
            disabled={isStreaming || !selectedText}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            <span class="text-sm">Analyze</span>
          </button>

          <button
            on:click={() => handleAction('ask')}
            class="flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-colors hover:bg-orange-50 hover:border-orange-200"
            class:bg-orange-50={intent === 'ask'}
            class:border-orange-200={intent === 'ask'}
            disabled={isStreaming}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            <span class="text-sm">Ask</span>
          </button>
        </div>

        <!-- Translation Language Selector -->
        {#if intent === 'translate' || (!intent && selectedText)}
          <div class="mt-3">
            <label class="block text-sm font-medium text-gray-700 mb-1">Target Language</label>
            <select bind:value={targetLang} class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
              {#each languageOptions as lang}
                <option value={lang.code}>{lang.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <!-- Ask Question Input -->
        {#if intent === 'ask' || (!intent && !selectedText)}
          <div class="mt-3">
            <label class="block text-sm font-medium text-gray-700 mb-1">Ask a Question</label>
            <div class="flex space-x-2">
              <input
                type="text"
                bind:value={askQuery}
                placeholder="What would you like to know about this book?"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                on:keydown={(e) => e.key === 'Enter' && handleAskSubmit()}
                disabled={isStreaming}
              />
              <button
                on:click={handleAskSubmit}
                disabled={!askQuery.trim() || isStreaming}
                class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
              >
                Ask
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Response Area -->
      <div class="flex-1 p-4 overflow-y-auto">
        {#if isStreaming}
          <div class="flex items-center space-x-2 text-gray-600 mb-4">
            <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-sm">Processing...</span>
          </div>
        {/if}

        {#if sources.length > 0}
          <div class="mb-4 p-3 bg-gray-50 rounded-lg">
            <div class="text-sm font-medium text-gray-700 mb-2">Sources</div>
            {#each sources as source}
              <div class="text-xs text-gray-600">
                📚 {source.title} {source.selection ? '(with selection)' : ''}
              </div>
            {/each}
          </div>
        {/if}

        {#if response}
          <div class="prose prose-sm max-w-none">
            <div class="whitespace-pre-wrap text-gray-800">{response}</div>
          </div>
        {/if}

        {#if usage}
          <div class="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500">
            <div>Tokens: {usage.tokens} • Cost: ${usage.cost?.toFixed(4) || '0.0010'}</div>
          </div>
        {/if}

        {#if !response && !isStreaming && visible}
          <div class="text-center text-gray-500 mt-8">
            <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            <p class="text-sm">Select an action above to get started</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>