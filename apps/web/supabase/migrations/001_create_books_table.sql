-- Create books table
CREATE TABLE IF NOT EXISTS public.books (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    file_path TEXT,
    file_url TEXT,
    file_size INTEGER,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    reading_progress JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS books_owner_id_idx ON public.books(owner_id);
CREATE INDEX IF NOT EXISTS books_upload_date_idx ON public.books(upload_date);

-- Set up Row Level Security (RLS)
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own books
CREATE POLICY "Users can view own books" ON public.books
    FOR SELECT USING (auth.uid() = owner_id);

-- Create policy: Users can insert their own books
CREATE POLICY "Users can insert own books" ON public.books
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Create policy: Users can update their own books
CREATE POLICY "Users can update own books" ON public.books
    FOR UPDATE USING (auth.uid() = owner_id);

-- Create policy: Users can delete their own books
CREATE POLICY "Users can delete own books" ON public.books
    FOR DELETE USING (auth.uid() = owner_id);

-- Create storage bucket for books (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('books', 'books', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies
CREATE POLICY "Users can upload books" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'books' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view own book files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'books' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete own book files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'books' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );