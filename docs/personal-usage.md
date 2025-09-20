# FlowReader - Personal Usage Guide

## 🏠 Status: Personal Use Ready

This guide provides the minimal steps needed to run FlowReader locally for personal use. Enterprise features, monitoring, and compliance systems are present but not required for personal usage.

## Prerequisites

### Required Software
- **Node.js 18+** and npm (check with `node -v` and `npm -v`)
- **Git** for cloning the repository
- **A text editor** to edit configuration files

### Required Accounts & Keys
- **Supabase Account** (free tier is sufficient)
  - Create at https://supabase.com
  - You'll need: Project URL, Anon Key, and Service Role Key
- **OpenAI API Key**
  - Get from https://platform.openai.com/api-keys
  - Requires some credit balance for AI features

### Optional (Not needed for personal use)
- Vercel account (only for deployment)
- Upstash QStash (background processing works without it locally)
- AWS credentials (TTS features are disabled by default)
- Monitoring tools (Sentry, Analytics)

## Installation Steps

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url> FlowReader
cd FlowReader

# Install dependencies (this may take a few minutes)
npm ci
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env.local

# Edit .env.local with your actual values
# Use your favorite text editor (nano, vim, code, etc.)
nano .env.local
```

**Minimal Required Configuration in `.env.local`:**

```bash
# Supabase (from your Supabase project settings)
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenAI (from platform.openai.com)
OPENAI_API_KEY=sk-your-openai-api-key-here

# JWT Secret (generate a random 32+ character string)
JWT_SECRET=your-random-jwt-secret-at-least-32-chars-long

# Keep these defaults for personal use
APP_URL=http://localhost:5173
NODE_ENV=development
FEATURE_AI_ENHANCED=true
FEATURE_SMART_NOTES=true

# Optional - Leave these commented out for personal use
# QSTASH_URL=
# QSTASH_TOKEN=
# SENTRY_DSN=
# ANALYTICS_ID=
```

### 3. Set Up Database

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Initialize Supabase locally
supabase init

# Start local Supabase (for development)
supabase start

# Apply database migrations
supabase db reset

# Note: For production Supabase, run migrations through Supabase Dashboard
```

### 4. Start the Application

```bash
# Start the development server
npm run dev

# The app will be available at http://localhost:5173
```

## Getting Your JWT Token

For API testing, you'll need a JWT token. Options:

### Option 1: Use Supabase Auth (Recommended)
1. Sign up through the web interface at http://localhost:5173
2. Open browser Developer Tools → Application → Local Storage
3. Find the `supabase.auth.token` entry
4. Copy the `access_token` value

### Option 2: Generate a Test Token
```bash
# Use the Supabase Dashboard to create a user
# Then get the JWT from the Authentication section
```

## Verify Installation

### 1. Check Health Endpoint
```bash
# Should return {"status":"ok",...}
curl -sf http://localhost:5173/api/health | jq '.status'
```

### 2. Test File Upload (requires JWT)
```bash
# Replace <your-token> with your actual JWT
curl -sf -X POST http://localhost:5173/api/upload/signed-url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"fileName":"test.epub","fileSize":102400}' | jq '.'
```

## Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Change the port in package.json or use:
PORT=5174 npm run dev
```

**Database Connection Failed**
- Verify your Supabase credentials in `.env.local`
- Ensure Supabase is running (`supabase status`)
- Check if migrations ran successfully

**OpenAI API Errors**
- Verify your API key is correct and has credits
- Check if the key has the necessary permissions

**JWT/Authentication Errors**
- Ensure JWT_SECRET is set and at least 32 characters
- Verify the token format includes "Bearer " prefix

### Getting Help

1. Check the [Personal Smoke Check](./personal-smoke-check.md) for testing the core features
2. Review error messages in the browser console
3. Check server logs in the terminal where you ran `npm run dev`

## What Works in Personal Mode

✅ **Core Features**
- EPUB upload and processing
- Reading interface with progress tracking
- AI-powered conversations about books
- Manual and automatic note-taking
- Note search and organization
- Library management

✅ **What's Included but Not Required**
- Enterprise security features (active but transparent)
- Performance optimizations (automatically applied)
- Caching systems (improve speed automatically)

❌ **What's Disabled by Default**
- Text-to-Speech (TTS) features
- External monitoring and analytics
- Background task processing (works locally without external queue)
- Multi-user/team features

## Next Steps

1. Follow the [Personal Smoke Check](./personal-smoke-check.md) to test core functionality
2. Upload your first EPUB file
3. Start reading and having AI conversations
4. Try the note-taking features

---

*Note: This is a personal use setup. For production deployment or enterprise features, refer to the full documentation.*