<script lang="ts">
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

  // Format file size
  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function openBook() {
    goto(`/read/${book.id}`);
  }

  // Get reading status
  function getReadingStatus() {
    if (!book.reading_progress || book.reading_progress.percentage === 0) {
      return { label: 'Not started', color: 'gray' };
    } else if (book.reading_progress.percentage >= 100) {
      return { label: 'Finished', color: 'green' };
    } else {
      return { label: 'Reading', color: 'blue' };
    }
  }

  $: readingStatus = getReadingStatus();
</script>

<div class="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-4">
  <div class="flex items-center space-x-4">
    <!-- Book Cover Thumbnail -->
    <div class="flex-shrink-0 w-16 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg flex items-center justify-center">
      <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
      </svg>
    </div>

    <!-- Book Info -->
    <div class="flex-1 min-w-0">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-gray-900 truncate text-lg">
            {book.title}
          </h3>
          <p class="text-gray-600 truncate">
            by {book.author || 'Unknown Author'}
          </p>
          
          <!-- Metadata Row -->
          <div class="flex items-center space-x-4 mt-2 text-sm text-gray-500">
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
            <span title="File size">
              {formatFileSize(book.file_size)}
            </span>
            <span title="Upload date">
              Added {formatDate(book.upload_date)}
            </span>
          </div>
        </div>

        <!-- Progress and Status -->
        <div class="flex flex-col md:items-end space-y-2 md:min-w-0 md:w-48">
          <!-- Reading Status Badge -->
          <div class="flex items-center space-x-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
              {readingStatus.color === 'gray' ? 'bg-gray-100 text-gray-800' :
               readingStatus.color === 'blue' ? 'bg-blue-100 text-blue-800' :
               'bg-green-100 text-green-800'}">
              {readingStatus.label}
            </span>
          </div>

          <!-- Reading Progress -->
          {#if book.reading_progress && book.reading_progress.percentage > 0}
            <div class="w-full md:w-32">
              <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{formatProgress(book.reading_progress.percentage)}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  class="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style="width: {book.reading_progress.percentage}%"
                ></div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Action Button -->
        <div class="flex-shrink-0">
          <button
            on:click={openBook}
            class="btn btn-primary whitespace-nowrap"
          >
            {book.reading_progress && book.reading_progress.percentage > 0 ? 'Continue' : 'Start Reading'}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>