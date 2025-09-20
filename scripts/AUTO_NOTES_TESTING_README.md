# Auto Notes Endpoint Testing Documentation

## Overview

Comprehensive contract and integration testing suite for the `POST /api/notes/auto` endpoint implementing T6-NOTES-AUTO requirements.

## Test Coverage

### 1. Success Scenarios (201)
- **Selection + enhance intent**: Tests T5 knowledge enhancement with quality threshold validation
- **Selection without intent**: Tests contextual summary generation
- **No selection**: Tests T7 dialog history summarization

### 2. Authentication Tests (401)
- Missing Authorization header
- Invalid JWT tokens
- Malformed Authorization headers
- XSS attempts in auth tokens

### 3. Authorization Tests (403)
- Cross-user book access prevention
- Non-existent book access
- RLS enforcement validation

### 4. Input Validation Tests (422)
- Invalid intent values
- Selection text too long (>1000 chars)
- Invalid UUID format for bookId
- Invalid contextScope values
- Missing selection for enhance intent
- No guidance parameters provided

### 5. Rate Limiting Tests (429)
- 20 auto-notes per hour limit enforcement
- Rate limit header validation
- Retry-After header verification

### 6. Integration Tests
- **T5 Knowledge Enhancement**: Validates knowledge_enhancement generation method
- **T7 Dialog History**: Validates dialog_summary generation method
- Quality threshold enforcement (0.6 confidence minimum)
- Response format compliance with API contract

### 7. Security Tests
- SQL injection attempts in bookId
- XSS attempts in selection text
- Path traversal attempts in chapterId
- Input sanitization validation

### 8. Edge Cases
- Empty request bodies
- Malformed JSON
- Wrong HTTP methods
- Large payload handling

## Test Suites

### 1. Bash Test Suite
**File**: `scripts/test-auto-notes-endpoint.sh`
- Comprehensive curl-based testing
- 27 individual test cases
- Real HTTP request validation
- Rate limiting simulation
- Security penetration testing

**Usage**:
```bash
./scripts/test-auto-notes-endpoint.sh
```

### 2. TypeScript Integration Suite
**File**: `api/notes/auto-notes-integration-tests.ts`
- Type-safe test definitions
- Programmatic response validation
- Detailed error reporting
- Performance metrics collection

**Usage**:
```bash
npx tsx api/notes/auto-notes-integration-tests.ts
```

### 3. Main Test Script Integration
**File**: `scripts/test-api-endpoints.sh`
- Auto notes tests integrated into main suite
- Focus mode: `--focus auto-notes`
- Comprehensive test execution
- TypeScript suite integration

**Usage**:
```bash
# Run all tests including auto notes
./scripts/test-api-endpoints.sh

# Focus on auto notes only
./scripts/test-api-endpoints.sh --focus auto-notes
```

## Test Data Requirements

### Environment Variables
- `API_BASE`: API server base URL (default: http://localhost:3001/api)
- `TEST_TOKEN`: Valid JWT token for testing
- `TEST_BOOK_ID`: Valid book UUID owned by test user

### Test Book Setup
Tests require a book owned by the test user with UUID: `550e8400-e29b-41d4-a716-446655440000`

## Expected Responses

### Success Response Format
```json
{
  "id": "uuid",
  "userId": "uuid",
  "bookId": "uuid",
  "chapterId": "string?",
  "selection": {
    "text": "string",
    "start": "number?",
    "end": "number?",
    "chapterId": "string?"
  },
  "content": "string",
  "source": "auto",
  "meta": {
    "intent": "enhance|explain|analyze|ask?",
    "generationMethod": "knowledge_enhancement|dialog_summary|context_analysis",
    "confidence": "number (≥0.6)",
    "sourceSelection": "object?",
    "contextScope": "selection|recent_dialog|chapter?"
  },
  "metrics": {
    "tokens": "number",
    "cost": "number",
    "processingTime": "number"
  },
  "createdAt": "ISO8601"
}
```

### Error Response Format
```json
{
  "error": "string",
  "message": "string",
  "status": "number",
  "details": "object?"
}
```

## Quality Assurance

### Acceptance Criteria Validation
- ✅ **AC-1**: All success scenarios (201) work with proper response format
- ✅ **AC-2**: Authentication failures return 401 with security logging
- ✅ **AC-3**: Authorization failures return 403 for cross-user access
- ✅ **AC-4**: Input validation returns 422 for invalid data
- ✅ **AC-5**: Rate limiting returns 429 after 20 requests/hour
- ✅ **AC-6**: T5 and T7 integrations working correctly
- ✅ **AC-7**: Quality threshold (0.6) enforced
- ✅ **AC-8**: All responses match API contract specification

### Performance Validation
- Response times tracked and reported
- Rate limiting enforcement verified
- Quality threshold compliance measured
- Token/cost metrics validated when requested

### Security Validation
- All authentication vectors tested
- Authorization boundaries enforced
- Input validation comprehensive
- XSS/SQL injection prevention verified
- Path traversal protection confirmed

## Troubleshooting

### Common Issues

1. **Server not running**: Ensure API server is running on configured port
2. **Invalid test tokens**: Update TEST_TOKEN environment variable
3. **Missing test book**: Create test book with specified UUID
4. **Rate limit triggers**: Tests may trigger actual rate limits during development

### Rate Limiting Notes
- Tests include actual rate limit verification
- May show warnings if limits configured higher than test thresholds
- Development environments may have different rate limit settings

### Dialog History Dependencies
- Dialog history tests depend on existing conversation data
- May return 422 if no recent dialog available (acceptable)
- T7 integration tests require dialog_messages table data

## Files Modified/Created

### New Test Files
- `scripts/test-auto-notes-endpoint.sh` - Dedicated auto notes test suite
- `api/notes/auto-notes-integration-tests.ts` - TypeScript integration tests
- `scripts/validate-auto-notes-setup.sh` - Setup validation script

### Modified Files
- `scripts/test-api-endpoints.sh` - Added auto notes testing and focus mode

### Implementation Dependencies
- `api/notes/auto.ts` - Auto notes endpoint implementation
- `api/_lib/rate-limiter.ts` - Auto notes rate limiter configuration
- `api/_lib/input-validator.ts` - Auto note request validation
- `api/_lib/auth-enhanced.ts` - Enhanced authentication with security logging

## Handoff Information

**From**: team-api-development (endpoint implemented)
**Role**: team-code-quality (test implementation)
**To**: docs-writer (T6 documentation completion)

All contract and integration tests implemented according to T6-NOTES-AUTO specifications. Comprehensive validation covers all success scenarios, error conditions, rate limiting, T5/T7 integrations, and security requirements.