-- Create chapters table
CREATE TABLE IF NOT EXISTS public.chapters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    title VARCHAR(255),
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS chapters_book_id_idx ON public.chapters(book_id);
CREATE INDEX IF NOT EXISTS chapters_book_id_idx_idx ON public.chapters(book_id, idx);

-- Enable Row Level Security
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can view chapters of their own books
CREATE POLICY "Users can view own book chapters" ON public.chapters
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.books
            WHERE books.id = chapters.book_id
            AND books.owner_id = auth.uid()
        )
    );

-- Create policy: Users can insert chapters for their own books
CREATE POLICY "Users can insert own book chapters" ON public.chapters
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.books
            WHERE books.id = chapters.book_id
            AND books.owner_id = auth.uid()
        )
    );

-- Create policy: Users can update chapters of their own books
CREATE POLICY "Users can update own book chapters" ON public.chapters
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.books
            WHERE books.id = chapters.book_id
            AND books.owner_id = auth.uid()
        )
    );

-- Create policy: Users can delete chapters of their own books
CREATE POLICY "Users can delete own book chapters" ON public.chapters
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.books
            WHERE books.id = chapters.book_id
            AND books.owner_id = auth.uid()
        )
    );