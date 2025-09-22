import { VercelRequest, VercelResponse } from '@vercel/node';
import { RAGProcessor } from '../_lib/rag-processor.js';
import { KnowledgeEnhancer, type KnowledgeEnhanceRequest } from '../_lib/knowledge-enhancer.js';
import { requireAuthWithSecurity, convertVercelRequest, enhancedAuth } from '../_lib/auth-enhanced.js';
import { chatRateLimiter } from '../_lib/rate-limiter.js';
import { supabaseAdmin } from '../_lib/auth.js';

// Intent-based request interface
interface ContextActionRequest {
  bookId: string;
  intent?: 'translate' | 'explain' | 'analyze' | 'ask' | 'enhance';
  selection?: {
    text: string;
    start?: number;
    end?: number;
    chapterId?: string;
  };
  query?: string;
  targetLang?: string;
  enhanceType?: 'concept' | 'historical' | 'cultural' | 'general';
  // Legacy field removed for security - userId now extracted from JWT token
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Convert VercelRequest to standard Request for enhanced auth
    const standardReq = convertVercelRequest(req);

    // Apply rate limiting first
    const rateLimitResult = await chatRateLimiter.checkLimit(standardReq);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          retryAfter: rateLimitResult.retryAfter
        }
      });
    }

    // Enhanced authentication with security logging
    let user;
    try {
      user = await requireAuthWithSecurity(standardReq);
    } catch (authError: any) {
      const statusCode = authError.message?.includes('Rate limit') ? 429 : 401;
      return res.status(statusCode).json({
        error: authError.message || 'Authentication required'
      });
    }

    const { bookId, intent, selection, query, targetLang, enhanceType } = req.body as ContextActionRequest;

    // Validate required fields
    if (!bookId) {
      return res.status(400).json({ error: 'Missing required field: bookId' });
    }

    // Validate intent-specific requirements
    if (intent && !['translate', 'explain', 'analyze', 'ask', 'enhance'].includes(intent)) {
      return res.status(422).json({ error: 'Invalid intent. Must be one of: translate, explain, analyze, ask, enhance' });
    }

    if (intent && intent !== 'ask' && (!selection || !selection.text)) {
      return res.status(400).json({ error: 'Selection with text is required for this intent' });
    }

    if (intent === 'enhance' && enhanceType && !['concept', 'historical', 'cultural', 'general'].includes(enhanceType)) {
      return res.status(422).json({ error: 'Invalid enhanceType. Must be one of: concept, historical, cultural, general' });
    }

    if (intent === 'ask' && !query) {
      return res.status(400).json({ error: 'Query is required for ask intent' });
    }

    if (intent === 'translate' && !targetLang) {
      return res.status(422).json({ error: 'Target language is required for translate intent' });
    }

    // Validate targetLang format (ISO 639-1 or locale format)
    if (targetLang && !/^[a-z]{2}(-[A-Z]{2})?$/.test(targetLang)) {
      return res.status(422).json({ error: 'Invalid target language format. Use ISO 639-1 (e.g., "en", "zh-CN")' });
    }

    // Truncate selection text if too long (max 1000 chars)
    if (selection?.text && selection.text.length > 1000) {
      selection.text = selection.text.substring(0, 1000) + '...';
    }

    // Legacy compatibility: if no intent but has query, treat as original chat
    const isLegacyRequest = !intent && query;

    if (isLegacyRequest && (!bookId || !query)) {
      return res.status(400).json({ error: 'Missing required fields for legacy request: bookId, query' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Initialize Supabase client
    // Use admin client for database operations with RLS

    // Get user ID from authenticated user
    const actualUserId = user.id;

    // For legacy requests, we now always use the authenticated user ID (no validation needed)

    // Get book and verify access with proper user isolation
    const { data: book, error: bookError } = await supabaseAdmin
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('owner_id', actualUserId)
      .single();

    if (bookError || !book) {
      // Log security event for unauthorized book access attempt
      await enhancedAuth.logSecurityEvent(
        'unauthorized_book_access',
        actualUserId,
        {
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          endpoint: 'POST /api/chat/stream'
        },
        {
          book_id: bookId,
          error: bookError?.message || 'Book not found'
        },
        'medium'
      );

      const statusCode = bookError?.code === 'PGRST116' ? 404 : 403;
      res.write('event: error\n');
      res.write(`data: {"error": "${statusCode === 404 ? 'Book not found' : 'Access denied'}"}\n\n`);
      res.end();
      return;
    }

    // Handle intent-based requests
    if (intent) {
      await handleIntentRequest(res, supabaseAdmin, book, intent, selection, query, targetLang, enhanceType, actualUserId);
    } else {
      // Legacy chat behavior
      await handleLegacyChat(res, book, query);
    }

  } catch (error) {
    console.error('Chat stream endpoint error:', error);

    // Log security event for system errors
    try {
      const standardReq = convertVercelRequest(req);
      await enhancedAuth.logSecurityEvent(
        'system_error',
        null,
        {
          ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          endpoint: 'POST /api/chat/stream'
        },
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        },
        'critical'
      );
    } catch (logError) {
      console.error('Failed to log security event:', logError);
    }

    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write('event: error\n');
      res.write('data: {"error": "Internal server error"}\n\n');
      res.end();
    }
  }
}

async function handleIntentRequest(
  res: VercelResponse,
  supabaseAdmin: any,
  book: any,
  intent: string,
  selection: any,
  query?: string,
  targetLang?: string,
  enhanceType?: string,
  userId?: string
) {
  try {
    // Handle knowledge enhancement intent
    if (intent === 'enhance') {
      await handleKnowledgeEnhancement(res, book, selection, enhanceType);
      return;
    }

    // Initialize RAG processor for other intents
    const ragProcessor = new RAGProcessor();

    // Check if book is processed for RAG
    const isProcessed = await ragProcessor.isBookProcessed(book.id);
    if (!isProcessed) {
      // For demo purposes, we'll proceed without RAG context
      console.warn(`Book ${book.id} not processed for RAG, using simple context`);
    }

    // Build context for intent
    const context = await buildIntentContext(supabaseAdmin, book, selection, query, intent, userId);

    // Generate system and user prompts based on intent
    const { systemPrompt, userPrompt } = buildIntentPrompts(intent, selection?.text, query, targetLang, context);

    // Send sources event
    res.write('event: sources\n');
    res.write(`data: {"sources": [{"title": "${book.title}", "type": "book", "selection": ${!!selection}}]}\n\n`);

    // Use RAG processor if available, otherwise fallback to simple response
    if (isProcessed) {
      // Use enhanced RAG for better responses
      const ragRequest = {
        book_id: book.id,
        message: userPrompt,
        selection: selection?.text || '',
        chapter_idx: selection?.chapterId ? parseInt(selection.chapterId) : undefined
      };

      const streamGenerator = ragProcessor.streamChatResponse(ragRequest);

      for await (const chunk of streamGenerator) {
        if (chunk.type === 'token') {
          res.write('event: token\n');
          res.write(`data: {"token": "${chunk.data}"}\n\n`);
        } else if (chunk.type === 'usage') {
          res.write('event: usage\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
        } else if (chunk.type === 'done') {
          res.write('event: done\n');
          res.write(`data: {"timestamp": "${new Date().toISOString()}"}\n\n`);
        } else if (chunk.type === 'error') {
          res.write('event: error\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
        }
      }
    } else {
      // Fallback to simulated response for demo
      await simulateIntentResponse(res, intent, selection?.text, query, targetLang, book.title);
    }

    res.end();

  } catch (error) {
    console.error('Intent request failed:', error);
    res.write('event: error\n');
    res.write('data: {"error": "Failed to process intent request"}\n\n');
    res.end();
  }
}

async function handleKnowledgeEnhancement(
  res: VercelResponse,
  book: any,
  selection: any,
  enhanceType?: string
) {
  try {
    console.log(`🧠 Processing knowledge enhancement for book "${book.title}"`);

    // Validate selection
    if (!selection || !selection.text) {
      res.write('event: error\n');
      res.write('data: {"error": "Selection with text is required for knowledge enhancement"}\n\n');
      res.end();
      return;
    }

    // Initialize knowledge enhancer
    const knowledgeEnhancer = new KnowledgeEnhancer();

    // Build knowledge enhancement request
    const enhanceRequest: KnowledgeEnhanceRequest = {
      bookId: book.id,
      intent: 'enhance',
      selection: {
        text: selection.text,
        start: selection.start,
        end: selection.end,
        chapterId: selection.chapterId
      },
      enhanceType: enhanceType as any
    };

    // Stream enhancement response
    const streamGenerator = knowledgeEnhancer.enhanceKnowledge(enhanceRequest);

    for await (const chunk of streamGenerator) {
      switch (chunk.type) {
        case 'sources':
          res.write('event: sources\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;

        case 'enhancement':
          res.write('event: enhancement\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;

        case 'usage':
          res.write('event: usage\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;

        case 'done':
          res.write('event: done\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;

        case 'error':
          res.write('event: error\n');
          res.write(`data: ${JSON.stringify(chunk.data)}\n\n`);
          break;
      }

      if (res.destroyed) {
        break;
      }
    }

    res.end();

  } catch (error) {
    console.error('Knowledge enhancement failed:', error);
    res.write('event: error\n');
    res.write('data: {"error": "Failed to process knowledge enhancement"}\n\n');
    res.end();
  }
}

async function buildIntentContext(
  supabaseAdmin: any,
  book: any,
  selection: any,
  query?: string,
  intent?: string,
): Promise<string> {
  let context = `Book: "${book.title}" by ${book.author || 'Unknown Author'}\n\n`;

  if (selection?.text) {
    context += `Selected text: "${selection.text}"\n\n`;
  }

  if (selection?.chapterId) {
    // Try to get chapter context with user isolation
    const { data: chapter } = await supabaseAdmin
      .from('chapters')
      .select('title, idx, book_id')
      .eq('id', selection.chapterId)
      .eq('book_id', book.id)
      .single();

    // Verify the chapter belongs to a book owned by the user
    if (chapter && chapter.book_id === book.id) {
      context += `From Chapter ${chapter.idx + 1}: "${chapter.title}"\n\n`;
    }
  }

  return context;
}

function buildIntentPrompts(
  intent: string,
  selectionText?: string,
  query?: string,
  targetLang?: string,
  context?: string
): { systemPrompt: string; userPrompt: string } {
  let systemPrompt = '';
  let userPrompt = context || '';

  switch (intent) {
    case 'translate':
      systemPrompt = `You are a professional translator. Translate the given text accurately while preserving the original meaning, tone, and style. Provide only the translation without explanations unless specifically asked.`;

      const langNames: { [key: string]: string } = {
        'zh-CN': 'Simplified Chinese',
        'zh-TW': 'Traditional Chinese',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ru': 'Russian',
        'ar': 'Arabic',
        'hi': 'Hindi'
      };

      const targetLanguage = langNames[targetLang!] || targetLang;
      userPrompt += `Please translate the following text to ${targetLanguage}:\n\n"${selectionText}"`;
      break;

    case 'explain':
      systemPrompt = `You are a helpful reading companion. Explain concepts, references, or passages in a clear and accessible way. Focus on helping the reader understand the context, meaning, and significance of the selected text.`;
      userPrompt += `Please explain this passage from the book:\n\n"${selectionText}"\n\nHelp me understand its meaning, context, and significance within the story.`;
      break;

    case 'analyze':
      systemPrompt = `You are a literary analyst. Provide thoughtful analysis of text passages, examining themes, literary devices, character development, symbolism, and other literary elements. Be insightful but accessible.`;
      userPrompt += `Please analyze this passage from the book:\n\n"${selectionText}"\n\nExamine its literary elements, themes, and significance within the larger work.`;
      break;

    case 'ask':
      systemPrompt = `You are an AI reading companion for FlowReader. Help readers understand and engage with their books through thoughtful discussion. Base your responses on the book context provided and be conversational and helpful.`;
      userPrompt += `Reader's question: ${query}\n\nPlease provide a helpful response based on the book context.`;
      break;

    default:
      systemPrompt = `You are a helpful AI assistant for FlowReader.`;
      userPrompt += query || `Please help with: ${selectionText}`;
  }

  return { systemPrompt, userPrompt };
}

async function simulateIntentResponse(
  res: VercelResponse,
  intent: string,
  selectionText?: string,
  query?: string,
  targetLang?: string,
  bookTitle?: string
) {
  let response = '';

  switch (intent) {
    case 'translate':
      if (targetLang === 'zh-CN') {
        response = '这是一个模拟的翻译结果。在实际实现中，这里会显示所选文本的中文翻译。';
      } else {
        response = `This is a simulated translation to ${targetLang}. In the actual implementation, this would show the translation of the selected text.`;
      }
      break;

    case 'explain':
      response = `This passage appears to be significant within the context of "${bookTitle}". The selected text "${selectionText?.substring(0, 50)}..." likely relates to key themes or character development in the story. A full explanation would analyze the meaning, context, and literary significance of this passage.`;
      break;

    case 'analyze':
      response = `Literary analysis of the selected passage from "${bookTitle}": This text demonstrates several literary techniques and thematic elements. The author's use of language, imagery, and narrative structure contributes to the overall meaning. A detailed analysis would examine specific literary devices, character development, and thematic significance.`;
      break;

    case 'ask':
      response = `Based on "${bookTitle}", I can help answer your question: "${query}". This is a simulated AI response that would normally provide detailed insights based on the book's content and context using the enhanced RAG system.`;
      break;

    default:
      response = `Simulated response for intent: ${intent}`;
  }

  // Simulate streaming by splitting response into words
  const words = response.split(' ');

  for (let i = 0; i < words.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));

    res.write('event: token\n');
    res.write(`data: {"token": "${words[i]}${i < words.length - 1 ? ' ' : ''}"}\n\n`);

    if (res.destroyed) break;
  }

  // Send usage event
  res.write('event: usage\n');
  res.write(`data: {"tokens": ${words.length}, "cost": 0.001}\n\n`);

  // Send done event
  res.write('event: done\n');
  res.write(`data: {"timestamp": "${new Date().toISOString()}"}\n\n`);
}

async function handleLegacyChat(res: VercelResponse, book: any, query: string) {
  // Send sources event
  res.write('event: sources\n');
  res.write(`data: {"sources": [{"title": "${book.title}", "type": "book"}]}\n\n`);

  // Simulate streaming AI response
  const mockResponse = `Based on the book "${book.title}", I can help answer your question about: ${query}. This is a simulated AI response that would normally come from OpenAI GPT-4.`;

  const words = mockResponse.split(' ');

  for (let i = 0; i < words.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate processing delay

    res.write('event: token\n');
    res.write(`data: {"token": "${words[i]}${i < words.length - 1 ? ' ' : ''}"}\n\n`);

    if (res.destroyed) break;
  }

  // Send usage event
  res.write('event: usage\n');
  res.write(`data: {"tokens": ${words.length}, "cost": 0.001}\n\n`);

  // Send done event
  res.write('event: done\n');
  res.write(`data: {"timestamp": "${new Date().toISOString()}"}\n\n`);

  res.end();
}