// @ts-nocheck
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals, params }: Parameters<PageServerLoad>[0]) => {
  const session = await locals.getSession();

  if (!session) {
    throw redirect(303, '/auth/login');
  }

  return {
    session,
    noteId: params.id
  };
};