<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Book } from '@flowreader/shared';

  export let books: Book[];

  const dispatch = createEventDispatcher<{
    upload: void;
    search: string;
    filter: { type: string; value: string };
  }>();

  // Quick stats for action cards
  $: unreadBooks = books.filter(book => !book.reading_progress || book.reading_progress.percentage === 0).length;
  $: inProgressBooks = books.filter(book => 
    book.reading_progress && book.reading_progress.percentage > 0 && book.reading_progress.percentage < 100
  ).length;

  function handleQuickSearch(query: string) {
    dispatch('search', query);
  }

  function handleQuickFilter(type: string, value: string) {
    dispatch('filter', { type, value });
  }
</script>

<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
  <!-- Upload Book -->
  <button
    on:click={() => dispatch('upload')}
    class="bg-white border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-primary-400 hover:bg-primary-50 transition-colors group"
  >
    <div class="text-center">
      <div class="w-8 h-8 bg-primary-100 group-hover:bg-primary-200 rounded-full flex items-center justify-center mx-auto mb-2">
        <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
      </div>
      <div class="text-sm font-medium text-gray-900">Upload Book</div>
      <div class="text-xs text-gray-500">Add new EPUB</div>
    </div>
  </button>

  <!-- Continue Reading -->
  <button
    on:click={() => handleQuickFilter('status', 'reading')}
    class="bg-white border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
    disabled={inProgressBooks === 0}
  >
    <div class="text-center">
      <div class="text-xl font-bold text-blue-600 mb-1">{inProgressBooks}</div>
      <div class="text-sm font-medium text-gray-900">In Progress</div>
      <div class="text-xs text-gray-500">Continue reading</div>
    </div>
  </button>

  <!-- Unread Books -->
  <button
    on:click={() => handleQuickFilter('status', 'unread')}
    class="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 hover:border-gray-300 transition-colors"
    disabled={unreadBooks === 0}
  >
    <div class="text-center">
      <div class="text-xl font-bold text-gray-600 mb-1">{unreadBooks}</div>
      <div class="text-sm font-medium text-gray-900">Unread</div>
      <div class="text-xs text-gray-500">Start new book</div>
    </div>
  </button>

  <!-- Random Book -->
  <button
    on:click={() => {
      if (books.length > 0) {
        const randomBook = books[Math.floor(Math.random() * books.length)];
        handleQuickSearch(randomBook.title);
      }
    }}
    class="bg-white border border-gray-200 rounded-lg p-4 hover:bg-purple-50 hover:border-purple-300 transition-colors"
    disabled={books.length === 0}
  >
    <div class="text-center">
      <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
        <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
      </div>
      <div class="text-sm font-medium text-gray-900">Surprise Me</div>
      <div class="text-xs text-gray-500">Random book</div>
    </div>
  </button>
</div>