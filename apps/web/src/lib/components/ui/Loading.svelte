<script lang="ts">
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let color: 'primary' | 'white' | 'gray' = 'primary';
  export let text: string = '';

  $: sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }[size];

  $: colorClasses = {
    primary: 'border-primary-600 border-t-transparent',
    white: 'border-white border-t-transparent',
    gray: 'border-gray-300 border-t-transparent'
  }[color];

  $: classes = `${sizeClasses} border-2 rounded-full animate-spin ${colorClasses}`;
</script>

<div class="flex items-center justify-center space-x-2">
  <div class={classes}></div>
  {#if text}
    <span class="text-sm text-gray-600 dark:text-gray-400">
      {text}
    </span>
  {/if}
</div>