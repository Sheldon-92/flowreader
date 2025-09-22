<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import type { PageData } from './$types';

  export let data: PageData;
  $: ({ session } = data);

  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let loading = false;
  let error = '';
  let success = '';

  // No authentication required for personal use

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      error = 'Please fill in all fields';
      return;
    }

    if (newPassword !== confirmPassword) {
      error = 'New passwords do not match';
      return;
    }

    if (newPassword.length < 8) {
      error = 'Password must be at least 8 characters long';
      return;
    }

    try {
      loading = true;
      error = '';
      success = '';

      // First, verify current password by attempting to sign in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: session?.user?.email || '',
        password: currentPassword
      });

      if (verifyError) {
        error = 'Current password is incorrect';
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        error = updateError.message;
        return;
      }

      success = 'Password updated successfully!';
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';

    } catch (e) {
      error = 'An unexpected error occurred';
      console.error('Change password error:', e);
    } finally {
      loading = false;
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      goto('/');
    }
  }
</script>

<svelte:head>
  <title>Settings - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Navigation -->
  <nav class="bg-white shadow-sm border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center">
          <a href="/library" class="flex items-center space-x-2">
            <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold">F</span>
            </div>
            <span class="text-xl font-bold text-primary-900">FlowReader</span>
          </a>
        </div>
        <div class="flex items-center space-x-4">
          <a href="/library" class="text-gray-600 hover:text-gray-900">Library</a>
          <a href="/notes" class="text-gray-600 hover:text-gray-900">Notes</a>
          <button
            on:click={handleSignOut}
            class="text-gray-600 hover:text-gray-900"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  </nav>

  <div class="max-w-2xl mx-auto py-12 px-4">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900">Account Settings</h1>
      <p class="text-gray-600 mt-2">Manage your account preferences and security</p>
    </div>

    <!-- User Info -->
    <div class="bg-white shadow rounded-lg p-6 mb-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700">Email</label>
          <p class="mt-1 text-sm text-gray-900">{session?.user?.email || ''}</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Member since</label>
          <p class="mt-1 text-sm text-gray-900">
            {session?.user?.created_at ? new Date(session.user.created_at).toLocaleDateString() : ''}
          </p>
        </div>
      </div>
    </div>

    <!-- Change Password -->
    <div class="bg-white shadow rounded-lg p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>

      {#if error}
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      {/if}

      {#if success}
        <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-green-800">{success}</p>
            </div>
          </div>
        </div>
      {/if}

      <div class="space-y-4">
        <div>
          <label for="current-password" class="block text-sm font-medium text-gray-700 mb-2">
            Current Password
          </label>
          <input
            type="password"
            id="current-password"
            bind:value={currentPassword}
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter your current password"
          />
        </div>

        <div>
          <label for="new-password" class="block text-sm font-medium text-gray-700 mb-2">
            New Password
          </label>
          <input
            type="password"
            id="new-password"
            bind:value={newPassword}
            required
            minlength="8"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="At least 8 characters"
          />
          <p class="text-xs text-gray-500 mt-1">Must be at least 8 characters long</p>
        </div>

        <div>
          <label for="confirm-password" class="block text-sm font-medium text-gray-700 mb-2">
            Confirm New Password
          </label>
          <input
            type="password"
            id="confirm-password"
            bind:value={confirmPassword}
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Re-enter your new password"
          />
        </div>

        <div class="pt-4">
          <button
            type="button"
            on:click={handleChangePassword}
            disabled={loading}
            class="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating password...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>

    <!-- Danger Zone -->
    <div class="bg-white shadow rounded-lg p-6 mt-6 border-l-4 border-red-400">
      <h2 class="text-lg font-semibold text-red-900 mb-4">Danger Zone</h2>
      <p class="text-sm text-gray-600 mb-4">
        Once you delete your account, there is no going back. Please be certain.
      </p>
      <button
        type="button"
        class="btn bg-red-600 hover:bg-red-700 text-white"
        on:click={() => {
          if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
            // TODO: Implement account deletion
            alert('Account deletion not yet implemented');
          }
        }}
      >
        Delete Account
      </button>
    </div>
  </div>
</div>