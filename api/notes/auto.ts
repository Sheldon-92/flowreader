import { withErrorHandling, ApiErrorHandler, createSuccessResponse } from '../_lib/error-handler.js';
import { requireAuthWithSecurity } from '../_lib/auth-enhanced.js';
import { withRateLimit, autoNotesRateLimiter } from '../_lib/rate-limiter.js';
import { inputValidator } from '../_lib/input-validator.js';
import { supabaseAdmin } from '../_lib/auth.js';
import { KnowledgeEnhancer } from '../_lib/knowledge-enhancer.js';
import type {
  AutoNoteRequest,
  AutoNoteResponse,
  AutoNoteMeta,
  NoteMetrics,
  TextSelection,
  IntentType
} from '@flowreader/shared';

interface DialogMessage {
  id: string;
  user_id: string;
  book_id: string;
  role: 'user' | 'assistant';
  content: string;
  intent?: IntentType;
  selection?: TextSelection;
  created_at: string;
}

interface ContentGenerationResult {
  content: string;
  confidence: number;
  generationMethod: 'knowledge_enhancement' | 'dialog_summary' | 'context_analysis';
  sourceData?: any;
  tokens?: number;
  cost?: number;
  processingTime: number;
}

const QUALITY_THRESHOLD = 0.6;
const knowledgeEnhancer = new KnowledgeEnhancer();

async function autoNotesHandler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return ApiErrorHandler.createErrorResponse(
      'METHOD_NOT_ALLOWED',
      'Method not allowed',
      405
    );
  }

  const user = await requireAuthWithSecurity(req);
  return await createAutoNote(req, user);
}

async function createAutoNote(req: Request, user: { id: string; email: string }): Promise<Response> {
  const startTime = Date.now();

  try {
    const body = await req.json();

    // Validate input using enhanced validator
    const validation = inputValidator.validateAutoNoteRequest(body);
    if (!validation.valid) {
      return ApiErrorHandler.createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid request data',
        422,
        { errors: validation.errors }
      );
    }

    const { bookId, selection, intent, contextScope, options } = validation.sanitizedData!;

    // Verify user owns the book
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('id, owner_id, title, author')
      .eq('id', bookId)
      .eq('owner_id', user.id)
      .single();

    if (bookError || !book) {
      return ApiErrorHandler.createErrorResponse(
        'FORBIDDEN',
        'Book not found or access denied',
        403,
        { bookId }
      );
    }

    // Generate content based on the request parameters
    const generationResult = await generateNoteContent({
      userId: user.id,
      bookId,
      selection,
      intent,
      contextScope,
      options
    });

    // Apply quality threshold check
    if (generationResult.confidence < QUALITY_THRESHOLD) {
      return ApiErrorHandler.createErrorResponse(
        'UNPROCESSABLE_ENTITY',
        'Generated content does not meet quality threshold',
        422,
        {
          confidence: generationResult.confidence,
          threshold: QUALITY_THRESHOLD,
          generationMethod: generationResult.generationMethod
        }
      );
    }

    // Validate content length
    if (generationResult.content.length < 50) {
      return ApiErrorHandler.createErrorResponse(
        'UNPROCESSABLE_ENTITY',
        'Generated content too short',
        422,
        { contentLength: generationResult.content.length, minLength: 50 }
      );
    }

    if (generationResult.content.length > 4000) {
      return ApiErrorHandler.createErrorResponse(
        'UNPROCESSABLE_ENTITY',
        'Generated content too long',
        422,
        { contentLength: generationResult.content.length, maxLength: 4000 }
      );
    }

    // Prepare note metadata with enhanced structure
    const meta: AutoNoteMeta = {
      intent,
      generationMethod: generationResult.generationMethod,
      confidence: generationResult.confidence,
      sourceSelection: selection,
      contextScope: contextScope || (selection ? 'selection' : 'recent_dialog'),
      // Enhanced metadata fields
      type: mapGenerationMethodToType(generationResult.generationMethod),
      position: selection ? {
        chapterId: selection.chapterId,
        start: selection.start,
        end: selection.end
      } : undefined,
      qualityScore: calculateQualityScore(generationResult),
      processingInfo: {
        method: generationResult.generationMethod,
        tokens: generationResult.tokens || 0,
        processingTime: generationResult.processingTime
      }
    };

    // Prepare note data for database with enhanced tags
    const noteData = {
      user_id: user.id,
      book_id: bookId,
      content: generationResult.content,
      source: 'auto',
      // Store metadata in tags array for compatibility with existing schema
      tags: [
        `source:auto`,
        `type:${meta.type}`,
        `method:${generationResult.generationMethod}`,
        `confidence:${generationResult.confidence.toFixed(2)}`,
        `quality:${meta.qualityScore.toFixed(2)}`,
        ...(intent ? [`intent:${intent}`] : []),
        ...(selection?.chapterId ? [`chapter:${selection.chapterId}`] : []),
        ...(selection?.start !== undefined ? [`position:${selection.start}-${selection.end || selection.start}`] : []),
        ...(selection ? ['has_selection'] : []),
        `tokens:${generationResult.tokens || 0}`,
        `processing_time:${generationResult.processingTime}`
      ]
    };

    // Save note to database
    const { data: note, error: insertError } = await supabaseAdmin
      .from('notes')
      .insert(noteData)
      .select('*')
      .single();

    if (insertError) {
      console.error('Failed to create auto note:', insertError);
      return ApiErrorHandler.internalServerError('Failed to create note');
    }

    // Prepare metrics if requested
    const metrics: NoteMetrics | undefined = options?.includeMetrics ? {
      tokens: generationResult.tokens || 0,
      cost: generationResult.cost || 0,
      processingTime: Date.now() - startTime
    } : undefined;

    // Transform to API response format
    const response: AutoNoteResponse = {
      id: note.id,
      userId: note.user_id,
      bookId: note.book_id,
      chapterId: selection?.chapterId,
      selection,
      content: note.content,
      source: 'auto',
      meta,
      metrics,
      createdAt: note.created_at
    };

    return createSuccessResponse(response, 201);

  } catch (error) {
    console.error('Auto note creation error:', error);

    // Handle rate limit errors from enhanced auth
    if (error instanceof Error && (error as any).rateLimitInfo) {
      return ApiErrorHandler.createErrorResponse(
        'RATE_LIMITED',
        'Too many requests',
        429,
        { retryAfter: (error as any).rateLimitInfo.retryAfter }
      );
    }

    return ApiErrorHandler.internalServerError('Failed to create auto note');
  }
}

async function generateNoteContent(params: {
  userId: string;
  bookId: string;
  selection?: TextSelection;
  intent?: IntentType;
  contextScope?: string;
  options?: { maxLength?: number; includeMetrics?: boolean };
}): Promise<ContentGenerationResult> {
  const { userId, bookId, selection, intent, contextScope, options } = params;
  const startTime = Date.now();

  try {
    // Scenario 1: Selection + Enhancement Intent
    if (selection && intent === 'enhance') {
      console.log(`🔬 Generating knowledge enhancement for: "${selection.text.substring(0, 50)}..."`);

      let enhancement;
      let tokens = 0;
      let cost = 0;

      // Use T5 knowledge enhancer
      const enhanceGenerator = knowledgeEnhancer.enhanceKnowledge({
        bookId,
        intent: 'enhance',
        selection,
        enhanceType: 'general' // Could be refined based on content analysis
      });

      for await (const chunk of enhanceGenerator) {
        if (chunk.type === 'enhancement') {
          enhancement = chunk.data;
        } else if (chunk.type === 'usage') {
          tokens = chunk.data.tokens_used || 0;
          cost = chunk.data.cost_usd || 0;
        }
      }

      if (!enhancement) {
        throw new Error('Failed to generate knowledge enhancement');
      }

      // Format enhancement as note content
      const content = formatEnhancementAsNote(enhancement, selection.text);

      return {
        content,
        confidence: enhancement.confidence || 0.8,
        generationMethod: 'knowledge_enhancement',
        sourceData: enhancement,
        tokens,
        cost,
        processingTime: Date.now() - startTime
      };
    }

    // Scenario 2: Selection without specific intent
    if (selection && !intent) {
      console.log(`📝 Generating contextual summary for: "${selection.text.substring(0, 50)}..."`);

      const content = await generateContextualSummary(selection, bookId);

      return {
        content,
        confidence: 0.75, // Good confidence for contextual summaries
        generationMethod: 'context_analysis',
        tokens: Math.ceil(content.length / 4), // Rough token estimate
        cost: 0,
        processingTime: Date.now() - startTime
      };
    }

    // Scenario 3: No selection - summarize recent dialog
    if (!selection) {
      console.log(`💬 Generating dialog summary for book: ${bookId}`);

      const recentMessages = await getRecentDialogHistory(userId, bookId, 10);

      if (recentMessages.length === 0) {
        throw new Error('No recent dialog history found to summarize');
      }

      const content = await summarizeDialogHistory(recentMessages, bookId);

      return {
        content,
        confidence: 0.7, // Moderate confidence for dialog summaries
        generationMethod: 'dialog_summary',
        sourceData: { messageCount: recentMessages.length },
        tokens: Math.ceil(content.length / 4), // Rough token estimate
        cost: 0,
        processingTime: Date.now() - startTime
      };
    }

    throw new Error('Invalid combination of parameters for content generation');

  } catch (error) {
    console.error('Content generation failed:', error);

    // Return fallback content with low confidence
    const fallbackContent = generateFallbackContent(selection, intent);

    return {
      content: fallbackContent,
      confidence: 0.3, // Low confidence for fallback
      generationMethod: 'context_analysis',
      tokens: Math.ceil(fallbackContent.length / 4),
      cost: 0,
      processingTime: Date.now() - startTime
    };
  }
}

function formatEnhancementAsNote(enhancement: any, originalText: string): string {
  let content = `**Enhanced Understanding: "${originalText.substring(0, 100)}${originalText.length > 100 ? '...' : ''}"**\n\n`;

  if (enhancement.summary) {
    content += `${enhancement.summary}\n\n`;
  }

  const data = enhancement.data || {};

  // Add concepts
  if (data.concepts && data.concepts.length > 0) {
    content += `**Key Concepts:**\n`;
    data.concepts.forEach((concept: any, index: number) => {
      content += `${index + 1}. **${concept.term}**: ${concept.definition}\n`;
      if (concept.context) {
        content += `   *Context*: ${concept.context}\n`;
      }
    });
    content += `\n`;
  }

  // Add historical references
  if (data.historical && data.historical.length > 0) {
    content += `**Historical Context:**\n`;
    data.historical.forEach((hist: any, index: number) => {
      content += `${index + 1}. **${hist.event}** (${hist.date})\n`;
      content += `   ${hist.relevance}\n`;
    });
    content += `\n`;
  }

  // Add cultural references
  if (data.cultural && data.cultural.length > 0) {
    content += `**Cultural Significance:**\n`;
    data.cultural.forEach((cult: any, index: number) => {
      content += `${index + 1}. **${cult.reference}** (${cult.origin})\n`;
      content += `   ${cult.significance}\n`;
    });
    content += `\n`;
  }

  // Add connections
  if (data.connections && data.connections.length > 0) {
    content += `**Related Topics:**\n`;
    data.connections.forEach((conn: any, index: number) => {
      content += `${index + 1}. ${conn.topic}: ${conn.relationship}\n`;
    });
  }

  return content.trim();
}

async function generateContextualSummary(selection: TextSelection, bookId: string): Promise<string> {
  // Simple contextual summary - could be enhanced with AI in the future
  const selectionText = selection.text;

  if (selectionText.length < 100) {
    return `**Note on**: "${selectionText}"\n\nThis passage appears to be a key point in the text. Consider reviewing the surrounding context for better understanding.`;
  }

  // Extract key themes or entities
  const sentences = selectionText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const firstSentence = sentences[0]?.trim();
  const mainThemes = extractKeyThemes(selectionText);

  let summary = `**Summary of Selected Passage**\n\n`;

  if (firstSentence) {
    summary += `**Opening**: ${firstSentence}.\n\n`;
  }

  if (mainThemes.length > 0) {
    summary += `**Key Themes**: ${mainThemes.join(', ')}\n\n`;
  }

  summary += `**Length**: ${selectionText.length} characters, ${sentences.length} sentences\n\n`;
  summary += `This selection may be significant for understanding the broader context of the work.`;

  return summary;
}

function extractKeyThemes(text: string): string[] {
  // Simple keyword extraction - could be enhanced with NLP
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);

  const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const wordCount = new Map<string, number>();

  words.forEach(word => {
    if (!commonWords.has(word)) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }
  });

  return Array.from(wordCount.entries())
    .filter(([_, count]) => count >= 2)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 5)
    .map(([word, _]) => word);
}

async function getRecentDialogHistory(userId: string, bookId: string, limit: number = 10): Promise<DialogMessage[]> {
  try {
    const { data: messages, error } = await supabaseAdmin
      .from('dialog_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch dialog history:', error);
      return [];
    }

    return messages || [];
  } catch (error) {
    console.error('Dialog history query error:', error);
    return [];
  }
}

async function summarizeDialogHistory(messages: DialogMessage[], bookId: string): Promise<string> {
  if (messages.length === 0) {
    return 'No recent conversation history found.';
  }

  // Sort messages chronologically for summary
  const chronologicalMessages = [...messages].reverse();

  let summary = `**Recent Conversation Summary**\n\n`;
  summary += `**Period**: ${chronologicalMessages[0].created_at.split('T')[0]} to ${chronologicalMessages[chronologicalMessages.length - 1].created_at.split('T')[0]}\n`;
  summary += `**Messages**: ${messages.length} exchanges\n\n`;

  // Group by intent if available
  const intentGroups = new Map<string, DialogMessage[]>();
  messages.forEach(msg => {
    const intent = msg.intent || 'general';
    if (!intentGroups.has(intent)) {
      intentGroups.set(intent, []);
    }
    intentGroups.get(intent)!.push(msg);
  });

  if (intentGroups.size > 1) {
    summary += `**Discussion Topics**:\n`;
    intentGroups.forEach((msgs, intent) => {
      summary += `- ${intent}: ${msgs.length} messages\n`;
    });
    summary += `\n`;
  }

  // Add recent highlights
  const userMessages = messages.filter(m => m.role === 'user').slice(0, 3);
  if (userMessages.length > 0) {
    summary += `**Recent Questions/Comments**:\n`;
    userMessages.forEach((msg, index) => {
      const preview = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
      summary += `${index + 1}. ${preview}\n`;
    });
  }

  return summary;
}

function generateFallbackContent(selection?: TextSelection, intent?: IntentType): string {
  if (selection) {
    return `**Note**: "${selection.text.substring(0, 200)}${selection.text.length > 200 ? '...' : ''}"\n\nThis passage was marked for review. Consider the context and significance within the broader work.`;
  }

  return `**Auto-Generated Note**\n\nA note was requested but insufficient context was available for detailed analysis. Consider providing a text selection or engaging in conversation about specific topics for more meaningful auto-generated content.`;
}

function mapGenerationMethodToType(method: string): string {
  switch (method) {
    case 'knowledge_enhancement':
      return 'enhancement';
    case 'dialog_summary':
      return 'summary';
    case 'context_analysis':
      return 'analysis';
    default:
      return 'note';
  }
}

function calculateQualityScore(generationResult: ContentGenerationResult): number {
  // Calculate quality score based on confidence, content length, and processing time
  const confidenceWeight = 0.6;
  const lengthWeight = 0.3;
  const timeWeight = 0.1;

  // Normalize content length (optimal around 200-800 characters)
  const contentLength = generationResult.content.length;
  const lengthScore = Math.min(1, Math.max(0,
    contentLength < 200 ? contentLength / 200 :
    contentLength > 800 ? Math.max(0, 1 - (contentLength - 800) / 3200) : 1
  ));

  // Normalize processing time (faster is better, but not too fast)
  const processingTime = generationResult.processingTime;
  const timeScore = Math.min(1, Math.max(0,
    processingTime < 1000 ? 0.5 : // Too fast might indicate simple processing
    processingTime > 30000 ? Math.max(0, 1 - (processingTime - 30000) / 30000) : 1
  ));

  const qualityScore = (
    generationResult.confidence * confidenceWeight +
    lengthScore * lengthWeight +
    timeScore * timeWeight
  );

  return Math.min(1, Math.max(0, qualityScore));
}

// Apply rate limiting and error handling
export default withErrorHandling(
  withRateLimit(autoNotesRateLimiter)(autoNotesHandler)
);