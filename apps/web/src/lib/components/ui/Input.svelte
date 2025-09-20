<script lang="ts">
  export let type: 'text' | 'email' | 'password' | 'search' | 'number' = 'text';
  export let value: string | number = '';
  export let placeholder: string = '';
  export let disabled: boolean = false;
  export let required: boolean = false;
  export let error: string = '';
  export let label: string = '';
  export let id: string = '';
  export let fullWidth: boolean = true;

  // Generate id if not provided
  if (!id && label) {
    id = label.toLowerCase().replace(/\s+/g, '-');
  }

  $: inputClasses = `
    px-3 py-2 border rounded-lg transition-colors
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
    disabled:opacity-50 disabled:cursor-not-allowed
    ${error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'}
    ${fullWidth ? 'w-full' : ''}
  `;
</script>

<div class={fullWidth ? 'w-full' : ''}>
  {#if label}
    <label for={id} class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      {label}
      {#if required}
        <span class="text-red-500">*</span>
      {/if}
    </label>
  {/if}
  
  {#if type === 'text'}
    <input
      {id}
      type="text"
      {placeholder}
      {disabled}
      {required}
      bind:value
      class={inputClasses}
      on:input
      on:change
      on:focus
      on:blur
      on:keydown
      on:keyup
    />
  {:else if type === 'email'}
    <input
      {id}
      type="email"
      {placeholder}
      {disabled}
      {required}
      bind:value
      class={inputClasses}
      on:input
      on:change
      on:focus
      on:blur
      on:keydown
      on:keyup
    />
  {:else if type === 'password'}
    <input
      {id}
      type="password"
      {placeholder}
      {disabled}
      {required}
      bind:value
      class={inputClasses}
      on:input
      on:change
      on:focus
      on:blur
      on:keydown
      on:keyup
    />
  {:else if type === 'search'}
    <input
      {id}
      type="search"
      {placeholder}
      {disabled}
      {required}
      bind:value
      class={inputClasses}
      on:input
      on:change
      on:focus
      on:blur
      on:keydown
      on:keyup
    />
  {:else if type === 'number'}
    <input
      {id}
      type="number"
      {placeholder}
      {disabled}
      {required}
      bind:value
      class={inputClasses}
      on:input
      on:change
      on:focus
      on:blur
      on:keydown
      on:keyup
    />
  {:else}
    <input
      {id}
      type="text"
      {placeholder}
      {disabled}
      {required}
      bind:value
      class={inputClasses}
      on:input
      on:change
      on:focus
      on:blur
      on:keydown
      on:keyup
    />
  {/if}
  
  {#if error}
    <p class="mt-1 text-sm text-red-600 dark:text-red-400">
      {error}
    </p>
  {/if}
</div>