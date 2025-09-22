<script lang="ts">
  import { onMount } from 'svelte';
  import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

  let debugInfo = {
    url: '',
    keyPresent: false,
    urlReachable: false,
    environment: '',
    timestamp: ''
  };

  onMount(async () => {
    debugInfo.url = PUBLIC_SUPABASE_URL || 'MISSING';
    debugInfo.keyPresent = !!PUBLIC_SUPABASE_ANON_KEY;
    debugInfo.environment = import.meta.env.MODE || 'unknown';
    debugInfo.timestamp = new Date().toISOString();

    // Detailed validation
    console.log('=== DETAILED DEBUG INFO ===');
    console.log('Supabase URL raw:', PUBLIC_SUPABASE_URL);
    console.log('Supabase URL length:', PUBLIC_SUPABASE_URL?.length);
    console.log('Supabase URL type:', typeof PUBLIC_SUPABASE_URL);
    console.log('API Key raw:', PUBLIC_SUPABASE_ANON_KEY);
    console.log('API Key length:', PUBLIC_SUPABASE_ANON_KEY?.length);
    console.log('API Key type:', typeof PUBLIC_SUPABASE_ANON_KEY);

    // Check for invalid characters
    if (PUBLIC_SUPABASE_URL) {
      const urlPattern = /^https?:\/\/.+/;
      console.log('URL matches pattern:', urlPattern.test(PUBLIC_SUPABASE_URL));
      console.log('URL contains newlines:', PUBLIC_SUPABASE_URL.includes('\n'));
      console.log('URL contains spaces:', PUBLIC_SUPABASE_URL.includes(' '));
    }

    // Test URL reachability with better error handling
    try {
      console.log('Testing URL:', `${PUBLIC_SUPABASE_URL}/rest/v1/`);
      const response = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': PUBLIC_SUPABASE_ANON_KEY
        }
      });
      debugInfo.urlReachable = response.ok;
      console.log('Supabase test response:', response.status, response.statusText);
    } catch (error) {
      console.error('Supabase test failed:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      debugInfo.urlReachable = false;
    }

    console.log('Debug info:', debugInfo);
  });
</script>

<svelte:head>
  <title>Debug - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-8">FlowReader Debug Information</h1>

    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">Environment Variables</h2>
      <div class="space-y-2 font-mono text-sm">
        <div class="flex">
          <span class="w-40 font-medium">Supabase URL:</span>
          <span class="text-blue-600">{debugInfo.url}</span>
        </div>
        <div class="flex">
          <span class="w-40 font-medium">API Key Present:</span>
          <span class="text-{debugInfo.keyPresent ? 'green' : 'red'}-600">
            {debugInfo.keyPresent ? 'Yes' : 'No'}
          </span>
        </div>
        <div class="flex">
          <span class="w-40 font-medium">Environment:</span>
          <span class="text-gray-600">{debugInfo.environment}</span>
        </div>
        <div class="flex">
          <span class="w-40 font-medium">URL Reachable:</span>
          <span class="text-{debugInfo.urlReachable ? 'green' : 'red'}-600">
            {debugInfo.urlReachable ? 'Yes' : 'No'}
          </span>
        </div>
        <div class="flex">
          <span class="w-40 font-medium">Timestamp:</span>
          <span class="text-gray-600">{debugInfo.timestamp}</span>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold mb-4">Browser Information</h2>
      <div class="space-y-2 font-mono text-sm">
        <div class="flex">
          <span class="w-40 font-medium">User Agent:</span>
          <span class="text-gray-600 break-all">{typeof window !== 'undefined' ? window.navigator.userAgent : 'Unknown'}</span>
        </div>
        <div class="flex">
          <span class="w-40 font-medium">Current URL:</span>
          <span class="text-blue-600">{typeof window !== 'undefined' ? window.location.href : 'Unknown'}</span>
        </div>
      </div>
    </div>

    <div class="mt-8">
      <a href="/auth/register" class="text-blue-600 hover:text-blue-800">← Back to Register</a>
    </div>
  </div>
</div>