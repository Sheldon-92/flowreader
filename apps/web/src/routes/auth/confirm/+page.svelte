<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';

  let loading = true;
  let error = '';
  let success = false;

  onMount(async () => {
    try {
      // Handle the email confirmation from URL
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (type === 'signup' && accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (sessionError) {
          console.error('Error setting session:', sessionError);
          error = 'Invalid or expired confirmation link';
          return;
        }

        success = true;

        // Redirect to library after 3 seconds
        setTimeout(() => {
          goto('/library');
        }, 3000);
      } else {
        error = 'Invalid confirmation link. Please check your email for the correct link.';
      }
    } catch (e) {
      console.error('Confirmation error:', e);
      error = 'An unexpected error occurred during confirmation';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Confirm Email - FlowReader</title>
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
    </div>

    {#if loading}
      <!-- Loading State -->
      <div class="bg-white py-8 px-6 shadow-lg rounded-lg text-center">
        <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-2">Confirming your email</h3>
        <p class="text-gray-600">Please wait while we verify your email address...</p>
      </div>
    {:else if success}
      <!-- Success State -->
      <div class="bg-white py-8 px-6 shadow-lg rounded-lg text-center">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-2">Email confirmed!</h3>
        <p class="text-gray-600 mb-6">
          Your email has been successfully verified. You'll be redirected to your library in a few seconds.
        </p>
        <a href="/library" class="btn btn-primary">
          Go to Library
        </a>
      </div>
    {:else if error}
      <!-- Error State -->
      <div class="bg-white py-8 px-6 shadow-lg rounded-lg text-center">
        <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-2">Confirmation failed</h3>
        <p class="text-gray-600 mb-6">{error}</p>
        <div class="space-y-3">
          <a href="/auth/register" class="btn btn-primary w-full">
            Try Again
          </a>
          <a href="/auth/login" class="btn btn-secondary w-full">
            Sign In Instead
          </a>
        </div>
      </div>
    {/if}

    <!-- Back to Home -->
    <div class="text-center">
      <a href="/" class="text-sm text-gray-500 hover:text-gray-700">
        ← Back to home
      </a>
    </div>
  </div>
</div>