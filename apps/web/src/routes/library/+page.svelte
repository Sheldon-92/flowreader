<!-- Library page - main dashboard for authenticated users -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import BookUpload from '$lib/components/BookUpload.svelte';
  import BookCard from '$lib/components/BookCard.svelte';
  import BookListItem from '$lib/components/BookListItem.svelte';
  import LibraryStats from '$lib/components/LibraryStats.svelte';
  import RecentlyRead from '$lib/components/RecentlyRead.svelte';
  import QuickActions from '$lib/components/QuickActions.svelte';
  import type { PageData } from './$types';
  import type { Book } from '@flowreader/shared';

  export let data: PageData;
  $: ({ supabase, session } = data);

  let books: Book[] = [];
  let filteredBooks: Book[] = [];
  let loading = true;
  let showUpload = false;
  let searchQuery = '';
  let sortBy: 'recent' | 'title' | 'author' | 'progress' = 'recent';
  let viewMode: 'grid' | 'list' = 'grid';
  let selectedGenre = 'all';
  let showFilters = false;

  // Redirect if not authenticated
  $: if (!session) {
    goto('/auth/login');
  }

  onMount(async () => {
    if (session) {
      await loadBooks();
    }
  });

  async function loadBooks() {
    try {
      loading = true;
      const { data: booksData, error } = await supabase
        .from('books')
        .select('*')
        .eq('owner_id', session?.user.id)
        .order('upload_date', { ascending: false });

      if (error) {
        console.error('Error loading books:', error);
        return;
      }

      books = booksData || [];
    filterAndSortBooks();
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      loading = false;
    }
  }

  function handleUploadComplete() {
    showUpload = false;
    loadBooks(); // Refresh the library
  }

  function filterAndSortBooks() {
    let filtered = books.filter(book => {
      const matchesSearch = searchQuery === '' || 
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesGenre = selectedGenre === 'all' || 
        book.metadata?.genre === selectedGenre;
      
      return matchesSearch && matchesGenre;
    });

    // Sort books
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'author':
          return (a.author || '').localeCompare(b.author || '');
        case 'progress':
          const aProgress = a.reading_progress?.percentage || 0;
          const bProgress = b.reading_progress?.percentage || 0;
          return bProgress - aProgress;
        case 'recent':
        default:
          return new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime();
      }
    });

    filteredBooks = filtered;
  }

  $: if (searchQuery !== undefined || sortBy || selectedGenre) {
    filterAndSortBooks();
  }

  function getUniqueGenres() {
    const genres = books
      .map(book => book.metadata?.genre)
      .filter(Boolean)
      .filter((genre, index, self) => self.indexOf(genre) === index);
    return genres;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    goto('/');
  }
</script>

<svelte:head>
  <title>My Library - FlowReader</title>
</svelte:head>

{#if session}
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
      <div class="container mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span class="text-white font-bold text-lg">F</span>
              </div>
              <span class="text-xl font-bold text-primary-900">FlowReader</span>
            </div>
            <nav class="hidden md:flex items-center space-x-6">
              <a href="/library" class="text-primary-600 font-medium">Library</a>
              <a href="/notes" class="text-gray-600 hover:text-primary-600">Notes</a>
              <a href="/reading" class="text-gray-600 hover:text-primary-600">Continue Reading</a>
            </nav>
          </div>

          <div class="flex items-center space-x-4">
            <button
              on:click={() => showUpload = true}
              class="btn btn-primary"
            >
              Upload Book
            </button>
            
            <div class="flex items-center space-x-2 text-sm text-gray-600">
              <span>{session.user.email}</span>
              <button
                on:click={handleSignOut}
                class="text-gray-500 hover:text-gray-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <div class="mb-8">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 mb-2">My Library</h1>
            <p class="text-gray-600">
              {filteredBooks.length} of {books.length} book{books.length !== 1 ? 's' : ''}
              {searchQuery ? ` matching "${searchQuery}"` : ''}
            </p>
          </div>
          
          <!-- View Toggle -->
          <div class="flex items-center space-x-2">
            <button
              on:click={() => viewMode = 'grid'}
              class="p-2 rounded-lg transition-colors {viewMode === 'grid' ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}"
              title="Grid view"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
              </svg>
            </button>
            <button
              on:click={() => viewMode = 'list'}
              class="p-2 rounded-lg transition-colors {viewMode === 'list' ? 'bg-primary-100 text-primary-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}"
              title="List view"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Search and Filters -->
        <div class="flex flex-col md:flex-row gap-4 mb-6">
          <!-- Search -->
          <div class="flex-1 relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search books by title or author..."
              class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <!-- Sort Dropdown -->
          <select 
            bind:value={sortBy}
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="recent">Recently Added</option>
            <option value="title">Title (A-Z)</option>
            <option value="author">Author (A-Z)</option>
            <option value="progress">Reading Progress</option>
          </select>
          
          <!-- Filter Toggle -->
          <button
            on:click={() => showFilters = !showFilters}
            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z"/>
            </svg>
            <span>Filters</span>
          </button>
        </div>
        
        <!-- Expandable Filters -->
        {#if showFilters}
          <div class="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Genre</label>
                <select 
                  bind:value={selectedGenre}
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="all">All Genres</option>
                  {#each getUniqueGenres() as genre}
                    <option value={genre}>{genre}</option>
                  {/each}
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Reading Status</label>
                <select class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                  <option value="all">All Books</option>
                  <option value="unread">Not Started</option>
                  <option value="reading">Currently Reading</option>
                  <option value="finished">Finished</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">File Size</label>
                <select class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                  <option value="all">Any Size</option>
                  <option value="small">&lt; 1MB</option>
                  <option value="medium">1MB - 10MB</option>
                  <option value="large">&gt; 10MB</option>
                </select>
              </div>
            </div>
          </div>
        {/if}
      </div>
      
      <!-- Quick Actions -->
      {#if !loading}
        <QuickActions 
          {books}
          on:upload={() => showUpload = true}
          on:search={(e) => searchQuery = e.detail}
          on:filter={(e) => {
            // Handle quick filter actions
            if (e.detail.type === 'status') {
              if (e.detail.value === 'reading') {
                // Filter to books in progress
                filteredBooks = books.filter(book => 
                  book.reading_progress && book.reading_progress.percentage > 0 && book.reading_progress.percentage < 100
                );
              } else if (e.detail.value === 'unread') {
                // Filter to unread books
                filteredBooks = books.filter(book => 
                  !book.reading_progress || book.reading_progress.percentage === 0
                );
              }
            }
          }}
        />
      {/if}
      
      <!-- Recently Read -->
      {#if !loading && books.length > 0}
        <RecentlyRead {books} />
      {/if}
      
      <!-- Library Statistics -->
      {#if !loading && books.length > 0}
        <LibraryStats {books} />
      {/if}

      {#if loading}
        <div class="flex items-center justify-center py-12">
          <div class="loading-spinner w-8 h-8"></div>
          <span class="ml-3 text-gray-600">Loading your books...</span>
        </div>
      {:else if filteredBooks.length === 0 && books.length > 0}
        <!-- No results -->
        <div class="text-center py-16">
          <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-gray-900 mb-2">No books found</h3>
          <p class="text-gray-600 mb-6">
            {#if searchQuery}
              No books match your search for "{searchQuery}"
            {:else}
              No books match your current filters
            {/if}
          </p>
          <button
            on:click={() => { searchQuery = ''; selectedGenre = 'all'; }}
            class="btn btn-secondary"
          >
            Clear filters
          </button>
        </div>
      {:else if books.length === 0}
        <!-- Empty state -->
        <div class="text-center py-16">
          <div class="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-gray-900 mb-2">No books yet</h3>
          <p class="text-gray-600 mb-6">Upload your first EPUB to start your AI-enhanced reading journey</p>
          <button
            on:click={() => showUpload = true}
            class="btn btn-primary text-lg px-8 py-3"
          >
            Upload Your First Book
          </button>
        </div>
      {:else}
        <!-- Books display -->
        {#if viewMode === 'grid'}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {#each filteredBooks as book (book.id)}
              <BookCard {book} />
            {/each}
          </div>
        {:else}
          <div class="space-y-4">
            {#each filteredBooks as book (book.id)}
              <BookListItem {book} />
            {/each}
          </div>
        {/if}
      {/if}
    </main>
  </div>

  <!-- Upload Modal -->
  {#if showUpload}
    <BookUpload 
      {supabase}
      userId={session.user.id}
      on:complete={handleUploadComplete}
      on:cancel={() => showUpload = false}
    />
  {/if}
{/if}

<style>
  .loading-spinner {
    border: 2px solid #f3f4f6;
    border-top: 2px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>