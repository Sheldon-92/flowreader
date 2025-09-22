import { redirect } from '@sveltejs/kit';

export const load = async ({ url, depends }) => {
  depends('supabase:auth');

  return {
    url: url.origin
  };
};