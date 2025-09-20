# Dialog History API - Test Documentation

## Overview
This document provides comprehensive documentation for the dialog history API testing suite, covering contract testing, integration verification, security validation, and T5 enhancement compatibility.

## Test Architecture

### Test Components
1. **Contract Tests** (`contract-tests.ts`) - API endpoint specification validation
2. **Database Integration Tests** (`database-integration-tests.ts`) - RLS policies and data integrity
3. **T5 Integration Tests** (`t5-integration-tests.ts`) - Knowledge enhancement integration
4. **Comprehensive Test Runner** (`comprehensive-test-runner.ts`) - Orchestrates all tests
5. **Shell Script Tests** (`test-api-endpoints.sh`) - Quick endpoint validation

### Test Categories

#### 1. Contract Testing
**Purpose**: Verify API endpoints match exact contract specifications

**Coverage**:
- ✅ GET `/api/dialog/history` - Message retrieval with pagination
- ✅ POST `/api/dialog/history` - Message creation (single and batch)
- ✅ Query parameter validation (bookId, limit, cursor, intent, role)
- ✅ Request/response format compliance
- ✅ Error handling and HTTP status codes
- ✅ Edge cases and boundary conditions

**Key Test Cases**:
```typescript
// GET endpoint tests
GET-001: Valid request returns 200 with messages array and pagination
GET-002: Pagination with cursor works correctly
GET-003: Intent filtering returns only matching messages
GET-004: Role filtering returns only matching messages
GET-005: Missing bookId returns 400 Bad Request
GET-006: Invalid bookId format returns 400 Bad Request
GET-007: Invalid limit values return 400 Bad Request
GET-008: Invalid intent values return 422 Unprocessable Entity
GET-009: Invalid role values return 422 Unprocessable Entity
GET-010: Invalid cursor format returns 400 Bad Request

// POST endpoint tests
POST-001: Valid single message creation returns 201
POST-002: Valid batch message creation returns 201
POST-003: T5 enhancement message with metadata storage
POST-004: Missing required fields return 400 Bad Request
POST-005: Invalid role values return 422 Unprocessable Entity
POST-006: Empty content returns 422 Unprocessable Entity
POST-007: Content too long returns 422 Unprocessable Entity
POST-008: Too many messages returns 400 Bad Request
POST-009: Invalid UUID format in bookId returns 422
POST-010: Invalid JSON body returns 400 Bad Request
```

#### 2. Security & Authentication Testing
**Purpose**: Ensure proper authentication, authorization, and security measures

**Coverage**:
- ✅ Authentication requirements enforced
- ✅ Cross-user access prevention (RLS policies)
- ✅ Rate limiting enforcement
- ✅ Input sanitization and SQL injection prevention
- ✅ Token validation and security logging

**Key Test Cases**:
```typescript
SEC-001: Missing authentication returns 401 Unauthorized
SEC-002: Invalid token returns 401 Unauthorized
SEC-003: Cross-user book access returns 403 Forbidden
SEC-004: Rate limiting enforced after multiple requests
SEC-005: SQL injection attempts safely handled
```

#### 3. Database Integration Testing
**Purpose**: Verify database operations, RLS policies, and data integrity

**Coverage**:
- ✅ Message insertion (single and batch)
- ✅ Paginated retrieval with cursor-based navigation
- ✅ JSONB field validation (selection, metrics)
- ✅ RLS policy enforcement for user isolation
- ✅ Foreign key constraints and data integrity
- ✅ Content validation and constraints

**Key Test Cases**:
```typescript
DB-001: Dialog message insertion works correctly
DB-002: Batch message insertion works correctly
DB-003: Paginated retrieval works correctly
DB-004: JSONB fields validation works correctly

RLS-001: Users cannot read other users dialog messages
RLS-002: Users cannot insert messages for other users
RLS-003: Book ownership verification works correctly
RLS-004: Dialog message filtering by intent and role works

INT-001: Foreign key constraints prevent orphaned records
INT-002: Content length constraints enforced
INT-003: Role enum constraint enforced
```

#### 4. T5 Enhancement Integration Testing
**Purpose**: Verify T5 knowledge enhancement system integration

**Coverage**:
- ✅ Enhancement data storage in dialog messages
- ✅ Metadata integrity (enhanceType, confidence, metrics)
- ✅ Multiple enhancement types (concept, historical, cultural)
- ✅ Quality improvement verification (≥10% target)
- ✅ Conversation flow integration
- ✅ Performance metrics tracking

**Key Test Cases**:
```typescript
T5-001: Enhancement data properly stored in dialog messages
T5-002: Enhancement retrieval maintains metadata integrity
T5-003: Multiple enhancement types stored and filtered correctly
T5-004: Quality improvement target (≥10%) verified with stored data
T5-005: Enhancement conversation flow integration
T5-006: Enhancement performance metrics tracking
```

#### 5. Performance Testing
**Purpose**: Ensure acceptable performance under expected load

**Coverage**:
- ✅ Pagination performance with large datasets
- ✅ Response time targets (<200ms for standard queries)
- ✅ Response size validation
- ✅ Database query efficiency

**Key Test Cases**:
```typescript
PERF-001: Pagination performance with large datasets
PERF-002: Response size validation for large requests
```

## Test Execution

### Running All Tests
```bash
# Comprehensive test suite
npx tsx api/dialog/comprehensive-test-runner.ts

# Shell script quick tests
./scripts/test-api-endpoints.sh --focus dialog-history
```

### Running Individual Test Suites
```bash
# Contract tests only
npx tsx api/dialog/contract-tests.ts

# Database integration tests only
npx tsx api/dialog/database-integration-tests.ts

# T5 integration tests only
npx tsx api/dialog/t5-integration-tests.ts

# T5 quality regression test
npx tsx api/_spikes/knowledge-quality-mock-test.ts
```

### Focus Testing
```bash
# Focus on specific areas
./scripts/test-api-endpoints.sh --focus dialog-history
./scripts/test-api-endpoints.sh --focus security
./scripts/test-api-endpoints.sh --focus rate-limits
```

## Test Environment Requirements

### Prerequisites
- Node.js with TypeScript support
- Supabase database with dialog_messages table
- Valid API authentication tokens
- Network access to API endpoints

### Environment Variables
```bash
API_BASE_URL=http://localhost:3001  # API base URL
SUPABASE_URL=your-supabase-url      # Database URL
SUPABASE_ANON_KEY=your-anon-key     # Database access key
NODE_ENV=test                       # Test environment
```

### Database Schema Requirements
```sql
-- Core table
dialog_messages (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  book_id UUID REFERENCES books(id),
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT CHECK (length(content) > 0),
  intent TEXT CHECK (intent IN ('translate', 'explain', 'analyze', 'ask', 'enhance')),
  selection JSONB,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Supporting tables
books (id UUID, owner_id UUID, title TEXT)
users (id UUID, email TEXT)

-- RLS policies enabled for user isolation
```

## Test Results Interpretation

### Success Criteria
- **Contract Compliance**: All API endpoints return expected formats
- **Security**: No cross-user access, authentication enforced
- **Integration**: Database operations work correctly with RLS
- **T5 Enhancement**: Quality improvement ≥10% achieved
- **Performance**: Response times <200ms for standard queries

### Result Categories
- ✅ **PASS**: Test met all requirements
- ❌ **FAIL**: Critical issue detected, requires resolution
- ⚠️ **WARN**: Non-critical issue or configuration note

### Final Recommendations
- **GO**: All critical tests passed, ready for production
- **NO-GO**: Critical failures detected, review required

## Evidence Commands

### Verification Commands
```bash
# Test dialog history specific tests
./scripts/test-api-endpoints.sh --focus dialog-history

# Verify contract compliance
curl -H "Authorization: Bearer <valid-token>" \
  "http://localhost:3001/api/dialog/history?bookId=<book-id>" | jq .

# Test T5 integration
npx tsx api/_spikes/knowledge-quality-mock-test.ts

# Check database RLS policies
psql -d your_database -c "SELECT * FROM dialog_messages;" # Should respect RLS
```

### Manual Testing Examples
```bash
# GET endpoint with various parameters
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3001/api/dialog/history?bookId=<id>&limit=10&intent=enhance"

# POST endpoint with enhancement data
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "bookId": "<book-id>",
      "role": "assistant",
      "content": "Enhanced explanation...",
      "intent": "enhance",
      "selection": {"text": "selected text"},
      "metrics": {"tokens": 200, "cost": 0.004, "enhanceType": "cultural"}
    }]
  }' \
  "http://localhost:3001/api/dialog/history"
```

## Integration Points

### With Existing Systems
1. **Chat Stream**: Dialog history stores messages from chat interactions
2. **Authentication**: Uses existing JWT token validation
3. **Rate Limiting**: Integrated with existing rate limiting system
4. **Book Management**: Respects book ownership and permissions
5. **T5 Enhancement**: Stores and retrieves enhancement results

### API Contract Specification
The dialog history API follows RESTful conventions:

**GET /api/dialog/history**
- Purpose: Retrieve paginated dialog messages
- Parameters: bookId (required), limit, cursor, intent, role
- Returns: `{ messages: [], pagination: { hasMore, nextCursor } }`

**POST /api/dialog/history**
- Purpose: Create one or more dialog messages
- Body: `{ messages: [{ bookId, role, content, intent?, selection?, metrics? }] }`
- Returns: `{ saved: [{ id, createdAt }], count: number }`

## Troubleshooting

### Common Issues
1. **Authentication Failures**: Check JWT token validity and format
2. **Database Errors**: Verify RLS policies and user permissions
3. **Validation Errors**: Check request format against contract specification
4. **Performance Issues**: Review database indexes and query efficiency

### Debug Commands
```bash
# Check API health
curl http://localhost:3001/api/health

# Verify authentication
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/dialog/history?bookId=<valid-id>

# Test database connectivity
npx tsx api/dialog/database-integration-tests.ts

# Validate T5 integration
npx tsx api/dialog/t5-integration-tests.ts
```

## Maintenance

### Regular Testing
- Run comprehensive test suite before releases
- Monitor performance metrics trends
- Update test data and scenarios as needed
- Verify T5 quality improvements maintain target

### Test Data Management
- Tests create and clean up their own data
- No persistent test data in production
- Mock data used for T5 quality testing
- Isolated test environments recommended

## Conclusion

This test suite provides comprehensive validation of the dialog history API implementation, ensuring:
- Contract compliance with all specified requirements
- Security and authentication properly enforced
- Database operations and RLS policies working correctly
- T5 enhancement integration maintaining quality targets
- Performance meeting production requirements

All acceptance criteria have been verified through automated testing with evidence provided for each requirement.