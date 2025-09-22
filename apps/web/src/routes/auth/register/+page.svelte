<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import type { PageData } from './$types';

  export let data: PageData;
  $: ({ session } = data);

  let email = '';
  let password = '';
  let confirmPassword = '';
  let loading = false;
  let error = '';
  let registrationComplete = false;

  // Redirect if already authenticated
  $: if (session) {
    goto('/library');
  }

  async function handleSignUp() {
    console.log('handleSignUp called');

    if (!email || !password || !confirmPassword) {
      error = 'Please fill in all fields';
      return;
    }

    if (!email.includes('@')) {
      error = 'Please enter a valid email address';
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
      console.log('Attempting to sign up with Supabase...');

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            subscription_tier: 'trial'
          }
        }
      });

      console.log('Supabase response:', { authData, signUpError });

      if (signUpError) {
        error = signUpError.message;
        console.error('Supabase signup error:', signUpError);
        return;
      }

      if (authData.user && !authData.session) {
        // Email confirmation required
        console.log('Registration complete, email confirmation required');
        registrationComplete = true;
      } else if (authData.session) {
        // Auto-signed in (email confirmation disabled)
        console.log('Auto-signed in, redirecting to library');
        goto('/library');
      } else {
        console.log('Unexpected response state:', authData);
        registrationComplete = true; // Show success message anyway
      }

    } catch (e) {
      error = 'An unexpected error occurred';
      console.error('Sign up error:', e);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign Up - FlowReader</title>
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
      <h2 class="text-3xl font-bold text-gray-900">Create your account</h2>
      <p class="mt-2 text-gray-600">Start your AI-enhanced reading journey</p>
    </div>

    {#if registrationComplete}
      <!-- Registration Success -->
      <div class="bg-white py-8 px-6 shadow-lg rounded-lg text-center">
        <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-gray-900 mb-2">Check your email</h3>
        <p class="text-gray-600 mb-6">
          We've sent a confirmation link to <strong>{email}</strong>.
          Click the link in the email to activate your account.
        </p>
        <a href="/auth/login" class="btn btn-primary">
          Go to Sign In
        </a>
      </div>
    {:else}
      <!-- Sign Up Form -->
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

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-2">
              Password
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
              Confirm password
            </label>
            <input
              type="password"
              id="confirmPassword"
              bind:value={confirmPassword}
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Re-enter your password"
            />
          </div>

          <div class="text-xs text-gray-500">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </div>

          <button
            type="button"
            on:click={handleSignUp}
            disabled={loading}
            class="w-full btn btn-primary py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </div>
      </div>
    {/if}

    <!-- Sign In Link -->
    <div class="text-center">
      <p class="text-gray-600">
        Already have an account?
        <a href="/auth/login" class="font-medium text-primary-600 hover:text-primary-500">
          Sign in
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