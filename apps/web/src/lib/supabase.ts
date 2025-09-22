import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { browser } from '$app/environment';
import type { Database } from '$types/supabase';

// Get environment variables with fallbacks for production
const getSupabaseConfig = () => {
  // In browser, check if env vars are available, if not use fallbacks
  if (browser) {
    const url = PUBLIC_SUPABASE_URL || 'https://nlzayvpmyrjyveropyhq.supabase.co';
    const key = PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5semF5dnBteXJqeXZlcm9weWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0Nzk4NTAsImV4cCI6MjA3NDA1NTg1MH0.gHvAlZneQCm2K6p1jCBb__LvTlGr18lngbgqDnARiks';

    console.log('Supabase config (browser):', {
      url: url,
      anonKey: key ? 'Present' : 'Missing',
      urlType: typeof url,
      keyType: typeof key
    });

    return { url, key };
  }

  // Server-side, use env vars directly
  console.log('Supabase config (server):', {
    url: PUBLIC_SUPABASE_URL,
    anonKey: PUBLIC_SUPABASE_ANON_KEY ? 'Present' : 'Missing'
  });

  return {
    url: PUBLIC_SUPABASE_URL,
    key: PUBLIC_SUPABASE_ANON_KEY
  };
};

const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();

// Client-side Supabase instance
export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    global: {
      headers: {
        'x-client-info': 'flowreader-web'
      }
    },
    db: {
      schema: 'public'
    }
  }
);