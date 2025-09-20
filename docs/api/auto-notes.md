# Auto Notes API Documentation

## Overview

The Auto Notes API provides intelligent, automated note generation capabilities for FlowReader. It integrates with the T5 Knowledge Enhancement and T7 Dialog History systems to create meaningful, context-aware notes from text selections, conversation summaries, and enhanced content analysis.

## Base URL

```
/api/notes/
```

## Authentication

All endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Create Auto Note

Generates an automated note based on provided context and intent.

#### Request

```http
POST /api/notes/auto
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

#### Request Body

```typescript
interface AutoNoteRequest {
  bookId: string;                    // Required: Book ID for context
  selection?: TextSelection;         // Optional: Text selection
  intent?: IntentType;              // Optional: Generation intent
  contextScope?: ContextScope;       // Optional: Context scope
  options?: AutoNoteOptions;         // Optional: Generation options
}

interface TextSelection {
  text: string;                     // Selected text content
  start?: number;                   // Start position in text
  end?: number;                     // End position in text
  chapterId?: string;               // Chapter identifier
}

type IntentType = 'translate' | 'explain' | 'analyze' | 'ask' | 'enhance';
type ContextScope = 'selection' | 'recent_dialog' | 'chapter';

interface AutoNoteOptions {
  maxLength?: number;               // Maximum content length (default: 4000)
  includeMetrics?: boolean;         // Include generation metrics (default: false)
}
```

#### Response

```typescript
interface AutoNoteResponse {
  id: string;                       // Generated note ID
  userId: string;                   // User ID
  bookId: string;                   // Book ID
  chapterId?: string;               // Chapter ID if applicable
  selection?: TextSelection;        // Original text selection
  content: string;                  // Generated note content
  source: 'auto';                   // Always 'auto' for auto-generated notes
  meta: AutoNoteMeta;               // Enhanced metadata
  metrics?: NoteMetrics;            // Generation metrics (if requested)
  createdAt: string;                // ISO timestamp
}

interface AutoNoteMeta {
  intent?: IntentType;              // Original intent
  generationMethod: GenerationMethod; // How note was generated
  confidence: number;               // Confidence score (0-1)
  sourceSelection?: TextSelection;   // Source text selection
  contextScope?: string;            // Context used
  type: string;                     // Note type (enhancement, summary, analysis)
  position?: {                      // Text position information
    chapterId?: string;
    start?: number;
    end?: number;
  };
  qualityScore: number;             // Overall quality score (0-1)
  processingInfo: {                 // Processing metadata
    method: GenerationMethod;
    tokens: number;
    processingTime: number;
  };
}

type GenerationMethod = 'knowledge_enhancement' | 'dialog_summary' | 'context_analysis';

interface NoteMetrics {
  tokens: number;                   // Tokens consumed
  cost: number;                     // Cost in USD
  processingTime: number;           // Processing time in milliseconds
}
```

#### Examples

**Knowledge Enhancement Request:**
```json
{
  "bookId": "book_123",
  "selection": {
    "text": "The Industrial Revolution began in Britain in the late 18th century.",
    "start": 1250,
    "end": 1320,
    "chapterId": "chapter_5"
  },
  "intent": "enhance",
  "options": {
    "includeMetrics": true
  }
}
```

**Dialog Summary Request:**
```json
{
  "bookId": "book_123",
  "contextScope": "recent_dialog",
  "options": {
    "includeMetrics": true
  }
}
```

#### Success Response (201 Created)

```json
{
  "id": "note_auto_456",
  "userId": "user_123",
  "bookId": "book_123",
  "chapterId": "chapter_5",
  "selection": {
    "text": "The Industrial Revolution began in Britain in the late 18th century.",
    "start": 1250,
    "end": 1320,
    "chapterId": "chapter_5"
  },
  "content": "**Enhanced Understanding: \"The Industrial Revolution began in Britain in the late 18th century.\"**\n\nThis statement marks the beginning of one of the most transformative periods in human history...",
  "source": "auto",
  "meta": {
    "intent": "enhance",
    "generationMethod": "knowledge_enhancement",
    "confidence": 0.87,
    "type": "enhancement",
    "position": {
      "chapterId": "chapter_5",
      "start": 1250,
      "end": 1320
    },
    "qualityScore": 0.92,
    "processingInfo": {
      "method": "knowledge_enhancement",
      "tokens": 342,
      "processingTime": 4250
    }
  },
  "metrics": {
    "tokens": 342,
    "cost": 0.0034,
    "processingTime": 4250
  },
  "createdAt": "2024-09-19T10:30:00.000Z"
}
```

#### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Missing or invalid request parameters |
| 401 | `UNAUTHORIZED` | Invalid or missing authentication token |
| 403 | `FORBIDDEN` | User doesn't own the specified book |
| 422 | `UNPROCESSABLE_ENTITY` | Generated content doesn't meet quality threshold |
| 429 | `RATE_LIMITED` | Rate limit exceeded (20 requests/hour) |
| 500 | `INTERNAL_ERROR` | Internal server error |

### 2. List Notes

Retrieves a paginated list of notes with filtering and search capabilities.

#### Request

```http
GET /api/notes/list?[query_parameters]
Authorization: Bearer <jwt_token>
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bookId` | string | No | Filter by specific book |
| `source` | `'manual' \| 'auto'` | No | Filter by note source |
| `generationMethod` | `GenerationMethod` | No | Filter by generation method (auto notes only) |
| `search` | string | No | Search in note content |
| `limit` | number | No | Number of items per page (max 100, default 20) |
| `offset` | number | No | Number of items to skip (default 0) |
| `sortBy` | `'created_at' \| 'confidence' \| 'content_length'` | No | Sort field (default 'created_at') |
| `sortOrder` | `'asc' \| 'desc'` | No | Sort order (default 'desc') |

#### Response

```typescript
interface ListNotesResponse {
  notes: Note[];                    // Array of notes
  total: number;                    // Total number of notes matching filters
  hasMore: boolean;                 // Whether more pages available
  filters: {                        // Applied filters
    bookId?: string;
    source?: string;
    generationMethod?: string;
  };
  pagination: {                     // Pagination info
    limit: number;
    offset: number;
    total: number;
  };
}
```

#### Examples

**Get all auto notes for a book:**
```http
GET /api/notes/list?bookId=book_123&source=auto
```

**Search notes with pagination:**
```http
GET /api/notes/list?search=Industrial%20Revolution&limit=10&offset=20
```

**Filter by generation method:**
```http
GET /api/notes/list?source=auto&generationMethod=knowledge_enhancement
```

#### Success Response (200 OK)

```json
{
  "notes": [
    {
      "id": "note_auto_456",
      "userId": "user_123",
      "bookId": "book_123",
      "content": "**Enhanced Understanding...",
      "source": "auto",
      "meta": {
        "confidence": 0.87,
        "type": "enhancement"
      },
      "createdAt": "2024-09-19T10:30:00.000Z"
    }
  ],
  "total": 15,
  "hasMore": true,
  "filters": {
    "bookId": "book_123",
    "source": "auto"
  },
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 15
  }
}
```

## Generation Methods

### 1. Knowledge Enhancement (`knowledge_enhancement`)

**Trigger:** `intent: 'enhance'` with text selection

**Features:**
- Integrates with T5 Knowledge Enhancement system
- Provides structured analysis with concepts, historical context, and cultural references
- Highest confidence scores (typically 0.8+)
- Rich formatting with categories and bullet points

**Example Output:**
```markdown
**Enhanced Understanding: "The Industrial Revolution began in Britain..."**

This statement marks one of history's most significant transformations...

**Key Concepts:**
1. **Industrial Revolution**: The transition from manual labor to mechanized production
2. **Britain**: The birthplace of industrial transformation due to coal reserves and capital

**Historical Context:**
1. **Steam Engine Invention** (1712): James Watt's improvements revolutionized power generation
2. **Textile Industry Growth** (1760-1840): Mechanization transformed cloth production

**Cultural Significance:**
1. **Social Transformation**: Rise of the working class and urbanization
2. **Economic Theory**: Adam Smith's wealth of nations concepts emerged during this period
```

### 2. Dialog Summary (`dialog_summary`)

**Trigger:** `contextScope: 'recent_dialog'` or no selection provided

**Features:**
- Summarizes recent conversation history from T7 Dialog system
- Groups messages by intent and topic
- Moderate confidence scores (typically 0.7)
- Includes conversation metadata and highlights

**Example Output:**
```markdown
**Recent Conversation Summary**

**Period**: 2024-09-19 to 2024-09-19
**Messages**: 8 exchanges

**Discussion Topics:**
- enhance: 3 messages
- explain: 2 messages
- general: 3 messages

**Recent Questions/Comments:**
1. What were the main causes of the Industrial Revolution?
2. How did the steam engine change manufacturing?
3. Can you explain the social impact of industrialization?
```

### 3. Context Analysis (`context_analysis`)

**Trigger:** Text selection without specific intent

**Features:**
- Analyzes text selection for themes and structure
- Extracts key topics and provides contextual summary
- Good confidence scores (typically 0.75)
- Simple keyword extraction and thematic analysis

**Example Output:**
```markdown
**Summary of Selected Passage**

**Opening**: The Industrial Revolution began in Britain in the late 18th century.

**Key Themes**: industrial, revolution, britain, century, late

**Length**: 65 characters, 1 sentences

This selection may be significant for understanding the broader context of the work.
```

## Quality Assurance

### Confidence Scoring

All auto-generated notes include a confidence score (0-1) based on:
- **Content Analysis Quality**: How well the AI understood the text
- **Knowledge Enhancement Success**: Completeness of enhancement data
- **Generation Method Performance**: Historical success rate of the method

**Thresholds:**
- **0.8+**: High confidence - comprehensive, accurate content
- **0.6-0.8**: Good confidence - reliable content with minor gaps
- **<0.6**: Below threshold - request rejected or fallback content generated

### Quality Score Calculation

Enhanced quality score considers:
- **Confidence** (60% weight): AI confidence in generation
- **Content Length** (30% weight): Optimal length 200-800 characters
- **Processing Time** (10% weight): Reasonable processing time

### Rate Limiting

- **Auto Notes**: 20 requests per hour per user
- **List/Search**: Standard API rate limits apply
- **Retry-After**: Headers provided when rate limited

## Error Handling

### Common Error Patterns

#### Quality Threshold Failures (422)
```json
{
  "error": {
    "code": "UNPROCESSABLE_ENTITY",
    "message": "Generated content does not meet quality threshold",
    "details": {
      "confidence": 0.45,
      "threshold": 0.6,
      "generationMethod": "context_analysis"
    }
  }
}
```

**Recovery:** Retry with different intent or provide more context

#### Rate Limiting (429)
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "details": {
      "retryAfter": 1800
    }
  }
}
```

**Recovery:** Wait for rate limit reset or use manual notes

#### Authentication Errors (401)
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token",
    "details": {}
  }
}
```

**Recovery:** Refresh authentication token

## Integration Examples

### Frontend Integration

```typescript
// Generate auto note from text selection
async function createAutoNote(bookId: string, selection: TextSelection, intent?: IntentType) {
  const response = await fetch('/api/notes/auto', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      bookId,
      selection,
      intent,
      options: { includeMetrics: true }
    })
  });

  if (response.ok) {
    const autoNote = await response.json();
    console.log(`Created note with ${autoNote.meta.confidence * 100}% confidence`);
    return autoNote;
  } else {
    const error = await response.json();
    console.error('Auto note creation failed:', error);
    throw new Error(error.error.message);
  }
}

// List notes with filters
async function loadNotes(filters: { source?: string; search?: string; limit?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, value.toString());
  });

  const response = await fetch(`/api/notes/list?${params}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  return response.json();
}
```

### Reading Interface Integration

```typescript
// Auto note generation from selection popover
function handleGenerateAutoNote(selection: TextSelection) {
  createAutoNote(currentBookId, selection, 'enhance')
    .then(note => {
      showNotification('Auto note created successfully!');
      // Optionally show note in sidebar or navigate to note
    })
    .catch(error => {
      if (error.message.includes('quality threshold')) {
        showNotification('Content quality too low. Try selecting more text.');
      } else {
        showNotification('Failed to generate note. Please try again.');
      }
    });
}
```

## Performance Characteristics

### Response Times
- **Simple Generation** (context analysis): <5 seconds
- **Complex Enhancement** (knowledge enhancement): <15 seconds
- **Dialog Summary**: <3 seconds
- **Notes List**: <1 second

### Resource Usage
- **Token Consumption**: 50-500 tokens per note (tracked and reported)
- **Cost Estimation**: $0.001-$0.01 per note (varies by complexity)
- **Memory Usage**: Optimized for concurrent requests

### Scalability
- **Caching**: 24-hour enhancement result caching
- **Async Processing**: Non-blocking generation patterns
- **Queue Management**: Rate limiting prevents system overload

## Monitoring and Analytics

### Key Metrics
- **Success Rate**: Target >95% successful generations
- **Average Confidence**: Target >0.75 quality score
- **Response Time**: P95 <10 seconds
- **Error Rate**: Target <5% total error rate

### Health Checks
```bash
# Basic health check
curl -X POST "/api/notes/auto" \
  -H "Authorization: Bearer <token>" \
  -d '{"bookId":"test_book","selection":{"text":"test"}}'

# Expected: 201 response with valid note structure
```

This comprehensive API provides the foundation for intelligent note generation while maintaining high quality standards and seamless integration with FlowReader's existing architecture.