/**
 * EPUB Processing Implementation
 * 
 * Based on the EPUB performance spike validation,
 * this implements the production-ready EPUB processing pipeline
 */

import { supabaseAdmin } from './auth.js';
import { SecureEPUBParser } from '../_spikes/epub-performance-test.js';
import type { Book, Chapter } from '@flowreader/shared';

export class EPUBProcessor {
  private parser: SecureEPUBParser;

  constructor() {
    this.parser = new SecureEPUBParser();
  }

  /**
   * Process uploaded EPUB file and create book + chapters
   */
  async processUploadedEPUB(
    fileBuffer: Buffer,
    fileName: string,
    userId: string
  ): Promise<{
    book: Book;
    chaptersCount: number;
    processingStats: {
      fileSize: number;
      processingTime: number;
      memoryUsed: number;
      wordCount: number;
    };
  }> {
    try {
      console.log(`📚 Processing EPUB upload: ${fileName} for user ${userId}`);

      // Parse EPUB file
      const parseResult = await this.parser.parseEPUB(fileBuffer, fileName);

      // Create book record
      const book = await this.createBookRecord(
        parseResult.metadata,
        fileName,
        fileBuffer.length,
        userId,
        parseResult.stats
      );

      // Create chapter records
      await this.createChapterRecords(book.id, parseResult.chapters);

      // Trigger embedding creation task
      await this.triggerEmbeddingCreation(book.id, userId);

      console.log(`✅ EPUB processing completed: ${book.id}`);

      return {
        book,
        chaptersCount: parseResult.chapters.length,
        processingStats: parseResult.stats
      };

    } catch (error) {
      console.error('EPUB processing failed:', error);
      throw new Error(`EPUB processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createBookRecord(
    metadata: any,
    fileName: string,
    fileSize: number,
    userId: string,
    stats: any
  ): Promise<Book> {
    try {
      // Upload file to storage first
      const filePath = await this.uploadFileToStorage(fileName, userId);

      const bookData = {
        owner_id: userId,
        title: metadata.title,
        author: metadata.author,
        file_path: filePath,
        file_size: fileSize,
        metadata: {
          language: metadata.language,
          identifier: metadata.identifier,
          word_count: stats.wordCount,
          estimated_reading_time: Math.ceil(stats.wordCount / 250), // 250 WPM average
          chapter_count: stats.chaptersCount,
          processing_stats: {
            processing_time: stats.processingTime,
            memory_used: stats.memoryUsed
          }
        },
        reading_progress: {
          current_cfi: '',
          current_chapter: 0,
          percentage: 0,
          last_read: null
        }
      };

      const { data: book, error } = await supabaseAdmin
        .from('books')
        .insert(bookData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return book as Book;

    } catch (error) {
      console.error('Failed to create book record:', error);
      throw error;
    }
  }

  private async createChapterRecords(bookId: string, chapters: any[]): Promise<void> {
    try {
      const chapterRecords = chapters.map(chapter => ({
        book_id: bookId,
        idx: chapter.order,
        title: chapter.title,
        text: chapter.content,
        word_count: this.countWords(chapter.content)
      }));

      // Insert chapters in batches to avoid large transactions
      const batchSize = 10;
      for (let i = 0; i < chapterRecords.length; i += batchSize) {
        const batch = chapterRecords.slice(i, i + batchSize);
        
        const { error } = await supabaseAdmin
          .from('chapters')
          .insert(batch);

        if (error) {
          throw error;
        }
      }

      console.log(`📝 Created ${chapterRecords.length} chapter records`);

    } catch (error) {
      console.error('Failed to create chapter records:', error);
      throw error;
    }
  }

  private async uploadFileToStorage(fileName: string, userId: string): Promise<string> {
    try {
      // In production, this would upload the actual file to Supabase Storage
      // For now, return a mock path
      const timestamp = Date.now();
      const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      return `books/${userId}/${timestamp}-${safeName}`;
    } catch (error) {
      console.error('Failed to upload file to storage:', error);
      throw error;
    }
  }

  private async triggerEmbeddingCreation(bookId: string, userId: string): Promise<void> {
    try {
      // Import TaskQueue to avoid circular dependencies
      const { TaskQueue } = await import('./queue.js');
      
      await TaskQueue.createTask(
        'embedding_create',
        {
          user_id: userId,
          book_id: bookId
        }
      );

      console.log(`🔮 Triggered embedding creation for book ${bookId}`);

    } catch (error) {
      console.warn('Failed to trigger embedding creation:', error);
      // Don't throw - the book was created successfully
    }
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Get book content for reading
   */
  async getBookContent(
    bookId: string, 
    userId: string, 
    chapterIdx?: number
  ): Promise<{
    book: Book;
    chapters: Chapter[];
    currentChapter?: Chapter;
  }> {
    try {
      // Get book record
      const { data: book, error: bookError } = await supabaseAdmin
        .from('books')
        .select('*')
        .eq('id', bookId)
        .or(`owner_id.eq.${userId},namespace.eq.public`)
        .single();

      if (bookError || !book) {
        throw new Error('Book not found');
      }

      // Get chapters
      let chaptersQuery = supabaseAdmin
        .from('chapters')
        .select('*')
        .eq('book_id', bookId)
        .order('idx');

      if (chapterIdx !== undefined) {
        chaptersQuery = chaptersQuery.eq('idx', chapterIdx);
      }

      const { data: chapters, error: chaptersError } = await chaptersQuery;

      if (chaptersError) {
        throw chaptersError;
      }

      const currentChapter = chapterIdx !== undefined ? chapters[0] : undefined;

      return {
        book: book as Book,
        chapters: chapters as Chapter[],
        currentChapter: currentChapter as Chapter
      };

    } catch (error) {
      console.error('Failed to get book content:', error);
      throw error;
    }
  }

  /**
   * Update book reading progress
   */
  async updateReadingProgress(
    bookId: string,
    userId: string,
    progress: {
      chapterIdx: number;
      cfiPosition: string;
      percentage: number;
    }
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .rpc('update_reading_position', {
          p_user_id: userId,
          p_book_id: bookId,
          p_chapter_idx: progress.chapterIdx,
          p_cfi_position: progress.cfiPosition,
          p_percentage: progress.percentage
        });

      if (error) {
        throw error;
      }

    } catch (error) {
      console.error('Failed to update reading progress:', error);
      throw error;
    }
  }

  /**
   * Search books in user's library
   */
  async searchBooks(
    userId: string,
    query: string,
    limit: number = 20
  ): Promise<Book[]> {
    try {
      const { data: books, error } = await supabaseAdmin
        .from('books')
        .select('*')
        .or(`owner_id.eq.${userId},namespace.eq.public`)
        .or(`title.ilike.%${query}%,author.ilike.%${query}%`)
        .limit(limit)
        .order('upload_date', { ascending: false });

      if (error) {
        throw error;
      }

      return books as Book[];

    } catch (error) {
      console.error('Failed to search books:', error);
      throw error;
    }
  }

  /**
   * Get book statistics
   */
  async getBookStatistics(bookId: string, userId: string): Promise<{
    totalWords: number;
    totalChapters: number;
    readingProgress: number;
    estimatedReadingTime: number;
    timeSpent?: number;
  }> {
    try {
      const { data: book, error: bookError } = await supabaseAdmin
        .from('books')
        .select('metadata, reading_progress')
        .eq('id', bookId)
        .or(`owner_id.eq.${userId},namespace.eq.public`)
        .single();

      if (bookError || !book) {
        throw new Error('Book not found');
      }

      const { data: chaptersCount } = await supabaseAdmin
        .from('chapters')
        .select('id', { count: 'exact' })
        .eq('book_id', bookId);

      const stats = {
        totalWords: book.metadata?.word_count || 0,
        totalChapters: chaptersCount?.length || 0,
        readingProgress: book.reading_progress?.percentage || 0,
        estimatedReadingTime: book.metadata?.estimated_reading_time || 0,
        timeSpent: undefined // TODO: Track actual reading time
      };

      return stats;

    } catch (error) {
      console.error('Failed to get book statistics:', error);
      throw error;
    }
  }

  /**
   * Delete book and all associated data
   */
  async deleteBook(bookId: string, userId: string): Promise<void> {
    try {
      // Verify ownership
      const { data: book, error: bookError } = await supabaseAdmin
        .from('books')
        .select('id, owner_id')
        .eq('id', bookId)
        .eq('owner_id', userId)
        .single();

      if (bookError || !book) {
        throw new Error('Book not found or access denied');
      }

      // Delete will cascade to chapters, embeddings, etc. due to foreign key constraints
      const { error: deleteError } = await supabaseAdmin
        .from('books')
        .delete()
        .eq('id', bookId);

      if (deleteError) {
        throw deleteError;
      }

      console.log(`🗑️  Deleted book ${bookId} and all associated data`);

    } catch (error) {
      console.error('Failed to delete book:', error);
      throw error;
    }
  }
}