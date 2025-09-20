# Dialog History Migration (003)

## Overview

This migration implements the `dialog_messages` table and associated functionality for storing user-AI dialog interactions with comprehensive security and performance optimizations.

## Database Schema

### Table: `dialog_messages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique message identifier |
| `user_id` | UUID | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE | Owner of the message |
| `book_id` | UUID | NOT NULL, REFERENCES books(id) ON DELETE CASCADE | Associated book |
| `role` | TEXT | NOT NULL, CHECK (role IN ('user', 'assistant')) | Message sender role |
| `content` | TEXT | NOT NULL, CHECK (length(content) > 0 AND length(content) <= 4000) | Message content |
| `intent` | TEXT | CHECK (intent IN ('translate', 'explain', 'analyze', 'ask', 'enhance')) | Optional user intent |
| `selection` | JSONB | NULL | Optional text selection data |
| `metrics` | JSONB | NULL | Optional performance metrics |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Message timestamp |

## Security Implementation

### Row Level Security (RLS)

All policies enforce strict user isolation using `auth.uid()`:

1. **SELECT Policy**: Users can only view their own dialog messages
2. **INSERT Policy**: Users can only create messages for themselves
3. **UPDATE Policy**: Users can only update their own messages
4. **DELETE Policy**: Users can only delete their own messages

### Data Validation

- **Content Length**: Maximum 4000 characters
- **Role Validation**: Only 'user' or 'assistant' allowed
- **Intent Validation**: Limited to predefined intents
- **JSONB Validation**: Custom trigger validates structure
- **Foreign Key Constraints**: Ensures referential integrity

### Security Testing

```sql
-- Test cross-user access (should return empty)
SELECT COUNT(*) FROM dialog_messages WHERE user_id != auth.uid();

-- Test constraint violations
INSERT INTO dialog_messages (content) VALUES (repeat('x', 5000)); -- Should fail
```

## Performance Optimization

### Indexes

1. **Primary Performance Index**:
   ```sql
   idx_dialog_messages_user_book_time ON (user_id, book_id, created_at DESC)
   ```
   - Optimizes paginated dialog retrieval for specific user+book
   - Supports efficient ORDER BY created_at DESC queries
   - Expected use: 90% of dialog queries

2. **Secondary Index**:
   ```sql
   idx_dialog_messages_user_time ON (user_id, created_at DESC)
   ```
   - Optimizes cross-book user queries
   - Supports user activity timelines
   - Expected use: 10% of dialog queries

3. **Analytics Index**:
   ```sql
   idx_dialog_messages_intent ON (intent) WHERE intent IS NOT NULL
   ```
   - Partial index for intent-based analytics
   - Only indexes rows with non-null intent
   - Space-efficient for optional field

### Query Performance Expectations

- **Pagination queries**: < 100ms for 1000+ records
- **User-specific queries**: < 50ms with proper index usage
- **Cross-book searches**: < 200ms for active users

### Performance Testing

```sql
-- Verify index usage
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM dialog_messages
WHERE user_id = auth.uid() AND book_id = $1
ORDER BY created_at DESC
LIMIT 50;
```

## API Support Functions

### 1. `get_dialog_messages_paginated()`

Efficient pagination with optional timestamp-based filtering:

```sql
SELECT * FROM get_dialog_messages_paginated(
    user_id => auth.uid(),
    book_id => $1,
    p_limit => 50,
    p_offset => 0,
    p_before_timestamp => '2024-01-01'::timestamptz
);
```

### 2. `get_recent_dialog_context()`

Retrieves recent messages for AI context:

```sql
SELECT * FROM get_recent_dialog_context(
    p_user_id => auth.uid(),
    p_book_id => $1,
    p_limit => 10
);
```

### 3. `cleanup_old_dialog_messages()`

Data retention management:

```sql
SELECT cleanup_old_dialog_messages(365); -- Keep 1 year
```

## Analytics Support

### View: `dialog_message_stats`

Provides aggregated statistics per user/book:

- Total message count
- User vs assistant message breakdown
- Messages with intent classification
- First and last message timestamps

## Migration Safety

### Rollback Procedure

1. Run rollback script: `003_dialog_history_rollback.sql`
2. Verify table removal: `\d dialog_messages` (should show "does not exist")
3. Check for orphaned data: Rollback cleans up completely

### Pre-Migration Checklist

- [ ] Verify `books` table exists and has proper structure
- [ ] Confirm `auth.users` table is accessible
- [ ] Check PostgreSQL version supports JSONB (9.4+)
- [ ] Ensure sufficient database storage for expected volume

### Post-Migration Validation

Run the test script: `003_dialog_history_tests.sql`

Expected results:
- All constraints validate correctly
- RLS policies prevent cross-user access
- Indexes show up in query plans
- Functions execute without errors

## Integration Points

### Existing Tables

- **Dependencies**: `auth.users`, `books`
- **Cascade Behavior**: Messages deleted when user/book deleted
- **No Conflicts**: Does not interfere with existing `ai_conversations`/`ai_messages`

### Supabase Features

- **Compatible with**: Supabase Auth, RLS, Real-time subscriptions
- **Edge Functions**: Can be accessed from Supabase Edge Functions
- **Client Libraries**: Works with all Supabase client libraries

## Monitoring and Maintenance

### Key Metrics to Monitor

1. **Query Performance**:
   - Average response time for pagination queries
   - Index hit ratio for dialog_messages table
   - Slow query log for queries > 100ms

2. **Storage Growth**:
   - Table size growth rate
   - JSONB field utilization
   - Message content length distribution

3. **Security Events**:
   - Failed RLS policy violations
   - Constraint violation attempts
   - Cross-user access attempts

### Maintenance Tasks

1. **Weekly**: Review query performance metrics
2. **Monthly**: Analyze storage growth and consider cleanup
3. **Quarterly**: Review and optimize indexes based on usage patterns

### Troubleshooting

Common issues and solutions:

1. **Slow pagination**: Check if user_id filter is applied
2. **RLS violations**: Verify auth.uid() is properly set
3. **JSONB validation errors**: Check selection/metrics structure
4. **Foreign key errors**: Ensure book_id exists and user has access

## Future Considerations

### Potential Enhancements

1. **Partitioning**: Consider partitioning by user_id for very large datasets
2. **Archival**: Implement cold storage for old messages
3. **Full-text Search**: Add GIN index on content for search functionality
4. **Compression**: Consider JSONB compression for large selection data

### Scaling Recommendations

- **< 1M messages**: Current schema optimal
- **1M-10M messages**: Consider user-based partitioning
- **> 10M messages**: Implement archival strategy and read replicas