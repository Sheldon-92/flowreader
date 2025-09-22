<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '@supabase/supabase-js';

  let testResult = {
    directTest: false,
    error: '',
    timestamp: ''
  };

  onMount(async () => {
    testResult.timestamp = new Date().toISOString();

    try {
      // Direct test with hardcoded values (temporarily)
      const supabaseUrl = 'https://nlzayvpmyrjyveropyhq.supabase.co';
      const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5semF5dnBteXJqeXZlcm9weWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0Nzk4NTAsImV4cCI6MjA3NDA1NTg1MH0.gHvAlZneQCm2K6p1jCBb__LvTlGr18lngbgqDnARiks';

      console.log('Testing with direct values...');
      console.log('URL:', supabaseUrl);
      console.log('Key length:', supabaseKey.length);

      const testClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      });

      // Test reset password function directly
      const { error } = await testClient.auth.resetPasswordForEmail(
        'test@example.com',
        {
          redirectTo: `${window.location.origin}/auth/reset-password`
        }
      );

      if (!error || (error && !error.message.includes('fetch'))) {
        testResult.directTest = true;
        console.log('✓ Direct test succeeded:', error?.message || 'Success');
      } else {
        testResult.directTest = false;
        testResult.error = error.message;
        console.error('✗ Direct test failed:', error);
      }

    } catch (e) {
      testResult.directTest = false;
      testResult.error = e.message;
      console.error('✗ Direct test exception:', e);
    }
  });
</script>

<svelte:head>
  <title>Direct Test - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-8">Direct Supabase Test</h1>

    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">Direct Connection Test</h2>

      <div class="flex items-center space-x-3 mb-4">
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm {testResult.directTest ? 'bg-green-500' : 'bg-red-500'}">
          {testResult.directTest ? '✓' : '✗'}
        </span>
        <span>Direct Supabase Client Test</span>
      </div>

      {#if testResult.error}
        <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 class="text-lg font-medium text-red-900 mb-2">Error Details</h3>
          <pre class="text-sm text-red-800 whitespace-pre-wrap">{testResult.error}</pre>
        </div>
      {/if}

      <div class="mt-6 text-sm text-gray-500">
        Test completed at: {testResult.timestamp}
      </div>
    </div>

    <div class="mt-8">
      <a href="/test-auth" class="text-blue-600 hover:text-blue-800">← Back to Auth Tests</a>
    </div>
  </div>
</div>