# FlowReader Environment Matrix

## Overview
This document defines the complete environment matrix for FlowReader across different deployment scenarios, platforms, and configurations.

## Environment Types

### Development Environment
**Purpose**: Local development and testing
**Host**: Developer workstations
**Database**: Local Supabase instance

| Component | Requirement | Version | Notes |
|-----------|-------------|---------|-------|
| **Runtime** |
| Node.js | Required | >= 18.0.0 | LTS recommended |
| npm | Required | >= 9.0.0 | Package management |
| **Database** |
| Supabase CLI | Required | >= 1.100.0 | Local development |
| PostgreSQL | Auto-installed | 15.x | Via Supabase local |
| **Development Tools** |
| Git | Required | >= 2.0.0 | Version control |
| TypeScript | Required | >= 5.3.0 | Via npm install |
| Playwright | Optional | Latest | E2E testing |
| **Optional Tools** |
| Vercel CLI | Recommended | Latest | Deployment testing |
| Docker | Optional | Latest | Alternative local setup |

### Staging Environment
**Purpose**: Pre-production testing and validation
**Host**: Vercel Preview Deployments
**Database**: Supabase Staging Project

| Component | Requirement | Configuration | Notes |
|-----------|-------------|---------------|-------|
| **Platform** |
| Vercel | Required | Pro plan | Preview deployments |
| Supabase | Required | Pro plan | Staging project |
| **Runtime** |
| Node.js | Auto-managed | 18.x LTS | Vercel runtime |
| Region | Configurable | iad1 (default) | US East |
| **External Services** |
| OpenAI | Required | Production API | Rate limited |
| Upstash QStash | Required | Pro plan | Task queue |

### Production Environment
**Purpose**: Live production system
**Host**: Vercel Production
**Database**: Supabase Production Project

| Component | Requirement | Configuration | Notes |
|-----------|-------------|---------------|-------|
| **Platform** |
| Vercel | Required | Pro/Team plan | Production hosting |
| Supabase | Required | Pro plan | Production database |
| **Runtime** |
| Node.js | Auto-managed | 18.x LTS | Vercel runtime |
| Region | Configurable | iad1/sfo1/lhr1 | Multi-region support |
| **External Services** |
| OpenAI | Required | Production API | Full rate limits |
| Upstash QStash | Required | Pro plan | Production queue |
| **Monitoring** |
| Vercel Analytics | Enabled | Built-in | Performance monitoring |
| Supabase Metrics | Enabled | Built-in | Database monitoring |
| Error Tracking | Optional | Sentry | Error aggregation |

## Environment Variables Matrix

### Required Variables (All Environments)

| Variable | Development | Staging | Production | Description |
|----------|-------------|---------|------------|-------------|
| `PUBLIC_SUPABASE_URL` | `http://localhost:54321` | Staging URL | Production URL | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Local key | Staging key | Production key | Public anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Local key | Staging key | Production key | Server-side service key |
| `OPENAI_API_KEY` | Test key | Test key | Production key | OpenAI API access |
| `QSTASH_URL` | `https://qstash.upstash.io` | Same | Same | QStash endpoint |
| `QSTASH_TOKEN` | Dev token | Staging token | Production token | QStash authentication |
| `JWT_SECRET` | Generated | Generated | Generated | JWT signing secret (32+ chars) |
| `NODE_ENV` | `development` | `staging` | `production` | Environment identifier |
| `APP_URL` | `http://localhost:5173` | Preview URL | Production URL | Application base URL |

### Feature Flags

| Variable | Development | Staging | Production | Purpose |
|----------|-------------|---------|------------|---------|
| `FEATURE_TTS_ENABLED` | `false` | `false` | `false` | Text-to-speech features |
| `FEATURE_AI_ENHANCED` | `true` | `true` | `true` | Enhanced AI features |
| `FEATURE_SMART_NOTES` | `true` | `true` | `true` | Smart note-taking |

### Security & Rate Limiting

| Variable | Development | Staging | Production | Purpose |
|----------|-------------|---------|------------|---------|
| `RATE_LIMIT_MAX` | `1000` | `100` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW` | `900000` | `900000` | `900000` | Rate limit window (15min) |
| `CORS_ORIGIN` | `*` | Specific domains | Specific domains | CORS allowed origins |

### Optional Variables

| Variable | Development | Staging | Production | Purpose |
|----------|-------------|---------|------------|---------|
| `SENTRY_DSN` | Not set | Optional | Recommended | Error tracking |
| `ANALYTICS_ID` | Not set | Optional | Recommended | Analytics tracking |
| `AWS_ACCESS_KEY_ID` | Not set | Not set | Future | TTS service (planned) |
| `AWS_SECRET_ACCESS_KEY` | Not set | Not set | Future | TTS service (planned) |
| `AWS_REGION` | Not set | Not set | Future | TTS service region |

## Platform-Specific Configurations

### Vercel Configuration

#### Development (Local)
```bash
# Uses vercel dev for local API simulation
vercel dev --listen 3001
```

#### Staging
```json
{
  "env": {
    "NODE_ENV": "staging"
  },
  "regions": ["iad1"],
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

#### Production
```json
{
  "env": {
    "NODE_ENV": "production"
  },
  "regions": ["iad1", "sfo1"],
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

### Supabase Configuration

#### Development (Local)
```toml
[api]
port = 54321
[auth]
port = 54324
[db]
port = 54322
```

#### Staging/Production
- Managed service configuration
- Connection pooling enabled
- Row Level Security (RLS) enforced
- Automated backups enabled

## Resource Requirements

### Development Environment

| Resource | Minimum | Recommended | Notes |
|----------|---------|-------------|-------|
| CPU | 2 cores | 4 cores | For build processes |
| RAM | 4 GB | 8 GB | Node.js + Supabase local |
| Disk | 10 GB | 20 GB | Dependencies + local data |
| Network | Broadband | Broadband | API calls to external services |

### Staging Environment

| Resource | Specification | Limits | Notes |
|----------|---------------|--------|-------|
| Serverless Functions | Vercel managed | 30s timeout | Auto-scaling |
| Database | Supabase managed | 2 CPU, 1 GB RAM | Staging tier |
| Storage | Supabase managed | 8 GB | File uploads |
| Bandwidth | Vercel managed | 100 GB/month | Pro plan |

### Production Environment

| Resource | Specification | Limits | Notes |
|----------|---------------|--------|-------|
| Serverless Functions | Vercel managed | 30s timeout | Auto-scaling |
| Database | Supabase managed | 4 CPU, 8 GB RAM | Production tier |
| Storage | Supabase managed | 100 GB | File uploads |
| Bandwidth | Vercel managed | 1 TB/month | Team plan |

## Security Matrix

### Development
- Local-only access
- Test credentials
- No real user data
- Relaxed CORS policies

### Staging
- Limited access (team only)
- Non-production credentials
- Synthetic test data
- Restricted CORS policies
- HTTPS required

### Production
- Public access
- Production credentials
- Real user data
- Strict CORS policies
- HTTPS required
- Security headers enforced
- Rate limiting active

## Monitoring & Observability

### Development
| Metric | Tool | Configuration |
|--------|------|---------------|
| Application Logs | Console | Local only |
| Error Tracking | None | Development errors |
| Performance | None | Manual testing |

### Staging
| Metric | Tool | Configuration |
|--------|------|---------------|
| Application Logs | Vercel | Function logs |
| Database Metrics | Supabase | Built-in dashboard |
| Error Tracking | Optional | Sentry (if configured) |
| Performance | Vercel | Analytics enabled |

### Production
| Metric | Tool | Configuration |
|--------|------|---------------|
| Application Logs | Vercel | Centralized logging |
| Database Metrics | Supabase | Full monitoring |
| Error Tracking | Sentry | Real-time alerts |
| Performance | Vercel Analytics | Core Web Vitals |
| Uptime | External | Health check monitoring |

## Deployment Matrix

### Deployment Triggers

| Environment | Trigger | Branch | Auto-Deploy |
|-------------|---------|--------|-------------|
| Development | Manual | Any | No |
| Staging | PR Creation | feature/* | Yes |
| Production | Merge to main | main | Yes |

### Deployment Process

| Stage | Development | Staging | Production |
|-------|-------------|---------|------------|
| **Build** | Local | Vercel | Vercel |
| **Test** | Local | Automated | Automated |
| **Deploy** | Manual | Automatic | Automatic |
| **Verify** | Manual | Automated | Automated |
| **Rollback** | Not needed | Manual | Automated |

## Compatibility Matrix

### Browser Support (Production)

| Browser | Version | Support Level |
|---------|---------|---------------|
| Chrome | Last 2 versions | Full |
| Firefox | Last 2 versions | Full |
| Safari | Last 2 versions | Full |
| Edge | Last 2 versions | Full |
| Mobile Safari | iOS 14+ | Full |
| Chrome Mobile | Android 8+ | Full |

### API Compatibility

| Client | Version | Support Level |
|--------|---------|---------------|
| Web App | Current | Full |
| Mobile App | Future | Planned |
| Third-party | v1 API | Limited |

## CLI Tool Installation Guide

### Automated Installation (Recommended)
```bash
# Install all dependencies and CLI tools
./scripts/install-deps.sh

# Verify installation
./scripts/verify-setup.sh
```

### Manual Installation

#### Supabase CLI
```bash
# Option 1: npm global install
npm install -g supabase@latest

# Option 2: Use npx (no global install needed)
npx supabase --version

# Option 3: Direct download (macOS/Linux)
# Visit: https://github.com/supabase/cli/releases
```

#### Vercel CLI
```bash
# Option 1: npm global install
npm install -g vercel@latest

# Option 2: Use npx (no global install needed)
npx vercel --version

# Option 3: Direct download
# Visit: https://vercel.com/download
```

### Platform-Specific Installation

#### macOS
```bash
# Using Homebrew
brew install supabase/tap/supabase
brew install vercel-cli

# Using npm (works on all platforms)
npm install -g supabase@latest vercel@latest
```

#### Windows
```bash
# Using npm (recommended)
npm install -g supabase@latest vercel@latest

# Using Chocolatey
choco install vercel-cli
```

#### Linux
```bash
# Using npm (recommended)
npm install -g supabase@latest vercel@latest

# Direct download for Supabase
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/
```

### Verification Commands
```bash
# Check CLI tool availability
supabase --version    # Should show version
vercel --version      # Should show version

# Alternative with npx (if global install failed)
npx supabase --version
npx vercel --version

# Full setup verification
./scripts/verify-setup.sh
```

### Troubleshooting CLI Installation

#### Permission Issues (macOS/Linux)
```bash
# If npm global install fails due to permissions
sudo npm install -g supabase@latest vercel@latest

# Or use npx instead (no global install needed)
npx supabase --version
npx vercel --version
```

#### Network/Registry Issues
```bash
# Clear npm cache and retry
npm cache clean --force
npm install -g supabase@latest vercel@latest

# Use different registry if needed
npm install -g supabase@latest --registry=https://registry.npmjs.org/
```

#### Version Conflicts
```bash
# Uninstall existing versions
npm uninstall -g supabase vercel

# Reinstall latest versions
npm install -g supabase@latest vercel@latest
```

## Troubleshooting Matrix

### Common Issues by Environment

#### Development
| Issue | Cause | Solution |
|-------|-------|---------|
| CLI tools not found | Missing global install | Run `./scripts/install-deps.sh` or use `npx` |
| Environment variables | Placeholder values | Copy `.env.example` to `.env.local` and configure |
| Supabase not starting | Port conflict | Change ports in config.toml |
| Build failures | Missing dependencies | Run `./scripts/install-deps.sh` |
| Type errors | Outdated types | Run `npm run types:generate` |

#### Staging
| Issue | Cause | Solution |
|-------|-------|---------|
| Preview fails | Environment variables | Check Vercel env settings |
| Database connection | Wrong URL | Verify Supabase project |
| API timeouts | Cold starts | Implement warming |

#### Production
| Issue | Cause | Solution |
|-------|-------|---------|
| 500 errors | Missing env vars | Check Vercel dashboard |
| Slow responses | Database load | Scale Supabase tier |
| CORS errors | Wrong origins | Update vercel.json |

## Migration Paths

### Environment Promotion

```
Development → Staging → Production
```

#### Data Migration
- Development: Synthetic data only
- Staging → Production: No direct migration
- Schema changes: Via Supabase migrations

#### Configuration Changes
- Environment variables: Manually configured per environment
- Feature flags: Promoted through environments
- Infrastructure: Infrastructure as Code (vercel.json)

---

**Document Version**: 1.0
**Last Updated**: 2025-09-18
**Next Review**: 2025-10-18
**Owner**: DevOps Team