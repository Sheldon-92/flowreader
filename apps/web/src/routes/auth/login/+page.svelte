<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import type { ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  $: ({ session } = data);

  let email = '';
  let password = '';
  let loading = false;
</script>

<svelte:head>
  <title>Sign In - FlowReader</title>
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
      <h2 class="text-3xl font-bold text-gray-900">Welcome back</h2>
      <p class="mt-2 text-gray-600">Sign in to your account to continue reading</p>
    </div>

    <!-- Sign In Form -->
    <div class="bg-white py-8 px-6 shadow-lg rounded-lg">
      <form method="POST" use:enhance={() => {
        loading = true;
        return async ({ update }) => {
          loading = false;
          await update();
        };
      }} class="space-y-6">
        {#if form?.error}
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm text-red-800">{form.error}</p>
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
            name="email"
            id="email"
            bind:value={email}
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            type="password"
            name="password"
            id="password"
            bind:value={password}
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          class="w-full btn btn-primary py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>

    <!-- Sign Up Link -->
    <div class="text-center">
      <p class="text-gray-600">
        Don't have an account?
        <a href="/auth/register" class="font-medium text-primary-600 hover:text-primary-500">
          Sign up for free
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