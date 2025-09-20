# FlowReader - Personal Smoke Check

## 🧪 Core Functionality Testing Checklist

This checklist verifies the core reading loop works correctly: **Upload → Read → Chat → Notes → Search**

## Prerequisites

- FlowReader is running locally (`npm run dev`)
- You have a valid JWT token (see [Personal Usage Guide](./personal-usage.md#getting-your-jwt-token))
- You have a small EPUB file for testing (< 5MB recommended)

## Testing Steps

### Step 1: Health Check ✓
Verify the application is running correctly.

```bash
# Expected: {"status":"ok","timestamp":"...","version":"0.1.0","environment":"..."}
curl -sf http://localhost:5173/api/health | jq '.'

# Check status specifically (should return "ok")
curl -sf http://localhost:5173/api/health | jq -r '.status'
```

**Expected Result:** Status shows "ok"

### Step 2: Upload EPUB ✓
Test file upload functionality.

```bash
# Get a signed upload URL (replace <your-token> with your JWT)
UPLOAD_RESPONSE=$(curl -sf -X POST http://localhost:5173/api/upload/signed-url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"fileName":"test.epub","fileSize":1048576}')

echo $UPLOAD_RESPONSE | jq '.'

# Extract the upload URL
UPLOAD_URL=$(echo $UPLOAD_RESPONSE | jq -r '.url')
TASK_ID=$(echo $UPLOAD_RESPONSE | jq -r '.taskId')

echo "Task ID: $TASK_ID"
```

**Alternative: Use Web Interface**
1. Navigate to http://localhost:5173
2. Sign in with your account
3. Click "Upload Book" or drag-drop an EPUB file
4. Wait for processing to complete

**Expected Result:** Upload completes and book appears in library

### Step 3: Check Upload Processing ✓
Monitor the upload processing status.

```bash
# Check task status (replace <your-token> and <task-id>)
curl -sf -X GET "http://localhost:5173/api/tasks/status?taskId=<task-id>" \
  -H "Authorization: Bearer <your-token>" | jq '.'
```

**Expected Result:** Status progresses from "processing" to "completed"

### Step 4: View Library ✓
Verify the uploaded book appears in your library.

```bash
# Get your library (replace <your-token>)
curl -sf -X GET "http://localhost:5173/api/library" \
  -H "Authorization: Bearer <your-token>" | jq '.'

# Count books in library
curl -sf -X GET "http://localhost:5173/api/library" \
  -H "Authorization: Bearer <your-token>" | jq '. | length'
```

**Expected Result:** Your uploaded book appears in the library list

### Step 5: Test AI Chat ✓
Test the AI conversation feature with a book.

```bash
# Start a chat about a book (replace <your-token> and <book-id>)
curl -sf -X POST http://localhost:5173/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "bookId": "<book-id>",
    "query": "What are the main themes of this book?",
    "intent": "explain",
    "selection": {
      "text": "Sample text from the book",
      "chapterId": "chapter-1",
      "chapterTitle": "Introduction"
    }
  }' \
  --no-buffer
```

**Alternative: Use Web Interface**
1. Open a book from your library
2. Select some text
3. Click "Chat" or "Explain" button
4. Ask a question about the selection

**Expected Result:** Receive AI-generated response about the book content

### Step 6: Create Notes ✓
Test manual and automatic note creation.

```bash
# Create a manual note (replace tokens and IDs)
curl -sf -X POST http://localhost:5173/api/notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "bookId": "<book-id>",
    "content": "This is a test note",
    "type": "highlight",
    "source": "manual",
    "position": {
      "chapterId": "chapter-1",
      "percentage": 10
    }
  }' | jq '.'

# Create an auto note from selection
curl -sf -X POST http://localhost:5173/api/notes/auto \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "bookId": "<book-id>",
    "selection": {
      "text": "Important passage from the book",
      "chapterId": "chapter-1"
    },
    "intent": "summarize"
  }' | jq '.'
```

**Expected Result:** Notes are created successfully

### Step 7: List and Search Notes ✓
Verify notes can be retrieved and searched.

```bash
# List all notes for a book (replace tokens and IDs)
curl -sf -X GET "http://localhost:5173/api/notes?bookId=<book-id>" \
  -H "Authorization: Bearer <your-token>" | jq '.'

# Count notes
curl -sf -X GET "http://localhost:5173/api/notes?bookId=<book-id>" \
  -H "Authorization: Bearer <your-token>" | jq '.items | length'

# Search notes (if search endpoint is available)
curl -sf -X GET "http://localhost:5173/api/notes/search?q=test&bookId=<book-id>" \
  -H "Authorization: Bearer <your-token>" | jq '.'
```

**Expected Result:** Notes are listed and searchable

### Step 8: Verify Reading Position ✓
Test reading progress tracking.

```bash
# Update reading position (replace tokens and IDs)
curl -sf -X POST http://localhost:5173/api/position/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "bookId": "<book-id>",
    "chapterIdx": 1,
    "percentage": 25
  }' | jq '.'

# Get current position
curl -sf -X GET "http://localhost:5173/api/position?bookId=<book-id>" \
  -H "Authorization: Bearer <your-token>" | jq '.'
```

**Expected Result:** Reading position is saved and retrieved correctly

## Success Criteria

✅ **All tests pass if:**
1. Health check returns "healthy"
2. EPUB upload completes successfully
3. Book appears in library
4. AI chat responds to queries
5. Notes can be created (manual and auto)
6. Notes can be listed and searched
7. Reading position is tracked
8. No critical errors in browser console or server logs

## Quick Web UI Test

For a quicker test using the web interface:

1. **Open Browser**: Navigate to http://localhost:5173
2. **Sign In**: Create account or sign in
3. **Upload**: Drag and drop an EPUB file
4. **Read**: Open the book from library
5. **Chat**: Select text and ask AI about it
6. **Note**: Create a note from selection
7. **Search**: Use the search bar to find your notes
8. **Verify**: Check that all features work without errors

## Troubleshooting

### If Tests Fail

1. **Check server logs**: Look for errors in the terminal running `npm run dev`
2. **Verify token**: Ensure your JWT token is valid and not expired
3. **Check browser console**: Open Developer Tools for client-side errors
4. **Database issues**: Run `supabase db reset` to refresh the database
5. **Port conflicts**: Ensure port 5173 is not used by another application

### Common Error Codes

- `401 Unauthorized`: Invalid or missing JWT token
- `403 Forbidden`: Token valid but lacks permissions
- `404 Not Found`: Resource doesn't exist (wrong book ID, etc.)
- `429 Too Many Requests`: Rate limit exceeded (wait and retry)
- `500 Internal Server Error`: Check server logs for details

## Summary

If all 8 steps complete successfully, FlowReader's core functionality is working correctly for personal use. The application is ready for:

- 📚 Uploading and managing your EPUB library
- 📖 Reading with progress tracking
- 💬 AI-powered discussions about your books
- 📝 Creating and organizing notes
- 🔍 Searching through your reading insights

---

*Note: This smoke check covers core functionality only. Enterprise features, monitoring, and compliance systems are not tested in personal use mode.*