<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Button, Card, Badge, Loading } from '$lib/components/ui';
  import type { PageData } from './$types';
  import type { Note, AutoNoteMeta } from '@flowreader/shared';

  export let data: PageData;

  let note: Note | null = null;
  let loading = true;
  let error: string | null = null;
  let book: any = null;

  $: noteId = $page.params.id;

  onMount(() => {
    loadNote();
  });

  async function loadNote() {
    loading = true;
    error = null;

    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        headers: {
          'Authorization': `Bearer ${data.session?.access_token}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          error = 'Note not found';
        } else {
          throw new Error(`Failed to load note: ${response.statusText}`);
        }
        return;
      }

      note = await response.json();

      // Load book information if note has bookId
      if (note?.bookId) {
        await loadBook(note.bookId);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load note';
      console.error('Note loading error:', err);
    } finally {
      loading = false;
    }
  }

  async function loadBook(bookId: string) {
    try {
      const response = await fetch(`/api/books/${bookId}`, {
        headers: {
          'Authorization': `Bearer ${data.session?.access_token}`
        }
      });

      if (response.ok) {
        book = await response.json();
      }
    } catch (err) {
      console.error('Book loading error:', err);
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
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

  function formatGenerationMethod(method: string): string {
    return method.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  function goBack() {
    goto('/notes');
  }

  function readBook() {
    if (note?.bookId) {
      goto(`/read/${note.bookId}`);
    }
  }
</script>

<svelte:head>
  <title>{note ? `Note - ${note.content.substring(0, 50)}...` : 'Note'} - FlowReader</title>
</svelte:head>

<div class="max-w-4xl mx-auto p-6">
  <!-- Loading state -->
  {#if loading}
    <div class="flex justify-center py-12">
      <Loading size="lg" />
    </div>
  {/if}

  <!-- Error state -->
  {#if error}
    <Card class="p-6 border-red-200 bg-red-50">
      <div class="text-red-800">
        <h3 class="font-medium mb-2">Error loading note</h3>
        <p class="text-sm">{error}</p>
      </div>
      <div class="mt-4 flex gap-2">
        <Button on:click={goBack} variant="outline" size="sm">
          Back to Notes
        </Button>
        <Button on:click={loadNote} variant="outline" size="sm">
          Try Again
        </Button>
      </div>
    </Card>
  {/if}

  <!-- Note content -->
  {#if note && !loading}
    <!-- Header -->
    <div class="mb-6">
      <Button on:click={goBack} variant="outline" size="sm" class="mb-4">
        ← Back to Notes
      </Button>

      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">Note Details</h1>
          <div class="flex items-center gap-2 mb-4">
            <Badge variant={note.source === 'auto' ? 'primary' : 'secondary'}>
              {note.source === 'auto' ? 'Auto-Generated' : 'Manual'}
            </Badge>

            {#if note.source === 'auto' && note.meta}
              {@const autoMeta = note.meta as AutoNoteMeta}
              {#if autoMeta.type}
                <Badge class={getTypeColor(autoMeta.type)}>
                  {autoMeta.type}
                </Badge>
              {/if}
              {#if autoMeta.confidence !== undefined}
                <Badge class={getConfidenceColor(autoMeta.confidence)}>
                  {Math.round(autoMeta.confidence * 100)}% confidence
                </Badge>
              {/if}
            {/if}
          </div>
        </div>

        <time class="text-sm text-gray-500">
          {formatDate(note.createdAt)}
        </time>
      </div>
    </div>

    <!-- Book information -->
    {#if book}
      <Card class="p-4 mb-6 bg-blue-50 border-blue-200">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-medium text-blue-900 mb-1">{book.title}</h3>
            <p class="text-sm text-blue-700">by {book.author}</p>
          </div>
          <Button on:click={readBook} variant="primary" size="sm">
            Read Book
          </Button>
        </div>
      </Card>
    {/if}

    <!-- Selection context (if available) -->
    {#if note.selection}
      <Card class="p-4 mb-6">
        <h3 class="font-medium text-gray-900 mb-2">Selected Text</h3>
        <div class="bg-gray-50 p-3 rounded border-l-4 border-blue-500">
          <p class="text-gray-700 italic">"{note.selection.text}"</p>
        </div>
        {#if note.selection.chapterId}
          <p class="text-sm text-gray-500 mt-2">
            From chapter: {note.selection.chapterId}
          </p>
        {/if}
      </Card>
    {/if}

    <!-- Main note content -->
    <Card class="p-6 mb-6">
      <h3 class="font-medium text-gray-900 mb-4">Note Content</h3>
      <div class="prose prose-gray max-w-none">
        {#each note.content.split('\n') as paragraph}
          {#if paragraph.trim()}
            <p class="mb-4 last:mb-0">{@html paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>
          {/if}
        {/each}
      </div>
    </Card>

    <!-- Metadata (for auto-generated notes) -->
    {#if note.source === 'auto' && note.meta}
      {@const autoMeta = note.meta as AutoNoteMeta}
      <Card class="p-6">
        <h3 class="font-medium text-gray-900 mb-4">Generation Details</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Generation method -->
          {#if autoMeta.generationMethod}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Generation Method
              </label>
              <p class="text-gray-900">{formatGenerationMethod(autoMeta.generationMethod)}</p>
            </div>
          {/if}

          <!-- Confidence score -->
          {#if autoMeta.confidence !== undefined}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Confidence Score
              </label>
              <div class="flex items-center gap-2">
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div
                    class="h-2 rounded-full {autoMeta.confidence >= 0.8 ? 'bg-green-600' : autoMeta.confidence >= 0.6 ? 'bg-yellow-600' : 'bg-red-600'}"
                    style="width: {autoMeta.confidence * 100}%"
                  ></div>
                </div>
                <span class="text-sm font-medium">{Math.round(autoMeta.confidence * 100)}%</span>
              </div>
            </div>
          {/if}

          <!-- Context scope -->
          {#if autoMeta.contextScope}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Context Scope
              </label>
              <p class="text-gray-900 capitalize">{autoMeta.contextScope.replace('_', ' ')}</p>
            </div>
          {/if}

          <!-- Intent -->
          {#if autoMeta.intent}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Intent
              </label>
              <p class="text-gray-900 capitalize">{autoMeta.intent}</p>
            </div>
          {/if}

          <!-- Position information -->
          {#if autoMeta.position}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Text Position
              </label>
              <p class="text-gray-900">
                {#if autoMeta.position.start !== undefined}
                  Characters {autoMeta.position.start}-{autoMeta.position.end || autoMeta.position.start}
                {/if}
                {#if autoMeta.position.chapterId}
                  in chapter {autoMeta.position.chapterId}
                {/if}
              </p>
            </div>
          {/if}

          <!-- Quality score -->
          {#if autoMeta.qualityScore !== undefined}
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Quality Score
              </label>
              <div class="flex items-center gap-2">
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div
                    class="h-2 rounded-full bg-purple-600"
                    style="width: {autoMeta.qualityScore * 100}%"
                  ></div>
                </div>
                <span class="text-sm font-medium">{Math.round(autoMeta.qualityScore * 100)}%</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Processing information -->
        {#if autoMeta.processingInfo}
          <div class="mt-6 pt-4 border-t border-gray-200">
            <h4 class="font-medium text-gray-900 mb-2">Processing Information</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
              <div>
                <span class="font-medium">Tokens:</span> {autoMeta.processingInfo.tokens}
              </div>
              <div>
                <span class="font-medium">Processing Time:</span> {autoMeta.processingInfo.processingTime}ms
              </div>
              <div>
                <span class="font-medium">Method:</span> {formatGenerationMethod(autoMeta.processingInfo.method)}
              </div>
            </div>
          </div>
        {/if}
      </Card>
    {/if}

    <!-- Actions -->
    <div class="mt-8 flex gap-2">
      <Button on:click={goBack} variant="outline">
        Back to Notes
      </Button>
      {#if book}
        <Button on:click={readBook} variant="primary">
          Read Book
        </Button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .prose {
    max-width: none;
  }

  .prose p {
    margin-bottom: 1rem;
  }

  .prose p:last-child {
    margin-bottom: 0;
  }

  .prose strong {
    font-weight: 600;
    color: #374151;
  }
</style>