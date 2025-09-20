<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PageData } from './$types';
  import type { Note } from '@flowreader/shared';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Loading from '$lib/components/ui/Loading.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';

  export let data: PageData;
  $: ({ supabase, session, bookId } = data);

  let book: any = null;
  let notes: Note[] = [];
  let loading = true;
  let loadingMore = false;
  let selectedNote: Note | null = null;
  let nextCursor: string | undefined;
  let hasMore = false;

  async function loadBook() {
    try {
      const { data: bookData, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .eq('owner_id', session?.user.id)
        .single();

      if (error || !bookData) {
        console.error('Book not found:', error);
        goto('/library');
        return;
      }

      book = bookData;
    } catch (error) {
      console.error('Failed to load book:', error);
      goto('/library');
    }
  }

  async function loadNotes(cursor?: string) {
    try {
      if (!cursor) loading = true;
      else loadingMore = true;

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        goto('/auth/login');
        return;
      }

      const url = new URL('/api/notes', window.location.origin);
      url.searchParams.set('bookId', bookId);
      url.searchParams.set('limit', '20');
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${sessionData.session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load notes');
      }

      const result = await response.json();
      const newNotes = result.data.items || [];

      if (cursor) {
        notes = [...notes, ...newNotes];
      } else {
        notes = newNotes;
      }

      nextCursor = result.data.nextCursor;
      hasMore = !!nextCursor;

    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function loadMoreNotes() {
    if (nextCursor && !loadingMore) {
      loadNotes(nextCursor);
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

  onMount(async () => {
    if (!session) {
      goto('/auth/login');
      return;
    }

    await loadBook();
    await loadNotes();
  });
</script>

<svelte:head>
  <title>Notes - {book?.title || 'Loading...'} - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white shadow-sm border-b">
    <div class="container mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <button
            on:click={() => goto(`/read/${bookId}`)}
            class="text-gray-600 hover:text-gray-900 flex items-center space-x-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            <span>Back to Reading</span>
          </button>

          {#if book}
            <div class="border-l pl-4">
              <h1 class="font-semibold text-gray-900 truncate max-w-md">Notes: {book.title}</h1>
              <p class="text-sm text-gray-600">by {book.author || 'Unknown Author'}</p>
            </div>
          {/if}
        </div>

        <div class="flex items-center space-x-4">
          <span class="text-sm text-gray-600">
            {notes.length} note{notes.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="container mx-auto px-4 py-8">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <Loading />
        <span class="ml-3 text-gray-600">Loading notes...</span>
      </div>
    {:else}
      <div class="flex gap-8 max-w-7xl mx-auto">
        <!-- Notes List -->
        <div class="flex-1">
          {#if notes.length === 0}
            <Card class="text-center py-12">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-gray-900 mb-2">No notes yet</h3>
              <p class="text-gray-600 mb-4">Start taking notes by selecting text while reading and clicking "Save Note".</p>
              <Button variant="primary" on:click={() => goto(`/read/${bookId}`)}>
                Start Reading
              </Button>
            </Card>
          {:else}
            <div class="space-y-4">
              {#each notes as note (note.id)}
                <Card
                  class="cursor-pointer hover:shadow-md transition-shadow {selectedNote?.id === note.id ? 'ring-2 ring-blue-500' : ''}"
                  on:click={() => selectNote(note)}
                >
                  <div class="p-6">
                    <!-- Note header -->
                    <div class="flex items-start justify-between mb-3">
                      <div class="flex items-center space-x-2">
                        {#if note.meta?.intent}
                          <Badge variant="secondary">
                            {note.meta.intent}
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
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading...' : 'Load More Notes'}
                  </Button>
                </div>
              {/if}
            </div>
          {/if}
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

                <!-- Metadata -->
                <div class="mb-4 space-y-2">
                  <div class="flex items-center space-x-2">
                    {#if selectedNote.meta?.intent}
                      <Badge variant="secondary">
                        {selectedNote.meta.intent}
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
              </div>
            </Card>
          </div>
        {/if}
      </div>
    {/if}
  </main>
</div>