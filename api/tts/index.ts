import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuth } from '../_lib/auth.js';
import { TaskQueue } from '../_lib/queue.js';
import { CONFIG } from '@flowreader/shared';

async function ttsHandler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return ApiErrorHandler.badRequest('Method not allowed');
  }

  // Authenticate user
  const user = await requireAuth(req);

  try {
    const body = await req.json();
    const { text, voice_id, speed = 1.0, language = 'en-US' } = body;
    const idempotencyKey = req.headers.get('idempotency-key');

    // Validate input
    if (!text || typeof text !== 'string') {
      return ApiErrorHandler.badRequest('Text is required');
    }

    if (text.length > CONFIG.TTS.MAX_CHARACTERS) {
      return ApiErrorHandler.badRequest(
        'Text too long',
        {
          max_characters: CONFIG.TTS.MAX_CHARACTERS,
          provided_characters: text.length
        }
      );
    }

    if (!voice_id || typeof voice_id !== 'string') {
      return ApiErrorHandler.badRequest('Voice ID is required');
    }

    // Validate playback rate
    if (speed < 0.25 || speed > 4.0) {
      return ApiErrorHandler.badRequest(
        'Invalid speed',
        { min: 0.25, max: 4.0, provided: speed }
      );
    }

    // Create cache key (excluding speed for caching efficiency)
    const textHash = await crypto.subtle.digest(
      'SHA-256', 
      new TextEncoder().encode(text)
    );
    const hashHex = Array.from(new Uint8Array(textHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const cacheKey = `tts-${hashHex}-${voice_id}-${language}`;
    
    // Use cache key as default idempotency key
    const finalIdempotencyKey = idempotencyKey || cacheKey;

    // Create TTS generation task
    const { task_id, existing } = await TaskQueue.createTask(
      'tts_generate',
      {
        user_id: user.id,
        text,
        voice_id,
        speed,
        language,
        cache_key: cacheKey
      },
      finalIdempotencyKey
    );

    const response = {
      task_id,
      cache_key: cacheKey,
      message: existing ? 'TTS already generated or in progress' : 'TTS generation initiated',
      estimated_duration: Math.ceil(text.length / 100) * 1000, // ~10ms per character estimate
      characters: text.length
    };

    return createSuccessResponse(response, existing ? 200 : 202);

  } catch (error) {
    console.error('TTS request error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Authentication')) {
        return ApiErrorHandler.unauthorized();
      }
      if (error.message.includes('quota')) {
        return ApiErrorHandler.quotaExceeded('TTS quota exceeded', 3600);
      }
    }
    
    return ApiErrorHandler.internalServerError('TTS request failed');
  }
}

export default withErrorHandling(ttsHandler);