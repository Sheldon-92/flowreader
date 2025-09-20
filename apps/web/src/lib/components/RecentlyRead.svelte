<script lang="ts">
  import { goto } from '$app/navigation';
  import type { Book } from '@flowreader/shared';

  export let books: Book[];

  // Get recently read books (books with reading progress and recent last_read date)
  $: recentBooks = books
    .filter(book => book.reading_progress && book.reading_progress.last_read)
    .sort((a, b) => {
      const aTime = new Date(a.reading_progress?.last_read || 0).getTime();
      const bTime = new Date(b.reading_progress?.last_read || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 3); // Show top 3 recent books

  function formatLastRead(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  function openBook(bookId: string) {
    goto(`/read/${bookId}`);
  }
</script>

{#if recentBooks.length > 0}
  <div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-gray-900">Continue Reading</h3>
      <button class="text-sm text-primary-600 hover:text-primary-700">View all</button>
    </div>
    
    <div class="space-y-4">
      {#each recentBooks as book (book.id)}
        <div class="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
             on:click={() => openBook(book.id)}>
          <!-- Book thumbnail -->
          <div class="flex-shrink-0 w-12 h-16 bg-gradient-to-br from-primary-100 to-primary-200 rounded-md flex items-center justify-center">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </div>
          
          <!-- Book info -->
          <div class="flex-1 min-w-0">
            <h4 class="font-medium text-gray-900 truncate">{book.title}</h4>
            <p class="text-sm text-gray-600 truncate">by {book.author || 'Unknown Author'}</p>
            <p class="text-xs text-gray-500 mt-1">
              Last read {formatLastRead(book.reading_progress?.last_read || '')}
            </p>
          </div>
          
          <!-- Progress -->
          <div class="flex-shrink-0 text-right">
            <div class="text-sm font-medium text-gray-900">
              {Math.round(book.reading_progress?.percentage || 0)}%
            </div>
            <div class="w-16 bg-gray-200 rounded-full h-2 mt-1">
              <div
                class="bg-primary-600 h-2 rounded-full"
                style="width: {book.reading_progress?.percentage || 0}%"
              ></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}