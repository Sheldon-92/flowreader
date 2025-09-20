<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from './ui/Modal.svelte';
  import Button from './ui/Button.svelte';
  import Input from './ui/Input.svelte';
  import Toast from './ui/Toast.svelte';
  import { supabase } from '../supabase.js';

  export let open = false;
  export let selectedText = '';
  export let bookId = '';
  export let chapterId = '';
  export let intent = '';

  let content = '';
  let saving = false;
  let toastMessage = '';
  let toastType: 'success' | 'error' = 'success';
  let showToast = false;

  const dispatch = createEventDispatcher<{ close: void; saved: void }>();

  // Pre-fill content with selected text when modal opens
  $: if (open && selectedText && !content) {
    content = `Selected text: "${selectedText}"\n\nMy note: `;
  }

  async function saveNote() {
    if (!content.trim()) {
      showErrorToast('Please enter some content for your note');
      return;
    }

    try {
      saving = true;

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        showErrorToast('Please log in to save notes');
        return;
      }

      const noteData = {
        bookId,
        chapterId: chapterId || undefined,
        selection: selectedText ? {
          text: selectedText,
          start: 0,
          end: selectedText.length
        } : undefined,
        content: content.trim(),
        meta: intent ? { intent } : undefined
      };

      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session.access_token}`
        },
        body: JSON.stringify(noteData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to save note');
      }

      showSuccessToast('Note saved successfully!');
      dispatch('saved');
      closeModal();

    } catch (error) {
      console.error('Error saving note:', error);
      showErrorToast(error instanceof Error ? error.message : 'Failed to save note');
    } finally {
      saving = false;
    }
  }

  function closeModal() {
    open = false;
    content = '';
    dispatch('close');
  }

  function showSuccessToast(message: string) {
    toastMessage = message;
    toastType = 'success';
    showToast = true;
  }

  function showErrorToast(message: string) {
    toastMessage = message;
    toastType = 'error';
    showToast = true;
  }
</script>

<Modal bind:open title="Save Note" size="md" on:close={closeModal}>
  <div class="p-6 space-y-4">
    {#if selectedText}
      <div class="bg-gray-50 p-4 rounded-lg border-l-4 border-blue-500">
        <h4 class="text-sm font-medium text-gray-900 mb-2">Selected Text:</h4>
        <p class="text-sm text-gray-700 italic">"{selectedText}"</p>
      </div>
    {/if}

    <div>
      <label for="note-content" class="block text-sm font-medium text-gray-700 mb-2">
        Your Note
      </label>
      <textarea
        id="note-content"
        bind:value={content}
        placeholder="Enter your thoughts about this selection..."
        rows="6"
        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
        maxlength="4000"
      ></textarea>
      <div class="text-xs text-gray-500 mt-1">
        {content.length}/4000 characters
      </div>
    </div>
  </div>

  <div slot="footer" class="flex justify-end space-x-3">
    <Button variant="secondary" on:click={closeModal} disabled={saving}>
      Cancel
    </Button>
    <Button variant="primary" on:click={saveNote} disabled={saving || !content.trim()}>
      {saving ? 'Saving...' : 'Save Note'}
    </Button>
  </div>
</Modal>

{#if showToast}
  <Toast
    message={toastMessage}
    type={toastType}
    bind:show={showToast}
  />
{/if}