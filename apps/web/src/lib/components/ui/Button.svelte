<script lang="ts">
  import type { ComponentEvents } from 'svelte';

  export let variant: 'primary' | 'secondary' | 'ghost' | 'ai' | 'audio' | 'danger' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled: boolean = false;
  export let loading: boolean = false;
  export let fullWidth: boolean = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';

  // Compute classes based on variant and size
  $: baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  
  $: variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
    ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800',
    ai: 'bg-ai-600 text-white hover:bg-ai-700 active:bg-ai-800',
    audio: 'bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
  }[variant];

  $: sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }[size];

  $: widthClasses = fullWidth ? 'w-full' : '';
  
  $: classes = `${baseClasses} ${variantClasses} ${sizeClasses} ${widthClasses}`;
</script>

<button 
  class={classes}
  {type}
  {disabled}
  on:click
  on:keydown
  on:keyup
  on:mouseenter
  on:mouseleave
  on:focus
  on:blur
>
  {#if loading}
    <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
  {/if}
  <slot />
</button>