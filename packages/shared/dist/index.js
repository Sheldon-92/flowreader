// Re-export all types
export * from './types/index.js';
// Constants and configurations
export const CONFIG = {
    // File upload limits
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    SUPPORTED_FORMATS: ['.epub', '.txt'],
    // TTS configuration
    TTS: {
        MAX_CHARACTERS: 3000,
        CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours
        DEFAULT_VOICE: 'Joanna',
        PLAYBACK_RATES: [0.8, 1.0, 1.25, 1.5, 2.0]
    },
    // AI configuration
    AI: {
        MAX_CONTEXT_LENGTH: 4000,
        MAX_TOKENS_PER_REQUEST: 1000,
        EMBEDDING_DIMENSIONS: 1536,
        RAG_SIMILARITY_THRESHOLD: 0.8
    },
    // Cost limits (USD)
    COST_LIMITS: {
        trial: 5,
        pro: 100,
        enterprise: 1000
    },
    // Performance targets
    SLO: {
        API_RESPONSE_TIME_P95: 600, // ms
        TTS_GENERATION_P95: 20000, // ms
        AUDIO_SYNC_ACCURACY: 300, // ms
        FIRST_TOKEN_TIME: 2000 // ms
    }
};
