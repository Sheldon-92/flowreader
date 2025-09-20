<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import type { Note } from '@flowreader/shared';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Loading from '$lib/components/ui/Loading.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  export let data: PageData;
  $: ({ supabase, session, searchParams } = data);

  // Search state
  let searchQuery = searchParams.q || '';
  let selectedBookId = searchParams.bookId || '';
  let selectedSource = searchParams.source || '';
  let selectedType = searchParams.type || '';
  let selectedHasSelection = searchParams.hasSelection || '';
  let selectedTags = searchParams.tags || '';
  let minConfidence = searchParams.minConfidence || '';
  let sortBy = searchParams.sortBy || 'created_at';
  let sortOrder = searchParams.sortOrder || 'desc';

  // Results state
  let notes: Note[] = [];
  let books: any[] = [];
  let loading = false;
  let searchPerformed = false;
  let total = 0;
  let hasMore = false;
  let currentOffset = 0;
  let selectedNote: Note | null = null;
  let performance = { queryTime: 0, resultsCount: 0 };

  // UI state
  let showAdvancedFilters = false;

  const pageSize = 20;
  const availableTypes = ['enhance', 'explain', 'analyze', 'translate', 'ask'];
  const availableSources = ['manual', 'auto'];
  const sortOptions = [
    { value: 'created_at', label: 'Date Created' },
    { value: 'content_length', label: 'Content Length' },
    { value: 'confidence', label: 'Confidence' },
    { value: 'relevance', label: 'Relevance' }
  ];

  async function loadBooks() {
    try {
      const { data: booksData, error } = await supabase
        .from('books')
        .select('id, title, author')
        .eq('owner_id', session?.user.id)
        .order('title');

      if (error) {
        console.error('Failed to load books:', error);
        return;
      }

      books = booksData || [];
    } catch (error) {
      console.error('Failed to load books:', error);
    }
  }

  async function performSearch(isLoadMore = false) {
    if (!searchQuery && !selectedBookId && !selectedSource && !selectedType) {
      notes = [];
      searchPerformed = false;
      return;
    }

    try {
      loading = true;

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        goto('/auth/login');
        return;
      }

      const url = new URL('/api/notes/search', window.location.origin);

      // Add search parameters
      if (searchQuery) url.searchParams.set('q', searchQuery);
      if (selectedBookId) url.searchParams.set('bookId', selectedBookId);
      if (selectedSource) url.searchParams.set('source', selectedSource);
      if (selectedType) url.searchParams.set('type', selectedType);
      if (selectedHasSelection) url.searchParams.set('hasSelection', selectedHasSelection);
      if (selectedTags) url.searchParams.set('tags', selectedTags);
      if (minConfidence) url.searchParams.set('minConfidence', minConfidence);

      // Pagination and sorting
      url.searchParams.set('limit', pageSize.toString());
      url.searchParams.set('offset', (isLoadMore ? currentOffset + pageSize : 0).toString());
      url.searchParams.set('sortBy', sortBy);
      url.searchParams.set('sortOrder', sortOrder);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${sessionData.session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to search notes');
      }

      const result = await response.json();
      const searchResults = result.data || {};
      const newNotes = searchResults.notes || [];

      if (isLoadMore) {
        notes = [...notes, ...newNotes];
        currentOffset += pageSize;
      } else {
        notes = newNotes;
        currentOffset = 0;
      }

      total = searchResults.total || 0;
      hasMore = searchResults.hasMore || false;
      performance = searchResults.performance || { queryTime: 0, resultsCount: 0 };
      searchPerformed = true;

      // Update URL with search parameters
      updateURL();

    } catch (error) {
      console.error('Failed to search notes:', error);
    } finally {
      loading = false;
    }
  }

  function updateURL() {
    if (!browser) return;

    const url = new URL(window.location.href);

    // Clear existing search params
    url.searchParams.delete('q');
    url.searchParams.delete('bookId');
    url.searchParams.delete('source');
    url.searchParams.delete('type');
    url.searchParams.delete('hasSelection');
    url.searchParams.delete('tags');
    url.searchParams.delete('minConfidence');
    url.searchParams.delete('sortBy');
    url.searchParams.delete('sortOrder');

    // Add current search params
    if (searchQuery) url.searchParams.set('q', searchQuery);
    if (selectedBookId) url.searchParams.set('bookId', selectedBookId);
    if (selectedSource) url.searchParams.set('source', selectedSource);
    if (selectedType) url.searchParams.set('type', selectedType);
    if (selectedHasSelection) url.searchParams.set('hasSelection', selectedHasSelection);
    if (selectedTags) url.searchParams.set('tags', selectedTags);
    if (minConfidence) url.searchParams.set('minConfidence', minConfidence);
    if (sortBy !== 'created_at') url.searchParams.set('sortBy', sortBy);
    if (sortOrder !== 'desc') url.searchParams.set('sortOrder', sortOrder);

    window.history.replaceState({}, '', url.toString());
  }

  function clearFilters() {
    searchQuery = '';
    selectedBookId = '';
    selectedSource = '';
    selectedType = '';
    selectedHasSelection = '';
    selectedTags = '';
    minConfidence = '';
    sortBy = 'created_at';
    sortOrder = 'desc';
    notes = [];
    searchPerformed = false;
    selectedNote = null;
    updateURL();
  }

  function handleSearchSubmit() {
    performSearch(false);
  }

  function loadMoreNotes() {
    if (hasMore && !loading) {
      performSearch(true);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function truncateText(text: string, maxLength: number = 150) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  function selectNote(note: Note) {
    selectedNote = note;
  }

  function closeDetail() {
    selectedNote = null;
  }

  function getBookTitle(bookId: string) {
    const book = books.find(b => b.id === bookId);
    return book ? book.title : 'Unknown Book';
  }

  // Auto-search when URL parameters change
  $: if (browser && $page.url.searchParams.toString() !== new URLSearchParams({
    q: searchQuery,
    bookId: selectedBookId,
    source: selectedSource,
    type: selectedType,
    hasSelection: selectedHasSelection,
    tags: selectedTags,
    minConfidence: minConfidence,
    sortBy: sortBy,
    sortOrder: sortOrder
  }).toString()) {
    const hasAnyFilter = searchQuery || selectedBookId || selectedSource || selectedType;
    if (hasAnyFilter) {
      performSearch(false);
    }
  }

  onMount(async () => {
    if (!session) {
      goto('/auth/login');
      return;
    }

    await loadBooks();

    // Perform search if URL has parameters
    const hasInitialFilters = searchQuery || selectedBookId || selectedSource || selectedType;
    if (hasInitialFilters) {
      performSearch(false);
    }
  });
</script>

<svelte:head>
  <title>Search Notes - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white shadow-sm border-b">
    <div class="container mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <button
            on:click={() => goto('/library')}
            class="text-gray-600 hover:text-gray-900 flex items-center space-x-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            <span>Back to Library</span>
          </button>

          <div class="border-l pl-4">
            <h1 class="font-semibold text-gray-900">Search Notes</h1>
            <p class="text-sm text-gray-600">Find and filter your notes across all books</p>
          </div>
        </div>

        {#if searchPerformed}
          <div class="flex items-center space-x-4 text-sm text-gray-600">
            <span>{total} result{total === 1 ? '' : 's'}</span>
            {#if performance.queryTime > 0}
              <span>({performance.queryTime}ms)</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- Search Interface -->
  <div class="bg-white border-b">
    <div class="container mx-auto px-4 py-6">
      <!-- Main Search Bar -->
      <form on:submit|preventDefault={handleSearchSubmit} class="mb-4">
        <div class="flex space-x-4">
          <div class="flex-1">
            <Input
              bind:value={searchQuery}
              placeholder="Search in note content..."
              class="w-full"
            />
          </div>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>
      </form>

      <!-- Quick Filters -->
      <div class="flex flex-wrap items-center gap-4 mb-4">
        <div class="flex items-center space-x-2">
          <label class="text-sm font-medium text-gray-700">Book:</label>
          <select
            bind:value={selectedBookId}
            on:change={handleSearchSubmit}
            class="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">All Books</option>
            {#each books as book}
              <option value={book.id}>{book.title}</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center space-x-2">
          <label class="text-sm font-medium text-gray-700">Source:</label>
          <select
            bind:value={selectedSource}
            on:change={handleSearchSubmit}
            class="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">All Sources</option>
            <option value="manual">Manual</option>
            <option value="auto">Auto-generated</option>
          </select>
        </div>

        <div class="flex items-center space-x-2">
          <label class="text-sm font-medium text-gray-700">Sort:</label>
          <select
            bind:value={sortBy}
            on:change={handleSearchSubmit}
            class="text-sm border border-gray-300 rounded px-2 py-1"
          >
            {#each sortOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
          <select
            bind:value={sortOrder}
            on:change={handleSearchSubmit}
            class="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        <Button
          variant="ghost"
          size="sm"
          on:click={() => showAdvancedFilters = !showAdvancedFilters}
        >
          Advanced Filters
          <svg class="w-4 h-4 ml-1 {showAdvancedFilters ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </Button>

        {#if searchPerformed}
          <Button variant="ghost" size="sm" on:click={clearFilters}>
            Clear All
          </Button>
        {/if}
      </div>

      <!-- Advanced Filters -->
      {#if showAdvancedFilters}
        <div class="bg-gray-50 p-4 rounded-lg space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Note Type:</label>
              <select
                bind:value={selectedType}
                on:change={handleSearchSubmit}
                class="w-full text-sm border border-gray-300 rounded px-3 py-2"
              >
                <option value="">All Types</option>
                {#each availableTypes as type}
                  <option value={type}>{type}</option>
                {/each}
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Has Selection:</label>
              <select
                bind:value={selectedHasSelection}
                on:change={handleSearchSubmit}
                class="w-full text-sm border border-gray-300 rounded px-3 py-2"
              >
                <option value="">Any</option>
                <option value="true">With Selection</option>
                <option value="false">Without Selection</option>
              </select>
            </div>

            {#if selectedSource === 'auto'}
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Min Confidence:</label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  bind:value={minConfidence}
                  on:change={handleSearchSubmit}
                  placeholder="0.0 - 1.0"
                  class="w-full"
                />
              </div>
            {/if}
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated):</label>
            <Input
              bind:value={selectedTags}
              on:change={handleSearchSubmit}
              placeholder="tag1, tag2, tag3"
              class="w-full"
            />
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Results -->
  <main class="container mx-auto px-4 py-8">
    {#if loading && !searchPerformed}
      <div class="flex items-center justify-center py-16">
        <Loading />
        <span class="ml-3 text-gray-600">Searching...</span>
      </div>
    {:else if !searchPerformed}
      <div class="text-center py-16">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Search Your Notes</h3>
        <p class="text-gray-600 mb-4">Enter a search term or use filters to find specific notes across all your books.</p>
      </div>
    {:else if notes.length === 0}
      <div class="text-center py-16">
        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">No notes found</h3>
        <p class="text-gray-600 mb-4">Try adjusting your search terms or filters to find more results.</p>
        <Button variant="secondary" on:click={clearFilters}>
          Clear Filters
        </Button>
      </div>
    {:else}
      <div class="flex gap-8 max-w-7xl mx-auto">
        <!-- Notes List -->
        <div class="flex-1">
          <div class="space-y-4">
            {#each notes as note (note.id)}
              <Card
                class="cursor-pointer hover:shadow-md transition-shadow {selectedNote?.id === note.id ? 'ring-2 ring-blue-500' : ''}"
                on:click={() => selectNote(note)}
              >
                <div class="p-6">
                  <!-- Note header -->
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center space-x-2 flex-wrap">
                      <Badge variant="outline" class="text-xs">
                        {getBookTitle(note.bookId)}
                      </Badge>
                      {#if note.source === 'auto'}
                        <Badge variant="secondary">Auto</Badge>
                      {/if}
                      {#if note.meta?.intent}
                        <Badge variant="secondary">
                          {note.meta.intent}
                        </Badge>
                      {/if}
                      {#if note.meta?.confidence}
                        <Badge variant="outline">
                          {Math.round(note.meta.confidence * 100)}% confident
                        </Badge>
                      {/if}
                      {#if note.selection}
                        <Badge variant="outline">
                          Has selection
                        </Badge>
                      {/if}
                    </div>
                    <span class="text-xs text-gray-500">
                      {formatDate(note.createdAt)}
                    </span>
                  </div>

                  <!-- Selection preview -->
                  {#if note.selection?.text}
                    <div class="bg-blue-50 border-l-4 border-blue-400 p-3 mb-3">
                      <p class="text-sm text-blue-800 italic">
                        "{truncateText(note.selection.text, 100)}"
                      </p>
                    </div>
                  {/if}

                  <!-- Note content preview -->
                  <div class="text-gray-900">
                    <p class="text-sm leading-relaxed">
                      {truncateText(note.content)}
                    </p>
                  </div>
                </div>
              </Card>
            {/each}

            <!-- Load more button -->
            {#if hasMore}
              <div class="text-center py-4">
                <Button
                  variant="secondary"
                  on:click={loadMoreNotes}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load More Notes'}
                </Button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Note Detail Panel -->
        {#if selectedNote}
          <div class="w-96">
            <Card class="sticky top-8">
              <div class="p-6">
                <!-- Detail header -->
                <div class="flex items-start justify-between mb-4">
                  <h3 class="text-lg font-semibold text-gray-900">Note Details</h3>
                  <button
                    on:click={closeDetail}
                    class="text-gray-400 hover:text-gray-600"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>

                <!-- Book and metadata -->
                <div class="mb-4 space-y-2">
                  <div class="text-sm text-gray-600">
                    <strong>Book:</strong> {getBookTitle(selectedNote.bookId)}
                  </div>
                  <div class="flex items-center space-x-2 flex-wrap">
                    {#if selectedNote.source === 'auto'}
                      <Badge variant="secondary">Auto</Badge>
                    {/if}
                    {#if selectedNote.meta?.intent}
                      <Badge variant="secondary">
                        {selectedNote.meta.intent}
                      </Badge>
                    {/if}
                    {#if selectedNote.meta?.confidence}
                      <Badge variant="outline">
                        {Math.round(selectedNote.meta.confidence * 100)}% confident
                      </Badge>
                    {/if}
                    {#if selectedNote.selection}
                      <Badge variant="outline">
                        Has selection
                      </Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-gray-500">
                    Created {formatDate(selectedNote.createdAt)}
                  </p>
                </div>

                <!-- Full selection -->
                {#if selectedNote.selection?.text}
                  <div class="mb-4">
                    <h4 class="text-sm font-medium text-gray-900 mb-2">Selected Text:</h4>
                    <div class="bg-blue-50 border-l-4 border-blue-400 p-3">
                      <p class="text-sm text-blue-800 italic">
                        "{selectedNote.selection.text}"
                      </p>
                    </div>
                  </div>
                {/if}

                <!-- Full content -->
                <div>
                  <h4 class="text-sm font-medium text-gray-900 mb-2">Note Content:</h4>
                  <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-sm text-gray-900 whitespace-pre-wrap">
                      {selectedNote.content}
                    </p>
                  </div>
                </div>

                <!-- Actions -->
                <div class="mt-4 pt-4 border-t">
                  <Button
                    variant="primary"
                    size="sm"
                    on:click={() => goto(`/read/${selectedNote?.bookId}`)}
                  >
                    Read Book
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        {/if}
      </div>
    {/if}
  </main>
</div>