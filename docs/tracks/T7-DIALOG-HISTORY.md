# T7-DIALOG-HISTORY API Contract Definition

**Track**: T7-DIALOG-HISTORY
**Status**: GO (已发放)
**Role**: api-designer (负责人)
**Version**: 1.0
**Date**: 2025-09-18

## Executive Summary

This document defines the complete API contract for dialog history functionality in FlowReader, enabling users to save, retrieve, and paginate through their conversation history with the AI assistant. The API integrates seamlessly with the existing chat stream infrastructure while providing efficient access to historical conversations for context and reference.

## API Endpoints

### 1. GET /api/dialog/history

Retrieve paginated dialog history for a specific book.

#### Endpoint Details
- **Method**: `GET`
- **Path**: `/api/dialog/history`
- **Authentication**: Required (Bearer token)
- **Rate Limiting**: 100 requests per minute per user

#### Query Parameters

| Parameter | Type | Required | Description | Validation |
|-----------|------|----------|-------------|------------|
| `bookId` | string (UUID) | Yes | Book identifier | Valid UUID format |
| `limit` | integer | No | Items per page (1-100) | Default: 20, Max: 100 |
| `cursor` | string | No | Pagination cursor | Base64 encoded timestamp |
| `intent` | string | No | Filter by intent type | One of: 'translate', 'explain', 'analyze', 'ask', 'enhance' |
| `role` | string | No | Filter by message role | One of: 'user', 'assistant' |

#### Success Response (200 OK)

```json
{
  "data": {
    "messages": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "userId": "987e6543-e21b-34d5-c678-123456789012",
        "bookId": "456e7890-e12c-45d6-d789-234567890123",
        "role": "user",
        "content": "Can you explain this passage about quantum mechanics?",
        "intent": "explain",
        "selection": {
          "text": "The quantum state of a particle...",
          "start": 1250,
          "end": 1380,
          "chapterId": "789e0123-e45f-67g8-h901-345678901234"
        },
        "metrics": {
          "tokens": 42,
          "cost": 0.00084
        },
        "createdAt": "2025-09-18T10:30:45.123Z"
      },
      {
        "id": "234e5678-e90b-23e4-b567-537625185111",
        "userId": "987e6543-e21b-34d5-c678-123456789012",
        "bookId": "456e7890-e12c-45d6-d789-234567890123",
        "role": "assistant",
        "content": "This passage introduces the fundamental concept of quantum superposition...",
        "intent": "explain",
        "metrics": {
          "tokens": 156,
          "cost": 0.00312
        },
        "createdAt": "2025-09-18T10:30:47.456Z"
      }
    ],
    "pagination": {
      "hasMore": true,
      "nextCursor": "MjAyNS0wOS0xOFQxMDozMDo0Ny40NTZa",
      "totalEstimate": 45
    }
  },
  "meta": {
    "request_id": "req_abc123def456",
    "timestamp": "2025-09-18T10:31:00.000Z"
  }
}
```

#### Error Responses

**400 Bad Request - Missing bookId**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Missing required parameter: bookId",
    "details": {
      "parameter": "bookId",
      "expectedType": "string (UUID)"
    },
    "timestamp": "2025-09-18T10:31:00.000Z",
    "request_id": "req_error123"
  }
}
```

**401 Unauthorized**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "timestamp": "2025-09-18T10:31:00.000Z",
    "request_id": "req_error124"
  }
}
```

**403 Forbidden - Access to other user's data**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied to book or dialog history",
    "details": {
      "bookId": "456e7890-e12c-45d6-d789-234567890123",
      "reason": "not_owner"
    },
    "timestamp": "2025-09-18T10:31:00.000Z",
    "request_id": "req_error125"
  }
}
```

**422 Unprocessable Entity - Invalid parameters**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid parameter format",
    "details": {
      "errors": [
        {
          "parameter": "intent",
          "value": "invalid_intent",
          "message": "Must be one of: translate, explain, analyze, ask, enhance"
        },
        {
          "parameter": "limit",
          "value": 150,
          "message": "Must be between 1 and 100"
        }
      ]
    },
    "timestamp": "2025-09-18T10:31:00.000Z",
    "request_id": "req_error126"
  }
}
```

### 2. POST /api/dialog/history

Save dialog messages to history.

#### Endpoint Details
- **Method**: `POST`
- **Path**: `/api/dialog/history`
- **Authentication**: Required (Bearer token)
- **Content-Type**: `application/json`

#### Request Body

```json
{
  "messages": [
    {
      "bookId": "456e7890-e12c-45d6-d789-234567890123",
      "role": "user",
      "content": "Can you translate this sentence to Spanish?",
      "intent": "translate",
      "selection": {
        "text": "The weather is beautiful today.",
        "start": 450,
        "end": 480,
        "chapterId": "789e0123-e45f-67g8-h901-345678901234"
      },
      "targetLang": "es"
    },
    {
      "bookId": "456e7890-e12c-45d6-d789-234567890123",
      "role": "assistant",
      "content": "El clima está hermoso hoy.",
      "intent": "translate",
      "metrics": {
        "tokens": 15,
        "cost": 0.0003
      }
    }
  ]
}
```

#### Request Body Schema

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `messages` | array | Yes | Array of dialog messages | 1-10 messages per request |
| `messages[].bookId` | string (UUID) | Yes | Book identifier | Valid UUID, user must own book |
| `messages[].role` | string | Yes | Message role | 'user' or 'assistant' |
| `messages[].content` | string | Yes | Message content | 1-10,000 characters |
| `messages[].intent` | string | No | Intent type | One of: 'translate', 'explain', 'analyze', 'ask', 'enhance' |
| `messages[].selection` | object | No | Text selection context | - |
| `messages[].selection.text` | string | No | Selected text | Max 1,000 characters |
| `messages[].selection.start` | integer | No | Selection start position | >= 0 |
| `messages[].selection.end` | integer | No | Selection end position | > start |
| `messages[].selection.chapterId` | string (UUID) | No | Chapter identifier | Valid UUID |
| `messages[].targetLang` | string | No | Target language for translation | ISO 639-1 format |
| `messages[].metrics` | object | No | Usage metrics | Assistant messages only |
| `messages[].metrics.tokens` | integer | No | Token count | >= 0 |
| `messages[].metrics.cost` | number | No | Cost in USD | >= 0 |

#### Success Response (201 Created)

```json
{
  "data": {
    "saved": [
      {
        "id": "345e6789-e01c-34e5-e890-456789012345",
        "createdAt": "2025-09-18T10:32:15.789Z"
      },
      {
        "id": "456e7890-e12d-45f6-f901-567890123456",
        "createdAt": "2025-09-18T10:32:15.790Z"
      }
    ],
    "count": 2
  },
  "meta": {
    "request_id": "req_save456def",
    "timestamp": "2025-09-18T10:32:16.000Z"
  }
}
```

#### Error Responses

**400 Bad Request - Invalid request body**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request body",
    "details": {
      "errors": [
        {
          "field": "messages",
          "message": "Must be a non-empty array"
        }
      ]
    },
    "timestamp": "2025-09-18T10:32:16.000Z",
    "request_id": "req_error127"
  }
}
```

**422 Unprocessable Entity - Validation errors**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Message validation failed",
    "details": {
      "errors": [
        {
          "messageIndex": 0,
          "field": "role",
          "value": "invalid_role",
          "message": "Must be 'user' or 'assistant'"
        },
        {
          "messageIndex": 1,
          "field": "content",
          "message": "Content cannot be empty"
        }
      ]
    },
    "timestamp": "2025-09-18T10:32:16.000Z",
    "request_id": "req_error128"
  }
}
```

## Data Models

### DialogMessage

Complete data model for dialog messages stored in the database.

```typescript
interface DialogMessage {
  id: string;                    // UUID, auto-generated
  userId: string;                // UUID, from auth token
  bookId: string;                // UUID, must exist and be owned by user
  role: 'user' | 'assistant';    // Message role
  content: string;               // Message content (1-10,000 chars)
  intent?: 'translate' | 'explain' | 'analyze' | 'ask' | 'enhance';
  selection?: {                  // Text selection context
    text: string;                // Selected text (max 1,000 chars)
    start?: number;              // Selection start position
    end?: number;                // Selection end position
    chapterId?: string;          // Chapter UUID
  };
  targetLang?: string;           // Target language (ISO 639-1)
  metrics?: {                    // Usage metrics (assistant messages)
    tokens: number;              // Token count
    cost: number;                // Cost in USD
  };
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

### PaginationResponse

```typescript
interface PaginationResponse {
  hasMore: boolean;              // Whether more items exist
  nextCursor?: string;           // Base64 encoded timestamp for next page
  totalEstimate?: number;        // Estimated total count (optional)
}
```

### DialogHistoryResponse

```typescript
interface DialogHistoryResponse {
  messages: DialogMessage[];     // Array of dialog messages
  pagination: PaginationResponse; // Pagination metadata
}
```

## Database Schema

### Dialog Messages Table

The dialog history will be stored in a new `dialog_messages` table:

```sql
CREATE TABLE dialog_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 10000),
    intent TEXT CHECK (intent IN ('translate', 'explain', 'analyze', 'ask', 'enhance')),
    selection JSONB,
    target_lang TEXT CHECK (target_lang ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_dialog_messages_user_book ON dialog_messages(user_id, book_id);
CREATE INDEX idx_dialog_messages_book_created ON dialog_messages(book_id, created_at DESC);
CREATE INDEX idx_dialog_messages_intent ON dialog_messages(intent) WHERE intent IS NOT NULL;
CREATE INDEX idx_dialog_messages_role ON dialog_messages(role);

-- RLS Policy
ALTER TABLE dialog_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own dialog messages" ON dialog_messages
    FOR ALL USING (auth.uid() = user_id);
```

## Authentication & Authorization

### Security Requirements

1. **Authentication**: All endpoints require valid Bearer token
2. **Authorization**: Users can only access their own dialog history
3. **Book Ownership**: Users can only save/retrieve messages for books they own
4. **Rate Limiting**: Implemented using existing rate limiter
5. **Input Validation**: Strict validation of all parameters and request bodies

### Security Implementation

```typescript
// Authentication check (using existing security baseline)
const authResult = await requireAuthWithSecurity(req);
const userId = authResult.id;

// Book ownership verification
const { data: book, error } = await supabase
  .from('books')
  .select('id, owner_id')
  .eq('id', bookId)
  .eq('owner_id', userId)
  .single();

if (error || !book) {
  throw new Error('Book not found or access denied');
}
```

## Error Handling Strategy

### Error Codes & HTTP Status Mapping

| Error Code | HTTP Status | Description | Retry Strategy |
|------------|-------------|-------------|----------------|
| `BAD_REQUEST` | 400 | Missing or invalid required parameters | Don't retry |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication | Don't retry |
| `FORBIDDEN` | 403 | Access denied to resource | Don't retry |
| `NOT_FOUND` | 404 | Book or resource not found | Don't retry |
| `VALIDATION_ERROR` | 422 | Request validation failed | Fix and retry |
| `RATE_LIMITED` | 429 | Rate limit exceeded | Retry after delay |
| `INTERNAL_ERROR` | 500 | Server error | Retry with backoff |

### Error Response Format

All errors follow the standardized format from `ApiErrorHandler`:

```typescript
interface ApiError {
  code: string;                  // Error code constant
  message: string;               // Human-readable message
  details?: Record<string, any>; // Additional error context
  timestamp: string;             // ISO 8601 timestamp
  request_id: string;            // Unique request identifier
  retry_after?: number;          // Retry delay in seconds
}
```

## SSE Integration Points

### Chat Stream Compatibility

The dialog history API integrates with the existing chat stream at these points:

1. **Message Saving**: After SSE stream completion
2. **Context Retrieval**: For conversation context
3. **Usage Tracking**: Metrics from stream events

### Integration Flow

```typescript
// In chat/stream.ts - after stream completion
const dialogMessages = [
  {
    bookId,
    role: 'user',
    content: userQuery,
    intent,
    selection
  },
  {
    bookId,
    role: 'assistant',
    content: assistantResponse,
    intent,
    metrics: { tokens: totalTokens, cost: totalCost }
  }
];

// Save to dialog history
await saveDialogMessages(dialogMessages, userId);
```

## Pagination Strategy

### Cursor-Based Pagination

Uses timestamp-based cursors for efficient pagination:

```typescript
// Cursor encoding/decoding
function encodeCursor(timestamp: string): string {
  return Buffer.from(timestamp).toString('base64');
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64').toString('utf-8');
}

// Database query with cursor
const query = supabase
  .from('dialog_messages')
  .select('*')
  .eq('book_id', bookId)
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(limit);

if (cursor) {
  const timestamp = decodeCursor(cursor);
  query.lt('created_at', timestamp);
}
```

### Pagination Benefits

- **Performance**: Efficient even for large datasets
- **Consistency**: Handles concurrent insertions correctly
- **Simplicity**: Single timestamp-based cursor
- **Stability**: Results don't shift during pagination

## Rate Limiting & Quotas

### Rate Limits

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `GET /api/dialog/history` | 100 requests | 1 minute | Per user |
| `POST /api/dialog/history` | 50 requests | 1 minute | Per user |

### Implementation

Uses existing `authRateLimiter` with endpoint-specific configuration:

```typescript
// Rate limiting check
const rateLimitResult = await authRateLimiter.checkLimit(req, {
  endpoint: 'dialog-history-get',
  maxRequests: 100,
  windowMs: 60000
});

if (!rateLimitResult.allowed) {
  return ApiErrorHandler.rateLimited(
    'Rate limit exceeded',
    rateLimitResult.resetTime
  );
}
```

## Performance Considerations

### Query Optimization

1. **Indexes**: Composite indexes on `(user_id, book_id)` and `(book_id, created_at DESC)`
2. **Limits**: Maximum 100 items per request
3. **Filtering**: Optional filters use separate indexes
4. **Caching**: Consider Redis caching for frequent queries

### Response Size Management

1. **Content Truncation**: Long content truncated in list view
2. **Field Selection**: Support for selective field retrieval
3. **Compression**: Gzip compression for large responses
4. **Streaming**: Consider streaming for very large result sets

## Implementation Guidance

### File Structure

```
api/dialog/
├── history.ts          # Main endpoint handler
├── _lib/
│   ├── dialog-service.ts    # Business logic
│   ├── validation.ts        # Request validation
│   └── pagination.ts        # Pagination utilities
└── __tests__/
    ├── history.test.ts      # Endpoint tests
    └── dialog-service.test.ts # Service tests
```

### Example Implementation Skeleton

```typescript
// api/dialog/history.ts
export default async function handler(req: Request): Promise<Response> {
  try {
    // Authentication & rate limiting
    const user = await requireAuthWithSecurity(req);

    if (req.method === 'GET') {
      return await handleGetHistory(req, user);
    } else if (req.method === 'POST') {
      return await handleSaveMessages(req, user);
    } else {
      return ApiErrorHandler.createErrorResponse(
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        405
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}
```

## Migration Strategy

### Existing API Compatibility

1. **Backward Compatibility**: Existing chat stream API unchanged
2. **Gradual Migration**: Optional dialog history saving initially
3. **Feature Flags**: Enable/disable history features per user
4. **Data Migration**: Migrate existing conversation data if needed

### Rollout Plan

1. **Phase 1**: Deploy API endpoints with feature flag disabled
2. **Phase 2**: Enable for internal testing and beta users
3. **Phase 3**: Gradual rollout to all users
4. **Phase 4**: Integration with frontend components

## Testing Requirements

### Unit Tests

- Request validation
- Authentication/authorization
- Pagination logic
- Error handling

### Integration Tests

- End-to-end API flows
- Database operations
- SSE integration
- Rate limiting

### Performance Tests

- Load testing with high message volumes
- Pagination performance with large datasets
- Concurrent user scenarios
- Memory usage optimization

## Handoff Documentation

### For Database Expert

1. **Schema Implementation**: Create `dialog_messages` table with indexes and RLS
2. **Migration Scripts**: Database migration files for new table
3. **Performance Tuning**: Query optimization and index analysis
4. **Backup Strategy**: Include new table in backup procedures

### For API Development Team

1. **Endpoint Implementation**: Core API logic and request handling
2. **Validation Layer**: Request/response validation middleware
3. **Integration Testing**: Test suite for all endpoints
4. **Documentation**: OpenAPI/Swagger specification

### For Frontend Team

1. **API Client**: TypeScript client for dialog history endpoints
2. **State Management**: Redux/Zustand store integration
3. **UI Components**: History display and pagination components
4. **Error Handling**: User-friendly error messages and retry logic

---

**Document Status**: Complete
**Review Required**: Yes
**Next Phase**: Database schema implementation by database-expert