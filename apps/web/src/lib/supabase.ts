import { createSupabaseLoadClient } from '@supabase/auth-helpers-sveltekit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from '$types/supabase';

export const createSupabaseClient = (
  event: { fetch: any; depends?: any },
  serverClient?: boolean
) => {
  return createSupabaseLoadClient<Database>({
    supabaseUrl: PUBLIC_SUPABASE_URL,
    supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
    event,
    serverClient
  });
};

// Client-side Supabase instance
export const supabase = createSupabaseLoadClient<Database>({
  supabaseUrl: PUBLIC_SUPABASE_URL,
  supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
  event: { fetch },
  serverClient: false
});