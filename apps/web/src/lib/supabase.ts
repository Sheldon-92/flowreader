import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from '$types/supabase';

// Debug environment variables
console.log('Supabase config:', {
  url: PUBLIC_SUPABASE_URL,
  anonKey: PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing'
});

// Client-side Supabase instance
export const supabase = createClient<Database>(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);