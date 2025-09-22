import { createClient } from '@supabase/supabase-js';
import type { Database } from '$types/supabase';

// Production-ready Supabase configuration
// Using direct values since environment variables are causing issues
const SUPABASE_URL = 'https://nlzayvpmyrjyveropyhq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5semF5dnBteXJqeXZlcm9weWhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0Nzk4NTAsImV4cCI6MjA3NDA1NTg1MH0.gHvAlZneQCm2K6p1jCBb__LvTlGr18lngbgqDnARiks';

console.log('Supabase config initialized:', {
  url: SUPABASE_URL,
  keyPresent: !!SUPABASE_ANON_KEY,
  timestamp: new Date().toISOString()
});

// Client-side Supabase instance
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
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