import { createClient } from '@supabase/supabase-js';
import type { Database } from '@flowreader/shared';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey);

export async function authenticateRequest(req: Request): Promise<{
  user: { id: string; email: string } | null;
  error?: string;
}> {
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return { user: null, error: 'Invalid token' };
    }

    return { user: { id: user.id, email: user.email! } };
  } catch (error) {
    console.error('Authentication error:', error);
    return { user: null, error: 'Authentication failed' };
  }
}

export async function requireAuth(req: Request) {
  const { user, error } = await authenticateRequest(req);
  
  if (!user) {
    throw new Error(error || 'Authentication required');
  }
  
  return user;
}