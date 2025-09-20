import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/auth.js';
import type { Book } from '@flowreader/shared';

/**
 * Library API Endpoint
 * 
 * Provides comprehensive library data including books, statistics, and reading progress
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Basic authentication check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization' });
    }

    const { userId, limit = 50, offset = 0, search, sortBy = 'recent' } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID is required' });
    }

    console.log(`📚 Loading library for user: ${userId}`);

    // Build query
    let query = supabaseAdmin
      .from('books')
      .select('*')
      .eq('owner_id', userId);

    // Add search filter if provided
    if (search && typeof search === 'string') {
      query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%`);
    }

    // Add sorting
    switch (sortBy) {
      case 'title':
        query = query.order('title', { ascending: true });
        break;
      case 'author':
        query = query.order('author', { ascending: true });
        break;
      case 'progress':
        query = query.order('reading_progress->percentage', { ascending: false });
        break;
      case 'recent':
      default:
        query = query.order('upload_date', { ascending: false });
        break;
    }

    // Add pagination
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const offsetNum = parseInt(offset as string) || 0;
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data: books, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate statistics
    const stats = calculateLibraryStats(books as Book[]);

    // Get recently read books
    const recentlyRead = getRecentlyRead(books as Book[]);

    // Get reading recommendations (simple logic for now)
    const recommendations = getReadingRecommendations(books as Book[]);

    console.log(`✅ Loaded ${books?.length || 0} books for user ${userId}`);

    return res.status(200).json({
      books: books || [],
      stats,
      recentlyRead,
      recommendations,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: (books?.length || 0) === limitNum
      }
    });

  } catch (error) {
    console.error('❌ Library loading failed:', error);
    
    return res.status(500).json({
      error: 'Failed to load library',
      timestamp: new Date().toISOString()
    });
  }
}

function calculateLibraryStats(books: Book[]) {
  const totalBooks = books.length;
  const totalWords = books.reduce((sum, book) => sum + (book.metadata?.word_count || 0), 0);
  const totalSize = books.reduce((sum, book) => sum + book.file_size, 0);
  
  const readingBooks = books.filter(book => 
    book.reading_progress && book.reading_progress.percentage > 0 && book.reading_progress.percentage < 100
  ).length;
  
  const finishedBooks = books.filter(book => 
    book.reading_progress && book.reading_progress.percentage >= 100
  ).length;
  
  const unreadBooks = totalBooks - readingBooks - finishedBooks;
  
  const averageProgress = totalBooks > 0 
    ? books.reduce((sum, book) => sum + (book.reading_progress?.percentage || 0), 0) / totalBooks
    : 0;

  const estimatedReadingTime = books.reduce((sum, book) => 
    sum + (book.metadata?.estimated_reading_time || 0), 0
  );

  // Calculate completion rate
  const completionRate = totalBooks > 0 ? (finishedBooks / totalBooks) * 100 : 0;

  // Get genre distribution
  const genres = books
    .map(book => book.metadata?.genre)
    .filter(Boolean)
    .reduce((acc, genre) => {
      acc[genre!] = (acc[genre!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const topGenres = Object.entries(genres)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([genre, count]) => ({ genre, count }));

  return {
    totalBooks,
    totalWords,
    totalSize,
    readingBooks,
    finishedBooks,
    unreadBooks,
    averageProgress: Math.round(averageProgress * 100) / 100,
    estimatedReadingTime,
    completionRate: Math.round(completionRate * 100) / 100,
    topGenres
  };
}

function getRecentlyRead(books: Book[]): Book[] {
  return books
    .filter(book => book.reading_progress && book.reading_progress.last_read)
    .sort((a, b) => {
      const aTime = new Date(a.reading_progress?.last_read || 0).getTime();
      const bTime = new Date(b.reading_progress?.last_read || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 5);
}

function getReadingRecommendations(books: Book[]): { 
  continueReading: Book[];
  startNext: Book[];
  similarBooks: Book[];
} {
  // Books to continue reading (in progress, recently active)
  const continueReading = books
    .filter(book => 
      book.reading_progress && 
      book.reading_progress.percentage > 0 && 
      book.reading_progress.percentage < 100
    )
    .sort((a, b) => {
      const aTime = new Date(a.reading_progress?.last_read || 0).getTime();
      const bTime = new Date(b.reading_progress?.last_read || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 3);

  // Unread books to start next (prefer shorter books or popular genres)
  const startNext = books
    .filter(book => !book.reading_progress || book.reading_progress.percentage === 0)
    .sort((a, b) => (a.metadata?.word_count || 0) - (b.metadata?.word_count || 0))
    .slice(0, 3);

  // Similar books based on finished books' genres (simple implementation)
  const finishedGenres = books
    .filter(book => book.reading_progress && book.reading_progress.percentage >= 100)
    .map(book => book.metadata?.genre)
    .filter(Boolean);

  const similarBooks = books
    .filter(book => 
      (!book.reading_progress || book.reading_progress.percentage === 0) &&
      book.metadata?.genre &&
      finishedGenres.includes(book.metadata.genre)
    )
    .slice(0, 3);

  return {
    continueReading,
    startNext,
    similarBooks
  };
}