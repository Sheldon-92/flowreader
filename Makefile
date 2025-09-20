# FlowReader Makefile
# Provides convenient shortcuts for common development and deployment tasks

.PHONY: help dev build test verify clean install

# Default target
help: ## Show this help message
	@echo "FlowReader Development Commands"
	@echo "=============================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Verification Examples:"
	@echo "  make verify-local              # Verify local development server"
	@echo "  make verify-staging            # Verify staging deployment"
	@echo "  make verify-production         # Verify production deployment"
	@echo "  make verify URL=https://app.com # Verify custom URL"

# Development
install: ## Install dependencies
	npm ci

dev: ## Start development server
	npm run dev

build: ## Build the application
	npm run build

# Testing
test: ## Run all tests
	npm run test

test-e2e: ## Run end-to-end tests
	npm run test:e2e

lint: ## Run linting
	npm run lint

type-check: ## Run TypeScript type checking
	npm run type-check

# Verification commands
verify: ## Verify deployment (requires URL argument)
ifndef URL
	@echo "Error: URL argument required"
	@echo "Usage: make verify URL=https://your-app.vercel.app"
	@exit 1
endif
	./scripts/verify.sh $(URL)

verify-local: ## Verify local development server
	./scripts/verify.sh --env local http://localhost:3000

verify-staging: ## Verify staging deployment (set STAGING_URL env var)
	@if [ -z "$(STAGING_URL)" ]; then \
		echo "Error: STAGING_URL environment variable not set"; \
		echo "Usage: STAGING_URL=https://staging.app.com make verify-staging"; \
		exit 1; \
	fi
	./scripts/verify.sh --env staging $(STAGING_URL)

verify-production: ## Verify production deployment (set PRODUCTION_URL env var)
	@if [ -z "$(PRODUCTION_URL)" ]; then \
		echo "Error: PRODUCTION_URL environment variable not set"; \
		echo "Usage: PRODUCTION_URL=https://flowreader.app make verify-production"; \
		exit 1; \
	fi
	./scripts/verify.sh --env production $(PRODUCTION_URL)

verify-json: ## Verify with JSON output (requires URL argument)
ifndef URL
	@echo "Error: URL argument required"
	@echo "Usage: make verify-json URL=https://your-app.vercel.app"
	@exit 1
endif
	./scripts/verify.sh --json $(URL)

# Quick verification commands for CI/CD
ci-verify-local: ## CI: Verify local (no URL required)
	npm run verify:post-deploy http://localhost:3000

ci-verify-staging: ## CI: Verify staging using VERCEL_URL or DEPLOY_URL
	npm run verify:staging

ci-verify-production: ## CI: Verify production using VERCEL_URL or DEPLOY_URL
	npm run verify:production

# Utility commands
clean: ## Clean build artifacts and dependencies
	rm -rf node_modules
	rm -rf apps/web/dist
	rm -rf apps/web/.svelte-kit
	rm -rf .vercel

clean-verify: ## Clean verification artifacts
	rm -f verification-report.json
	rm -f .env.verify

setup-verify: ## Set up verification configuration
	@if [ ! -f .env.verify ]; then \
		echo "Creating .env.verify from example..."; \
		cp scripts/verify-config.example.env .env.verify; \
		echo "✅ Created .env.verify - please customize it for your environment"; \
	else \
		echo "⚠️  .env.verify already exists"; \
	fi

# Show verification help
verify-help: ## Show detailed verification help
	./scripts/verify.sh --help

# Development shortcuts
start: dev ## Alias for dev

build-packages: ## Build packages only
	npm run build:packages

build-web: ## Build web app only
	npm run build:web

# Database and types
types-generate: ## Generate TypeScript types from Supabase
	npm run types:generate

# All-in-one commands
full-test: install lint type-check test ## Run complete test suite

quick-check: lint type-check ## Quick code quality check

# Deployment preparation
pre-deploy: clean install build full-test ## Complete pre-deployment check