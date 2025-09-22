const express = require('express');
const app = express();

app.use(express.json());

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Mock /api/upload/process endpoint
app.post('/api/upload/process', async (req, res) => {
  const { filePath, fileName } = req.body;

  // Check authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Simulate processing
  const bookId = 'book_' + Date.now();
  const chaptersCount = Math.floor(Math.random() * 10) + 5;

  console.log(`Processing EPUB: ${fileName} at ${filePath}`);
  console.log(`Generated book ID: ${bookId} with ${chaptersCount} chapters`);

  // Return success response
  res.status(200).json({
    success: true,
    book: {
      id: bookId,
      title: fileName.replace('.epub', ''),
      author: 'Test Author',
      chaptersCount: chaptersCount,
      processingTime: 1234
    },
    chaptersCount: chaptersCount,
    stats: {
      fileSize: 1048576,
      processingTime: 1234,
      memoryUsed: 50000000,
      wordCount: 25000
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'test-api' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test API server running on http://localhost:${PORT}`);
  console.log(`Ready to receive requests at /api/upload/process`);
});