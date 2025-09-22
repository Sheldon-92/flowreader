export interface User {
    id: string;
    email: string;
    created_at: string;
    subscription_tier: 'trial' | 'pro' | 'enterprise';
    usage_quotas: UsageQuota;
    preferences: UserPreferences;
}
export interface UsageQuota {
    tts_characters_used: number;
    ai_tokens_used: number;
    monthly_cost: number;
    reset_date: string;
}
export interface UserPreferences {
    reading_speed: number;
    voice_preference: string;
    theme: 'light' | 'dark' | 'sepia';
    default_tts_mode: 'local' | 'cloud';
}
export interface Book {
    id: string;
    owner_id: string;
    title: string;
    author: string;
    file_path: string;
    file_size: number;
    upload_date: string;
    reading_progress: ReadingProgress;
    metadata: BookMetadata;
    namespace: 'private' | 'public';
}
export interface BookMetadata {
    word_count?: number;
    estimated_reading_time?: number;
    language: string;
    cover_url?: string;
    chapter_count: number;
}
export interface ReadingProgress {
    current_cfi: string;
    current_chapter: number;
    percentage: number;
    last_read: string;
}
export interface Chapter {
    id: string;
    book_id: string;
    idx: number;
    title: string;
    content: string;
    word_count: number;
    created_at: string;
}
export interface Highlight {
    id: string;
    book_id: string;
    user_id: string;
    selector_type: 'TextQuote' | 'TextPosition';
    selector_data: TextQuoteSelector | TextPositionSelector;
    highlighted_text?: string;
    note_content?: string;
    color?: string;
    created_at: string;
}
export interface TextQuoteSelector {
    exact: string;
    prefix?: string;
    suffix?: string;
}
export interface TextPositionSelector {
    start: number;
    end: number;
}
export interface Note {
    id: string;
    userId: string;
    bookId: string;
    chapterId?: string;
    selection?: TextSelection;
    content: string;
    source?: 'manual' | 'auto';
    meta?: NoteMeta;
    createdAt: string;
}
export interface TextSelection {
    text: string;
    start?: number;
    end?: number;
    chapterId?: string;
}
export interface NoteMeta {
    intent?: IntentType;
    [key: string]: any;
}
export type IntentType = 'translate' | 'explain' | 'analyze' | 'ask' | 'enhance';
export interface AutoNoteRequest {
    bookId: string;
    selection?: TextSelection;
    intent?: IntentType;
    contextScope?: 'selection' | 'recent_dialog' | 'chapter';
    options?: AutoNoteOptions;
}
export interface AutoNoteOptions {
    maxLength?: number;
    includeMetrics?: boolean;
}
export interface AutoNoteResponse extends Note {
    source: 'auto';
    meta: AutoNoteMeta;
    metrics?: NoteMetrics;
}
export interface AutoNoteMeta extends NoteMeta {
    generationMethod: 'knowledge_enhancement' | 'dialog_summary' | 'context_analysis';
    confidence: number;
    sourceSelection?: TextSelection;
    contextScope?: string;
    type?: string;
    position?: {
        chapterId?: string;
        start?: number;
        end?: number;
    };
    qualityScore?: number;
    processingInfo?: {
        method: GenerationMethod;
        tokens: number;
        processingTime: number;
    };
}
export interface NoteMetrics {
    tokens: number;
    cost: number;
    processingTime: number;
}
export type ContextScope = 'selection' | 'recent_dialog' | 'chapter';
export type GenerationMethod = 'knowledge_enhancement' | 'dialog_summary' | 'context_analysis';
export interface AIConversation {
    id: string;
    book_id: string;
    user_id: string;
    title: string;
    messages: AIMessage[];
    context_summary?: string;
    total_tokens: number;
    created_at: string;
}
export interface AIMessage {
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    tokens: number;
    cost_usd: number;
    context_chunks?: string[];
    created_at: string;
}
export interface AudioAsset {
    id: string;
    book_id: string;
    chapter_id?: string;
    cache_key: string;
    voice_id: string;
    url: string;
    marks_url?: string;
    duration: number;
    namespace: 'private' | 'public';
    created_at: string;
}
export interface SpeechMark {
    type: 'word' | 'sentence' | 'ssml';
    start: number;
    end: number;
    time: number;
    value: string;
}
export interface Task {
    id: string;
    kind: 'epub_parse' | 'tts_generate' | 'embedding_create';
    status: 'queued' | 'processing' | 'completed' | 'failed';
    payload: any;
    idempotency_key: string;
    result?: any;
    error_code?: string;
    created_at: string;
    updated_at: string;
}
export interface ApiResponse<T = any> {
    data?: T;
    error?: ApiError;
    meta?: {
        request_id: string;
        timestamp: string;
        quota?: QuotaInfo;
    };
}
export interface ApiError {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    request_id: string;
    retry_after?: number;
}
export interface QuotaInfo {
    used: number;
    limit: number;
    reset_date: string;
    cost_estimate?: number;
}
export interface AnalyticsEvent {
    id: string;
    user_id?: string;
    event_type: string;
    properties: Record<string, any>;
    timestamp: string;
}
export interface AudioState {
    is_playing: boolean;
    current_time: number;
    duration: number;
    audio_url: string | null;
    playback_rate: number;
    voice_id?: string;
    sync_mode: 'sentence' | 'word';
}
export interface TTSRequest {
    text: string;
    voice_id: string;
    speed?: number;
    language?: string;
    idempotency_key: string;
}
export interface TTSResponse {
    task_id: string;
    estimated_duration?: number;
}
export interface SSEEvent {
    type: 'sources' | 'token' | 'usage' | 'done' | 'error';
    data: any;
    id?: string;
}
export interface ChatStreamRequest {
    book_id: string;
    chapter_idx?: number;
    selection: string;
    message: string;
    conversation_id?: string;
}
export type EnhanceType = 'concept' | 'historical' | 'cultural' | 'general';
export interface KnowledgeEnhanceRequest {
    bookId: string;
    intent: 'enhance';
    selection: {
        text: string;
        start?: number;
        end?: number;
        chapterId?: string;
    };
    enhanceType?: EnhanceType;
}
export interface KnowledgeConcept {
    term: string;
    definition: string;
    context: string;
}
export interface HistoricalReference {
    event: string;
    date: string;
    relevance: string;
}
export interface CulturalReference {
    reference: string;
    origin: string;
    significance: string;
}
export interface KnowledgeConnection {
    topic: string;
    relationship: string;
}
export interface KnowledgeEnhancement {
    type: 'enhancement';
    data: {
        concepts?: KnowledgeConcept[];
        historical?: HistoricalReference[];
        cultural?: CulturalReference[];
        connections?: KnowledgeConnection[];
    };
    summary: string;
    confidence: number;
    enhanceType: EnhanceType;
    qualityMetrics?: {
        accuracy: number;
        relevance: number;
        completeness: number;
        clarity: number;
        overall: number;
    };
}
export interface KnowledgeEnhanceResponse {
    enhancement: KnowledgeEnhancement;
    usage: {
        tokens_used: number;
        cost_usd: number;
        enhancement_type: EnhanceType;
    };
    timestamp: string;
}
export declare const ERROR_CODES: {
    readonly TOO_LARGE: "TOO_LARGE";
    readonly INVALID_EPUB: "INVALID_EPUB";
    readonly UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly QUOTA_EXCEEDED: "QUOTA_EXCEEDED";
    readonly RATE_LIMITED: "RATE_LIMITED";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR";
    readonly SSE_ABORTED: "SSE_ABORTED";
    readonly TASK_NOT_FOUND: "TASK_NOT_FOUND";
    readonly TASK_FAILED: "TASK_FAILED";
};
export type ErrorCode = keyof typeof ERROR_CODES;
