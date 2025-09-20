<script lang="ts">
  import { Button, Card, Badge, Progress } from '$lib/components/ui';
  import { goto } from '$app/navigation';
  import type { Book } from '@flowreader/shared';

  export let book: Book;

  // Format date helper
  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // Format reading progress
  function formatProgress(percentage: number) {
    return Math.round(percentage);
  }

  function openBook() {
    goto(`/read/${book.id}`);
  }
</script>

<Card hover shadow="sm" padding="none">
  <!-- Book Cover Placeholder -->
  <div class="aspect-[3/4] bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
    <div class="text-center p-4">
      <div class="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center mx-auto mb-2">
        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      </div>
      <p class="text-xs text-primary-700 font-medium text-center leading-tight">
        {book.title.length > 40 ? book.title.substring(0, 40) + '...' : book.title}
      </p>
    </div>
  </div>

  <!-- Book Info -->
  <div class="p-4">
    <h3 class="font-semibold text-gray-900 mb-1 line-clamp-2 text-sm leading-snug">
      {book.title}
    </h3>
    
    <p class="text-sm text-gray-600 mb-3 line-clamp-1">
      by {book.author || 'Unknown Author'}
    </p>

    <!-- Reading Progress -->
    {#if book.reading_progress && book.reading_progress.percentage > 0}
      <div class="mb-3">
        <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span>
          <span>{formatProgress(book.reading_progress.percentage)}%</span>
        </div>
        <Progress value={book.reading_progress.percentage} size="sm" />
      </div>
    {/if}

    <!-- Book Stats -->
    <div class="flex items-center justify-between text-xs text-gray-500 mb-4">
      <div class="flex items-center space-x-3">
        {#if book.metadata?.word_count}
          <span title="Word count">
            {(book.metadata.word_count / 1000).toFixed(0)}k words
          </span>
        {/if}
        {#if book.metadata?.estimated_reading_time}
          <span title="Estimated reading time">
            {Math.ceil(book.metadata.estimated_reading_time / 60)}h read
          </span>
        {/if}
      </div>
      <span title="Upload date">
        {formatDate(book.upload_date)}
      </span>
    </div>

    <!-- Action Button -->
    <Button
      on:click={openBook}
      fullWidth
      size="sm"
    >
      {book.reading_progress && book.reading_progress.percentage > 0 ? 'Continue Reading' : 'Start Reading'}
    </Button>
  </div>
</Card>

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>