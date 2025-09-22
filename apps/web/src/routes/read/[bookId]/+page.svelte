<!-- Enhanced reading page with chapter navigation and reading position memory -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import { supabase } from '$lib/supabase';
  import { localBooks } from '$lib/stores/localBooks';
  import SelectionPopover from '$lib/components/SelectionPopover.svelte';
  import ContextSidePanel from '$lib/components/ContextSidePanel.svelte';
  import SaveNoteModal from '$lib/components/SaveNoteModal.svelte';

  export let data: PageData;
  $: ({ session, bookId } = data);

  let book = null;
  let chapters = [];
  let currentChapter = null;
  let currentChapterIndex = 0;
  let loading = true;
  let showSettings = false;
  let showChapterList = false;

  // Reading settings
  let fontSize = 18;
  let lineHeight = 1.6;
  let fontFamily = 'serif';
  let theme = 'light';
  let readingWidth = 'normal';

  // Selection and context actions
  let showSelectionPopover = false;
  let popoverX = 0;
  let popoverY = 0;
  let selectedText = '';
  let showContextPanel = false;
  let contextIntent = '';
  let contextResponse = '';

  // Save note modal
  let showSaveNoteModal = false;

  // Initial mount was moved below

  async function loadBook() {
    try {
      loading = true;
      
      // Load book data
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
      
      // Load chapters
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select('*')
        .eq('book_id', bookId)
        .order('idx');

      if (chaptersError) {
        console.error('Failed to load chapters:', chaptersError);
        return;
      }

      chapters = chaptersData || [];
      
      // Set current chapter based on reading progress
      if (book.reading_progress && book.reading_progress.current_chapter !== undefined) {
        currentChapterIndex = book.reading_progress.current_chapter;
      }
      
      if (chapters.length > 0) {
        currentChapter = chapters[currentChapterIndex] || chapters[0];
      }
    } catch (error) {
      console.error('Failed to load book:', error);
      goto('/library');
    } finally {
      loading = false;
    }
  }

  function nextChapter() {
    if (currentChapterIndex < chapters.length - 1) {
      currentChapterIndex++;
      currentChapter = chapters[currentChapterIndex];
      updateReadingPosition();
      scrollToTop();
    }
  }

  function previousChapter() {
    if (currentChapterIndex > 0) {
      currentChapterIndex--;
      currentChapter = chapters[currentChapterIndex];
      updateReadingPosition();
      scrollToTop();
    }
  }

  function goToChapter(index) {
    if (index >= 0 && index < chapters.length) {
      currentChapterIndex = index;
      currentChapter = chapters[currentChapterIndex];
      updateReadingPosition();
      showChapterList = false;
      scrollToTop();
    }
  }

  async function updateReadingPosition() {
    if (!book || !session) return;
    
    try {
      // Calculate reading percentage based on current chapter
      const chapterProgress = (currentChapterIndex + 1) / chapters.length;
      const percentage = Math.round(chapterProgress * 100);
      
      const { error } = await supabase
        .rpc('update_reading_position', {
          p_user_id: session.user.id,
          p_book_id: book.id,
          p_chapter_idx: currentChapterIndex,
          p_cfi_position: '', // CFI position would be calculated from scroll position in a real implementation
          p_percentage: percentage
        });

      if (error) {
        console.error('Failed to update reading position:', error);
      }
    } catch (error) {
      console.error('Error updating reading position:', error);
    }
  }

  function scrollToTop() {
    const content = document.getElementById('reading-content');
    if (content) {
      content.scrollTop = 0;
    }
  }

  function applyReadingSettings() {
    const content = document.getElementById('reading-content');
    if (content) {
      content.style.fontSize = `${fontSize}px`;
      content.style.lineHeight = lineHeight.toString();
      content.style.fontFamily = fontFamily === 'serif' ? 'Charter, Georgia, serif' : 'Inter, system-ui, sans-serif';
    }
    
    const container = document.getElementById('reading-container');
    if (container) {
      container.className = container.className.replace(/theme-\w+/, '') + ` theme-${theme}`;
    }
  }

  $: if (typeof window !== 'undefined') {
    applyReadingSettings();
  }

  // Auto-save reading position when chapter changes
  $: if (currentChapter && book) {
    setTimeout(updateReadingPosition, 1000);
  }

  // Selection handling
  function handleTextSelection(event: MouseEvent) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      showSelectionPopover = false;
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();

    if (text.length === 0) {
      showSelectionPopover = false;
      return;
    }

    // Only show popover for meaningful selections (more than 3 characters)
    if (text.length < 4) {
      showSelectionPopover = false;
      return;
    }

    selectedText = text;

    // Position popover near the selection
    const rect = range.getBoundingClientRect();
    popoverX = rect.left + (rect.width / 2);
    popoverY = rect.top + window.scrollY;

    showSelectionPopover = true;
  }

  function handleSelectionAction(event: CustomEvent) {
    const { intent, selectedText: text, selection } = event.detail;

    selectedText = text;

    if (intent === 'save_note') {
      showSelectionPopover = false;
      showSaveNoteModal = true;
    } else {
      contextIntent = intent;
      contextResponse = '';
      showSelectionPopover = false;
      showContextPanel = true;
    }
  }

  function handleContextPanelClose() {
    showContextPanel = false;
    contextIntent = '';
    contextResponse = '';
    selectedText = '';
  }

  function handleSaveNoteClose() {
    showSaveNoteModal = false;
    selectedText = '';
  }

  function handleNoteSaved() {
    showSaveNoteModal = false;
    selectedText = '';
    // Could show a success toast here
  }

  // Add selection listener on mount
  onMount(async () => {
    // No authentication required for personal use

    await loadBook();

    // Add text selection event listener
    if (typeof window !== 'undefined') {
      document.addEventListener('mouseup', handleTextSelection);

      return () => {
        document.removeEventListener('mouseup', handleTextSelection);
      };
    }
  });
</script>

<svelte:head>
  <title>{book?.title || 'Reading'} - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50" id="reading-container">
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
            <span>Library</span>
          </button>
          
          {#if book}
            <div class="border-l pl-4">
              <h1 class="font-semibold text-gray-900 truncate max-w-md">{book.title}</h1>
              <p class="text-sm text-gray-600">by {book.author || 'Unknown Author'}</p>
            </div>
          {/if}
        </div>

        <div class="flex items-center space-x-4">
          <button
            on:click={() => showChapterList = true}
            class="btn btn-ghost"
            title="Table of contents"
            disabled={chapters.length === 0}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
            </svg>
          </button>

          <button
            on:click={() => goto(`/read/${bookId}/notes`)}
            class="btn btn-ghost"
            title="View notes"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
          </button>
          
          <button 
            on:click={() => showSettings = true}
            class="btn btn-ghost" 
            title="Reading settings"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="container mx-auto px-4 py-8">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <div class="loading-spinner w-8 h-8"></div>
        <span class="ml-3 text-gray-600">Loading book...</span>
      </div>
    {:else if book}
      <!-- Reading Interface -->
      <div class="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto">
        <!-- Main Reading Content -->
        <div class="flex-1">
          <div class="bg-white rounded-lg shadow-sm border min-h-screen">
            {#if currentChapter}
              <!-- Chapter Header -->
              <div class="border-b p-6">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h2 class="text-xl font-semibold text-gray-900">{currentChapter.title}</h2>
                    <p class="text-sm text-gray-600">Chapter {currentChapterIndex + 1} of {chapters.length}</p>
                  </div>
                  <div class="text-sm text-gray-500">
                    {currentChapter.word_count?.toLocaleString() || 0} words
                  </div>
                </div>
                
                <!-- Progress Bar -->
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div
                    class="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style="width: {((currentChapterIndex + 1) / chapters.length) * 100}%"
                  ></div>
                </div>
              </div>
              
              <!-- Chapter Content -->
              <div 
                id="reading-content"
                class="p-6 lg:p-12 prose max-w-none reading-content"
                class:max-w-3xl={readingWidth === 'narrow'}
                class:max-w-5xl={readingWidth === 'normal'}
                class:max-w-none={readingWidth === 'wide'}
              >
                {@html currentChapter.content.replace(/\n/g, '</p><p>')}
              </div>
              
              <!-- Chapter Navigation -->
              <div class="border-t p-6 bg-gray-50">
                <div class="flex items-center justify-between">
                  <button
                    on:click={previousChapter}
                    disabled={currentChapterIndex === 0}
                    class="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                    </svg>
                    Previous Chapter
                  </button>
                  
                  <div class="text-sm text-gray-600">
                    {Math.round(((currentChapterIndex + 1) / chapters.length) * 100)}% complete
                  </div>
                  
                  <button
                    on:click={nextChapter}
                    disabled={currentChapterIndex === chapters.length - 1}
                    class="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next Chapter
                    <svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            {:else if chapters.length === 0}
              <div class="p-8 text-center">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                  </svg>
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">No content available</h3>
                <p class="text-gray-600 mb-4">This book may still be processing or there was an error loading the chapters.</p>
                <button on:click={() => goto('/library')} class="btn btn-primary">
                  Back to Library
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <!-- Book not found -->
      <div class="text-center py-16">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">Book Not Found</h2>
        <p class="text-gray-600 mb-6">The book you're looking for doesn't exist or you don't have access to it.</p>
        <button
          on:click={() => goto('/library')}
          class="btn btn-primary"
        >
          Back to Library
        </button>
      </div>
    {/if}
  </main>

  <!-- Context Action Components -->
  <SelectionPopover
    bind:visible={showSelectionPopover}
    bind:x={popoverX}
    bind:y={popoverY}
    bind:selectedText={selectedText}
    on:action={handleSelectionAction}
  />

  <ContextSidePanel
    bind:visible={showContextPanel}
    bind:intent={contextIntent}
    bind:selectedText={selectedText}
    bind:response={contextResponse}
    on:close={handleContextPanelClose}
  />

  <SaveNoteModal
    bind:open={showSaveNoteModal}
    bind:selectedText={selectedText}
    bookId={book?.id || ''}
    chapterId={currentChapter?.id || ''}
    intent={contextIntent}
    on:close={handleSaveNoteClose}
    on:saved={handleNoteSaved}
  />
</div>

<!-- Chapter List Modal -->
{#if showChapterList}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
      <div class="p-6 border-b">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Table of Contents</h3>
          <button 
            on:click={() => showChapterList = false}
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="overflow-y-auto max-h-96">
        {#each chapters as chapter, index (chapter.id)}
          <button
            on:click={() => goToChapter(index)}
            class="w-full text-left p-4 hover:bg-gray-50 border-b last:border-b-0 transition-colors
                   {index === currentChapterIndex ? 'bg-primary-50 border-primary-200' : ''}"
          >
            <div class="flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <h4 class="font-medium text-gray-900 truncate">{chapter.title}</h4>
                <p class="text-sm text-gray-500">Chapter {index + 1}</p>
              </div>
              <div class="ml-2 text-sm text-gray-400">
                {chapter.word_count?.toLocaleString() || 0} words
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Reading Settings Modal -->
{#if showSettings}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-xl shadow-2xl max-w-md w-full">
      <div class="p-6 border-b">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Reading Settings</h3>
          <button 
            on:click={() => showSettings = false}
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="p-6 space-y-6">
        <!-- Font Size -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Font Size</label>
          <input 
            type="range" 
            min="12" 
            max="24" 
            bind:value={fontSize}
            class="w-full"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>12px</span>
            <span>{fontSize}px</span>
            <span>24px</span>
          </div>
        </div>
        
        <!-- Line Height -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Line Height</label>
          <input 
            type="range" 
            min="1.2" 
            max="2.0" 
            step="0.1"
            bind:value={lineHeight}
            class="w-full"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>Tight</span>
            <span>{lineHeight}</span>
            <span>Loose</span>
          </div>
        </div>
        
        <!-- Font Family -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Font</label>
          <select bind:value={fontFamily} class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            <option value="serif">Serif (Charter)</option>
            <option value="sans">Sans-serif (Inter)</option>
          </select>
        </div>
        
        <!-- Reading Width -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Reading Width</label>
          <select bind:value={readingWidth} class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            <option value="narrow">Narrow</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
          </select>
        </div>
        
        <!-- Theme -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Theme</label>
          <div class="flex space-x-2">
            <button
              on:click={() => theme = 'light'}
              class="flex-1 p-3 rounded-lg border-2 transition-colors
                     {theme === 'light' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}"
            >
              <div class="w-6 h-6 bg-white border border-gray-300 rounded mx-auto mb-1"></div>
              <div class="text-sm">Light</div>
            </button>
            <button
              on:click={() => theme = 'dark'}
              class="flex-1 p-3 rounded-lg border-2 transition-colors
                     {theme === 'dark' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}"
            >
              <div class="w-6 h-6 bg-gray-800 border border-gray-600 rounded mx-auto mb-1"></div>
              <div class="text-sm">Dark</div>
            </button>
          </div>
        </div>
      </div>
      
      <div class="p-6 border-t">
        <button 
          on:click={() => showSettings = false}
          class="w-full btn btn-primary"
        >
          Apply Settings
        </button>
      </div>
    </div>
  </div>
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
  
  .reading-content {
    font-family: Charter, Georgia, serif;
    color: #2d3748;
  }
  
  .reading-content :global(p) {
    margin-bottom: 1.5em;
  }
  
  .theme-dark .reading-content {
    color: #e2e8f0;
  }
  
  .theme-dark {
    background-color: #1a202c;
  }
  
  .theme-dark .bg-white {
    background-color: #2d3748;
  }
  
  .theme-dark .text-gray-900 {
    color: #f7fafc;
  }
  
  .theme-dark .text-gray-600 {
    color: #a0aec0;
  }
  
  .theme-dark .border-gray-200,
  .theme-dark .border {
    border-color: #4a5568;
  }
  
  .theme-dark .bg-gray-50 {
    background-color: #2d3748;
  }
</style>