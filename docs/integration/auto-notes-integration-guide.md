# Auto Notes Integration Guide

## Overview

This guide provides comprehensive integration patterns for implementing auto notes functionality in FlowReader applications. It covers both frontend and backend integration strategies, common use cases, and best practices for seamless user experiences.

## Frontend Integration Patterns

### 1. Text Selection Integration

#### Basic Text Selection Handler

Integrate auto note creation with text selection in reading interface:

```javascript
class AutoNoteTextSelection {
  constructor(apiClient, notesManager) {
    this.apiClient = apiClient;
    this.notesManager = notesManager;
    this.initializeSelectionHandlers();
  }

  initializeSelectionHandlers() {
    document.addEventListener('mouseup', this.handleTextSelection.bind(this));
    document.addEventListener('touchend', this.handleTextSelection.bind(this));
  }

  async handleTextSelection(event) {
    const selection = window.getSelection();

    if (selection.rangeCount === 0 || selection.toString().trim().length < 10) {
      return; // Skip very short selections
    }

    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);

    // Extract context information
    const selectionData = {
      text: selectedText,
      start: this.getSelectionStart(range),
      end: this.getSelectionEnd(range),
      chapterId: this.getCurrentChapterId()
    };

    // Show auto note creation options
    this.showAutoNoteOptions(selectionData, event);
  }

  showAutoNoteOptions(selectionData, event) {
    const menu = this.createSelectionMenu([
      {
        label: 'Enhance with AI',
        icon: '🔬',
        action: () => this.createAutoNote(selectionData, 'enhance')
      },
      {
        label: 'Quick Summary',
        icon: '📝',
        action: () => this.createAutoNote(selectionData)
      },
      {
        label: 'Analyze Passage',
        icon: '🔍',
        action: () => this.createAutoNote(selectionData, 'analyze')
      }
    ]);

    this.positionMenu(menu, event);
  }

  async createAutoNote(selectionData, intent = null) {
    try {
      // Show loading indicator
      this.showLoadingIndicator('Generating note...');

      const request = {
        bookId: this.getCurrentBookId(),
        selection: selectionData,
        options: { includeMetrics: true }
      };

      if (intent) {
        request.intent = intent;
      }

      const note = await this.apiClient.createAutoNote(request);

      // Add note to UI
      await this.notesManager.addNote(note);

      // Show success feedback
      this.showSuccessMessage('Auto note created successfully');

      // Analytics tracking
      this.trackAutoNoteCreation(intent, note.meta.confidence);

    } catch (error) {
      this.handleAutoNoteError(error, selectionData);
    } finally {
      this.hideLoadingIndicator();
    }
  }

  handleAutoNoteError(error, selectionData) {
    if (error.response?.status === 422) {
      // Quality threshold not met - offer manual note creation
      this.showFallbackOptions(selectionData, error.response.data);
    } else if (error.response?.status === 429) {
      // Rate limited - show retry timer
      this.showRateLimitMessage(error.response.data.details.reset_time);
    } else {
      // General error - offer manual fallback
      this.showErrorMessage('Auto note creation failed. Create manual note?',
        () => this.createManualNote(selectionData));
    }
  }
}
```

#### React Component Integration

For React-based reading interfaces:

```jsx
import { useState, useCallback } from 'react';
import { useAutoNotes } from '../hooks/useAutoNotes';
import { useSelection } from '../hooks/useSelection';

const ReadingInterface = ({ book, chapter }) => {
  const { createAutoNote, isLoading, error } = useAutoNotes();
  const { selectedText, selectionRange } = useSelection();
  const [showNoteOptions, setShowNoteOptions] = useState(false);

  const handleTextSelection = useCallback(async (intent) => {
    if (!selectedText) return;

    try {
      const note = await createAutoNote({
        bookId: book.id,
        selection: {
          text: selectedText,
          ...selectionRange,
          chapterId: chapter.id
        },
        intent,
        options: { includeMetrics: true }
      });

      // Update notes state
      onNoteCreated(note);
      setShowNoteOptions(false);

    } catch (error) {
      console.error('Auto note creation failed:', error);
    }
  }, [selectedText, selectionRange, book.id, chapter.id]);

  return (
    <div className="reading-interface">
      <div className="text-content" onMouseUp={() => selectedText && setShowNoteOptions(true)}>
        {chapter.content}
      </div>

      {showNoteOptions && (
        <SelectionMenu
          onEnhance={() => handleTextSelection('enhance')}
          onSummarize={() => handleTextSelection()}
          onAnalyze={() => handleTextSelection('analyze')}
          onClose={() => setShowNoteOptions(false)}
          isLoading={isLoading}
        />
      )}

      {error && (
        <ErrorMessage
          error={error}
          onRetry={() => handleTextSelection()}
          onFallback={() => createManualNote(selectedText)}
        />
      )}
    </div>
  );
};
```

### 2. Chat Interface Integration

#### Post-Conversation Note Generation

Integrate auto note creation after AI conversations:

```javascript
class ChatAutoNotes {
  constructor(apiClient, chatManager) {
    this.apiClient = apiClient;
    this.chatManager = chatManager;
  }

  async onConversationEnd(bookId, conversationId) {
    // Check if conversation has enough content for summary
    const messages = await this.chatManager.getConversationMessages(conversationId);

    if (messages.length < 3) {
      return; // Skip very short conversations
    }

    // Offer auto note creation
    this.showConversationSummaryOption(bookId, messages);
  }

  showConversationSummaryOption(bookId, messages) {
    const prompt = this.createPrompt({
      title: 'Create Conversation Summary?',
      message: `Generate an auto note summarizing your ${messages.length} message conversation?`,
      actions: [
        {
          label: 'Create Summary',
          primary: true,
          action: () => this.createConversationSummary(bookId)
        },
        {
          label: 'Skip',
          action: () => this.dismissPrompt()
        }
      ]
    });

    this.showPrompt(prompt);
  }

  async createConversationSummary(bookId) {
    try {
      const note = await this.apiClient.createAutoNote({
        bookId,
        contextScope: 'recent_dialog',
        options: {
          includeMetrics: true,
          maxLength: 1500
        }
      });

      // Show summary note with conversation link
      this.showSummaryNote(note);

    } catch (error) {
      console.error('Conversation summary failed:', error);
      this.showError('Failed to create conversation summary');
    }
  }

  // Intelligent conversation triggers
  async checkForAutoNoteOpportunities(bookId, newMessage) {
    const conversation = await this.chatManager.getCurrentConversation();

    // Trigger conditions
    const conditions = [
      () => conversation.messages.length % 5 === 0, // Every 5 messages
      () => this.hasComplexTopics(conversation.messages), // Complex discussions
      () => this.hasMultipleIntents(conversation.messages), // Multiple intent types
      () => this.hasLongPauses(conversation.messages) // Natural break points
    ];

    if (conditions.some(condition => condition())) {
      this.suggestConversationSummary(bookId);
    }
  }
}
```

### 3. Batch Note Generation

#### Multiple Selection Processing

Handle multiple text selections for batch note creation:

```javascript
class BatchAutoNotes {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.batchQueue = [];
    this.maxBatchSize = 5;
  }

  async addToBatch(bookId, selection, intent) {
    const batchItem = {
      id: this.generateBatchId(),
      bookId,
      selection,
      intent,
      status: 'pending'
    };

    this.batchQueue.push(batchItem);

    // Auto-process when batch is full
    if (this.batchQueue.length >= this.maxBatchSize) {
      await this.processBatch();
    }

    return batchItem.id;
  }

  async processBatch() {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    // Show batch processing UI
    this.showBatchProgress(batch);

    // Process items with rate limiting consideration
    const results = await this.processWithRateLimit(batch);

    // Update UI with results
    this.showBatchResults(results);
  }

  async processWithRateLimit(batch) {
    const results = [];
    const delay = 3000; // 3 seconds between requests to respect rate limits

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];

      try {
        item.status = 'processing';
        this.updateBatchProgress(item);

        const note = await this.apiClient.createAutoNote({
          bookId: item.bookId,
          selection: item.selection,
          intent: item.intent
        });

        item.status = 'completed';
        item.result = note;
        results.push(item);

      } catch (error) {
        item.status = 'failed';
        item.error = error;
        results.push(item);
      }

      // Respect rate limits (except for last item)
      if (i < batch.length - 1) {
        await this.sleep(delay);
      }
    }

    return results;
  }
}
```

## Backend Integration Patterns

### 1. Service Layer Integration

#### Auto Notes Service

Create a dedicated service for auto note operations:

```typescript
// services/AutoNotesService.ts
import { AutoNoteRequest, AutoNoteResponse } from '@flowreader/shared';
import { ApiClient } from '../lib/ApiClient';
import { CacheManager } from '../lib/CacheManager';
import { MetricsCollector } from '../lib/MetricsCollector';

export class AutoNotesService {
  private apiClient: ApiClient;
  private cache: CacheManager;
  private metrics: MetricsCollector;

  constructor(dependencies: {
    apiClient: ApiClient;
    cache: CacheManager;
    metrics: MetricsCollector;
  }) {
    this.apiClient = dependencies.apiClient;
    this.cache = dependencies.cache;
    this.metrics = dependencies.metrics;
  }

  async createAutoNote(
    userId: string,
    request: AutoNoteRequest
  ): Promise<AutoNoteResponse> {
    const startTime = Date.now();

    try {
      // Check cache for identical selections
      const cacheKey = this.generateCacheKey(request);
      const cached = await this.cache.get(cacheKey);

      if (cached && this.isCacheValid(cached)) {
        this.metrics.recordCacheHit('auto_notes');
        return this.adaptCachedResponse(cached, userId);
      }

      // Rate limit check
      await this.checkRateLimit(userId);

      // Create auto note
      const response = await this.apiClient.post<AutoNoteResponse>(
        '/api/notes/auto',
        request,
        { userId }
      );

      // Cache successful responses
      if (response.meta.confidence >= 0.7) {
        await this.cache.set(cacheKey, response, { ttl: 86400 }); // 24 hours
      }

      // Record metrics
      this.metrics.recordAutoNoteCreation({
        userId,
        method: response.meta.generationMethod,
        confidence: response.meta.confidence,
        processingTime: Date.now() - startTime
      });

      return response;

    } catch (error) {
      this.metrics.recordAutoNoteError({
        userId,
        error: error.message,
        processingTime: Date.now() - startTime
      });

      throw error;
    }
  }

  async createBulkAutoNotes(
    userId: string,
    requests: AutoNoteRequest[]
  ): Promise<Array<{ request: AutoNoteRequest; result?: AutoNoteResponse; error?: Error }>> {
    const results = [];

    // Process with rate limiting
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];

      try {
        const result = await this.createAutoNote(userId, request);
        results.push({ request, result });

        // Rate limiting delay between requests
        if (i < requests.length - 1) {
          await this.sleep(this.calculateDelay(userId));
        }

      } catch (error) {
        results.push({ request, error: error as Error });

        // Stop on rate limit errors
        if (error.response?.status === 429) {
          break;
        }
      }
    }

    return results;
  }

  private async checkRateLimit(userId: string): Promise<void> {
    const rateLimitKey = `auto_notes_rate_limit:${userId}`;
    const currentCount = await this.cache.get(rateLimitKey) || 0;

    if (currentCount >= 20) {
      throw new RateLimitError('Auto notes hourly limit exceeded');
    }

    await this.cache.set(rateLimitKey, currentCount + 1, { ttl: 3600 });
  }

  private generateCacheKey(request: AutoNoteRequest): string {
    const key = {
      bookId: request.bookId,
      selectionText: request.selection?.text,
      intent: request.intent,
      contextScope: request.contextScope
    };

    return `auto_note:${this.hashObject(key)}`;
  }

  private calculateDelay(userId: string): number {
    // Progressive delay based on recent usage
    return 3000; // 3 seconds minimum between requests
  }
}
```

### 2. Event-Driven Integration

#### Auto Note Events

Implement event-driven patterns for auto note creation:

```typescript
// events/AutoNoteEvents.ts
import { EventEmitter } from 'events';
import { AutoNoteRequest, AutoNoteResponse } from '@flowreader/shared';

export class AutoNoteEventManager extends EventEmitter {
  constructor(private autoNotesService: AutoNotesService) {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Listen for reading events
    this.on('user:textSelected', this.handleTextSelection.bind(this));
    this.on('chat:conversationEnded', this.handleConversationEnd.bind(this));
    this.on('reading:chapterCompleted', this.handleChapterCompletion.bind(this));
  }

  private async handleTextSelection(event: {
    userId: string;
    bookId: string;
    selection: TextSelection;
    context: ReadingContext;
  }) {
    // Intelligent auto-note triggers
    const shouldCreateAutoNote = this.evaluateAutoNoteTrigger(event);

    if (shouldCreateAutoNote) {
      try {
        const autoNote = await this.autoNotesService.createAutoNote(event.userId, {
          bookId: event.bookId,
          selection: event.selection,
          intent: this.detectIntent(event.selection.text),
          options: { includeMetrics: true }
        });

        this.emit('autoNote:created', {
          userId: event.userId,
          note: autoNote,
          trigger: 'text_selection'
        });

      } catch (error) {
        this.emit('autoNote:failed', {
          userId: event.userId,
          error,
          trigger: 'text_selection'
        });
      }
    }
  }

  private async handleConversationEnd(event: {
    userId: string;
    bookId: string;
    conversationId: string;
    messageCount: number;
  }) {
    // Only create summary for substantial conversations
    if (event.messageCount >= 5) {
      try {
        const summaryNote = await this.autoNotesService.createAutoNote(event.userId, {
          bookId: event.bookId,
          contextScope: 'recent_dialog'
        });

        this.emit('autoNote:created', {
          userId: event.userId,
          note: summaryNote,
          trigger: 'conversation_end'
        });

      } catch (error) {
        this.emit('autoNote:failed', {
          userId: event.userId,
          error,
          trigger: 'conversation_end'
        });
      }
    }
  }

  private evaluateAutoNoteTrigger(event: any): boolean {
    const criteria = [
      () => event.selection.text.length > 100, // Substantial text
      () => this.hasComplexConcepts(event.selection.text), // Complex content
      () => this.isKeyPassage(event.context), // Important section
      () => this.userPrefersAutoNotes(event.userId) // User preference
    ];

    // Require at least 2 criteria
    return criteria.filter(fn => fn()).length >= 2;
  }
}
```

### 3. Webhook Integration

#### External System Integration

Integrate auto notes with external systems via webhooks:

```typescript
// webhooks/AutoNoteWebhooks.ts
export class AutoNoteWebhookManager {
  constructor(
    private autoNotesService: AutoNotesService,
    private webhookClient: WebhookClient
  ) {}

  async handleExternalTrigger(webhook: {
    source: string;
    event: string;
    data: any;
  }) {
    switch (webhook.source) {
      case 'reading_tracker':
        await this.handleReadingEvent(webhook.data);
        break;

      case 'study_planner':
        await this.handleStudyEvent(webhook.data);
        break;

      case 'external_annotation':
        await this.handleAnnotationEvent(webhook.data);
        break;
    }
  }

  private async handleReadingEvent(data: {
    userId: string;
    bookId: string;
    milestone: string;
    context: any;
  }) {
    if (data.milestone === 'chapter_completed') {
      // Create chapter summary note
      const autoNote = await this.autoNotesService.createAutoNote(data.userId, {
        bookId: data.bookId,
        contextScope: 'chapter'
      });

      // Send webhook to external systems
      await this.webhookClient.send('auto_note_created', {
        userId: data.userId,
        noteId: autoNote.id,
        trigger: 'chapter_completion'
      });
    }
  }
}
```

## Error Handling Patterns

### 1. Graceful Degradation

```javascript
class AutoNoteErrorHandler {
  async createAutoNoteWithFallback(request, fallbackOptions = {}) {
    try {
      // Primary: Auto note creation
      return await this.apiClient.createAutoNote(request);

    } catch (error) {
      if (error.response?.status === 422) {
        // Quality threshold not met - try simpler approach
        return await this.createSimplifiedAutoNote(request);

      } else if (error.response?.status === 429) {
        // Rate limited - offer manual note creation
        return await this.createManualNote(request, fallbackOptions);

      } else {
        // System error - queue for retry
        await this.queueForRetry(request);
        throw error;
      }
    }
  }

  async createSimplifiedAutoNote(request) {
    // Remove complex intents and try basic context analysis
    const simplifiedRequest = {
      ...request,
      intent: undefined, // Remove specific intent
      contextScope: 'selection'
    };

    return await this.apiClient.createAutoNote(simplifiedRequest);
  }
}
```

### 2. Retry Strategies

```typescript
class AutoNoteRetryHandler {
  async createWithRetry(
    request: AutoNoteRequest,
    options: { maxRetries: number; backoffMs: number } = {
      maxRetries: 3,
      backoffMs: 1000
    }
  ): Promise<AutoNoteResponse> {
    let lastError: Error;

    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        return await this.autoNotesService.createAutoNote(request);

      } catch (error) {
        lastError = error as Error;

        // Don't retry certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // Exponential backoff
        if (attempt < options.maxRetries) {
          await this.sleep(options.backoffMs * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError;
  }

  private isNonRetryableError(error: any): boolean {
    const nonRetryableCodes = [400, 401, 403, 422];
    return nonRetryableCodes.includes(error.response?.status);
  }
}
```

## Performance Optimization

### 1. Caching Strategies

```typescript
class AutoNoteCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours

  async getCachedResponse(request: AutoNoteRequest): Promise<AutoNoteResponse | null> {
    const key = this.generateCacheKey(request);
    const entry = this.cache.get(key);

    if (entry && Date.now() - entry.timestamp < this.TTL) {
      return entry.response;
    }

    return null;
  }

  async setCachedResponse(request: AutoNoteRequest, response: AutoNoteResponse): Promise<void> {
    // Only cache high-confidence responses
    if (response.meta.confidence >= 0.7) {
      const key = this.generateCacheKey(request);
      this.cache.set(key, {
        response,
        timestamp: Date.now()
      });
    }
  }

  private generateCacheKey(request: AutoNoteRequest): string {
    return `${request.bookId}:${request.selection?.text}:${request.intent}`;
  }
}
```

### 2. Request Optimization

```javascript
class RequestOptimizer {
  optimizeAutoNoteRequest(request) {
    // Optimize selection text
    if (request.selection?.text) {
      request.selection.text = this.cleanText(request.selection.text);

      // Truncate very long selections for better performance
      if (request.selection.text.length > 800) {
        request.selection.text = this.smartTruncate(request.selection.text, 800);
      }
    }

    // Set optimal max length based on intent
    if (!request.options?.maxLength) {
      request.options = request.options || {};
      request.options.maxLength = this.getOptimalLength(request.intent);
    }

    return request;
  }

  private getOptimalLength(intent) {
    const lengthMap = {
      'enhance': 3000,    // Detailed enhancement
      'analyze': 2000,    // Moderate analysis
      'explain': 1500,    // Concise explanation
      'translate': 1000   // Brief translation
    };

    return lengthMap[intent] || 2000;
  }
}
```

This integration guide provides comprehensive patterns for implementing auto notes functionality across different parts of FlowReader applications, ensuring consistent user experiences and robust error handling.