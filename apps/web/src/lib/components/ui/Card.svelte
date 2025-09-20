<script lang="ts">
  export let hover: boolean = false;
  export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  export let shadow: 'none' | 'sm' | 'md' | 'lg' = 'sm';

  $: paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  }[padding];

  $: shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg'
  }[shadow];

  $: hoverClasses = hover ? 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200' : '';

  $: classes = `bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 ${shadowClasses} ${hoverClasses} ${paddingClasses}`;
</script>

<div class={classes}>
  <slot />
</div>