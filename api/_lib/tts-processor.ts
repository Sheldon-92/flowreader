/**
 * TTS Processing Implementation
 * 
 * Based on the TTS Speech Marks spike validation,
 * this implements the production-ready TTS processing pipeline
 */

import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { supabaseAdmin } from './auth.js';
import type { SpeechMark } from '@flowreader/shared';

export class TTSProcessor {
  private polly: PollyClient;

  constructor() {
    this.polly = new PollyClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });
  }

  /**
   * Generate TTS audio with Speech Marks for sentence-level synchronization
   */
  async generateTTSWithMarks(
    text: string,
    voiceId: string,
    language: string = 'en-US',
    cacheKey: string
  ): Promise<{
    audioUrl: string;
    marksUrl: string;
    duration: number;
    charactersProcessed: number;
  }> {
    try {
      // Check cache first
      const cached = await this.checkCache(cacheKey);
      if (cached) {
        return cached;
      }

      console.log(`🔊 Generating TTS for ${text.length} characters with voice ${voiceId}`);

      // Generate audio and speech marks in parallel
      const [audioResult, marksResult] = await Promise.all([
        this.generateAudio(text, voiceId),
        this.generateSpeechMarks(text, voiceId)
      ]);

      // Upload audio file to storage
      const audioUrl = await this.uploadAudio(audioResult.audioData, cacheKey);
      
      // Process and upload speech marks
      const processedMarks = this.processSpeechMarks(marksResult.speechMarks);
      const marksUrl = await this.uploadSpeechMarks(processedMarks, cacheKey);

      // Calculate duration estimate
      const duration = this.estimateDuration(text);

      // Cache the result
      await this.cacheResult(cacheKey, {
        audioUrl,
        marksUrl,
        duration,
        charactersProcessed: text.length
      });

      console.log(`✅ TTS generation completed: ${audioUrl}`);

      return {
        audioUrl,
        marksUrl,
        duration,
        charactersProcessed: text.length
      };

    } catch (error) {
      console.error('TTS generation failed:', error);
      throw new Error(`TTS generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async generateAudio(text: string, voiceId: string): Promise<{
    audioData: Uint8Array;
  }> {
    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: voiceId,
      Engine: 'neural',
      SampleRate: '22050'
    });

    const response = await this.polly.send(command);
    
    if (!response.AudioStream) {
      throw new Error('No audio data received from Polly');
    }

    const audioData = await response.AudioStream.transformToByteArray();
    return { audioData };
  }

  private async generateSpeechMarks(text: string, voiceId: string): Promise<{
    speechMarks: any[];
  }> {
    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'json',
      VoiceId: voiceId,
      Engine: 'neural',
      SpeechMarkTypes: ['sentence', 'word'] // Focus on sentence for MVP
    });

    const response = await this.polly.send(command);
    
    if (!response.AudioStream) {
      throw new Error('No speech marks data received from Polly');
    }

    const marksData = await response.AudioStream.transformToByteArray();
    const marksText = new TextDecoder().decode(marksData);
    
    // Parse JSONL format (one JSON object per line)
    const speechMarks = marksText
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    return { speechMarks };
  }

  private processSpeechMarks(rawMarks: any[]): SpeechMark[] {
    return rawMarks.map(mark => ({
      type: mark.type as 'word' | 'sentence' | 'ssml',
      start: mark.start || 0,
      end: mark.end || 0,
      time: mark.time || 0,
      value: mark.value || ''
    }));
  }

  private async uploadAudio(audioData: Uint8Array, cacheKey: string): Promise<string> {
    const fileName = `tts/${cacheKey}.mp3`;
    
    const { data, error } = await supabaseAdmin.storage
      .from('audio-cache')
      .upload(fileName, audioData, {
        contentType: 'audio/mpeg',
        cacheControl: '86400', // 24 hours cache
        upsert: true
      });

    if (error) {
      throw new Error(`Failed to upload audio: ${error.message}`);
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('audio-cache')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  }

  private async uploadSpeechMarks(marks: SpeechMark[], cacheKey: string): Promise<string> {
    const fileName = `marks/${cacheKey}.json`;
    const marksJson = JSON.stringify(marks);
    
    const { data, error } = await supabaseAdmin.storage
      .from('audio-cache')
      .upload(fileName, marksJson, {
        contentType: 'application/json',
        cacheControl: '86400', // 24 hours cache
        upsert: true
      });

    if (error) {
      throw new Error(`Failed to upload speech marks: ${error.message}`);
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('audio-cache')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  }

  private async checkCache(cacheKey: string): Promise<any | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('audio_assets')
        .select('url, marks_url, duration')
        .eq('cache_key', cacheKey)
        .single();

      if (error || !data) {
        return null;
      }

      // Verify files still exist
      const audioExists = await this.verifyFileExists(data.url);
      const marksExists = await this.verifyFileExists(data.marks_url);

      if (audioExists && marksExists) {
        return {
          audioUrl: data.url,
          marksUrl: data.marks_url,
          duration: data.duration,
          charactersProcessed: 0 // Cached result
        };
      }

      // Clean up stale cache entry
      await supabaseAdmin
        .from('audio_assets')
        .delete()
        .eq('cache_key', cacheKey);

      return null;
    } catch (error) {
      console.warn('Cache check failed:', error);
      return null;
    }
  }

  private async cacheResult(cacheKey: string, result: any): Promise<void> {
    try {
      await supabaseAdmin
        .from('audio_assets')
        .upsert({
          cache_key: cacheKey,
          voice_id: 'Joanna', // TODO: Get from context
          url: result.audioUrl,
          marks_url: result.marksUrl,
          duration: result.duration,
          namespace: 'private' // TODO: Determine from context
        });
    } catch (error) {
      console.warn('Failed to cache result:', error);
      // Don't throw - the result is still valid
    }
  }

  private async verifyFileExists(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  private estimateDuration(text: string): number {
    // Rough estimation: ~150 words per minute, ~5 characters per word
    const wordsPerMinute = 150;
    const charactersPerWord = 5;
    const words = text.length / charactersPerWord;
    return Math.ceil((words / wordsPerMinute) * 60 * 1000); // milliseconds
  }
}

// Local TTS Fallback Implementation
export class LocalTTSFallback {
  private synthesis: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
    }
  }

  isAvailable(): boolean {
    return this.synthesis !== null;
  }

  async speak(
    text: string,
    options: {
      voice?: string;
      rate?: number;
      pitch?: number;
      onSentenceStart?: (sentence: string, index: number) => void;
    } = {}
  ): Promise<void> {
    if (!this.synthesis) {
      throw new Error('Speech synthesis not available');
    }

    return new Promise((resolve, reject) => {
      try {
        // Split text into sentences for highlighting
        const sentences = this.splitIntoSentences(text);
        let currentSentenceIndex = 0;

        const speakNextSentence = () => {
          if (currentSentenceIndex >= sentences.length) {
            resolve();
            return;
          }

          const sentence = sentences[currentSentenceIndex];
          this.currentUtterance = new SpeechSynthesisUtterance(sentence);
          
          // Configure voice and rate
          this.currentUtterance.rate = options.rate || 1.0;
          this.currentUtterance.pitch = options.pitch || 1.0;
          
          if (options.voice && this.synthesis) {
            const voices = this.synthesis.getVoices();
            const selectedVoice = voices.find(v => v.name.includes(options.voice!));
            if (selectedVoice) {
              this.currentUtterance.voice = selectedVoice;
            }
          }

          // Handle sentence highlighting
          this.currentUtterance.onstart = () => {
            options.onSentenceStart?.(sentence, currentSentenceIndex);
          };

          this.currentUtterance.onend = () => {
            currentSentenceIndex++;
            // Small delay between sentences
            setTimeout(speakNextSentence, 200);
          };

          this.currentUtterance.onerror = (event) => {
            console.error('TTS error:', event);
            reject(new Error(`TTS failed: ${event.error}`));
          };

          this.synthesis!.speak(this.currentUtterance);
        };

        speakNextSentence();

      } catch (error) {
        reject(error);
      }
    });
  }

  pause(): void {
    if (this.synthesis) {
      this.synthesis.pause();
    }
  }

  resume(): void {
    if (this.synthesis) {
      this.synthesis.resume();
    }
  }

  stop(): void {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
    this.currentUtterance = null;
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - in production, use Intl.Segmenter if available
    const sentences = text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    return sentences;
  }
}