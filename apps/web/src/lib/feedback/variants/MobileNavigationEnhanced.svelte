<!-- Mobile Navigation Enhanced Variant (B) -->
<!-- Improved mobile reading navigation with gesture support and better UI -->

<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { trackEvent } from './ABTestManager';

  export let currentPage: number = 1;
  export let totalPages: number = 100;
  export let chapterTitle: string = '';
  export let bookTitle: string = '';

  const dispatch = createEventDispatcher();

  let navigationContainer: HTMLElement;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isDragging = false;
  let showQuickNav = false;
  let showPageJumper = false;

  // Enhanced features
  let gestureEnabled = true;
  let hapticFeedback = true;
  let pagePreview = false;

  onMount(() => {
    trackEvent('mobile_nav_loaded', {
      testId: 'navigation_mobile_v1',
      variantId: 'enhanced',
      currentPage,
      totalPages,
      isMobile: window.innerWidth < 768
    });

    // Add global gesture listeners
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  });

  function handleTouchStart(event: TouchEvent) {
    if (!gestureEnabled) return;

    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isDragging = false;
  }

  function handleTouchMove(event: TouchEvent) {
    if (!gestureEnabled) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    // Check if this is a horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
      if (!isDragging) {
        isDragging = true;
        event.preventDefault(); // Prevent scrolling
      }
    }
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!gestureEnabled || !isDragging) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const deltaTime = Date.now() - touchStartTime;

    // Swipe detection thresholds
    const minSwipeDistance = 50;
    const maxSwipeTime = 500;
    const maxVerticalDeviation = 100;

    if (
      Math.abs(deltaX) > minSwipeDistance &&
      Math.abs(deltaY) < maxVerticalDeviation &&
      deltaTime < maxSwipeTime
    ) {
      if (deltaX > 0) {
        // Swipe right - previous page
        handlePreviousPage('swipe');
      } else {
        // Swipe left - next page
        handleNextPage('swipe');
      }

      // Haptic feedback
      if (hapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }

    isDragging = false;
  }

  function handleNextPage(method: 'button' | 'swipe' | 'tap' = 'button') {
    if (currentPage >= totalPages) return;

    const startTime = Date.now();
    currentPage += 1;

    dispatch('pageChange', { page: currentPage, direction: 'next' });

    trackEvent('page_navigation', {
      testId: 'navigation_mobile_v1',
      variantId: 'enhanced',
      direction: 'next',
      method,
      currentPage,
      totalPages,
      navigationTime: Date.now() - startTime
    });
  }

  function handlePreviousPage(method: 'button' | 'swipe' | 'tap' = 'button') {
    if (currentPage <= 1) return;

    const startTime = Date.now();
    currentPage -= 1;

    dispatch('pageChange', { page: currentPage, direction: 'previous' });

    trackEvent('page_navigation', {
      testId: 'navigation_mobile_v1',
      variantId: 'enhanced',
      direction: 'previous',
      method,
      currentPage,
      totalPages,
      navigationTime: Date.now() - startTime
    });
  }

  function jumpToPage(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;

    const startTime = Date.now();
    const previousPage = currentPage;
    currentPage = page;

    dispatch('pageChange', { page: currentPage, direction: page > previousPage ? 'next' : 'previous' });

    trackEvent('page_jump', {
      testId: 'navigation_mobile_v1',
      variantId: 'enhanced',
      fromPage: previousPage,
      toPage: page,
      jumpDistance: Math.abs(page - previousPage),
      navigationTime: Date.now() - startTime
    });

    showPageJumper = false;
  }

  function toggleQuickNav() {
    showQuickNav = !showQuickNav;

    trackEvent('quick_nav_toggle', {
      testId: 'navigation_mobile_v1',
      variantId: 'enhanced',
      isShowing: showQuickNav
    });
  }

  function togglePageJumper() {
    showPageJumper = !showPageJumper;

    trackEvent('page_jumper_toggle', {
      testId: 'navigation_mobile_v1',
      variantId: 'enhanced',
      isShowing: showPageJumper
    });
  }

  // Calculate progress percentage
  $: progressPercentage = ((currentPage - 1) / (totalPages - 1)) * 100;
</script>

<div bind:this={navigationContainer} class="mobile-nav-enhanced">
  <!-- Main Navigation Bar -->
  <div class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
    <!-- Progress Bar -->
    <div class="h-1 bg-gray-200">
      <div
        class="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
        style="width: {progressPercentage}%"
      ></div>
    </div>

    <!-- Main Controls -->
    <div class="px-4 py-3">
      <div class="flex items-center justify-between">
        <!-- Previous Page -->
        <button
          on:click={() => handlePreviousPage('button')}
          disabled={currentPage <= 1}
          class="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
        >
          <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>

        <!-- Page Info & Quick Actions -->
        <div class="flex-1 mx-4">
          <div class="text-center">
            <!-- Current Position -->
            <button
              on:click={togglePageJumper}
              class="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
            >
              {currentPage} of {totalPages}
            </button>

            <!-- Chapter/Book Info -->
            <div class="text-xs text-gray-500 mt-1 truncate">
              {chapterTitle || bookTitle}
            </div>

            <!-- Gesture Hint -->
            {#if gestureEnabled}
              <div class="flex items-center justify-center mt-1 text-xs text-gray-400">
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l-4-4m0 0l4-4m-4 4h18"/>
                </svg>
                Swipe to navigate
                <svg class="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                </svg>
              </div>
            {/if}
          </div>
        </div>

        <!-- Next Page -->
        <button
          on:click={() => handleNextPage('button')}
          disabled={currentPage >= totalPages}
          class="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
        >
          <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <!-- Enhanced Controls Row -->
      <div class="flex items-center justify-center mt-3 space-x-4">
        <!-- Quick Nav Toggle -->
        <button
          on:click={toggleQuickNav}
          class="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
        >
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
          Chapters
        </button>

        <!-- Bookmark -->
        <button
          on:click={() => dispatch('bookmark', { page: currentPage })}
          class="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-all duration-200"
        >
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
          </svg>
          Bookmark
        </button>

        <!-- Settings -->
        <button
          on:click={() => dispatch('settings')}
          class="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200"
        >
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Settings
        </button>
      </div>
    </div>
  </div>

  <!-- Page Jumper Modal -->
  {#if showPageJumper}
    <div class="fixed inset-0 bg-black bg-opacity-50 z-60 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg p-6 w-full max-w-sm">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Jump to Page</h3>

        <div class="space-y-4">
          <!-- Page Input -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Page Number</label>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              on:change={(e) => jumpToPage(parseInt(e.target.value))}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <!-- Quick Jump Options -->
          <div class="grid grid-cols-3 gap-2">
            <button
              on:click={() => jumpToPage(1)}
              class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Start
            </button>
            <button
              on:click={() => jumpToPage(Math.floor(totalPages / 2))}
              class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Middle
            </button>
            <button
              on:click={() => jumpToPage(totalPages)}
              class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              End
            </button>
          </div>
        </div>

        <div class="flex space-x-3 mt-6">
          <button
            on:click={() => showPageJumper = false}
            class="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Quick Navigation Sidebar -->
  {#if showQuickNav}
    <div class="fixed inset-0 bg-black bg-opacity-50 z-60" on:click={() => showQuickNav = false}>
      <div class="fixed left-0 top-0 bottom-0 w-80 bg-white shadow-xl transform transition-transform duration-300">
        <div class="p-4 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">Navigation</h3>
            <button
              on:click={() => showQuickNav = false}
              class="p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="p-4">
          <div class="space-y-3">
            <!-- Chapter list would go here -->
            <div class="text-sm text-gray-600">
              Enhanced navigation with chapters, bookmarks, and quick access would be implemented here.
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .mobile-nav-enhanced {
    /* Touch-friendly interactive areas */
  }

  .safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* Enhanced touch targets for mobile */
  .mobile-nav-enhanced button {
    min-height: 44px;
    min-width: 44px;
  }

  /* Smooth transitions for gestures */
  .mobile-nav-enhanced .transition-all {
    transition-property: all;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Active state feedback */
  .mobile-nav-enhanced button:active {
    transform: scale(0.95);
  }

  /* Better visibility for progress bar */
  .mobile-nav-enhanced .h-1 {
    background: linear-gradient(90deg, #e5e7eb 0%, #d1d5db 100%);
  }
</style>