<!-- Landing/Dashboard page -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';

  export let data: PageData;
  $: ({ session } = data);

  // Redirect authenticated users to library
  $: if (session) {
    goto('/library');
  }
</script>

<svelte:head>
  <title>FlowReader - AI-Enhanced Reading Experience</title>
</svelte:head>

{#if !session}
  <!-- Landing page for unauthenticated users -->
  <div class="min-h-screen bg-gradient-to-br from-primary-50 to-accent-50">
    <!-- Header -->
    <header class="relative px-4 lg:px-6 h-16 flex items-center">
      <div class="container mx-auto flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-lg">F</span>
          </div>
          <span class="text-xl font-bold text-primary-900">FlowReader</span>
        </div>
        
        <nav class="hidden md:flex items-center space-x-6">
          <a href="/auth/login" class="text-gray-700 hover:text-primary-600 font-medium transition-colors">
            Sign In
          </a>
          <a href="/auth/register" class="btn btn-primary">
            Get Started
          </a>
        </nav>
      </div>
    </header>

    <!-- Hero Section -->
    <main class="container mx-auto px-4 py-16">
      <div class="text-center max-w-4xl mx-auto">
        <h1 class="text-4xl md:text-6xl font-bold text-primary-900 mb-6">
          Reading Reimagined with
          <span class="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-600">
            AI & Audio
          </span>
        </h1>
        
        <p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Transform your reading experience with seamless audio-text synchronization, 
          intelligent AI conversations, and personalized insights.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <a href="/auth/register" class="btn btn-primary text-lg px-8 py-3">
            Start Reading Free
          </a>
          <a href="#features" class="btn btn-secondary text-lg px-8 py-3">
            Learn More
          </a>
        </div>

        <!-- Feature preview -->
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-3xl mx-auto">
          <div class="grid md:grid-cols-3 gap-8">
            <div class="text-center">
              <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
              </div>
              <h3 class="font-semibold text-primary-900 mb-2">Smart Reading</h3>
              <p class="text-sm text-gray-600">Upload EPUBs and read with intelligent text processing</p>
            </div>

            <div class="text-center">
              <div class="w-12 h-12 bg-accent-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg class="w-6 h-6 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9.879 16.121A3 3 0 1012.015 11L11 14l-4-1 3.015-2.121z"/>
                </svg>
              </div>
              <h3 class="font-semibold text-primary-900 mb-2">Audio Sync</h3>
              <p class="text-sm text-gray-600">Listen while reading with perfect text-audio synchronization</p>
            </div>

            <div class="text-center">
              <div class="w-12 h-12 bg-ai-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg class="w-6 h-6 text-ai-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
              </div>
              <h3 class="font-semibold text-primary-900 mb-2">AI Companion</h3>
              <p class="text-sm text-gray-600">Ask questions and get insights about your reading</p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Features Section -->
    <section id="features" class="bg-white py-20">
      <div class="container mx-auto px-4">
        <div class="text-center max-w-3xl mx-auto mb-16">
          <h2 class="text-3xl md:text-4xl font-bold text-primary-900 mb-4">
            Everything You Need for Enhanced Reading
          </h2>
          <p class="text-lg text-gray-600">
            FlowReader combines the best of traditional reading with modern AI and audio technology
          </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div class="p-6">
            <h3 class="text-xl font-semibold text-primary-900 mb-3">Multi-Modal Reading</h3>
            <p class="text-gray-600 mb-4">
              Switch seamlessly between reading, listening, and combined modes for the perfect experience in any situation.
            </p>
          </div>

          <div class="p-6">
            <h3 class="text-xl font-semibold text-primary-900 mb-3">AI-Powered Insights</h3>
            <p class="text-gray-600 mb-4">
              Get instant explanations, summaries, and insights about your reading with our intelligent AI companion.
            </p>
          </div>

          <div class="p-6">
            <h3 class="text-xl font-semibold text-primary-900 mb-3">Smart Annotations</h3>
            <p class="text-gray-600 mb-4">
              Highlight text, take notes, and save AI conversations for later review and knowledge building.
            </p>
          </div>

          <div class="p-6">
            <h3 class="text-xl font-semibold text-primary-900 mb-3">Cross-Device Sync</h3>
            <p class="text-gray-600 mb-4">
              Your reading progress, notes, and preferences sync instantly across all your devices.
            </p>
          </div>

          <div class="p-6">
            <h3 class="text-xl font-semibold text-primary-900 mb-3">Professional Audio</h3>
            <p class="text-gray-600 mb-4">
              High-quality neural text-to-speech with multiple voices and precise synchronization.
            </p>
          </div>

          <div class="p-6">
            <h3 class="text-xl font-semibold text-primary-900 mb-3">Privacy First</h3>
            <p class="text-gray-600 mb-4">
              Your books and reading data are processed securely with privacy and security as top priorities.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="bg-primary-900 text-white py-16">
      <div class="container mx-auto px-4 text-center">
        <h2 class="text-3xl md:text-4xl font-bold mb-4">
          Ready to Transform Your Reading?
        </h2>
        <p class="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
          Join thousands of readers who have discovered the power of AI-enhanced, multi-modal reading.
        </p>
        
        <a href="/auth/register" class="btn bg-white text-primary-900 hover:bg-primary-50 text-lg px-8 py-3 inline-block">
          Start Your Free Trial
        </a>
      </div>
    </section>

    <!-- Footer -->
    <footer class="bg-gray-50 py-8">
      <div class="container mx-auto px-4 text-center">
        <div class="flex items-center justify-center space-x-2 mb-4">
          <div class="w-6 h-6 bg-primary-600 rounded flex items-center justify-center">
            <span class="text-white font-bold text-sm">F</span>
          </div>
          <span class="font-semibold text-primary-900">FlowReader</span>
        </div>
        <p class="text-gray-600 text-sm">
          © 2024 FlowReader. Transforming reading through AI and audio technology.
        </p>
      </div>
    </footer>
  </div>
{:else}
  <!-- Authenticated users get redirected, but show loading state briefly -->
  <div class="min-h-screen bg-white flex items-center justify-center">
    <div class="text-center">
      <div class="loading-spinner w-8 h-8 mx-auto mb-4"></div>
      <p class="text-gray-600">Redirecting to your library...</p>
    </div>
  </div>
{/if}