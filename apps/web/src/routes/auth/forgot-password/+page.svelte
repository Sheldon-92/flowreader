<script lang="ts">
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';

  let email = '';
  let loading = false;
  let error = '';
  let success = false;

  async function handleResetPassword() {
    if (!email) {
      error = 'Please enter your email address';
      return;
    }

    if (!email.includes('@')) {
      error = 'Please enter a valid email address';
      return;
    }

    try {
      loading = true;
      error = '';

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      });

      if (resetError) {
        error = resetError.message;
        return;
      }

      success = true;
    } catch (e) {
      error = 'An unexpected error occurred';
      console.error('Reset password error:', e);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Forgot Password - FlowReader</title>
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
      <h2 class="text-3xl font-bold text-gray-900">Reset your password</h2>
      <p class="mt-2 text-gray-600">Enter your email and we'll send you a reset link</p>
    </div>

    {#if success}
      <!-- Success Message -->
      <div class="bg-white py-8 px-6 shadow-lg rounded-lg text-center">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-2">Check your email</h3>
        <p class="text-gray-600 mb-6">
          We've sent a password reset link to <strong>{email}</strong>.
          Click the link in the email to reset your password.
        </p>
        <div class="space-y-3">
          <a href="/auth/login" class="btn btn-primary w-full">
            Back to Sign In
          </a>
          <button
            type="button"
            on:click={() => { success = false; email = ''; }}
            class="btn btn-secondary w-full"
          >
            Send Another Email
          </button>
        </div>
      </div>
    {:else}
      <!-- Reset Form -->
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
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
              Email address
            </label>
            <input
              type="email"
              id="email"
              bind:value={email}
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="button"
            on:click={handleResetPassword}
            disabled={loading}
            class="w-full btn btn-primary py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending reset link...' : 'Send Reset Link'}
          </button>
        </div>
      </div>
    {/if}

    <!-- Navigation Links -->
    <div class="text-center space-y-2">
      <p class="text-gray-600">
        Remember your password?
        <a href="/auth/login" class="font-medium text-primary-600 hover:text-primary-500">
          Sign in
        </a>
      </p>
      <p class="text-gray-600">
        Don't have an account?
        <a href="/auth/register" class="font-medium text-primary-600 hover:text-primary-500">
          Sign up
        </a>
      </p>
    </div>

    <!-- Back to Home -->
    <div class="text-center">
      <a href="/" class="text-sm text-gray-500 hover:text-gray-700">
        ← Back to home
      </a>
    </div>
  </div>
</div>