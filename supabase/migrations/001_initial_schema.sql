-- FlowReader Database Schema
-- Initial migration with core tables and RLS policies

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    subscription_tier TEXT DEFAULT 'trial' CHECK (subscription_tier IN ('trial', 'pro', 'enterprise')),
    usage_quotas JSONB DEFAULT '{
        "tts_characters_used": 0,
        "ai_tokens_used": 0,
        "monthly_cost": 0,
        "reset_date": null
    }',
    preferences JSONB DEFAULT '{
        "reading_speed": 1.0,
        "voice_preference": "Joanna",
        "theme": "light",
        "default_tts_mode": "local"
    }'
);

-- Books table
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    reading_progress JSONB DEFAULT '{
        "current_cfi": "",
        "current_chapter": 0,
        "percentage": 0,
        "last_read": null
    }',
    metadata JSONB DEFAULT '{}',
    namespace TEXT DEFAULT 'private' CHECK (namespace IN ('private', 'public')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chapters table
CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
    idx INTEGER NOT NULL,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(book_id, idx)
);

-- Chapter embeddings for RAG
CREATE TABLE chapter_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
    chapter_idx INTEGER NOT NULL,
    chunk_id INTEGER NOT NULL,
    embedding VECTOR(1536),
    start_pos INTEGER NOT NULL,
    end_pos INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reading positions (composite primary key for upsert)
CREATE TABLE reading_positions (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
    chapter_idx INTEGER DEFAULT 0,
    cfi_position TEXT DEFAULT '',
    percentage FLOAT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, book_id)
);

-- Highlights with dual anchor support
CREATE TABLE highlights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
    selector_type TEXT NOT NULL CHECK (selector_type IN ('TextQuote', 'TextPosition')),
    selector_data JSONB NOT NULL,
    highlighted_text TEXT,
    note_content TEXT,
    color TEXT DEFAULT '#fbbf24',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes table
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    linked_highlight_id UUID REFERENCES highlights(id) ON DELETE SET NULL,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI conversations (normalized design)
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    context_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI messages
CREATE TABLE ai_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,6) DEFAULT 0,
    context_chunks TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audio assets with caching
CREATE TABLE audio_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
    chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
    cache_key TEXT UNIQUE NOT NULL,
    voice_id TEXT NOT NULL,
    url TEXT NOT NULL,
    marks_url TEXT,
    duration INTEGER NOT NULL,
    namespace TEXT DEFAULT 'private' CHECK (namespace IN ('private', 'public')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task queue system
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind TEXT NOT NULL CHECK (kind IN ('epub_parse', 'tts_generate', 'embedding_create')),
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    payload JSONB NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    result JSONB,
    error_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics events
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    properties JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_books_owner_id ON books(owner_id);
CREATE INDEX idx_books_namespace ON books(namespace);
CREATE INDEX idx_chapters_book_id ON chapters(book_id);
CREATE INDEX idx_chapters_book_idx ON chapters(book_id, idx);
CREATE INDEX idx_chapter_embeddings_book_id ON chapter_embeddings(book_id);
CREATE INDEX idx_chapter_embeddings_vector ON chapter_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_highlights_user_book ON highlights(user_id, book_id);
CREATE INDEX idx_notes_user_book ON notes(user_id, book_id);
CREATE INDEX idx_ai_conversations_user_book ON ai_conversations(user_id, book_id);
CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id);
CREATE INDEX idx_audio_assets_cache_key ON audio_assets(cache_key);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_idempotency ON tasks(idempotency_key);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_timestamp ON analytics_events(timestamp);

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Books policies
CREATE POLICY "Users can view own books" ON books
    FOR SELECT USING (auth.uid() = owner_id OR namespace = 'public');
CREATE POLICY "Users can insert own books" ON books
    FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own books" ON books
    FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own books" ON books
    FOR DELETE USING (auth.uid() = owner_id);

-- Chapters policies (follow books access)
CREATE POLICY "Chapters access follows book access" ON chapters
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM books 
            WHERE books.id = chapters.book_id 
            AND (books.owner_id = auth.uid() OR books.namespace = 'public')
        )
    );

-- Chapter embeddings policies
CREATE POLICY "Embeddings access follows book access" ON chapter_embeddings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM books 
            WHERE books.id = chapter_embeddings.book_id 
            AND (books.owner_id = auth.uid() OR books.namespace = 'public')
        )
    );

-- Reading positions policies
CREATE POLICY "Users can manage own reading positions" ON reading_positions
    FOR ALL USING (auth.uid() = user_id);

-- Highlights policies
CREATE POLICY "Users can manage own highlights" ON highlights
    FOR ALL USING (auth.uid() = user_id);

-- Notes policies
CREATE POLICY "Users can manage own notes" ON notes
    FOR ALL USING (auth.uid() = user_id);

-- AI conversations policies
CREATE POLICY "Users can manage own conversations" ON ai_conversations
    FOR ALL USING (auth.uid() = user_id);

-- AI messages policies
CREATE POLICY "Users can manage own messages" ON ai_messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM ai_conversations 
            WHERE ai_conversations.id = ai_messages.conversation_id 
            AND ai_conversations.user_id = auth.uid()
        )
    );

-- Audio assets policies (allow access for book owners or public assets)
CREATE POLICY "Audio assets access follows book/namespace" ON audio_assets
    FOR SELECT USING (
        namespace = 'public' OR 
        EXISTS (
            SELECT 1 FROM books 
            WHERE books.id = audio_assets.book_id 
            AND books.owner_id = auth.uid()
        )
    );

-- Tasks policies (users can only see their own tasks)
CREATE POLICY "Users can manage own tasks" ON tasks
    FOR ALL USING (
        payload->>'user_id' = auth.uid()::text
    );

-- Analytics events policies
CREATE POLICY "Users can insert analytics events" ON analytics_events
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Functions for common operations

-- Function to update reading position with upsert
CREATE OR REPLACE FUNCTION update_reading_position(
    p_user_id UUID,
    p_book_id UUID,
    p_chapter_idx INTEGER,
    p_cfi_position TEXT,
    p_percentage FLOAT
) RETURNS VOID AS $$
BEGIN
    INSERT INTO reading_positions (user_id, book_id, chapter_idx, cfi_position, percentage, updated_at)
    VALUES (p_user_id, p_book_id, p_chapter_idx, p_cfi_position, p_percentage, NOW())
    ON CONFLICT (user_id, book_id) 
    DO UPDATE SET 
        chapter_idx = EXCLUDED.chapter_idx,
        cfi_position = EXCLUDED.cfi_position,
        percentage = EXCLUDED.percentage,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update usage quotas
CREATE OR REPLACE FUNCTION update_usage_quota(
    p_user_id UUID,
    p_tts_chars INTEGER DEFAULT 0,
    p_ai_tokens INTEGER DEFAULT 0,
    p_cost DECIMAL DEFAULT 0
) RETURNS VOID AS $$
BEGIN
    UPDATE users SET 
        usage_quotas = jsonb_set(
            jsonb_set(
                jsonb_set(
                    usage_quotas,
                    '{tts_characters_used}',
                    ((usage_quotas->>'tts_characters_used')::integer + p_tts_chars)::text::jsonb
                ),
                '{ai_tokens_used}',
                ((usage_quotas->>'ai_tokens_used')::integer + p_ai_tokens)::text::jsonb
            ),
            '{monthly_cost}',
            ((usage_quotas->>'monthly_cost')::decimal + p_cost)::text::jsonb
        )
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update task updated_at on status change
CREATE OR REPLACE FUNCTION update_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_task_timestamp();