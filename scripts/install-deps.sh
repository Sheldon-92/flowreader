#!/bin/bash

# Note: Not using set -e to allow graceful error handling

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment detection
ENV=${NODE_ENV:-development}
CI=${CI:-false}

echo "📦 FlowReader Dependency Installation"
echo "====================================="
echo -e "${BLUE}Environment: $ENV${NC}"
echo -e "${BLUE}CI Mode: $CI${NC}"
echo ""

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verify installation
verify_package() {
    local package=$1
    local workspace=${2:-"."}

    if npm list "$package" --depth=0 --prefix="$workspace" &> /dev/null; then
        local version=$(npm list "$package" --depth=0 --prefix="$workspace" 2>/dev/null | grep "$package" | awk '{print $2}' | tr -d '@' || echo "unknown")
        log_success "$package installed successfully ($version)"
        return 0
    else
        log_error "$package installation failed"
        return 1
    fi
}

# Install with retry logic
install_with_retry() {
    local cmd="$1"
    local description="$2"
    local max_attempts=3
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "Attempt $attempt/$max_attempts: $description"

        if eval "$cmd"; then
            log_success "$description completed"
            return 0
        else
            log_warning "$description failed (attempt $attempt/$max_attempts)"
            if [ $attempt -eq $max_attempts ]; then
                log_error "$description failed after $max_attempts attempts"
                return 1
            fi
            attempt=$((attempt + 1))
            sleep 2
        fi
    done
}

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command_exists node; then
    log_error "Node.js is not installed. Please install Node.js >= 18.0.0"
    exit 1
fi

if ! command_exists npm; then
    log_error "npm is not installed. Please install npm >= 9.0.0"
    exit 1
fi

# Get versions
NODE_VERSION=$(node --version | sed 's/v//')
NPM_VERSION=$(npm --version)

log_info "Node.js version: $NODE_VERSION"
log_info "npm version: $NPM_VERSION"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    log_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Configure npm for CI environments
if [ "$CI" = "true" ]; then
    log_info "Configuring npm for CI environment..."
    npm config set audit-level moderate
    npm config set fund false
    npm config set update-notifier false
fi

echo ""
echo "📦 Installing root dependencies..."

# Clear npm cache if requested or in CI
if [ "$1" = "--clean" ] || [ "$CI" = "true" ]; then
    log_info "Clearing npm cache..."
    npm cache clean --force
fi

# Install root dependencies
if ! install_with_retry "npm install" "Installing root dependencies"; then
    log_error "Failed to install root dependencies"
    exit 1
fi

# Verify core dependencies
log_info "Verifying root dependencies..."
if [ -f "package.json" ]; then
    # Check key dependencies from package.json
    if npm list concurrently &> /dev/null; then
        log_success "concurrently installed"
    else
        log_warning "concurrently not found (required for dev scripts)"
    fi

    if npm list typescript &> /dev/null; then
        log_success "typescript installed"
    else
        log_warning "typescript not found"
    fi
fi

echo ""
echo "🌐 Installing web app dependencies..."

if [ -d "apps/web" ]; then
    cd apps/web

    # Install web app dependencies with specific versions for stability
    SUPABASE_PACKAGES="@supabase/auth-helpers-sveltekit@latest @supabase/supabase-js@latest"
    if ! install_with_retry "npm install $SUPABASE_PACKAGES" "Installing Supabase packages"; then
        log_error "Failed to install Supabase packages"
        cd ../..
        exit 1
    fi

    # Install Playwright for E2E testing
    if [ "$ENV" != "production" ]; then
        if ! install_with_retry "npm install --save-dev @playwright/test@latest" "Installing Playwright"; then
            log_warning "Failed to install Playwright (non-critical for production)"
        else
            # Install Playwright browsers in non-CI environments
            if [ "$CI" != "true" ]; then
                log_info "Installing Playwright browsers..."
                if npx playwright install chromium; then
                    log_success "Playwright browsers installed"
                else
                    log_warning "Failed to install Playwright browsers"
                fi
            fi
        fi
    fi

    # Verify web app dependencies
    log_info "Verifying web app dependencies..."
    verify_package "@supabase/supabase-js" "."
    verify_package "@supabase/auth-helpers-sveltekit" "."

    cd ../..
else
    log_warning "apps/web directory not found, skipping web app dependencies"
fi

echo ""
echo "🔗 Installing shared package dependencies..."

if [ -d "packages/shared" ]; then
    cd packages/shared

    if ! install_with_retry "npm install typescript@latest" "Installing shared package dependencies"; then
        log_error "Failed to install shared package dependencies"
        cd ../..
        exit 1
    fi

    # Verify shared dependencies
    log_info "Verifying shared package dependencies..."
    verify_package "typescript" "."

    cd ../..
else
    log_warning "packages/shared directory not found, skipping shared dependencies"
fi

echo ""
echo "🔧 Installing API dependencies..."

# Install API/deployment dependencies
API_DEPS="@vercel/node@latest"
if ! install_with_retry "npm install --save-dev $API_DEPS" "Installing API dependencies"; then
    log_error "Failed to install API dependencies"
    exit 1
fi

# Verify API dependencies
log_info "Verifying API dependencies..."
verify_package "@vercel/node" "."

# Install global tools for deployment
echo ""
echo "🌍 Installing global deployment tools..."

# Function to install CLI tools with fallback methods
install_cli_tool() {
    local tool_name=$1
    local npm_package=$2
    local description="$3"

    if command_exists "$tool_name"; then
        log_success "$description already installed"
        return 0
    fi

    log_info "Installing $description..."

    # Method 1: Try npm global install
    if npm install -g "$npm_package@latest" 2>/dev/null; then
        log_success "$description installed via npm"
        return 0
    fi

    # Method 2: Try npx for one-time install verification
    if npx "$npm_package" --version &>/dev/null; then
        log_success "$description available via npx"
        return 0
    fi

    # Method 3: Provide manual installation guidance
    log_warning "$description installation failed"
    case "$tool_name" in
        "supabase")
            echo "  Manual install options:"
            echo "  - npm install -g supabase@latest"
            echo "  - Use npx supabase for one-time commands"
            echo "  - Download from: https://github.com/supabase/cli/releases"
            ;;
        "vercel")
            echo "  Manual install options:"
            echo "  - npm install -g vercel@latest"
            echo "  - Use npx vercel for one-time commands"
            echo "  - Download from: https://vercel.com/download"
            ;;
    esac

    return 1
}

# Install Supabase CLI (required for database operations)
install_cli_tool "supabase" "supabase" "Supabase CLI"

# Install Vercel CLI (required for deployment)
install_cli_tool "vercel" "vercel" "Vercel CLI"

# Additional verification for CLI tools
echo ""
log_info "Verifying CLI tool installations..."

if command_exists supabase || command -v npx &>/dev/null; then
    if supabase --version &>/dev/null || npx supabase --version &>/dev/null; then
        log_success "Supabase CLI is functional"
    else
        log_warning "Supabase CLI installation needs attention"
    fi
fi

if command_exists vercel || command -v npx &>/dev/null; then
    if vercel --version &>/dev/null || npx vercel --version &>/dev/null; then
        log_success "Vercel CLI is functional"
    else
        log_warning "Vercel CLI installation needs attention"
    fi
fi

echo ""
echo "🔍 Post-installation verification..."

# Run type checking to ensure everything is properly installed
if npm run type-check &> /dev/null; then
    log_success "TypeScript type checking passed"
else
    log_warning "TypeScript type checking failed - check your dependencies"
fi

# Check if build works
if [ "$ENV" != "production" ]; then
    log_info "Testing build process..."
    if npm run build &> /dev/null; then
        log_success "Build test passed"
    else
        log_warning "Build test failed - check your configuration"
    fi
fi

echo ""
echo "✅ Dependency installation complete!"
echo ""

# Provide environment-specific next steps
case $ENV in
    "production")
        echo "🚀 Production setup:"
        echo "1. Ensure environment variables are configured"
        echo "2. Run deployment scripts"
        echo "3. Monitor application health"
        ;;
    "development"|*)
        echo "🛠️  Development setup:"
        echo "1. Copy .env.example to .env.local and fill in your values"
        echo "2. Set up Supabase: npx supabase init && npx supabase start"
        echo "3. Run migrations: npx supabase db reset"
        echo "4. Start development: npm run dev"
        ;;
esac

echo ""
echo "📋 Verification commands:"
echo "- Check setup: ./scripts/verify-setup.sh"
echo "- Test APIs: ./scripts/test-api-endpoints.sh"
echo "- Build project: npm run build"
echo "- Run tests: npm run test"

# Exit with success
exit 0