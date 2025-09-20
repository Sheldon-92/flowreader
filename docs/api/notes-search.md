# Notes Search API Documentation

## Overview

The Notes Search API provides comprehensive search and filtering capabilities for FlowReader notes. It supports full-text search, advanced filtering by various criteria, and efficient pagination with performance metrics.

## Endpoint

```
GET /api/notes/search
```

## Authentication

Requires JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

## Query Parameters

### Search Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | No | Full-text search query for note content |
| `bookId` | UUID | No | Filter notes by specific book ID |
| `chapterId` | UUID | No | Filter notes by specific chapter ID |
| `source` | enum | No | Filter by note source: `manual` or `auto` |
| `type` | string | No | Filter by note type/intent: `enhance`, `explain`, `analyze`, `translate`, `ask` |
| `generationMethod` | enum | No | Filter auto notes by generation method: `knowledge_enhancement`, `dialog_summary`, `context_analysis` |
| `hasSelection` | boolean | No | Filter notes with (`true`) or without (`false`) text selections |
| `tags` | string | No | Comma-separated list of tags to filter by |
| `minConfidence` | float | No | Minimum confidence score for auto-generated notes (0.0-1.0) |

### Pagination Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Number of results per page (max 100) |
| `offset` | integer | 0 | Number of results to skip |

### Sorting Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sortBy` | enum | `created_at` | Sort field: `created_at`, `confidence`, `content_length`, `relevance` |
| `sortOrder` | enum | `desc` | Sort direction: `asc` or `desc` |

## Request Examples

### Basic Search
```bash
GET /api/notes/search?q=knowledge+enhancement&limit=10
```

### Advanced Filtering
```bash
GET /api/notes/search?bookId=123e4567-e89b-12d3-a456-426614174000&source=auto&type=enhance&minConfidence=0.7
```

### Complex Search with Multiple Filters
```bash
GET /api/notes/search?q=historical&bookId=123e4567-e89b-12d3-a456-426614174000&hasSelection=true&sortBy=confidence&sortOrder=desc
```

## Response Format

### Success Response (200 OK)

```json
{
  "data": {
    "notes": [
      {
        "id": "note-uuid",
        "userId": "user-uuid",
        "bookId": "book-uuid",
        "chapterId": "chapter-uuid",
        "content": "Note content text...",
        "source": "auto",
        "meta": {
          "intent": "enhance",
          "generationMethod": "knowledge_enhancement",
          "confidence": 0.87,
          "type": "enhancement",
          "sourceSelection": {
            "text": "Selected text...",
            "start": 0,
            "end": 100
          }
        },
        "createdAt": "2024-09-19T10:30:00Z"
      }
    ],
    "total": 42,
    "hasMore": true,
    "filters": {
      "q": "knowledge enhancement",
      "bookId": "book-uuid",
      "source": "auto",
      "type": "enhance",
      "minConfidence": 0.7
    },
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 42
    },
    "performance": {
      "queryTime": 45,
      "resultsCount": 20
    }
  }
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "minConfidence must be between 0 and 1",
    "timestamp": "2024-09-19T10:30:00Z",
    "request_id": "req-123"
  }
}
```

#### 401 Unauthorized
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing JWT token",
    "timestamp": "2024-09-19T10:30:00Z",
    "request_id": "req-123"
  }
}
```

#### 403 Forbidden
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Book not found or access denied",
    "details": {
      "bookId": "book-uuid"
    },
    "timestamp": "2024-09-19T10:30:00Z",
    "request_id": "req-123"
  }
}
```

#### 429 Rate Limited
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "details": {
      "retryAfter": 60
    },
    "timestamp": "2024-09-19T10:30:00Z",
    "request_id": "req-123"
  }
}
```

#### 500 Internal Server Error
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Failed to search notes",
    "timestamp": "2024-09-19T10:30:00Z",
    "request_id": "req-123"
  }
}
```

## Data Types

### Note Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique note identifier |
| `userId` | UUID | ID of the note owner |
| `bookId` | UUID | ID of the associated book |
| `chapterId` | UUID | ID of the associated chapter (optional) |
| `content` | string | The note content text |
| `source` | enum | Note source: `manual` or `auto` |
| `meta` | object | Note metadata (varies by source) |
| `createdAt` | ISO 8601 | Note creation timestamp |

### Note Meta Object (Auto Notes)

| Field | Type | Description |
|-------|------|-------------|
| `intent` | string | Note intent/type |
| `generationMethod` | enum | Generation method used |
| `confidence` | float | Confidence score (0.0-1.0) |
| `type` | string | Note type classification |
| `sourceSelection` | object | Original text selection (optional) |

## Search Features

### Full-Text Search

The `q` parameter supports:
- **Prefix matching**: Terms 3+ characters use PostgreSQL prefix matching
- **Case-insensitive**: Search is case-insensitive by default
- **Content and tags**: Searches both note content and associated tags

### Tag-Based Filtering

Notes use structured tags for metadata:
- `source:auto` - Auto-generated notes
- `source:manual` - Manually created notes
- `method:knowledge_enhancement` - Generation method
- `intent:enhance` - Note intent/type
- `chapter:uuid` - Associated chapter
- `confidence:0.87` - Confidence score
- `has_selection` - Contains text selection

### Advanced Filtering

- **Book ownership**: Automatic filtering by user ownership via RLS
- **Confidence thresholds**: Filter auto notes by minimum confidence
- **Selection presence**: Filter by notes with/without text selections
- **Generation methods**: Filter auto notes by specific generation methods

### Sorting Options

- **created_at**: Sort by creation date (default)
- **content_length**: Sort by note content length
- **confidence**: Sort by confidence score (auto notes only)
- **relevance**: Sort by search relevance (when using full-text search)

## Performance Characteristics

### Query Performance

- **Simple filters**: < 100ms average response time
- **Full-text search**: < 200ms for typical queries
- **Complex multi-filter**: < 300ms with proper indexing

### Optimizations

- **Database indexes**: Optimized indexes on user_id, book_id, created_at, and tags
- **Pagination**: Efficient offset-based pagination
- **Query metrics**: Real-time performance monitoring included in response

### Rate Limiting

- **Search requests**: Subject to general API rate limits
- **Complex queries**: May have additional throttling for resource-intensive searches

## Security

### Row Level Security (RLS)

- **User isolation**: Users can only search their own notes
- **Book access control**: Automatic verification of book ownership
- **Data privacy**: No cross-user data leakage possible

### Input Validation

- **Parameter validation**: All query parameters validated and sanitized
- **SQL injection protection**: Parameterized queries prevent injection attacks
- **XSS prevention**: Content properly escaped in responses

## Usage Examples

### JavaScript/Fetch

```javascript
const searchNotes = async (query, filters = {}) => {
  const params = new URLSearchParams({
    q: query,
    ...filters
  });

  const response = await fetch(`/api/notes/search?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Search failed');
  }

  return response.json();
};

// Usage
const results = await searchNotes('enhancement', {
  source: 'auto',
  minConfidence: '0.8',
  sortBy: 'confidence'
});
```

### TypeScript Interface

```typescript
interface SearchNotesParams {
  q?: string;
  bookId?: string;
  chapterId?: string;
  source?: 'manual' | 'auto';
  type?: string;
  generationMethod?: 'knowledge_enhancement' | 'dialog_summary' | 'context_analysis';
  hasSelection?: boolean;
  tags?: string[];
  minConfidence?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'confidence' | 'content_length' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

interface SearchNotesResponse {
  notes: Note[];
  total: number;
  hasMore: boolean;
  filters: Partial<SearchNotesParams>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  performance: {
    queryTime: number;
    resultsCount: number;
  };
}
```

## Integration with FlowReader

### Frontend Integration

The search API integrates with:
- **Notes search page**: `/notes/search` route with full UI
- **Book-specific notes**: Filter by specific book context
- **Auto-notes discovery**: Find and explore auto-generated content

### Related APIs

- **GET /api/notes**: Basic notes listing for specific books
- **POST /api/notes/auto**: Auto-generate new notes
- **GET /api/notes/[id]**: Retrieve specific note details

## Migration Guide

### From Basic Notes API

If migrating from the basic notes API (`/api/notes`):

1. **Replace endpoint**: Change from `/api/notes` to `/api/notes/search`
2. **Update parameters**: Use new filtering parameters instead of basic queries
3. **Handle new response format**: Update response parsing for new structure
4. **Add error handling**: Implement handling for new error response formats

### Performance Considerations

- **Pagination**: Use appropriate `limit` values (20-50 recommended)
- **Filtering**: Apply filters to reduce result sets before full-text search
- **Caching**: Consider client-side caching for repeated searches
- **Debouncing**: Implement search input debouncing to reduce API calls

This comprehensive search API provides powerful discovery capabilities while maintaining simplicity and performance for FlowReader's note management system.