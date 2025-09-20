# Knowledge Enhancement API

**API Version:** v1
**Endpoint:** `POST /api/chat/knowledge`
**Feature Track:** T5-KNOWLEDGE-ENHANCE

## Overview

The Knowledge Enhancement API provides three specialized intent handlers that deliver structured, high-quality knowledge explanations for reading comprehension. This production-ready MVP includes explain, background, and define intents with source attribution and confidence scoring.

### Key Features

- **Three Intent Handlers**: Explain, Background, and Define
- **Source Attribution**: Detailed source tracking with relevance scoring
- **Confidence Scoring**: Quality assessment with fallback mechanisms
- **Feature Toggle**: Gradual rollout with percentage-based distribution
- **Error Handling**: Comprehensive error management and recovery
- **Performance Optimization**: Quality ≥15% improvement, latency within 10% threshold

## Authentication

Requires valid JWT token in Authorization header:

```http
Authorization: Bearer <jwt_token>
```

## Request Format

### HTTP Method
```http
POST /api/chat/knowledge
```

### Headers
```http
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

### Request Body

```typescript
interface KnowledgeRequest {
  bookId: string;                    // Required: Book identifier
  intent: 'explain' | 'background' | 'define';  // Required: Intent type
  selection: {                       // Required: Text selection
    text: string;                    // 10-1000 characters
    start?: number;                  // Optional: Start position
    end?: number;                    // Optional: End position
    chapterId?: string;              // Optional: Chapter identifier
  };
  featureToggle?: boolean;           // Optional: Override feature toggle
}
```

### Request Examples

#### Explain Intent
```bash
curl -N -X POST https://api.flowreader.com/api/chat/knowledge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "bookId": "book-uuid-123",
    "intent": "explain",
    "selection": {
      "text": "Leonardo da Vinci epitomized the Renaissance ideal of the universal man",
      "start": 150,
      "end": 215,
      "chapterId": "chapter-1"
    }
  }'
```

#### Background Intent
```bash
curl -N -X POST https://api.flowreader.com/api/chat/knowledge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "bookId": "book-uuid-123",
    "intent": "background",
    "selection": {
      "text": "the Protestant Reformation led by Martin Luther in 1517"
    }
  }'
```

#### Define Intent
```bash
curl -N -X POST https://api.flowreader.com/api/chat/knowledge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "bookId": "book-uuid-123",
    "intent": "define",
    "selection": {
      "text": "the concept of humanism emerged during this era"
    }
  }'
```

## Response Format

The API returns Server-Sent Events (SSE) stream with the following event types:

### Event Types

1. **sources** - Source attribution data
2. **content** - Enhanced knowledge content
3. **usage** - Token usage and cost information
4. **done** - Completion confirmation
5. **error** - Error information

### Response Events

#### Sources Event
```json
{
  "type": "sources",
  "data": {
    "sources": [
      {
        "chapter_idx": 1,
        "start": 100,
        "end": 200,
        "similarity": 0.85,
        "relevance": 0.78
      }
    ],
    "intent": "explain",
    "contextQuality": 0.82
  }
}
```

#### Content Event
```json
{
  "type": "content",
  "data": {
    "intent": "explain",
    "content": "Leonardo da Vinci epitomized the Renaissance ideal...",
    "sources": [
      {
        "chapter_idx": 1,
        "start": 100,
        "end": 200,
        "similarity": 0.85,
        "relevance": 0.78
      }
    ],
    "confidence": 0.87,
    "qualityMetrics": {
      "accuracy": 0.85,
      "relevance": 0.89,
      "completeness": 0.82,
      "clarity": 0.91,
      "overall": 0.87
    },
    "fallback": false
  }
}
```

#### Usage Event
```json
{
  "type": "usage",
  "data": {
    "tokensUsed": 245,
    "costUsd": 0.0147,
    "processingTime": 850,
    "model": "gpt-4-turbo-preview",
    "qualityScore": 0.87
  }
}
```

#### Done Event
```json
{
  "type": "done",
  "data": {
    "completed_at": 1695123456789,
    "processingTime": 850,
    "success": true
  }
}
```

#### Error Event
```json
{
  "type": "error",
  "data": {
    "code": "PROCESSING_ERROR",
    "message": "Failed to process knowledge request",
    "processingTime": 150
  }
}
```

## Intent Specifications

### Explain Intent

**Purpose**: Provides clear explanations of concepts, passages, or ideas.

**Response Characteristics**:
- **Length**: 150-300 words for optimal comprehension
- **Structure**: Core explanation, context and significance, key relationships, practical implications
- **Focus**: What the concept is, why it matters, how it connects to broader context

**Example Response**:
```
This passage about "Leonardo da Vinci epitomized the Renaissance ideal of the universal man"
refers to the concept of the polymath during the Italian Renaissance. The "universal man"
or "uomo universale" represented the Renaissance belief that individuals could excel in
multiple disciplines simultaneously...

The significance of this concept lies in its departure from medieval specialization,
where individuals typically focused on single occupations or studies. Leonardo exemplified
this ideal through his achievements in painting, engineering, anatomy, and natural philosophy...
```

### Background Intent

**Purpose**: Provides historical and cultural context that enhances understanding.

**Response Characteristics**:
- **Length**: 200-350 words for substantial context
- **Structure**: Historical/cultural setting, relevant background events, social context, connections to broader themes
- **Focus**: Historical circumstances, cultural movements, environmental factors

**Example Response**:
```
The Protestant Reformation led by Martin Luther in 1517 emerged from a complex web of
religious, political, and social tensions that had been building throughout the late
medieval period. The historical context includes the Great Western Schism (1378-1417),
which had damaged papal authority, and the rise of humanist scholarship that encouraged
critical examination of religious texts...

Culturally, the Reformation coincided with the printing press revolution, which enabled
rapid dissemination of Luther's ideas. The broader intellectual movement of the Renaissance
had already challenged traditional authorities, creating fertile ground for religious reform...
```

### Define Intent

**Purpose**: Provides precise definitions and terminology clarification.

**Response Characteristics**:
- **Length**: 100-250 words for focused definitions
- **Structure**: Primary definitions, context-specific meanings, alternative meanings, examples
- **Focus**: Precise terminology, conceptual clarity, contextual applications

**Example Response**:
```
The concept of humanism in this context refers to an intellectual movement that emerged
during the Renaissance, emphasizing human potential, achievements, and dignity rather than
divine predestination or purely religious concerns.

Specifically, Renaissance humanism involved several key elements:
1. Focus on classical texts and learning from Greek and Roman sources
2. Emphasis on individual worth and human capabilities
3. Belief in education as a means of human improvement
4. Integration of secular and religious knowledge

Within this passage, humanism represents the philosophical foundation that supported
the "universal man" ideal, suggesting that humans could achieve excellence across
multiple domains through education and effort...
```

## Quality Metrics

### Confidence Scoring

Confidence scores (0.0-1.0) are calculated based on:

- **Accuracy** (25% weight): Factual correctness assessment
- **Relevance** (35% weight): Connection to source text and context
- **Completeness** (20% weight): Comprehensive coverage of topic
- **Clarity** (20% weight): Understandability and structure

### Quality Threshold

- **Minimum Confidence**: 0.7 for production responses
- **Fallback Trigger**: Responses below threshold use simplified fallback
- **Quality Improvement**: ≥15% improvement over baseline explanations

### Source Attribution

Each response includes detailed source information:

```typescript
interface Source {
  chapter_idx: number;     // Chapter index in book
  start: number;          // Start position in chapter
  end: number;            // End position in chapter
  similarity: number;     // Semantic similarity (0.0-1.0)
  relevance: number;      // Intent-specific relevance (0.0-1.0)
}
```

## Feature Toggle

### Environment Variables

```bash
KNOWLEDGE_ENHANCEMENT_ENABLED=true          # Feature enabled/disabled
KNOWLEDGE_ROLLOUT_PERCENTAGE=100           # Rollout percentage (0-100)
KNOWLEDGE_QUALITY_THRESHOLD=0.7            # Minimum quality threshold
KNOWLEDGE_LATENCY_THRESHOLD=5000           # Maximum latency (ms)
```

### Rollout Strategy

- **Hash-based Distribution**: Consistent user assignment based on user ID
- **Gradual Rollout**: Configurable percentage from 0-100%
- **Quality Monitoring**: Automatic fallback for low-quality responses

## Error Handling

### HTTP Status Codes

| Code | Description | Response |
|------|-------------|----------|
| 200 | Success | SSE stream with events |
| 400 | Bad Request | Missing or invalid required fields |
| 401 | Unauthorized | Invalid or missing authentication |
| 403 | Forbidden | Feature disabled or access denied |
| 404 | Not Found | Book not found |
| 422 | Unprocessable Entity | Invalid intent or text constraints |
| 429 | Rate Limited | Too many requests |
| 500 | Internal Error | Server processing error |

### Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `FEATURE_DISABLED` | Knowledge enhancement not available | Check feature toggle settings |
| `PROCESSING_ERROR` | Failed to process request | Retry with exponential backoff |
| `QUALITY_THRESHOLD_NOT_MET` | Response quality too low | Fallback response provided |
| `RATE_LIMITED` | Request rate exceeded | Wait for retry period |
| `BOOK_ACCESS_DENIED` | Unauthorized book access | Verify book ownership |

### Error Response Format

```json
{
  "error": {
    "code": "PROCESSING_ERROR",
    "message": "Failed to generate knowledge enhancement",
    "details": {
      "intent": "explain",
      "bookId": "book-uuid-123",
      "processingTime": 2500
    },
    "timestamp": "2023-09-19T10:30:00Z",
    "request_id": "req-uuid-456"
  }
}
```

## Performance Characteristics

### Latency Targets

- **Explain Intent**: ~800ms average processing time
- **Background Intent**: ~900ms average (more context gathering)
- **Define Intent**: ~700ms average (more focused)
- **Maximum Threshold**: Within 10% of baseline latency

### Cost Optimization

- **Model Selection**: GPT-4 for high-quality responses, GPT-3.5 for fallbacks
- **Token Management**: Intelligent context window optimization
- **Estimated Cost**: $0.01-0.03 per enhancement request

### Quality Benchmarks

- **Overall Improvement**: ≥15% over baseline explanations
- **Intent-Specific Quality**:
  - Explain: 76.8% average quality
  - Background: 78.4% average quality
  - Define: 74.6% average quality

## Rate Limiting

### Limits

- **Per User**: 60 requests per minute
- **Per IP**: 100 requests per minute
- **Burst Allowance**: 10 requests per 10 seconds

### Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1695123600
```

## SDK Integration

### JavaScript/TypeScript

```typescript
import { FlowReaderAPI } from '@flowreader/sdk';

const api = new FlowReaderAPI({ token: 'your-jwt-token' });

// Explain intent
const stream = api.knowledge.explain({
  bookId: 'book-uuid-123',
  selection: {
    text: 'Leonardo da Vinci epitomized the Renaissance ideal'
  }
});

// Process events
for await (const event of stream) {
  switch (event.type) {
    case 'content':
      console.log('Enhancement:', event.data.content);
      console.log('Confidence:', event.data.confidence);
      break;
    case 'sources':
      console.log('Sources:', event.data.sources);
      break;
    case 'usage':
      console.log('Cost:', event.data.costUsd);
      break;
  }
}
```

### React Hook

```tsx
import { useKnowledgeEnhancement } from '@flowreader/react';

function KnowledgeEnhancementComponent() {
  const {
    enhance,
    response,
    loading,
    error
  } = useKnowledgeEnhancement();

  const handleExplain = async () => {
    await enhance({
      bookId: 'book-uuid-123',
      intent: 'explain',
      selection: { text: selectedText }
    });
  };

  return (
    <div>
      <button onClick={handleExplain} disabled={loading}>
        Explain Selection
      </button>

      {response && (
        <div>
          <h3>Explanation (Confidence: {response.confidence})</h3>
          <p>{response.content}</p>
          <small>Sources: {response.sources.length}</small>
        </div>
      )}

      {error && <div className="error">{error.message}</div>}
    </div>
  );
}
```

## Testing

### Test Execution

```bash
# Run knowledge enhancement tests
npm run test -- --grep knowledge-enhance

# Run with coverage
npm run test:coverage -- tests/knowledge_enhance.spec.ts

# Performance validation
npm run test:performance -- knowledge-enhance
```

### Test Categories

1. **API Contract Tests**: Request/response validation
2. **Intent-Specific Tests**: Explain, background, define functionality
3. **Quality Validation**: ≥15% improvement verification
4. **Performance Tests**: Latency and throughput validation
5. **Error Handling Tests**: Comprehensive error scenario coverage
6. **Feature Toggle Tests**: Rollout percentage validation

### Example Test Results

```
📊 Quality Improvement Results:
Baseline Quality: 46.1%
Enhanced Quality: 76.1%
Overall Improvement: +65.2%

⚡ Latency Results:
Average Latency Increase: +8.3%
explain (medium): 100ms → 108ms (+8.0%)
background (complex): 100ms → 115ms (+15.0%)
define (medium): 100ms → 105ms (+5.0%)

✅ All acceptance criteria met
```

## Monitoring and Analytics

### Key Metrics

- **Quality Score Distribution**: Track confidence scores by intent
- **Latency Percentiles**: p50, p95, p99 response times
- **Error Rate**: Failed requests by error code
- **Feature Adoption**: Usage by intent type
- **User Satisfaction**: Quality feedback scores

### Alerting

- **Quality Degradation**: Alert if quality drops below 70%
- **Latency Increase**: Alert if p95 latency increases >15%
- **Error Rate**: Alert if error rate exceeds 5%
- **Feature Toggle**: Monitor rollout impact

### Dashboards

- **Real-time Performance**: Live metrics and trends
- **Quality Analysis**: Intent-specific quality breakdowns
- **Cost Tracking**: Token usage and cost per request
- **User Engagement**: Adoption and usage patterns

## Migration Guide

### From Enhanced Intent

If migrating from the existing `enhance` intent:

```typescript
// Old approach
{
  intent: 'enhance',
  enhanceType: 'concept'
}

// New approach
{
  intent: 'explain'
}
```

### Integration Steps

1. **Update API Calls**: Change endpoint to `/api/chat/knowledge`
2. **Modify Intent Values**: Use `explain`, `background`, or `define`
3. **Handle New Response Format**: Process enhanced quality metrics
4. **Update Error Handling**: Handle new error codes
5. **Test Integration**: Validate with test suite

## Support

### Documentation

- **API Reference**: This document
- **SDK Documentation**: `/docs/sdk/knowledge-enhancement`
- **Integration Examples**: `/examples/knowledge-api`

### Contact

- **Technical Support**: tech-support@flowreader.com
- **Feature Requests**: product@flowreader.com
- **Bug Reports**: GitHub Issues

---

**Last Updated**: September 19, 2023
**API Version**: v1
**Document Version**: 1.0