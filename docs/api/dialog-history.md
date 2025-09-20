# Dialog History API Documentation

## Overview

The Dialog History API provides endpoints for saving and retrieving conversation history between users and the AI assistant within the context of specific books. This API enables persistent storage of dialog messages with full pagination support, filtering capabilities, and strict security enforcement.

## Base URL

```
/api/dialog/history
```

## Authentication

All endpoints require Bearer token authentication:

```http
Authorization: Bearer <your-access-token>
```

## Endpoints

### GET /api/dialog/history

Retrieve paginated dialog history for a specific book.

#### Request Parameters

| Parameter | Type | Required | Description | Default | Constraints |
|-----------|------|----------|-------------|---------|-------------|
| `bookId` | string (UUID) | Yes | Book identifier | - | Valid UUID format |
| `limit` | integer | No | Items per page | 20 | 1-100 |
| `cursor` | string | No | Pagination cursor | - | Base64 encoded timestamp |
| `intent` | string | No | Filter by intent type | - | One of: translate, explain, analyze, ask, enhance |
| `role` | string | No | Filter by message role | - | One of: user, assistant |

#### Example Request

```http
GET /api/dialog/history?bookId=123e4567-e89b-12d3-a456-426614174000&limit=20&intent=explain
Authorization: Bearer your-token-here
```

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
    "timestamp": "2025-09-18T10:31:00.000Z"
  }
}
```

#### Error Responses

##### 400 Bad Request - Missing bookId
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Missing required parameter: bookId",
    "timestamp": "2025-09-18T10:31:00.000Z"
  }
}
```

##### 401 Unauthorized
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "timestamp": "2025-09-18T10:31:00.000Z"
  }
}
```

##### 403 Forbidden - Cross-user access
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied to book or dialog history",
    "details": {
      "bookId": "456e7890-e12c-45d6-d789-234567890123",
      "reason": "not_owner"
    },
    "timestamp": "2025-09-18T10:31:00.000Z"
  }
}
```

##### 422 Validation Error
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
        }
      ]
    },
    "timestamp": "2025-09-18T10:31:00.000Z"
  }
}
```

---

### POST /api/dialog/history

Save dialog messages to history.

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

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `messages` | array | Yes | Array of dialog messages | 1-10 messages per request |
| `messages[].bookId` | string (UUID) | Yes | Book identifier | Valid UUID, user must own book |
| `messages[].role` | string | Yes | Message role | 'user' or 'assistant' |
| `messages[].content` | string | Yes | Message content | 1-10,000 characters |
| `messages[].intent` | string | No | Intent type | One of: translate, explain, analyze, ask, enhance |
| `messages[].selection` | object | No | Text selection context | - |
| `messages[].selection.text` | string | No | Selected text | Max 1,000 characters |
| `messages[].selection.start` | integer | No | Selection start position | ≥ 0 |
| `messages[].selection.end` | integer | No | Selection end position | > start |
| `messages[].selection.chapterId` | string (UUID) | No | Chapter identifier | Valid UUID |
| `messages[].targetLang` | string | No | Target language for translation | ISO 639-1 format |
| `messages[].metrics` | object | No | Usage metrics | Assistant messages only |
| `messages[].metrics.tokens` | integer | No | Token count | ≥ 0 |
| `messages[].metrics.cost` | number | No | Cost in USD | ≥ 0 |

#### Example Request

```http
POST /api/dialog/history
Authorization: Bearer your-token-here
Content-Type: application/json

{
  "messages": [
    {
      "bookId": "456e7890-e12c-45d6-d789-234567890123",
      "role": "user",
      "content": "Translate this to French",
      "intent": "translate",
      "targetLang": "fr"
    }
  ]
}
```

#### Success Response (201 Created)

```json
{
  "data": {
    "saved": [
      {
        "id": "345e6789-e01c-34e5-e890-456789012345",
        "createdAt": "2025-09-18T10:32:15.789Z"
      }
    ],
    "count": 1
  },
  "meta": {
    "timestamp": "2025-09-18T10:32:16.000Z"
  }
}
```

#### Error Responses

##### 400 Bad Request - Invalid request body
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Messages must be a non-empty array",
    "timestamp": "2025-09-18T10:32:16.000Z"
  }
}
```

##### 422 Validation Error
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
          "messageIndex": 0,
          "field": "content",
          "message": "Content cannot be empty"
        }
      ]
    },
    "timestamp": "2025-09-18T10:32:16.000Z"
  }
}
```

## Data Models

### DialogMessage

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
}
```

### PaginationResponse

```typescript
interface PaginationResponse {
  hasMore: boolean;              // Whether more items exist
  nextCursor?: string;           // Base64 encoded timestamp for next page
  totalEstimate?: number;        // Estimated total count
}
```

## Pagination

The API uses cursor-based pagination for efficient data retrieval:

1. **First Request**: Make a request without a cursor to get the first page
2. **Subsequent Requests**: Use the `nextCursor` from the previous response
3. **End of Data**: When `hasMore` is `false`, there are no more pages

### Pagination Example

```javascript
// First page
const page1 = await fetch('/api/dialog/history?bookId=123&limit=10');
const page1Data = await page1.json();

// Second page (if available)
if (page1Data.data.pagination.hasMore) {
  const page2 = await fetch(`/api/dialog/history?bookId=123&limit=10&cursor=${page1Data.data.pagination.nextCursor}`);
  const page2Data = await page2.json();
}
```

## Security

### Row Level Security (RLS)

- Users can only access dialog messages for books they own
- Cross-user access attempts return 403 Forbidden
- All operations are user-scoped automatically

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| GET /api/dialog/history | 100 requests | 1 minute |
| POST /api/dialog/history | 50 requests | 1 minute |

## Error Handling

All errors follow a consistent format:

```typescript
interface ApiError {
  code: string;                  // Error code constant
  message: string;               // Human-readable message
  details?: Record<string, any>; // Additional error context
  timestamp: string;             // ISO 8601 timestamp
}
```

### HTTP Status Codes

| Code | Description | Retry |
|------|-------------|-------|
| 200 | Success | - |
| 201 | Created | - |
| 400 | Bad Request | No |
| 401 | Unauthorized | No |
| 403 | Forbidden | No |
| 422 | Validation Error | Fix and retry |
| 429 | Rate Limited | Retry after delay |
| 500 | Internal Server Error | Retry with backoff |

## Usage Examples

### Retrieve Recent Messages

```javascript
const response = await fetch('/api/dialog/history?bookId=123&limit=10', {
  headers: {
    'Authorization': 'Bearer your-token-here'
  }
});

const data = await response.json();
console.log(`Found ${data.data.messages.length} messages`);
```

### Save a Conversation

```javascript
const messages = [
  {
    bookId: '123',
    role: 'user',
    content: 'Explain this concept',
    intent: 'explain'
  },
  {
    bookId: '123',
    role: 'assistant',
    content: 'Here is the explanation...',
    intent: 'explain',
    metrics: { tokens: 50, cost: 0.001 }
  }
];

const response = await fetch('/api/dialog/history', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-token-here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ messages })
});

const result = await response.json();
console.log(`Saved ${result.data.count} messages`);
```

### Filter by Intent

```javascript
const response = await fetch('/api/dialog/history?bookId=123&intent=translate', {
  headers: {
    'Authorization': 'Bearer your-token-here'
  }
});

const translations = await response.json();
// Only translation-related messages
```

## Integration with Chat Stream

The dialog history API integrates with the existing chat stream functionality:

```javascript
// After SSE stream completion in chat/stream.ts
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
await fetch('/api/dialog/history', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ messages: dialogMessages })
});
```

## Performance Considerations

- Use appropriate `limit` values to avoid large responses
- Implement client-side caching for frequently accessed data
- Use filtering parameters to reduce data transfer
- Consider the `totalEstimate` for UI progress indicators

## Best Practices

1. **Pagination**: Always handle pagination properly in UI components
2. **Error Handling**: Implement retry logic with exponential backoff for 500 errors
3. **Filtering**: Use intent and role filters to reduce bandwidth
4. **Batch Saving**: Save multiple messages in a single request when possible
5. **Security**: Never hardcode tokens; always use secure token storage

---

*Generated on 2025-09-19 for FlowReader Dialog History API v1.0*