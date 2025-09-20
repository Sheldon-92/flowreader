export * from './types/index.js';
export declare const CONFIG: {
    readonly MAX_FILE_SIZE: number;
    readonly SUPPORTED_FORMATS: readonly [".epub", ".txt"];
    readonly TTS: {
        readonly MAX_CHARACTERS: 3000;
        readonly CACHE_DURATION: number;
        readonly DEFAULT_VOICE: "Joanna";
        readonly PLAYBACK_RATES: readonly [0.8, 1, 1.25, 1.5, 2];
    };
    readonly AI: {
        readonly MAX_CONTEXT_LENGTH: 4000;
        readonly MAX_TOKENS_PER_REQUEST: 1000;
        readonly EMBEDDING_DIMENSIONS: 1536;
        readonly RAG_SIMILARITY_THRESHOLD: 0.8;
    };
    readonly COST_LIMITS: {
        readonly trial: 5;
        readonly pro: 100;
        readonly enterprise: 1000;
    };
    readonly SLO: {
        readonly API_RESPONSE_TIME_P95: 600;
        readonly TTS_GENERATION_P95: 20000;
        readonly AUDIO_SYNC_ACCURACY: 300;
        readonly FIRST_TOKEN_TIME: 2000;
    };
};
