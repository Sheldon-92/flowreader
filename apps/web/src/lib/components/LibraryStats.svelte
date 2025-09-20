<script lang="ts">
  import type { Book } from '@flowreader/shared';

  export let books: Book[];

  // Calculate library statistics
  $: stats = calculateStats(books);

  function calculateStats(books: Book[]) {
    const totalBooks = books.length;
    const totalWords = books.reduce((sum, book) => sum + (book.metadata?.word_count || 0), 0);
    const totalSize = books.reduce((sum, book) => sum + book.file_size, 0);
    
    const readingBooks = books.filter(book => 
      book.reading_progress && book.reading_progress.percentage > 0 && book.reading_progress.percentage < 100
    ).length;
    
    const finishedBooks = books.filter(book => 
      book.reading_progress && book.reading_progress.percentage >= 100
    ).length;
    
    const averageProgress = books.length > 0 
      ? books.reduce((sum, book) => sum + (book.reading_progress?.percentage || 0), 0) / books.length
      : 0;

    const estimatedReadingTime = books.reduce((sum, book) => 
      sum + (book.metadata?.estimated_reading_time || 0), 0
    );

    return {
      totalBooks,
      totalWords,
      totalSize,
      readingBooks,
      finishedBooks,
      averageProgress,
      estimatedReadingTime
    };
  }

  function formatNumber(num: number) {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}k`;
    }
    return num.toString();
  }

  function formatSize(bytes: number) {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  function formatTime(minutes: number) {
    const hours = Math.floor(minutes / 60);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes % 60}m`;
  }
</script>

<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
  <!-- Total Books -->
  <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
    <div class="text-2xl font-bold text-primary-600 mb-1">{stats.totalBooks}</div>
    <div class="text-sm text-gray-600">Books</div>
  </div>

  <!-- Currently Reading -->
  <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
    <div class="text-2xl font-bold text-blue-600 mb-1">{stats.readingBooks}</div>
    <div class="text-sm text-gray-600">Reading</div>
  </div>

  <!-- Finished -->
  <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
    <div class="text-2xl font-bold text-green-600 mb-1">{stats.finishedBooks}</div>
    <div class="text-sm text-gray-600">Finished</div>
  </div>

  <!-- Total Words -->
  <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
    <div class="text-2xl font-bold text-accent-600 mb-1">{formatNumber(stats.totalWords)}</div>
    <div class="text-sm text-gray-600">Words</div>
  </div>

  <!-- Average Progress -->
  <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
    <div class="text-2xl font-bold text-purple-600 mb-1">{Math.round(stats.averageProgress)}%</div>
    <div class="text-sm text-gray-600">Avg Progress</div>
  </div>

  <!-- Reading Time -->
  <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
    <div class="text-2xl font-bold text-indigo-600 mb-1">{formatTime(stats.estimatedReadingTime)}</div>
    <div class="text-sm text-gray-600">Est. Time</div>
  </div>
</div>

<!-- Progress Overview -->
{#if books.length > 0}
  <div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
    <h3 class="text-lg font-semibold text-gray-900 mb-4">Reading Progress Overview</h3>
    
    <div class="space-y-4">
      <!-- Overall Progress Bar -->
      <div>
        <div class="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Overall Library Progress</span>
          <span>{Math.round(stats.averageProgress)}%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div
            class="bg-gradient-to-r from-primary-500 to-accent-500 h-3 rounded-full transition-all duration-500"
            style="width: {stats.averageProgress}%"
          ></div>
        </div>
      </div>

      <!-- Reading Status Distribution -->
      <div class="grid grid-cols-3 gap-4 text-center">
        <div class="p-3 bg-gray-50 rounded-lg">
          <div class="text-lg font-semibold text-gray-700">{stats.totalBooks - stats.readingBooks - stats.finishedBooks}</div>
          <div class="text-xs text-gray-500">Not Started</div>
        </div>
        <div class="p-3 bg-blue-50 rounded-lg">
          <div class="text-lg font-semibold text-blue-700">{stats.readingBooks}</div>
          <div class="text-xs text-blue-600">In Progress</div>
        </div>
        <div class="p-3 bg-green-50 rounded-lg">
          <div class="text-lg font-semibold text-green-700">{stats.finishedBooks}</div>
          <div class="text-xs text-green-600">Completed</div>
        </div>
      </div>
    </div>
  </div>
{/if}