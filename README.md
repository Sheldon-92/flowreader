# FlowReader - Your Intelligent Reading Companion

![Status](https://img.shields.io/badge/Status-Personal%20Use%20Ready-green)
![Development](https://img.shields.io/badge/Development-Paused%20for%20Expansion-yellow)

> **📚 Personal Use Ready** - Core features complete and stable for individual use
> **⏸️ Expansion Paused** - Enterprise and commercialization features on hold
> **📖 Quick Start**: [Personal Usage Guide](./docs/personal-usage.md) | [Self-Test Checklist](./docs/personal-smoke-check.md)

An AI-powered reading platform that transforms passive reading into active learning through intelligent conversations, contextual understanding, and smart note-taking.

## Features

- 📚 **EPUB Upload & Processing**: Drag-and-drop EPUB uploads with intelligent parsing
- 🔍 **Smart Library Management**: Search, filter, and organize your reading collection
- 📖 **Enhanced Reading Experience**: Customizable reader with progress tracking
- 🤖 **AI Reading Companion**: Deep, contextual conversations about your reading content
- 🧠 **Knowledge Enhancement**: Real-time explanations of concepts, historical context, and cultural references
- 💭 **Interactive Discussions**: Engage in thoughtful debates and analysis with AI
- 📝 **Intelligent Notes System**: Automatically capture and organize insights from your reading and AI conversations
- 📊 **Reading Analytics**: Track progress and comprehension insights
- 🎵 **Audio Features** *(Future)*: High-quality TTS with synchronization capabilities

## Tech Stack

- **Frontend**: SvelteKit + TypeScript + Tailwind CSS
- **Backend**: Vercel Serverless Functions + Supabase
- **Database**: PostgreSQL with Row Level Security
- **AI**: OpenAI GPT-4 + Embeddings for RAG
- **Queue**: Upstash QStash for background processing
- **Storage**: Supabase Storage for file assets
- **Audio** *(Future)*: Amazon Polly TTS with Speech Marks

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or pnpm
- Supabase account
- Vercel account (for deployment)

### Local Development

1. **Clone and install dependencies**
   ```bash
   git clone <repository>
   cd FlowReader
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your actual values
   ```

3. **Set up Supabase**
   ```bash
   # Install Supabase CLI
   npm install -g supabase
   
   # Initialize and start local Supabase
   supabase init
   supabase start
   
   # Run migrations
   supabase db reset
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Run tests**
   ```bash
   npm run test
   npm run test:e2e
   ```

### API Testing

Test key endpoints with curl:

```bash
# Get signed upload URL
curl -X POST http://localhost:5173/api/upload/signed-url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"fileName": "test.epub", "fileSize": 1024000}'

# Check task status
curl -X GET http://localhost:5173/api/tasks/<task-id>/status \
  -H "Authorization: Bearer <token>"

# Stream AI chat
curl -X POST http://localhost:5173/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"bookId": "<book-id>", "query": "What is this chapter about?"}'
```

## Project Structure

```
FlowReader/
├── apps/web/                 # SvelteKit frontend application
│   ├── src/
│   │   ├── routes/          # Page routes and API endpoints
│   │   ├── lib/             # Components and utilities
│   │   └── app.html         # HTML template
│   ├── static/              # Static assets
│   └── tests/               # Frontend tests
├── api/                     # Vercel serverless functions
│   ├── _lib/                # Shared utilities
│   ├── _spikes/             # Technical validation prototypes
│   └── [endpoints]/         # API route handlers
├── supabase/
│   ├── migrations/          # Database migrations
│   └── config.toml          # Supabase configuration
├── packages/shared/         # Shared TypeScript types
└── docs/                    # Documentation and user stories
```

## Go/No-Go Verification

### Quick Health Check
```bash
# Build check
npm run build

# Test suite
npm run test

# Database migrations
supabase db reset

# API endpoints
curl -f http://localhost:5173/api/health
```

### Core Functionality Tests
- [ ] EPUB upload and processing pipeline
- [ ] Reading position persistence across sessions
- [ ] AI chat with contextual responses and knowledge enhancement
- [ ] Intelligent note generation and management
- [ ] Task queue processing and status updates
- [ ] Authentication and authorization flows

## Performance Targets

- **TTFT (Time to First Token)**: < 2 seconds for AI responses
- **AI Response Relevance**: > 90% accuracy for contextual questions
- **EPUB Processing**: < 30 seconds for files up to 10MB
- **Page Load**: < 1 second for library and reader pages
- **Note Generation**: < 3 seconds for conversation summaries
- **Reading Position Sync**: < 100ms for position updates

## Security & Privacy

- Row Level Security (RLS) for all user data
- File upload validation and sanitization
- JWT-based authentication with refresh tokens
- CORS protection and rate limiting
- Secure webhook signature verification
- No logging of user reading content

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
EOF < /dev/null