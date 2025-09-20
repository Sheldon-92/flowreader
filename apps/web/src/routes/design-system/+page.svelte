<!-- Design System showcase page -->
<script lang="ts">
  import { Button, Card, Input, Modal, Badge, Progress, Loading, Toast } from '$lib/components/ui';
  
  let showModal = false;
  let showToast = false;
  let inputValue = '';
  let progressValue = 65;
  
  // Color palette
  const colors = {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a'
    },
    accent: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: '#f97316',
      600: '#e56b1f',
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12'
    }
  };
</script>

<svelte:head>
  <title>Design System - FlowReader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 py-12">
  <div class="container mx-auto px-4">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">FlowReader Design System</h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        A comprehensive component library and design guidelines for building consistent, 
        accessible, and beautiful reading experiences.
      </p>
    </div>

    <div class="max-w-6xl mx-auto space-y-16">
      <!-- Color Palette -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Color Palette</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Primary Colors -->
          <Card>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Primary Colors</h3>
            <div class="space-y-2">
              {#each Object.entries(colors.primary) as [shade, color]}
                <div class="flex items-center space-x-3">
                  <div class="w-12 h-8 rounded border" style="background-color: {color}"></div>
                  <div class="flex-1">
                    <code class="text-sm">primary-{shade}</code>
                  </div>
                  <code class="text-xs text-gray-500">{color}</code>
                </div>
              {/each}
            </div>
          </Card>

          <!-- Accent Colors -->
          <Card>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Accent Colors</h3>
            <div class="space-y-2">
              {#each Object.entries(colors.accent) as [shade, color]}
                <div class="flex items-center space-x-3">
                  <div class="w-12 h-8 rounded border" style="background-color: {color}"></div>
                  <div class="flex-1">
                    <code class="text-sm">accent-{shade}</code>
                  </div>
                  <code class="text-xs text-gray-500">{color}</code>
                </div>
              {/each}
            </div>
          </Card>
        </div>
      </section>

      <!-- Typography -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Typography</h2>
        
        <Card>
          <div class="space-y-4">
            <div>
              <h1 class="text-4xl font-bold text-gray-900">Heading 1</h1>
              <code class="text-sm text-gray-500">text-4xl font-bold</code>
            </div>
            <div>
              <h2 class="text-3xl font-bold text-gray-900">Heading 2</h2>
              <code class="text-sm text-gray-500">text-3xl font-bold</code>
            </div>
            <div>
              <h3 class="text-2xl font-bold text-gray-900">Heading 3</h3>
              <code class="text-sm text-gray-500">text-2xl font-bold</code>
            </div>
            <div>
              <h4 class="text-xl font-semibold text-gray-900">Heading 4</h4>
              <code class="text-sm text-gray-500">text-xl font-semibold</code>
            </div>
            <div>
              <p class="text-base text-gray-700">Body text - Regular paragraph text for reading content and general information.</p>
              <code class="text-sm text-gray-500">text-base text-gray-700</code>
            </div>
            <div>
              <p class="text-sm text-gray-600">Small text - Used for captions, meta information, and secondary details.</p>
              <code class="text-sm text-gray-500">text-sm text-gray-600</code>
            </div>
            <div>
              <p class="reading-content">Reading content - Optimized typography for book content with serif font and comfortable line spacing.</p>
              <code class="text-sm text-gray-500">reading-content class</code>
            </div>
          </div>
        </Card>
      </section>

      <!-- Buttons -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Buttons</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Button Variants -->
          <Card>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Variants</h3>
            <div class="space-y-4">
              <div class="flex flex-wrap gap-3">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
              <div class="flex flex-wrap gap-3">
                <Button variant="ai">AI Assistant</Button>
                <Button variant="audio">Audio</Button>
                <Button variant="danger">Danger</Button>
              </div>
            </div>
          </Card>

          <!-- Button Sizes -->
          <Card>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Sizes</h3>
            <div class="space-y-4">
              <div class="flex items-center gap-3">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
              <div class="space-y-2">
                <Button fullWidth>Full Width Button</Button>
                <Button loading>Loading State</Button>
                <Button disabled>Disabled State</Button>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <!-- Form Elements -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Form Elements</h2>
        
        <Card>
          <div class="space-y-6">
            <Input 
              label="Text Input" 
              placeholder="Enter some text..." 
              bind:value={inputValue}
            />
            
            <Input 
              type="email" 
              label="Email Input" 
              placeholder="user@example.com"
              required
            />
            
            <Input 
              type="password" 
              label="Password Input" 
              placeholder="••••••••"
            />
            
            <Input 
              label="Input with Error" 
              placeholder="This field has an error"
              error="This field is required"
            />
            
            <Input 
              label="Disabled Input" 
              placeholder="Cannot edit this"
              disabled
            />
          </div>
        </Card>
      </section>

      <!-- Progress & Loading -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Progress & Loading</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Progress Bars -->
          <Card>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Progress Bars</h3>
            <div class="space-y-6">
              <Progress value={progressValue} showLabel label="Reading Progress" />
              <Progress value={85} variant="success" showLabel label="Upload Complete" />
              <Progress value={30} variant="warning" size="sm" />
              <Progress value={95} variant="danger" size="lg" />
            </div>
            <div class="mt-4 flex items-center space-x-2">
              <Button size="sm" on:click={() => progressValue = Math.max(0, progressValue - 10)}>-10</Button>
              <Button size="sm" on:click={() => progressValue = Math.min(100, progressValue + 10)}>+10</Button>
            </div>
          </Card>

          <!-- Loading States -->
          <Card>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Loading States</h3>
            <div class="space-y-6">
              <div class="flex items-center space-x-4">
                <Loading size="sm" />
                <span class="text-sm">Small</span>
              </div>
              <div class="flex items-center space-x-4">
                <Loading size="md" />
                <span class="text-sm">Medium</span>
              </div>
              <div class="flex items-center space-x-4">
                <Loading size="lg" />
                <span class="text-sm">Large</span>
              </div>
              <Loading text="Loading your library..." />
            </div>
          </Card>
        </div>
      </section>

      <!-- Badges -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Badges</h2>
        
        <Card>
          <div class="space-y-4">
            <div class="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
            </div>
            <div class="flex flex-wrap gap-2">
              <Badge size="sm">Small Badge</Badge>
              <Badge size="md">Medium Badge</Badge>
            </div>
            <div class="flex flex-wrap gap-2">
              <Badge variant="success" dot>Online</Badge>
              <Badge variant="warning" dot>Processing</Badge>
              <Badge variant="danger" dot>Error</Badge>
            </div>
          </div>
        </Card>
      </section>

      <!-- Cards -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Cards</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <h3 class="font-semibold text-gray-900 mb-2">Default Card</h3>
            <p class="text-gray-600">A basic card with default styling and medium padding.</p>
          </Card>
          
          <Card hover padding="sm">
            <h3 class="font-semibold text-gray-900 mb-2">Hoverable Card</h3>
            <p class="text-gray-600">This card has hover effects and small padding.</p>
          </Card>
          
          <Card shadow="lg" padding="lg">
            <h3 class="font-semibold text-gray-900 mb-2">Large Shadow</h3>
            <p class="text-gray-600">Enhanced shadow with large padding for important content.</p>
          </Card>
        </div>
      </section>

      <!-- Modal & Toast -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Overlays</h2>
        
        <Card>
          <div class="space-y-4">
            <div class="flex gap-4">
              <Button on:click={() => showModal = true}>Show Modal</Button>
              <Button on:click={() => showToast = true}>Show Toast</Button>
            </div>
          </div>
        </Card>
      </section>

      <!-- Guidelines -->
      <section>
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Usage Guidelines</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Component Usage</h3>
            <div class="space-y-3 text-sm">
              <div>
                <strong>Buttons:</strong> Use primary for main actions, secondary for secondary actions, and ghost for subtle actions.
              </div>
              <div>
                <strong>Colors:</strong> Primary blue for brand elements, accent orange for highlights and audio features.
              </div>
              <div>
                <strong>Typography:</strong> Use reading-content class for book text to ensure optimal readability.
              </div>
              <div>
                <strong>Spacing:</strong> Follow 8px grid system for consistent spacing and alignment.
              </div>
            </div>
          </Card>
          
          <Card>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Accessibility</h3>
            <div class="space-y-3 text-sm">
              <div>
                <strong>Focus:</strong> All interactive elements have visible focus indicators.
              </div>
              <div>
                <strong>Contrast:</strong> Colors meet WCAG AA contrast requirements.
              </div>
              <div>
                <strong>Keyboard:</strong> All functionality is keyboard accessible.
              </div>
              <div>
                <strong>Screen Readers:</strong> Semantic HTML and ARIA labels are used throughout.
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  </div>
</div>

<!-- Demo Modal -->
<Modal bind:open={showModal} title="Demo Modal" size="md">
  <div class="p-6">
    <p class="text-gray-600 mb-4">
      This is a demo modal to showcase the modal component. It includes proper focus trapping, 
      backdrop clicking, and keyboard navigation.
    </p>
    <Input label="Sample Input" placeholder="Type something..." />
  </div>
  
  <div slot="footer" class="flex justify-end space-x-3">
    <Button variant="ghost" on:click={() => showModal = false}>Cancel</Button>
    <Button on:click={() => showModal = false}>Confirm</Button>
  </div>
</Modal>

<!-- Demo Toast -->
<Toast 
  bind:visible={showToast}
  type="success"
  title="Success!"
  message="This is a demo toast notification."
  duration={3000}
/>

<style>
  .reading-content {
    font-family: Charter, Georgia, serif;
    line-height: 1.7;
    font-size: 18px;
  }
</style>