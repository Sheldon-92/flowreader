# Auto Notes API Reference

## Overview

The Auto Notes API provides intelligent automatic note generation through the `POST /api/notes/auto` endpoint. This API integrates with FlowReader's T5 Knowledge Enhancement and T7 Dialog History systems to create contextual, high-quality notes automatically.

## Endpoint Specification

### Base Information
- **URL**: `POST /api/notes/auto`
- **Content-Type**: `application/json`
- **Authentication**: Bearer JWT token required
- **Rate Limit**: 20 requests per hour per user

### Authentication

All requests require a valid JWT token in the Authorization header:

```bash
Authorization: Bearer <jwt-token>
```

## Request Schema

### AutoNoteRequest Interface

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
  contextScope?: ContextScope;       // 'selection' | 'recent_dialog' | 'chapter'
  options?: {
    maxLength?: number;              // max content length (default: 2000, max: 4000)
    includeMetrics?: boolean;        // include generation metrics (default: false)
  };
}
```

### Request Parameters

#### Required Parameters
- **bookId** (string): UUID of the book to create a note for

#### Optional Parameters
- **selection** (object): Text selection for analysis
  - **text** (string): Selected text content (max 1000 characters)
  - **start** (number): Selection start position in text
  - **end** (number): Selection end position in text
  - **chapterId** (string): UUID of the chapter containing selection
- **intent** (string): Generation intent type
  - `enhance`: Use T5 Knowledge Enhancement for detailed analysis
  - `explain`: Generate explanatory content
  - `analyze`: Provide analytical insights
  - `translate`: Create translation notes
  - `ask`: Generate Q&A style content
- **contextScope** (string): Context scope for generation
  - `selection`: Focus on provided text selection
  - `recent_dialog`: Use recent conversation history
  - `chapter`: Use chapter-level context
- **options** (object): Additional generation options
  - **maxLength** (number): Maximum content length (default: 2000, max: 4000)
  - **includeMetrics** (boolean): Include performance metrics (default: false)

## Response Schema

### AutoNoteResponse Interface

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

### Response Fields

- **id**: Unique identifier for the generated note
- **userId**: UUID of the user who created the note
- **bookId**: UUID of the book the note belongs to
- **content**: Generated note content (50-4000 characters)
- **source**: Always 'auto' for auto-generated notes
- **meta**: Metadata about the generation process
  - **generationMethod**: `knowledge_enhancement`, `dialog_summary`, or `context_analysis`
  - **confidence**: Quality score from 0-1 (minimum 0.6 for acceptance)
- **metrics**: Performance data (optional, when includeMetrics: true)
- **createdAt**: ISO timestamp of note creation

## Usage Examples

### 1. Knowledge Enhancement Note

Generate an enhanced analysis of selected text using T5 Knowledge Enhancement:

```bash
curl -X POST "http://localhost:5173/api/notes/auto" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": "550e8400-e29b-41d4-a716-446655440000",
    "selection": {
      "text": "Democracy in America represents a fundamental shift in political thought from aristocratic governance to popular sovereignty.",
      "start": 1250,
      "end": 1350,
      "chapterId": "chapter-1"
    },
    "intent": "enhance",
    "options": {
      "includeMetrics": true,
      "maxLength": 3000
    }
  }'
```

**Expected Response (201):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "user-uuid",
  "bookId": "550e8400-e29b-41d4-a716-446655440000",
  "chapterId": "chapter-1",
  "selection": {
    "text": "Democracy in America represents a fundamental shift...",
    "start": 1250,
    "end": 1350,
    "chapterId": "chapter-1"
  },
  "content": "**Enhanced Understanding: \"Democracy in America represents a fundamental shift...\"**\n\n**Key Concepts:**\n1. **Democracy**: A system of government where power rests with the people...\n2. **Popular Sovereignty**: The principle that government authority derives from the people...\n\n**Historical Context:**\n1. **American Revolution** (1776)\n   Established democratic principles in opposition to British monarchy...\n\n**Cultural Significance:**\n1. **Tocqueville's Analysis** (French)\n   Provided outsider perspective on American democratic experiment...",
  "source": "auto",
  "meta": {
    "intent": "enhance",
    "generationMethod": "knowledge_enhancement",
    "confidence": 0.87,
    "sourceSelection": {
      "text": "Democracy in America represents...",
      "start": 1250,
      "end": 1350
    },
    "contextScope": "selection"
  },
  "metrics": {
    "tokens": 456,
    "cost": 0.0234,
    "processingTime": 3420
  },
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### 2. Contextual Summary Note

Generate a contextual summary of selected text without specific intent:

```bash
curl -X POST "http://localhost:5173/api/notes/auto" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": "550e8400-e29b-41d4-a716-446655440000",
    "selection": {
      "text": "The nature of freedom and its implications for society cannot be understated. When we examine the philosophical foundations of liberty, we find complex interactions between individual rights and collective responsibilities."
    },
    "contextScope": "selection"
  }'
```

**Expected Response (201):**
```json
{
  "id": "789e0123-e89b-12d3-a456-426614174000",
  "userId": "user-uuid",
  "bookId": "550e8400-e29b-41d4-a716-446655440000",
  "selection": {
    "text": "The nature of freedom and its implications..."
  },
  "content": "**Summary of Selected Passage**\n\n**Opening**: The nature of freedom and its implications for society cannot be understated.\n\n**Key Themes**: freedom, society, philosophical, liberty, individual\n\n**Length**: 189 characters, 2 sentences\n\nThis selection may be significant for understanding the broader context of the work.",
  "source": "auto",
  "meta": {
    "generationMethod": "context_analysis",
    "confidence": 0.75,
    "sourceSelection": {
      "text": "The nature of freedom and its implications..."
    },
    "contextScope": "selection"
  },
  "createdAt": "2024-01-15T10:35:00Z"
}
```

### 3. Dialog History Summary Note

Generate a summary of recent conversation history:

```bash
curl -X POST "http://localhost:5173/api/notes/auto" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": "550e8400-e29b-41d4-a716-446655440000",
    "contextScope": "recent_dialog",
    "options": {
      "includeMetrics": true
    }
  }'
```

**Expected Response (201):**
```json
{
  "id": "def01234-e89b-12d3-a456-426614174000",
  "userId": "user-uuid",
  "bookId": "550e8400-e29b-41d4-a716-446655440000",
  "content": "**Recent Conversation Summary**\n\n**Period**: 2024-01-15 to 2024-01-15\n**Messages**: 6 exchanges\n\n**Discussion Topics**:\n- enhance: 3 messages\n- analyze: 2 messages\n- general: 1 messages\n\n**Recent Questions/Comments**:\n1. What does Tocqueville mean by \"tyranny of the majority\"?\n2. How does American democracy compare to European systems?\n3. Can you explain the concept of civil society?",
  "source": "auto",
  "meta": {
    "generationMethod": "dialog_summary",
    "confidence": 0.70,
    "contextScope": "recent_dialog"
  },
  "metrics": {
    "tokens": 185,
    "cost": 0.0012,
    "processingTime": 890
  },
  "createdAt": "2024-01-15T10:40:00Z"
}
```

### 4. Analysis Intent Note

Generate analytical insights about selected text:

```bash
curl -X POST "http://localhost:5173/api/notes/auto" \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookId": "550e8400-e29b-41d4-a716-446655440000",
    "selection": {
      "text": "In America, the majority rules, but the rights of minorities are protected by constitutional safeguards."
    },
    "intent": "analyze"
  }'
```

## Error Responses

### 400 Bad Request

**Causes:**
- Missing required `bookId` parameter
- Invalid UUID format for `bookId` or `chapterId`
- Invalid `intent` value
- `selection.text` exceeds 1000 characters
- Malformed JSON request body

**Example:**
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

### 401 Unauthorized

**Causes:**
- Missing Authorization header
- Invalid JWT token
- Expired token

**Example:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

### 403 Forbidden

**Causes:**
- User doesn't own the specified book
- Access denied to book resources

**Example:**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied to this book",
    "details": {
      "bookId": "550e8400-e29b-41d4-a716-446655440000",
      "reason": "not_owner"
    }
  }
}
```

### 422 Unprocessable Entity

**Causes:**
- Generated content quality below 0.6 threshold
- Generated content too short (<50 characters)
- Generated content too long (>4000 characters)
- Invalid parameter combination
- Missing selection for intent that requires it

**Example:**
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

### 429 Too Many Requests

**Causes:**
- Rate limit exceeded (20 auto notes per hour)
- Request throttling activated

**Example:**
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Auto note generation rate limit exceeded",
    "details": {
      "limit": 20,
      "window": "1 hour",
      "reset_time": "2024-01-15T11:00:00Z"
    }
  }
}
```

### 500 Internal Server Error

**Causes:**
- Knowledge enhancement service failure
- Database connection issues
- T5/T7 system failures
- Unexpected system errors

**Example:**
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

## Rate Limiting

### Limits
- **Auto Notes**: 20 requests per hour per user
- **Sliding Window**: 1-hour rolling window
- **Enforcement**: IP-based with user association

### Rate Limit Headers

Responses include rate limiting information:

```http
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 1641988800
```

### Rate Limit Best Practices

1. **Check Headers**: Monitor rate limit headers in responses
2. **Implement Backoff**: Use exponential backoff for 429 responses
3. **Cache Results**: Avoid duplicate requests for same content
4. **Batch Operations**: Group multiple requests when possible

```javascript
// Example rate limit handling
const createAutoNote = async (noteData) => {
  try {
    const response = await fetch('/api/notes/auto', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(noteData)
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      await sleep(parseInt(retryAfter) * 1000);
      return createAutoNote(noteData); // Retry
    }

    return response.json();
  } catch (error) {
    console.error('Auto note creation failed:', error);
    throw error;
  }
};
```

## Performance Considerations

### Response Times
- **Simple Generation**: <5 seconds (contextual analysis)
- **Complex Enhancement**: <15 seconds (T5 knowledge enhancement)
- **Dialog Summary**: <3 seconds (T7 integration)

### Token Usage
- **Tracking**: All requests track token consumption
- **Reporting**: Included in metrics when requested
- **Cost Estimation**: Real-time USD calculation

### Optimization Tips

1. **Selection Size**: Smaller selections process faster
2. **Intent Specificity**: Clear intents improve quality and speed
3. **Metrics Usage**: Only request metrics when needed
4. **Caching**: Identical selections are cached for 24 hours

## Integration Examples

### Frontend Integration

```javascript
// Auto note creation on text selection
class AutoNoteCreator {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async createFromSelection(bookId, selection, intent = null) {
    const requestData = {
      bookId,
      selection: {
        text: selection.text,
        start: selection.start,
        end: selection.end,
        chapterId: selection.chapterId
      }
    };

    if (intent) {
      requestData.intent = intent;
    }

    try {
      const response = await this.apiClient.post('/api/notes/auto', requestData);
      return response.data;
    } catch (error) {
      if (error.response?.status === 422) {
        // Quality threshold not met, fallback to manual note
        return this.createManualNote(bookId, selection);
      }
      throw error;
    }
  }

  async createConversationSummary(bookId) {
    return await this.apiClient.post('/api/notes/auto', {
      bookId,
      contextScope: 'recent_dialog',
      options: { includeMetrics: true }
    });
  }
}
```

### Backend Integration

```typescript
// Service layer integration
class NotesService {
  async createAutoNote(userId: string, request: AutoNoteRequest): Promise<AutoNoteResponse> {
    // Add user context to request
    const enrichedRequest = {
      ...request,
      userId
    };

    // Call auto notes endpoint
    const response = await fetch('/api/notes/auto', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getServiceToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(enrichedRequest)
    });

    if (!response.ok) {
      throw new AutoNoteError(`Auto note creation failed: ${response.statusText}`);
    }

    return response.json();
  }
}
```

This comprehensive API reference provides all the information needed to successfully integrate and use the Auto Notes API within FlowReader applications.