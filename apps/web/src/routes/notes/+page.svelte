<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Button, Card, Input, Badge, Loading } from '$lib/components/ui';
  import type { PageData } from './$types';
  import type { Note, AutoNoteMeta } from '@flowreader/shared';

  export let data: PageData;

  // Notes state
  let notes: Note[] = [];
  let loading = true;
  let error: string | null = null;
  let total = 0;
  let hasMore = false;

  // Filter state
  let searchQuery = '';
  let selectedSource: 'all' | 'manual' | 'auto' = 'all';
  let selectedMethod: 'all' | 'knowledge_enhancement' | 'dialog_summary' | 'context_analysis' = 'all';
  let sortBy: 'created_at' | 'confidence' | 'content_length' = 'created_at';
  let sortOrder: 'asc' | 'desc' = 'desc';

  // Pagination
  let currentPage = 0;
  const pageSize = 20;

  onMount(() => {
    loadNotes();
  });

  async function loadNotes(reset = true) {
    if (reset) {
      currentPage = 0;
      notes = [];
    }

    loading = true;
    error = null;

    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString(),
        sortBy,
        sortOrder
      });

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      if (selectedSource !== 'all') {
        params.set('source', selectedSource);
      }

      if (selectedMethod !== 'all' && selectedSource === 'auto') {
        params.set('generationMethod', selectedMethod);
      }

      // Get current book ID from URL params if available
      const bookId = $page.url.searchParams.get('bookId');
      if (bookId) {
        params.set('bookId', bookId);
      }

      const response = await fetch(`/api/notes/list?${params}`, {
        headers: {
          'Authorization': `Bearer ${data.session?.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load notes: ${response.statusText}`);
      }

      const result = await response.json();

      if (reset) {
        notes = result.notes;
      } else {
        notes = [...notes, ...result.notes];
      }

      total = result.total;
      hasMore = result.hasMore;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load notes';
      console.error('Notes loading error:', err);
    } finally {
      loading = false;
    }
  }

  function loadMore() {
    if (!loading && hasMore) {
      currentPage++;
      loadNotes(false);
    }
  }

  function handleSearch() {
    loadNotes(true);
  }

  function handleFilterChange() {
    loadNotes(true);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  }

  function getTypeColor(type: string): string {
    switch (type) {
      case 'enhancement':
        return 'bg-blue-100 text-blue-800';
      case 'summary':
        return 'bg-purple-100 text-purple-800';
      case 'analysis':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  function viewNote(noteId: string) {
    goto(`/notes/${noteId}`);
  }
</script>

<svelte:head>
  <title>Notes - FlowReader</title>
</svelte:head>

<div class="max-w-6xl mx-auto p-6">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Notes</h1>
    <p class="text-gray-600">
      {#if total > 0}
        {total} note{total !== 1 ? 's' : ''} found
      {:else}
        No notes yet
      {/if}
    </p>
  </div>

  <!-- Filters -->
  <Card class="mb-6 p-4">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Search -->
      <div>
        <label for="search" class="block text-sm font-medium text-gray-700 mb-1">
          Search
        </label>
        <Input
          id="search"
          type="text"
          placeholder="Search in notes..."
          bind:value={searchQuery}
          on:keypress={(e) => e.key === 'Enter' && handleSearch()}
        />
      </div>

      <!-- Source filter -->
      <div>
        <label for="source" class="block text-sm font-medium text-gray-700 mb-1">
          Source
        </label>
        <select
          id="source"
          bind:value={selectedSource}
          on:change={handleFilterChange}
          class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="all">All Sources</option>
          <option value="manual">Manual</option>
          <option value="auto">Auto-Generated</option>
        </select>
      </div>

      <!-- Generation method filter (only for auto notes) -->
      <div>
        <label for="method" class="block text-sm font-medium text-gray-700 mb-1">
          Method
        </label>
        <select
          id="method"
          bind:value={selectedMethod}
          on:change={handleFilterChange}
          disabled={selectedSource !== 'auto'}
          class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
        >
          <option value="all">All Methods</option>
          <option value="knowledge_enhancement">Knowledge Enhancement</option>
          <option value="dialog_summary">Dialog Summary</option>
          <option value="context_analysis">Context Analysis</option>
        </select>
      </div>

      <!-- Sort -->
      <div>
        <label for="sort" class="block text-sm font-medium text-gray-700 mb-1">
          Sort By
        </label>
        <select
          id="sort"
          bind:value={sortBy}
          on:change={handleFilterChange}
          class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="created_at">Date Created</option>
          <option value="confidence">Confidence</option>
          <option value="content_length">Content Length</option>
        </select>
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <Button on:click={handleSearch} variant="primary" size="sm">
        Search
      </Button>
      <Button
        on:click={() => {
          searchQuery = '';
          selectedSource = 'all';
          selectedMethod = 'all';
          handleFilterChange();
        }}
        variant="outline"
        size="sm"
      >
        Clear Filters
      </Button>
    </div>
  </Card>

  <!-- Loading state -->
  {#if loading && notes.length === 0}
    <div class="flex justify-center py-12">
      <Loading size="lg" />
    </div>
  {/if}

  <!-- Error state -->
  {#if error}
    <Card class="p-6 border-red-200 bg-red-50">
      <div class="text-red-800">
        <h3 class="font-medium mb-2">Error loading notes</h3>
        <p class="text-sm">{error}</p>
      </div>
      <Button on:click={() => loadNotes(true)} variant="outline" size="sm" class="mt-4">
        Try Again
      </Button>
    </Card>
  {/if}

  <!-- Notes list -->
  {#if notes.length > 0}
    <div class="space-y-4">
      {#each notes as note (note.id)}
        <Card class="p-4 hover:shadow-md transition-shadow cursor-pointer" on:click={() => viewNote(note.id)}>
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <Badge variant={note.source === 'auto' ? 'primary' : 'secondary'}>
                {note.source === 'auto' ? 'Auto' : 'Manual'}
              </Badge>

              {#if note.source === 'auto' && note.meta}
                
                {#if note.meta.type}
                  <Badge class={getTypeColor(note.meta.type)}>
                    {note.meta.type}
                  </Badge>
                {/if}
                {#if note.meta.confidence !== undefined}
                  <Badge class={getConfidenceColor(note.meta.confidence)}>
                    {Math.round(note.meta.confidence * 100)}% confidence
                  </Badge>
                {/if}
              {/if}
            </div>

            <time class="text-sm text-gray-500">
              {formatDate(note.createdAt)}
            </time>
          </div>

          <div class="text-gray-900 mb-2 line-clamp-3">
            {note.content.length > 200 ? note.content.substring(0, 200) + '...' : note.content}
          </div>

          {#if note.selection}
            <div class="text-sm text-gray-600 bg-gray-50 p-2 rounded mb-2">
              <strong>Selection:</strong> "{note.selection.text.substring(0, 100)}{note.selection.text.length > 100 ? '...' : ''}"
            </div>
          {/if}

          <div class="flex items-center justify-between text-xs text-gray-500">
            <span>{note.content.length} characters</span>
            {#if note.source === 'auto' && note.meta}
              
              {#if note.meta.generationMethod}
                <span>{note.meta.generationMethod.replace('_', ' ')}</span>
              {/if}
            {/if}
          </div>
        </Card>
      {/each}
    </div>

    <!-- Load more button -->
    {#if hasMore}
      <div class="flex justify-center mt-8">
        <Button on:click={loadMore} variant="outline" disabled={loading}>
          {#if loading}
            <Loading size="sm" class="mr-2" />
          {/if}
          Load More
        </Button>
      </div>
    {/if}
  {:else if !loading && !error}
    <Card class="p-12 text-center">
      <div class="text-gray-500">
        <h3 class="text-lg font-medium mb-2">No notes found</h3>
        <p class="mb-4">
          {#if searchQuery || selectedSource !== 'all' || selectedMethod !== 'all'}
            Try adjusting your filters or search query.
          {:else}
            Start reading and taking notes to see them here.
          {/if}
        </p>
        <Button on:click={() => goto('/library')} variant="primary">
          Go to Library
        </Button>
      </div>
    </Card>
  {/if}
</div>

<style>
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>