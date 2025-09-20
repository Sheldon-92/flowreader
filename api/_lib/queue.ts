import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from './auth.js';
import type { Task } from '@flowreader/shared';

export interface QueueTaskPayload {
  user_id: string;
  book_id?: string;
  [key: string]: any;
}

export class TaskQueue {
  static async createTask(
    kind: Task['kind'],
    payload: QueueTaskPayload,
    idempotencyKey?: string
  ): Promise<{ task_id: string; existing?: boolean }> {
    const taskId = uuidv4();
    const key = idempotencyKey || `${kind}-${payload.user_id}-${Date.now()}`;

    try {
      // Check for existing task with same idempotency key
      const { data: existingTask } = await supabaseAdmin
        .from('tasks')
        .select('id, status')
        .eq('idempotency_key', key)
        .single();

      if (existingTask) {
        return { 
          task_id: existingTask.id, 
          existing: true 
        };
      }

      // Create new task
      const { data: task, error } = await supabaseAdmin
        .from('tasks')
        .insert({
          id: taskId,
          kind,
          status: 'queued',
          payload,
          idempotency_key: key
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Enqueue for processing (using QStash)
      if (process.env.QSTASH_TOKEN) {
        await this.enqueueWithQStash(task.id, kind, payload);
      }

      return { task_id: taskId };
    } catch (error) {
      console.error('Failed to create task:', error);
      throw new Error('Failed to create task');
    }
  }

  static async getTaskStatus(taskId: string, userId?: string): Promise<Task | null> {
    try {
      let query = supabaseAdmin
        .from('tasks')
        .select('*')
        .eq('id', taskId);

      // If userId provided, ensure user can only access their own tasks
      if (userId) {
        query = query.eq('payload->user_id', userId);
      }

      const { data: task, error } = await query.single();

      if (error || !task) {
        return null;
      }

      return task as Task;
    } catch (error) {
      console.error('Failed to get task status:', error);
      return null;
    }
  }

  static async updateTaskStatus(
    taskId: string,
    status: Task['status'],
    result?: any,
    errorCode?: string
  ): Promise<void> {
    try {
      const updateData: Partial<Task> = {
        status,
        updated_at: new Date().toISOString()
      };

      if (result !== undefined) {
        updateData.result = result;
      }

      if (errorCode) {
        updateData.error_code = errorCode;
      }

      const { error } = await supabaseAdmin
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
      throw error;
    }
  }

  private static async enqueueWithQStash(
    taskId: string,
    kind: string,
    payload: any
  ): Promise<void> {
    if (!process.env.QSTASH_TOKEN || !process.env.QSTASH_URL) {
      console.warn('QStash not configured, task will not be processed');
      return;
    }

    const processingUrl = `${process.env.APP_URL}/api/tasks/process`;
    
    const queuePayload = {
      taskId,
      kind,
      payload
    };

    try {
      const response = await fetch(`${process.env.QSTASH_URL}/v1/publish/${encodeURIComponent(processingUrl)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(queuePayload)
      });

      if (!response.ok) {
        throw new Error(`QStash enqueue failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to enqueue task with QStash:', error);
      // Don't throw here - task is already created in database
      // It can be processed manually or through other means
    }
  }
}

// Background task processor
export class TaskProcessor {
  static async processTask(taskId: string): Promise<void> {
    const task = await TaskQueue.getTaskStatus(taskId);
    
    if (!task || task.status !== 'queued') {
      console.warn(`Task ${taskId} not found or not queued`);
      return;
    }

    try {
      await TaskQueue.updateTaskStatus(taskId, 'processing');

      let result;
      switch (task.kind) {
        case 'epub_parse':
          result = await this.processEpubParse(task.payload);
          break;
        case 'tts_generate':
          result = await this.processTTSGeneration(task.payload);
          break;
        case 'embedding_create':
          result = await this.processEmbeddingCreation(task.payload);
          break;
        default:
          throw new Error(`Unknown task kind: ${task.kind}`);
      }

      await TaskQueue.updateTaskStatus(taskId, 'completed', result);
    } catch (error) {
      console.error(`Task ${taskId} failed:`, error);
      await TaskQueue.updateTaskStatus(
        taskId, 
        'failed', 
        undefined, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private static async processEpubParse(payload: any): Promise<any> {
    const { EPUBProcessor } = await import('./epub-processor.js');
    const processor = new EPUBProcessor();
    
    const { user_id, file_name, file_size, file_data, file_hash } = payload;
    
    // Convert array back to Buffer
    const fileBuffer = Buffer.from(file_data);
    
    const result = await processor.processUploadedEPUB(
      fileBuffer,
      file_name,
      user_id
    );
    
    return {
      book_id: result.book.id,
      book_title: result.book.title,
      book_author: result.book.author,
      chapters_count: result.chaptersCount,
      file_size,
      file_hash,
      processing_stats: result.processingStats,
      status: 'completed'
    };
  }

  private static async processTTSGeneration(payload: any): Promise<any> {
    const { TTSProcessor } = await import('./tts-processor.js');
    const processor = new TTSProcessor();
    
    const { text, voice_id, language, cache_key } = payload;
    
    const result = await processor.generateTTSWithMarks(
      text,
      voice_id,
      language,
      cache_key
    );
    
    return {
      audio_url: result.audioUrl,
      marks_url: result.marksUrl,
      duration: result.duration,
      characters_processed: result.charactersProcessed,
      cache_key
    };
  }

  private static async processEmbeddingCreation(payload: any): Promise<any> {
    const { RAGProcessor } = await import('./rag-processor.js');
    const processor = new RAGProcessor();
    
    const { book_id } = payload;
    
    // Update status to processing
    await processor.updateProcessingStatus(book_id, 'processing');
    
    try {
      const result = await processor.processBookForRAG(book_id);
      
      // Update status to completed
      await processor.updateProcessingStatus(book_id, 'completed');
      
      return {
        book_id,
        chunks_created: result.chunksCreated,
        embeddings_stored: result.embeddingsStored,
        cost_estimate: result.costEstimate,
        status: 'completed'
      };
    } catch (error) {
      // Update status to failed
      await processor.updateProcessingStatus(book_id, 'failed');
      throw error;
    }
  }
}