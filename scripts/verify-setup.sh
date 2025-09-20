#!/bin/bash

# Note: Not using set -e to allow the script to continue through checks

echo "🔍 FlowReader Go/No-Go Verification"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0
INFO=0

# Logging function
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
    ((INFO++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED++))
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED++))
}

# Enhanced command check with version validation and fallback support
check_command() {
    local cmd=$1
    local min_version=$2
    local version_flag=${3:-"--version"}
    local is_optional=${4:-false}

    # Check direct command availability
    if command -v $cmd &> /dev/null; then
        if [ -n "$min_version" ]; then
            local current_version
            case $cmd in
                "node")
                    current_version=$(node --version | sed 's/v//')
                    ;;
                "npm")
                    current_version=$(npm --version)
                    ;;
                "git")
                    current_version=$(git --version | awk '{print $3}')
                    ;;
                "supabase")
                    current_version=$(supabase --version 2>/dev/null | awk '{print $2}' || echo "unknown")
                    ;;
                "vercel")
                    current_version=$(vercel --version 2>/dev/null || echo "unknown")
                    ;;
                *)
                    current_version=$($cmd $version_flag 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "unknown")
                    ;;
            esac

            if [ "$current_version" != "unknown" ]; then
                if version_compare "$current_version" "$min_version"; then
                    log_success "$cmd is installed (v$current_version) ✓ meets minimum v$min_version"
                else
                    log_warning "$cmd is installed (v$current_version) but below minimum v$min_version"
                fi
            else
                log_warning "$cmd is installed but version could not be determined"
            fi
        else
            log_success "$cmd is installed"
        fi
        return 0
    fi

    # Check npx availability for optional CLI tools
    if [ "$is_optional" = "true" ] && command -v npx &> /dev/null; then
        if npx $cmd --version &> /dev/null; then
            log_success "$cmd is available via npx (sufficient for development)"
            return 0
        fi
    fi

    # Tool not found
    if [ "$is_optional" = "true" ]; then
        log_info "$cmd is not installed locally (can use npx $cmd - sufficient for development)"
        case $cmd in
            "supabase")
                echo "  Development: npx supabase --version"
                echo "  Global install: npm install -g supabase@latest"
                echo "  Or run: ./scripts/install-deps.sh"
                ;;
            "vercel")
                echo "  Development: npx vercel --version"
                echo "  Global install: npm install -g vercel@latest"
                echo "  Or run: ./scripts/install-deps.sh"
                ;;
        esac
    else
        log_error "$cmd is not installed"
        case $cmd in
            "node")
                echo "  Install from: https://nodejs.org/"
                ;;
            "npm")
                echo "  Usually comes with Node.js"
                ;;
            "git")
                echo "  Install from: https://git-scm.com/"
                ;;
        esac
    fi
}

# Version comparison function (returns 0 if current >= minimum)
version_compare() {
    local current=$1
    local minimum=$2

    # Convert versions to comparable numbers
    local current_major=$(echo $current | cut -d. -f1)
    local current_minor=$(echo $current | cut -d. -f2)
    local current_patch=$(echo $current | cut -d. -f3 | grep -oE '[0-9]+' || echo "0")

    local min_major=$(echo $minimum | cut -d. -f1)
    local min_minor=$(echo $minimum | cut -d. -f2)
    local min_patch=$(echo $minimum | cut -d. -f3 | grep -oE '[0-9]+' || echo "0")

    # Compare major.minor.patch
    if [ $current_major -gt $min_major ]; then
        return 0
    elif [ $current_major -eq $min_major ]; then
        if [ $current_minor -gt $min_minor ]; then
            return 0
        elif [ $current_minor -eq $min_minor ]; then
            if [ $current_patch -ge $min_patch ]; then
                return 0
            fi
        fi
    fi
    return 1
}

check_file() {
    local file=$1
    local description=${2:-"$file"}

    if [ -f "$file" ]; then
        log_success "$description exists"
    else
        log_error "$description is missing"
        echo "  Expected location: $file"
    fi
}

check_directory() {
    local dir=$1
    local description=${2:-"$dir directory"}

    if [ -d "$dir" ]; then
        log_success "$description exists"
    else
        log_error "$description is missing"
        echo "  Expected location: $dir"
    fi
}

# Check if npm packages are installed
check_npm_package() {
    local package=$1
    local workspace=${2:-"."}

    if [ -f "$workspace/package.json" ]; then
        if npm list $package --depth=0 --prefix="$workspace" &> /dev/null; then
            local version=$(npm list $package --depth=0 --prefix="$workspace" 2>/dev/null | grep $package | awk '{print $2}' | tr -d '@')
            log_success "$package is installed ($version)"
        else
            log_error "$package is not installed in $workspace"
        fi
    else
        log_error "package.json not found in $workspace"
    fi
}

# Check environment file and variables with improved tolerance
check_env_setup() {
    local env_file=$1

    if [ -f "$env_file" ]; then
        log_success "Environment file $env_file exists"

        # Check for required variables (allowing placeholder values for development)
        local required_vars=("PUBLIC_SUPABASE_URL" "PUBLIC_SUPABASE_ANON_KEY" "SUPABASE_SERVICE_ROLE_KEY" "OPENAI_API_KEY")
        local missing_vars=0
        local placeholder_vars=0

        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" "$env_file"; then
                local value=$(grep "^$var=" "$env_file" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | tr -d ' ')

                if [ -z "$value" ]; then
                    log_warning "  $var is empty"
                    ((missing_vars++))
                elif [[ "$value" =~ ^(your-|sk-your-|https://your-) ]]; then
                    log_info "  $var has placeholder value (OK for development, configure for production)"
                    ((placeholder_vars++))
                else
                    log_success "  $var is configured"
                fi
            else
                log_warning "  $var is missing from file"
                ((missing_vars++))
            fi
        done

        # Provide guidance based on findings
        if [ $missing_vars -gt 0 ]; then
            log_warning "  $missing_vars environment variables are missing or empty"
            echo "    Fix: Add missing variables to $env_file"
        fi

        if [ $placeholder_vars -gt 0 ]; then
            log_info "  Development environment ready with $placeholder_vars placeholder values"
            echo "    For production: Replace placeholder values with actual credentials"
            echo "    For development: Current setup is sufficient"
        fi

        # Overall assessment
        if [ $missing_vars -eq 0 ] && [ $placeholder_vars -le 4 ]; then
            log_info "  Environment setup is adequate for development"
        fi
    else
        log_error "Environment file $env_file is missing"
        echo "  Fix: Copy .env.example to .env.local and configure variables"
        echo "  Command: cp .env.example .env.local"
    fi
}

echo ""
echo "🔧 Prerequisites Check:"
log_info "Checking required tools and versions..."

# Check Node.js (minimum version from package.json)
check_command "node" "18.0.0"

# Check npm (minimum version from package.json)
check_command "npm" "9.0.0"

# Check git
check_command "git" "2.0.0"

# Check optional but recommended tools
echo ""
log_info "Checking deployment tools (optional but recommended)..."
check_command "supabase" "" "--version" true
check_command "vercel" "" "--version" true

echo ""
echo "📁 Project Structure Check:"
log_info "Verifying project files and directories..."

# Core files
check_file "package.json" "Root package.json"
check_file ".env.example" "Environment template"
check_file "vercel.json" "Vercel configuration"
check_file "README.md" "README documentation"

# Directories
check_directory "apps/web" "Web application"
check_directory "api" "API functions"
check_directory "packages/shared" "Shared packages"
check_directory "supabase" "Supabase configuration"

echo ""
echo "🌐 API Endpoints Check:"
log_info "Verifying API endpoint files..."

# API endpoints
check_file "api/health.ts" "Health endpoint"
check_file "api/upload/signed-url.ts" "Upload signed URL endpoint"
check_file "api/upload/process.ts" "Upload process endpoint"
check_file "api/tasks/status.ts" "Task status endpoint"
check_file "api/position/update.ts" "Position update endpoint"
check_file "api/chat/stream.ts" "Chat stream endpoint"

echo ""
echo "💾 Database Check:"
log_info "Verifying database configuration..."

check_file "supabase/migrations/001_initial_schema.sql" "Initial database schema"
check_file "supabase/config.toml" "Supabase configuration"

echo ""
echo "🧪 Test Setup Check:"
log_info "Verifying test configuration..."

check_file "apps/web/playwright.config.ts" "Playwright configuration"
check_directory "apps/web/tests" "E2E tests directory"

# Check if test file exists (may be in different location)
if [ -f "tests/api.test.js" ] || [ -f "apps/web/tests/api.test.js" ]; then
    log_success "API test file exists"
else
    log_warning "API test file not found (tests/api.test.js or apps/web/tests/api.test.js)"
fi

echo ""
echo "🔧 Dependencies Check:"
log_info "Verifying core dependencies..."

# Check if node_modules exists
if [ -d "node_modules" ]; then
    log_success "Dependencies installed in root"
else
    log_warning "Dependencies not installed in root (run npm install)"
fi

# Check workspace dependencies
if [ -d "apps/web/node_modules" ] || [ -d "node_modules" ]; then
    log_success "Web app dependencies available"
else
    log_warning "Web app dependencies not installed"
fi

echo ""
echo "🌍 Environment Check:"
log_info "Checking environment configuration..."

# Check for .env.local file
check_env_setup ".env.local"

# If .env.local doesn't exist, check .env
if [ ! -f ".env.local" ]; then
    check_env_setup ".env"
fi

echo ""
echo "📊 Results Summary:"
echo "=================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Info: ${BLUE}$INFO${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

# Enhanced go/no-go determination with better guidance
if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -le 2 ]; then
        echo -e "\n🎉 ${GREEN}GO${NC} - All critical checks passed!"
        if [ $WARNINGS -gt 0 ]; then
            echo -e "  ${YELLOW}$WARNINGS warnings can be addressed during development${NC}"
        fi
        if [ $INFO -gt 0 ]; then
            echo -e "  ${BLUE}$INFO informational notes (no action required for development)${NC}"
        fi
    else
        echo -e "\n🟡 ${YELLOW}CONDITIONAL GO${NC} - All critical checks passed, but $WARNINGS warnings need attention"
    fi

    echo ""
    echo "🚀 Quick start commands:"
    echo "1. ./scripts/install-deps.sh    # Install dependencies and CLI tools"
    if [ ! -f ".env.local" ]; then
        echo "2. cp .env.example .env.local   # Set up environment variables"
    else
        echo "2. Configure .env.local         # Update placeholder values as needed"
    fi
    echo "3. npx supabase init            # Initialize Supabase project"
    echo "4. npx supabase start           # Start local database"
    echo "5. npx supabase db reset        # Apply database schema"
    echo "6. npm run build                # Build the application"
    echo "7. npm run dev                  # Start development server"

    echo ""
    echo "📋 Development workflow:"
    echo "- Database: npx supabase start/stop"
    echo "- Testing: npm run test"
    echo "- Type check: npm run type-check"
    echo "- Build: npm run build"

    echo ""
    echo "🚀 Deployment readiness:"
    echo "- Build test: npm run build"
    echo "- API test: ./scripts/test-api-endpoints.sh"
    echo "- Deploy guide: docs/ops/deploy_runbook.md"

    exit 0
else
    echo -e "\n🛑 ${RED}NO-GO${NC} - $FAILED critical checks failed!"
    echo "Critical issues must be resolved before proceeding."

    echo ""
    echo "🔧 Immediate fixes needed:"
    if ! command -v node &> /dev/null; then
        echo "- Install Node.js: https://nodejs.org/ (v18.0.0 or higher)"
    fi
    if ! command -v npm &> /dev/null; then
        echo "- Install npm: Usually comes with Node.js"
    fi
    if ! command -v git &> /dev/null; then
        echo "- Install Git: https://git-scm.com/"
    fi
    if [ ! -f "package.json" ]; then
        echo "- Ensure you're in the correct project directory"
    fi

    echo ""
    echo "💡 Quick resolution:"
    echo "1. Install missing tools (Node.js, npm, git)"
    echo "2. Navigate to project root directory"
    echo "3. Run: ./scripts/install-deps.sh"
    echo "4. Run: ./scripts/verify-setup.sh"

    exit 1
fi