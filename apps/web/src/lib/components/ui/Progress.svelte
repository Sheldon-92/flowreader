<script lang="ts">
  export let value: number = 0;
  export let max: number = 100;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' = 'primary';
  export let showLabel: boolean = false;
  export let label: string = '';

  // Calculate percentage
  $: percentage = Math.min(100, Math.max(0, (value / max) * 100));

  // Size classes
  $: sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  }[size];

  // Variant classes for the progress bar
  $: variantClasses = {
    default: 'bg-gray-600',
    primary: 'bg-primary-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    danger: 'bg-red-600'
  }[variant];

  // Format percentage for display
  $: displayPercentage = Math.round(percentage);
</script>

<div class="w-full">
  {#if showLabel || label}
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      {#if showLabel}
        <span class="text-sm text-gray-500 dark:text-gray-400">
          {displayPercentage}%
        </span>
      {/if}
    </div>
  {/if}
  
  <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full {sizeClasses}">
    <div
      class="{sizeClasses} rounded-full transition-all duration-300 {variantClasses}"
      style="width: {percentage}%"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin="0"
      aria-valuemax={max}
    ></div>
  </div>
</div>