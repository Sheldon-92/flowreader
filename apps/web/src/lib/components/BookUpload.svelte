<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import { localBooks } from '$lib/stores/localBooks';

  export let supabase: SupabaseClient;
  export let userId: string;

  const dispatch = createEventDispatcher<{
    complete: void;
    cancel: void;
  }>();

  let dragOver = false;
  let uploading = false;
  let uploadProgress = 0;
  let uploadStatus = '';
  let selectedFile: File | null = null;
  let errorMessage = '';
  let showSuccess = false;

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;

    const files = Array.from(e.dataTransfer?.files || []);
    const epubFile = files.find(file => file.name.toLowerCase().endsWith('.epub'));
    
    if (epubFile) {
      selectedFile = epubFile;
    }
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (file && file.name.toLowerCase().endsWith('.epub')) {
      selectedFile = file;
    }
  }

  async function uploadBook() {
    if (!selectedFile) return;

    try {
      uploading = true;
      uploadProgress = 10;
      uploadStatus = 'Preparing upload...';

      // Read file as base64
      const fileBuffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(fileBuffer);

      // Convert to base64 for transmission
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Data = btoa(binary);

      uploadProgress = 30;
      uploadStatus = 'Uploading to server...';

      // Send to API endpoint
      const response = await fetch('/api/books/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileData: base64Data, // Send as base64 string
          userId: userId
        })
      });

      uploadProgress = 60;
      uploadStatus = 'Processing EPUB...';

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Upload failed');
      }

      // Check for warnings even on success
      if (result.warning) {
        console.warn('Upload warning:', result.warning);
      }

      // If database save failed, save to local storage
      if (result.useLocalStorage && result.book) {
        console.log('Saving book to local storage');
        localBooks.addBook(result.book);
      }

      // Upload successful
      uploadProgress = 100;
      uploadStatus = result.message || 'Upload complete!';
      showSuccess = true;
      errorMessage = '';

      // Show success for longer if there's a warning
      const delay = result.warning ? 2500 : 1500;

      setTimeout(() => {
        dispatch('complete');
        reset(); // Reset the component
      }, delay);

    } catch (error) {
      console.error('Upload failed:', error);
      errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      uploadStatus = 'Upload failed';
      uploadProgress = 0;
      uploading = false;
      showSuccess = false;

      // Don't auto-reset on error - let user decide
    }
  }

  async function pollTaskStatus(taskId: string) {
    const maxAttempts = 30; // 5 minutes with 10-second intervals
    let attempts = 0;

    const poll = async () => {
      attempts++;
      
      try {
        const response = await fetch(`/api/tasks/${taskId}/status`);
        const task = await response.json();

        if (task.status === 'completed') {
          uploadProgress = 100;
          uploadStatus = 'Processing complete!';
          setTimeout(() => dispatch('complete'), 1000);
          return;
        }

        if (task.status === 'failed') {
          throw new Error(task.error_code || 'Processing failed');
        }

        if (task.status === 'processing') {
          uploadProgress = Math.min(80, 60 + (attempts * 2));
          uploadStatus = 'Processing chapters and creating embeddings...';
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          throw new Error('Processing timeout');
        }

      } catch (error) {
        console.error('Status check failed:', error);
        uploadStatus = `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        uploading = false;
      }
    };

    setTimeout(poll, 2000); // Start polling after 2 seconds
  }

  function cancel() {
    if (!uploading) {
      dispatch('cancel');
    }
  }

  function reset() {
    selectedFile = null;
    uploading = false;
    uploadProgress = 0;
    uploadStatus = '';
    errorMessage = '';
    showSuccess = false;
  }
</script>

<!-- Upload Modal -->
<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
  <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
    <div class="p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Upload Book</h2>
        {#if !uploading}
          <button
            on:click={cancel}
            class="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        {/if}
      </div>

      {#if !selectedFile && !uploading}
        <!-- File Selection -->
        <div
          class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-colors
                 {dragOver ? 'border-primary-500 bg-primary-50' : 'hover:border-gray-400'}"
          on:dragover={handleDragOver}
          on:dragleave={handleDragLeave}
          on:drop={handleDrop}
          role="button"
          tabindex="0"
        >
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
          </div>
          
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Upload EPUB File</h3>
          <p class="text-gray-600 mb-4">
            Drag and drop your EPUB file here, or click to browse
          </p>
          
          <label class="btn btn-secondary cursor-pointer">
            Choose File
            <input
              type="file"
              accept=".epub"
              on:change={handleFileSelect}
              class="hidden"
            />
          </label>
          
          <p class="text-xs text-gray-500 mt-3">
            Only EPUB files are supported. Maximum size: 50MB
          </p>
        </div>

      {:else if selectedFile && !uploading}
        <!-- File Preview -->
        <div class="bg-gray-50 rounded-lg p-4 mb-6">
          <div class="flex items-center space-x-3">
            <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-gray-900 truncate">{selectedFile.name}</p>
              <p class="text-sm text-gray-500">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          </div>
        </div>

        <div class="flex space-x-3">
          <button
            on:click={uploadBook}
            class="btn btn-primary flex-1"
          >
            Upload Book
          </button>
          <button
            on:click={reset}
            class="btn btn-secondary"
          >
            Change File
          </button>
        </div>

      {:else}
        <!-- Upload Progress -->
        <div class="text-center">
          {#if !errorMessage}
            <div class="w-16 h-16 {showSuccess ? 'bg-green-100' : 'bg-primary-100'} rounded-full flex items-center justify-center mx-auto mb-4">
              {#if showSuccess}
                <!-- Success checkmark -->
                <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              {:else}
                <div class="loading-spinner w-8 h-8"></div>
              {/if}
            </div>
          {:else}
            <!-- Error icon -->
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
          {/if}

          <h3 class="text-lg font-semibold text-gray-900 mb-2">
            {#if showSuccess}
              Upload Successful
            {:else if errorMessage}
              Upload Failed
            {:else}
              Processing Book
            {/if}
          </h3>

          {#if errorMessage}
            <p class="text-red-600 mb-6">{errorMessage}</p>
            <div class="flex space-x-3 justify-center">
              <button
                on:click={uploadBook}
                class="btn btn-primary"
              >
                Try Again
              </button>
              <button
                on:click={reset}
                class="btn btn-secondary"
              >
                Choose Different File
              </button>
            </div>
          {:else}
            <p class="text-gray-600 mb-6">{uploadStatus}</p>

            <!-- Progress Bar -->
            <div class="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                class="{showSuccess ? 'bg-green-600' : 'bg-primary-600'} h-2 rounded-full transition-all duration-300"
                style="width: {uploadProgress}%"
              ></div>
            </div>

            <p class="text-sm text-gray-500">{uploadProgress}% complete</p>

            {#if uploadProgress < 100}
              <p class="text-xs text-gray-400 mt-2">
                This may take a few moments...
              </p>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .loading-spinner {
    border: 2px solid #e5e7eb;
    border-top: 2px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>