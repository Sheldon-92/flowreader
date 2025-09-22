-- FlowReader Database Schema Creation Script
-- 在 Supabase SQL Editor 中执行此脚本来创建所需的表

-- 先删除已存在的表（如果有的话）
DROP TABLE IF EXISTS public.chapters CASCADE;
DROP TABLE IF EXISTS public.books CASCADE;

-- 1. 创建 books 表
CREATE TABLE public.books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    cover_url TEXT,
    file_path TEXT,
    file_size BIGINT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE
);

-- 2. 创建 chapters 表
CREATE TABLE public.chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE
);

-- 3. 为 books 表启用 RLS (Row Level Security)
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- 4. 为 chapters 表启用 RLS
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- 5. 创建 books 表的 RLS 策略
-- 用户只能看到自己的书
CREATE POLICY "Users can view their own books"
ON public.books
FOR SELECT
USING (auth.uid() = user_id);

-- 用户只能插入自己的书
CREATE POLICY "Users can insert their own books"
ON public.books
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的书
CREATE POLICY "Users can update their own books"
ON public.books
FOR UPDATE
USING (auth.uid() = user_id);

-- 用户只能删除自己的书
CREATE POLICY "Users can delete their own books"
ON public.books
FOR DELETE
USING (auth.uid() = user_id);

-- 6. 创建 chapters 表的 RLS 策略
-- 用户只能看到自己书籍的章节
CREATE POLICY "Users can view chapters of their own books"
ON public.chapters
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.books
        WHERE books.id = chapters.book_id
        AND books.user_id = auth.uid()
    )
);

-- 用户只能为自己的书籍插入章节
CREATE POLICY "Users can insert chapters for their own books"
ON public.chapters
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.books
        WHERE books.id = chapters.book_id
        AND books.user_id = auth.uid()
    )
);

-- 用户只能更新自己书籍的章节
CREATE POLICY "Users can update chapters of their own books"
ON public.chapters
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.books
        WHERE books.id = chapters.book_id
        AND books.user_id = auth.uid()
    )
);

-- 用户只能删除自己书籍的章节
CREATE POLICY "Users can delete chapters of their own books"
ON public.chapters
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.books
        WHERE books.id = chapters.book_id
        AND books.user_id = auth.uid()
    )
);

-- 7. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON public.books(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON public.chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_chapters_order ON public.chapters(book_id, order_index);

-- 8. 创建更新 updated_at 的触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. 为 books 表创建更新触发器
CREATE TRIGGER update_books_updated_at
BEFORE UPDATE ON public.books
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 10. 为 chapters 表创建更新触发器
CREATE TRIGGER update_chapters_updated_at
BEFORE UPDATE ON public.chapters
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 完成！现在你的数据库已经准备好了。