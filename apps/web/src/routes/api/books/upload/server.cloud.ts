import { json } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { RequestHandler } from './$types';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Create Supabase client
    const supabase = createServerClient(
      PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get: (key) => cookies.get(key),
          set: (key, value, options) => cookies.set(key, value, {
            ...options,
            path: '/'
          }),
          remove: (key, options) => cookies.delete(key, { ...options, path: '/' })
        }
      }
    );

    // Verify user is authenticated
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const bookId = uuidv4();
    const timestamp = Date.now();
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId}/${bookId}/${timestamp}-${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('books')
      .upload(filePath, file, {
        contentType: file.type || 'application/epub+zip',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return json({
        error: 'Failed to upload file',
        details: uploadError.message
      }, { status: 500 });
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('books')
      .getPublicUrl(filePath);

    // Extract basic metadata from filename
    const titleWithoutExt = file.name.replace('.epub', '');
    const title = titleWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (l: string) => l.toUpperCase());

    // Save book record to database
    const bookRecord = {
      id: bookId,
      title: title,
      author: 'Unknown Author',
      description: 'Book uploaded via FlowReader',
      cover_url: null,
      file_path: filePath,
      file_size: file.size,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      processed: false
    };

    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .insert(bookRecord)
      .select()
      .single();

    if (bookError) {
      console.error('Error saving book to database:', bookError);

      // Try to delete the uploaded file
      await supabase.storage
        .from('books')
        .remove([filePath]);

      return json({
        error: 'Failed to save book metadata',
        details: bookError.message
      }, { status: 500 });
    }

    // TODO: Trigger EPUB processing (Edge Function or external service)
    // This would parse the EPUB and extract chapters

    return json({
      success: true,
      book: bookData,
      fileUrl: publicUrl,
      message: 'Book uploaded successfully'
    });

  } catch (error) {
    console.error('Upload handler error:', error);
    return json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
};