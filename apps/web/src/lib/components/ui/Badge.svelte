<script lang="ts">
  export let variant: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' = 'default';
  export let size: 'sm' | 'md' = 'md';
  export let dot: boolean = false;

  $: variantClasses = {
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    primary: 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300',
    secondary: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
  }[variant];

  $: sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm'
  }[size];

  $: dotColor = {
    default: 'bg-gray-400',
    primary: 'bg-primary-600',
    secondary: 'bg-gray-400',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    danger: 'bg-red-500',
    info: 'bg-blue-500'
  }[variant];

  $: classes = `inline-flex items-center font-medium rounded-full ${variantClasses} ${sizeClasses}`;
</script>

<span class={classes}>
  {#if dot}
    <span class="w-1.5 h-1.5 rounded-full {dotColor} mr-1.5"></span>
  {/if}
  <slot />
</span>