import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      runtime: 'nodejs18.x'
    }),
    env: {
      publicPrefix: 'PUBLIC_'
    },
    alias: {
      $lib: 'src/lib',
      $components: 'src/lib/components',
      $stores: 'src/lib/stores',
      $types: '../../packages/shared/src/types',
      $utils: 'src/lib/utils'
    }
  }
};

export default config;