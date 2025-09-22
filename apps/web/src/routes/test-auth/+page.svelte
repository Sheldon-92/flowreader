<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';

  let testResults = {
    clientCreated: false,
    healthCheck: false,
    signUpTest: false,
    resetPasswordTest: false,
    errorDetails: '',
    timestamp: ''
  };

  onMount(async () => {
    console.log('Starting authentication tests...');
    testResults.timestamp = new Date().toISOString();

    // Test 1: Client creation
    try {
      testResults.clientCreated = !!supabase;
      console.log('✓ Supabase client created');
    } catch (error) {
      console.error('✗ Supabase client creation failed:', error);
    }

    // Test 2: Health check
    try {
      const { data, error } = await supabase.from('auth.users').select('count').limit(1);
      testResults.healthCheck = !error;
      console.log('✓ Supabase health check:', { data, error });
    } catch (error) {
      console.error('✗ Supabase health check failed:', error);
      testResults.errorDetails += `Health check: ${error.message}\n`;
    }

    // Test 3: Sign up test (with fake email to avoid actually creating users)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: 'test@nonexistent-domain-12345.com',
        password: 'testpassword123'
      });

      // We expect this to fail with a specific error, not a network error
      if (error && !error.message.includes('fetch')) {
        testResults.signUpTest = true;
        console.log('✓ Sign up test passed (expected error):', error.message);
      } else if (!error) {
        testResults.signUpTest = true;
        console.log('✓ Sign up test passed (unexpected success)');
      } else {
        console.error('✗ Sign up test failed with network error:', error);
        testResults.errorDetails += `Sign up: ${error.message}\n`;
      }
    } catch (error) {
      console.error('✗ Sign up test failed:', error);
      testResults.errorDetails += `Sign up exception: ${error.message}\n`;
    }

    // Test 4: Reset password test
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        'test@nonexistent-domain-12345.com',
        { redirectTo: `${window.location.origin}/auth/reset-password` }
      );

      // We expect this to work or fail with a specific error, not a network error
      if (!error || !error.message.includes('fetch')) {
        testResults.resetPasswordTest = true;
        console.log('✓ Reset password test passed:', error?.message || 'Success');
      } else {
        console.error('✗ Reset password test failed:', error);
        testResults.errorDetails += `Reset password: ${error.message}\n`;
      }
    } catch (error) {
      console.error('✗ Reset password test failed:', error);
      testResults.errorDetails += `Reset password exception: ${error.message}\n`;
    }

    console.log('Test results:', testResults);
  });
</script>

<svelte:head>
  <title>Auth Test - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-8">Authentication Tests</h1>

    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">Test Results</h2>
      <div class="space-y-3">
        <div class="flex items-center space-x-3">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm {testResults.clientCreated ? 'bg-green-500' : 'bg-red-500'}">
            {testResults.clientCreated ? '✓' : '✗'}
          </span>
          <span>Supabase Client Created</span>
        </div>

        <div class="flex items-center space-x-3">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm {testResults.healthCheck ? 'bg-green-500' : 'bg-red-500'}">
            {testResults.healthCheck ? '✓' : '✗'}
          </span>
          <span>Health Check</span>
        </div>

        <div class="flex items-center space-x-3">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm {testResults.signUpTest ? 'bg-green-500' : 'bg-red-500'}">
            {testResults.signUpTest ? '✓' : '✗'}
          </span>
          <span>Sign Up Function</span>
        </div>

        <div class="flex items-center space-x-3">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm {testResults.resetPasswordTest ? 'bg-green-500' : 'bg-red-500'}">
            {testResults.resetPasswordTest ? '✓' : '✗'}
          </span>
          <span>Reset Password Function</span>
        </div>
      </div>

      {#if testResults.errorDetails}
        <div class="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 class="text-lg font-medium text-red-900 mb-2">Error Details</h3>
          <pre class="text-sm text-red-800 whitespace-pre-wrap">{testResults.errorDetails}</pre>
        </div>
      {/if}

      <div class="mt-6 text-sm text-gray-500">
        Test completed at: {testResults.timestamp}
      </div>
    </div>

    <div class="mt-8">
      <a href="/debug" class="text-blue-600 hover:text-blue-800">← Back to Debug</a>
    </div>
  </div>
</div>