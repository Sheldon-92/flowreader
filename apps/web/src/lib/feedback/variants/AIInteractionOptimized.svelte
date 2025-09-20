<!-- AI Interaction Optimized Variant (B) -->
<!-- Improved AI interface with faster responses and better context retention -->

<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { trackEvent } from './ABTestManager';

  export let bookContext: string = '';
  export let conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];

  const dispatch = createEventDispatcher();

  let userInput = '';
  let isLoading = false;
  let streamingResponse = '';
  let conversationContainer: HTMLElement;

  // Optimized features
  let responseCache = new Map<string, string>();
  let contextWindow = 5; // Keep last 5 exchanges for better context
  let debounceTimer: number;

  // Progressive response streaming
  let isStreaming = false;
  let currentResponseIndex = 0;

  onMount(() => {
    trackEvent('ai_interface_loaded', {
      testId: 'ai_interaction_v1',
      variantId: 'optimized',
      bookContext: bookContext ? 'present' : 'none'
    });
  });

  async function handleSubmit() {
    if (!userInput.trim() || isLoading) return;

    const question = userInput.trim();
    userInput = '';

    // Add user message immediately
    conversationHistory = [...conversationHistory, { role: 'user', content: question }];

    // Track interaction start
    const startTime = Date.now();
    trackEvent('ai_question_submitted', {
      testId: 'ai_interaction_v1',
      variantId: 'optimized',
      questionLength: question.length,
      conversationTurn: conversationHistory.length
    });

    // Check cache first (optimization)
    const cacheKey = generateCacheKey(question, bookContext, conversationHistory.slice(-contextWindow));
    if (responseCache.has(cacheKey)) {
      const cachedResponse = responseCache.get(cacheKey)!;
      conversationHistory = [...conversationHistory, { role: 'assistant', content: cachedResponse }];

      trackEvent('ai_response_cached', {
        testId: 'ai_interaction_v1',
        variantId: 'optimized',
        responseTime: Date.now() - startTime,
        cached: true
      });

      scrollToBottom();
      return;
    }

    isLoading = true;
    streamingResponse = '';
    isStreaming = true;

    try {
      // Build optimized context with recent conversation history
      const contextualPrompt = buildOptimizedContext(question, bookContext, conversationHistory.slice(-contextWindow));

      const response = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: contextualPrompt,
          bookContext: bookContext,
          conversationHistory: conversationHistory.slice(-contextWindow), // Optimized context window
          enableStreaming: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream available');
      }

      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullResponse += data.content;
                streamingResponse = fullResponse;
                scrollToBottom();
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      }

      // Finalize response
      conversationHistory = [...conversationHistory, { role: 'assistant', content: fullResponse }];

      // Cache the response (optimization)
      responseCache.set(cacheKey, fullResponse);

      // Limit cache size
      if (responseCache.size > 50) {
        const firstKey = responseCache.keys().next().value;
        responseCache.delete(firstKey);
      }

      trackEvent('ai_response_completed', {
        testId: 'ai_interaction_v1',
        variantId: 'optimized',
        responseTime: Date.now() - startTime,
        responseLength: fullResponse.length,
        wasStreamed: true,
        cached: false
      });

    } catch (error) {
      console.error('AI interaction failed:', error);

      const errorMessage = 'I apologize, but I encountered an error. Please try asking your question again.';
      conversationHistory = [...conversationHistory, { role: 'assistant', content: errorMessage }];

      trackEvent('ai_response_error', {
        testId: 'ai_interaction_v1',
        variantId: 'optimized',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      isLoading = false;
      isStreaming = false;
      streamingResponse = '';
      scrollToBottom();
    }
  }

  function buildOptimizedContext(question: string, bookContext: string, recentHistory: typeof conversationHistory): string {
    // Enhanced context building with better relevance
    let context = `Book Context: ${bookContext}\n\n`;

    if (recentHistory.length > 0) {
      context += 'Recent Conversation:\n';
      recentHistory.slice(-4).forEach((msg, index) => {
        context += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
      context += '\n';
    }

    context += `Current Question: ${question}`;
    return context;
  }

  function generateCacheKey(question: string, bookContext: string, recentHistory: typeof conversationHistory): string {
    // Simple cache key generation
    const historyString = recentHistory.map(h => `${h.role}:${h.content}`).join('|');
    const combined = `${bookContext}|${historyString}|${question}`;

    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  function scrollToBottom() {
    if (conversationContainer) {
      setTimeout(() => {
        conversationContainer.scrollTop = conversationContainer.scrollHeight;
      }, 10);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  // Debounced typing indicator
  function handleInputChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      trackEvent('ai_typing_pause', {
        testId: 'ai_interaction_v1',
        variantId: 'optimized',
        inputLength: userInput.length
      });
    }, 1000);
  }
</script>

<div class="ai-interaction-optimized bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-96">
  <!-- Header with optimization indicator -->
  <div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-gray-900 flex items-center">
        <svg class="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
        AI Reading Assistant
        <span class="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">Enhanced</span>
      </h3>
      <div class="flex items-center text-xs text-gray-500">
        {#if responseCache.size > 0}
          <span class="flex items-center">
            <svg class="w-3 h-3 mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
            </svg>
            Cached responses: {responseCache.size}
          </span>
        {/if}
      </div>
    </div>
  </div>

  <!-- Conversation Display -->
  <div bind:this={conversationContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
    {#each conversationHistory as message, index}
      <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[80%] {message.role === 'user'
          ? 'bg-blue-600 text-white rounded-lg rounded-br-md'
          : 'bg-gray-100 text-gray-900 rounded-lg rounded-bl-md'} px-4 py-2">
          <div class="text-sm whitespace-pre-wrap">{message.content}</div>
          <div class="text-xs opacity-70 mt-1">
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    {/each}

    <!-- Streaming Response -->
    {#if isStreaming && streamingResponse}
      <div class="flex justify-start">
        <div class="max-w-[80%] bg-gray-100 text-gray-900 rounded-lg rounded-bl-md px-4 py-2">
          <div class="text-sm whitespace-pre-wrap">{streamingResponse}</div>
          <div class="flex items-center text-xs opacity-70 mt-1">
            <div class="animate-pulse flex space-x-1 mr-2">
              <div class="w-1 h-1 bg-blue-600 rounded-full"></div>
              <div class="w-1 h-1 bg-blue-600 rounded-full"></div>
              <div class="w-1 h-1 bg-blue-600 rounded-full"></div>
            </div>
            Typing...
          </div>
        </div>
      </div>
    {/if}

    <!-- Loading State (improved) -->
    {#if isLoading && !isStreaming}
      <div class="flex justify-start">
        <div class="bg-gray-100 rounded-lg rounded-bl-md px-4 py-3">
          <div class="flex items-center space-x-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span class="text-sm text-gray-600">Thinking...</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Input Area -->
  <div class="border-t border-gray-200 p-4">
    <div class="flex space-x-3">
      <div class="flex-1">
        <textarea
          bind:value={userInput}
          on:keydown={handleKeydown}
          on:input={handleInputChange}
          placeholder="Ask me anything about this book..."
          disabled={isLoading}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all duration-200"
          rows="2"
        ></textarea>
      </div>
      <button
        on:click={handleSubmit}
        disabled={isLoading || !userInput.trim()}
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center"
      >
        {#if isLoading}
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
          </svg>
        {/if}
        Send
      </button>
    </div>

    <!-- Input hints -->
    <div class="mt-2 flex items-center text-xs text-gray-500">
      <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      Press Enter to send, Shift+Enter for new line
      {#if responseCache.size > 0}
        • Frequently asked questions load instantly
      {/if}
    </div>
  </div>
</div>

<style>
  .ai-interaction-optimized {
    /* Custom scrollbar for conversation */
  }

  .ai-interaction-optimized :global(.overflow-y-auto)::-webkit-scrollbar {
    width: 6px;
  }

  .ai-interaction-optimized :global(.overflow-y-auto)::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .ai-interaction-optimized :global(.overflow-y-auto)::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 3px;
  }

  .ai-interaction-optimized :global(.overflow-y-auto)::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
</style>