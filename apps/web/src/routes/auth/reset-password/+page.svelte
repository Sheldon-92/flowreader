<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';

  let password = '';
  let confirmPassword = '';
  let loading = false;
  let error = '';
  let success = false;

  onMount(async () => {
    // Handle the password reset token from URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (sessionError) {
        console.error('Error setting session:', sessionError);
        error = 'Invalid or expired reset link';
        return;
      }
    } else {
      error = 'Invalid reset link. Please request a new password reset.';
    }
  });

  async function handleUpdatePassword() {
    if (!password || !confirmPassword) {
      error = 'Please fill in all fields';
      return;
    }

    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (password.length < 8) {
      error = 'Password must be at least 8 characters long';
      return;
    }

    try {
      loading = true;
      error = '';

      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        error = updateError.message;
        return;
      }

      success = true;

      // Redirect to login after 3 seconds
      setTimeout(() => {
        goto('/auth/login');
      }, 3000);

    } catch (e) {
      error = 'An unexpected error occurred';
      console.error('Update password error:', e);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Reset Password - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
  <div class="max-w-md w-full space-y-8">
    <!-- Header -->
    <div class="text-center">
      <div class="flex items-center justify-center space-x-2 mb-6">
        <div class="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
          <span class="text-white font-bold text-xl">F</span>
        </div>
        <span class="text-2xl font-bold text-primary-900">FlowReader</span>
      </div>
      <h2 class="text-3xl font-bold text-gray-900">Set new password</h2>
      <p class="mt-2 text-gray-600">Enter your new password below</p>
    </div>

    {#if success}
      <!-- Success Message -->
      <div class="bg-white py-8 px-6 shadow-lg rounded-lg text-center">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-2">Password updated!</h3>
        <p class="text-gray-600 mb-6">
          Your password has been successfully updated. You'll be redirected to the login page in a few seconds.
        </p>
        <a href="/auth/login" class="btn btn-primary">
          Go to Sign In
        </a>
      </div>
    {:else}
      <!-- Password Form -->
      <div class="bg-white py-8 px-6 shadow-lg rounded-lg">
        <div class="space-y-6">
          {#if error}
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
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

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <input
              type="password"
              id="password"
              bind:value={password}
              required
              minlength="8"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="At least 8 characters"
            />
            <p class="text-xs text-gray-500 mt-1">Must be at least 8 characters long</p>
          </div>

          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              bind:value={confirmPassword}
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Re-enter your new password"
            />
          </div>

          <button
            type="button"
            on:click={handleUpdatePassword}
            disabled={loading}
            class="w-full btn btn-primary py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating password...' : 'Update Password'}
          </button>
        </div>
      </div>
    {/if}

    <!-- Back to Login -->
    <div class="text-center">
      <a href="/auth/login" class="text-sm text-gray-500 hover:text-gray-700">
        ← Back to sign in
      </a>
    </div>
  </div>
</div>