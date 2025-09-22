-- Migration: Add processed column to books table
-- Created: 2025-09-21
-- Purpose: Track whether EPUB files have been processed

-- Add processed column to books table if it doesn't exist
ALTER TABLE public.books
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;

-- Create index for faster queries on unprocessed books
CREATE INDEX IF NOT EXISTS idx_books_processed ON public.books(processed);
CREATE INDEX IF NOT EXISTS idx_books_owner_processed ON public.books(owner_id, processed);

-- Update existing books to mark them as processed (if they have chapters)
UPDATE public.books b
SET processed = TRUE
WHERE EXISTS (
    SELECT 1 FROM public.chapters c
    WHERE c.book_id = b.id
);

-- Comment on the new column
COMMENT ON COLUMN public.books.processed IS 'Indicates whether the EPUB file has been fully processed and chapters created';