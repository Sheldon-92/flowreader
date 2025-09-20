# AUTO NOTES API SPECIFICATION

## T6-NOTES-AUTO: Automatic Note Generation API

### Overview

The Auto Notes API (`POST /api/notes/auto`) provides intelligent automatic note generation that integrates with existing FlowReader systems including T5 Knowledge Enhancement and T7 Dialog History. This endpoint generates contextual notes based on user selections, reading history, and intelligent content analysis.

### Endpoint Specification

```
POST /api/notes/auto
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

### Request Schema

```typescript
interface AutoNoteRequest {
  bookId: string;                    // UUID - Required
  selection?: {
    text: string;                    // max 1000 chars
    start?: number;                  // Selection start position
    end?: number;                    // Selection end position
    chapterId?: string;              // UUID - Chapter identifier
  };
  intent?: IntentType;               // 'translate' | 'explain' | 'analyze' | 'ask' | 'enhance'
  contextScope?: ContextScope;       // 'selection' | 'recent_dialog' | 'chapter' (default: 'selection')
  options?: {
    maxLength?: number;              // max content length (default: 2000, max: 4000)
    includeMetrics?: boolean;        // include generation metrics (default: false)
  };
}
```

### Response Schema

```typescript
interface AutoNoteResponse {
  id: string;                        // Generated note UUID
  userId: string;                    // User UUID
  bookId: string;                    // Book UUID
  chapterId?: string;                // Chapter UUID (if applicable)
  selection?: TextSelection;         // Original selection data
  content: string;                   // Generated note content
  source: 'auto';                    // Always 'auto' for this endpoint
  meta: {
    intent?: IntentType;             // User-specified or detected intent
    generationMethod: GenerationMethod; // How note was generated
    confidence: number;              // Quality confidence score (0-1)
    sourceSelection?: TextSelection; // Source selection for generation
    contextScope?: string;           // Context scope used
  };
  metrics?: {                        // Only if includeMetrics: true
    tokens: number;                  // Total tokens consumed
    cost: number;                    // Estimated cost in USD
    processingTime: number;          // Time in milliseconds
  };
  createdAt: string;                 // ISO timestamp
}
```

### Content Generation Strategy

#### 1. Intent-Based Generation

When `intent` is provided:

- **enhance**: Uses T5 Knowledge Enhancer for structured analysis
- **explain**: Generates explanatory content based on selection
- **analyze**: Provides analytical insights about the text
- **translate**: Creates translation notes (requires target language detection)
- **ask**: Generates Q&A style content based on context

#### 2. Context-Driven Generation

When `intent` is not provided, generation is based on `contextScope`:

- **selection**: Analyzes provided text selection
- **recent_dialog**: Summarizes recent T7 dialog history
- **chapter**: Generates chapter-based contextual summary

#### 3. Fallback Strategy

If primary generation fails or quality is below threshold (confidence < 0.6):
1. Attempt simpler context analysis
2. Generate basic explanatory content
3. Create minimal note with error indication

### Error Handling Matrix

#### 400 Bad Request
- Missing required `bookId`
- Invalid UUID format for `bookId` or `chapterId`
- Invalid `intent` value
- `selection.text` exceeds 1000 characters
- `options.maxLength` exceeds 4000
- Malformed JSON request body

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "errors": [
        {
          "field": "bookId",
          "message": "bookId is required"
        }
      ]
    }
  }
}
```

#### 401 Unauthorized
- Missing authorization header
- Invalid JWT token
- Expired token

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 403 Forbidden
- User doesn't own the specified book
- Access denied to book resources

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied to this book",
    "details": {
      "bookId": "uuid",
      "reason": "not_owner"
    }
  }
}
```

#### 422 Unprocessable Entity
- Invalid combination of parameters
- Unsupported intent for provided context
- Selection required for specific intents

```json
{
  "error": {
    "code": "UNPROCESSABLE_ENTITY",
    "message": "Invalid parameter combination",
    "details": {
      "reason": "selection_required_for_intent",
      "intent": "enhance"
    }
  }
}
```

#### 429 Too Many Requests
- Rate limit exceeded (20 auto notes per hour per user)
- Daily quota exceeded

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Auto note generation rate limit exceeded",
    "details": {
      "limit": 20,
      "window": "1 hour",
      "reset_time": "2024-01-01T15:00:00Z"
    }
  }
}
```

#### 500 Internal Server Error
- Knowledge enhancement service failure
- Database connection issues
- OpenAI API failures
- Unexpected system errors

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Auto note generation failed",
    "details": {
      "retry_after": 30
    }
  }
}
```

### Integration Architecture

#### T5 Knowledge Enhancement Integration

```typescript
// When intent='enhance' or high-quality enhancement needed
const enhancer = new KnowledgeEnhancer();
const enhancementStream = enhancer.enhanceKnowledge({
  bookId: request.bookId,
  intent: 'enhance',
  selection: request.selection,
  enhanceType: detectEnhanceType(request.selection.text)
});

// Process stream and extract structured content
for await (const chunk of enhancementStream) {
  if (chunk.type === 'enhancement') {
    // Transform enhancement data to note content
    content = formatEnhancementAsNote(chunk.data);
    confidence = chunk.data.confidence;
    generationMethod = 'knowledge_enhancement';
  }
}
```

#### T7 Dialog History Integration

```typescript
// When contextScope='recent_dialog' or no selection provided
const dialogHistory = await fetch(`/api/dialog/history?bookId=${bookId}&limit=10`);
const recentMessages = dialogHistory.data.messages;

// Summarize recent dialog for context
content = await generateDialogSummary(recentMessages);
generationMethod = 'dialog_summary';
```

#### Database Integration

```sql
-- Auto notes extend existing notes table
INSERT INTO notes (
  user_id,
  book_id,
  content,
  tags,
  metadata
) VALUES (
  $1,
  $2,
  $3,
  ARRAY['auto_generated', 'intent:' || $4],
  jsonb_build_object(
    'generation_method', $5,
    'confidence', $6,
    'source_selection', $7
  )
);
```

### Rate Limiting and Performance

#### Rate Limits
- **Auto Note Generation**: 20 requests per hour per user
- **Token Consumption**: Tracked against user quotas
- **Cost Monitoring**: Real-time cost calculation and limits

#### Performance Targets
- **Response Time**: < 5 seconds for simple generation, < 15 seconds for complex enhancement
- **Availability**: 99.5% uptime target
- **Quality Threshold**: Minimum 0.6 confidence score

#### Caching Strategy
- **Content Caching**: Cache enhancement results for identical selections (24 hours)
- **Context Caching**: Cache chapter context for frequent access patterns
- **Negative Caching**: Cache failures to prevent retry storms

### Security Considerations

#### Authentication & Authorization
- JWT-based authentication required
- Row-level security (RLS) enforcement on database queries
- Book ownership verification for all operations

#### Input Validation & Sanitization
- XSS prevention on all text inputs
- SQL injection prevention through parameterized queries
- Content length limits to prevent abuse

#### Audit Logging
```typescript
await logSecurityEvent({
  event_type: 'auto_note_generation',
  user_id: userId,
  details: {
    book_id: bookId,
    generation_method: method,
    success: true,
    confidence: score
  },
  severity: 'info'
});
```

### Quality Assurance

#### Content Quality Metrics
- **Relevance**: Text similarity to source selection
- **Completeness**: Comprehensive coverage of requested intent
- **Clarity**: Readability and structure assessment
- **Accuracy**: Factual correctness validation

#### Monitoring & Alerting
- **Success Rate**: > 95% successful generations
- **Quality Scores**: Average confidence > 0.75
- **Error Tracking**: Real-time error monitoring and alerting
- **Performance Metrics**: Response time and throughput monitoring

### Usage Examples

#### Basic Auto Note Generation
```bash
curl -X POST https://api.flowreader.com/api/notes/auto \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": "123e4567-e89b-12d3-a456-426614174000",
    "selection": {
      "text": "The concept of quantum entanglement",
      "start": 1250,
      "end": 1285,
      "chapterId": "456e7890-e89b-12d3-a456-426614174000"
    },
    "intent": "enhance"
  }'
```

#### Dialog History Summary
```bash
curl -X POST https://api.flowreader.com/api/notes/auto \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": "123e4567-e89b-12d3-a456-426614174000",
    "contextScope": "recent_dialog",
    "options": {
      "includeMetrics": true,
      "maxLength": 1500
    }
  }'
```

#### Response Example
```json
{
  "id": "789e0123-e89b-12d3-a456-426614174000",
  "userId": "abc12345-e89b-12d3-a456-426614174000",
  "bookId": "123e4567-e89b-12d3-a456-426614174000",
  "chapterId": "456e7890-e89b-12d3-a456-426614174000",
  "selection": {
    "text": "The concept of quantum entanglement",
    "start": 1250,
    "end": 1285,
    "chapterId": "456e7890-e89b-12d3-a456-426614174000"
  },
  "content": "**Quantum Entanglement** refers to a quantum mechanical phenomenon where particles become interconnected and the quantum state of each particle cannot be described independently...",
  "source": "auto",
  "meta": {
    "intent": "enhance",
    "generationMethod": "knowledge_enhancement",
    "confidence": 0.87,
    "sourceSelection": {
      "text": "The concept of quantum entanglement",
      "start": 1250,
      "end": 1285
    },
    "contextScope": "selection"
  },
  "metrics": {
    "tokens": 456,
    "cost": 0.0234,
    "processingTime": 3420
  },
  "createdAt": "2024-01-01T12:34:56.789Z"
}
```

### Implementation Checklist

#### Core Functionality
- [ ] Request validation using existing input validator patterns
- [ ] Book ownership verification with RLS
- [ ] T5 Knowledge Enhancer integration
- [ ] T7 Dialog History integration
- [ ] Content generation logic with fallbacks
- [ ] Quality assessment and confidence scoring

#### Security & Performance
- [ ] Rate limiting implementation (20/hour per user)
- [ ] Authentication and authorization
- [ ] Input sanitization and XSS prevention
- [ ] Audit logging for security events
- [ ] Performance monitoring and alerting

#### Testing & Documentation
- [ ] Unit tests for all generation methods
- [ ] Integration tests with T5 and T7 systems
- [ ] Error scenario testing
- [ ] Performance benchmarking
- [ ] OpenAPI specification generation

This specification provides the complete foundation for implementing the Auto Notes API endpoint that seamlessly integrates with FlowReader's existing architecture while providing intelligent, context-aware note generation capabilities.