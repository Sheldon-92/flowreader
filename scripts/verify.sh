#!/bin/bash

# FlowReader Post-Deployment Verification Script
# Usage: ./scripts/verify.sh [URL] [OPTIONS]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_URL="http://localhost:3000"
CONFIG_FILE=".env.verify"

# Helper functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

show_help() {
    cat << EOF
FlowReader Post-Deployment Verification Script

USAGE:
    ./scripts/verify.sh [URL] [OPTIONS]

ARGUMENTS:
    URL                 Base URL to verify (default: $DEFAULT_URL)

OPTIONS:
    -h, --help         Show this help message
    -c, --config FILE  Use custom config file (default: $CONFIG_FILE)
    -t, --timeout MS   Request timeout in milliseconds
    -j, --json         Output JSON report
    -v, --verbose      Enable verbose output
    -e, --env ENV      Environment preset (local|staging|production)

EXAMPLES:
    # Verify local development
    ./scripts/verify.sh

    # Verify staging
    ./scripts/verify.sh https://staging.flowreader.app

    # Verify production with JSON output
    ./scripts/verify.sh https://flowreader.app --json

    # Use environment preset
    ./scripts/verify.sh --env production https://flowreader.app

    # Custom timeout
    ./scripts/verify.sh https://flowreader.app --timeout 20000

ENVIRONMENT PRESETS:
    local       - Fast timeouts, minimal checks
    staging     - Moderate timeouts, full checks
    production  - Generous timeouts, comprehensive checks

CONFIG FILE:
    Create $CONFIG_FILE to set default configuration:

    BASE_URL=https://your-app.vercel.app
    VERIFY_TIMEOUT=10000
    TEST_USER_EMAIL=test@example.com
    TEST_USER_PASSWORD=test-password
    OUTPUT_JSON=false

EOF
}

# Parse command line arguments
URL=""
CONFIG_FILE=".env.verify"
TIMEOUT=""
OUTPUT_JSON=""
VERBOSE=""
ENVIRONMENT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -j|--json)
            OUTPUT_JSON="true"
            shift
            ;;
        -v|--verbose)
            VERBOSE="true"
            shift
            ;;
        -e|--env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -*|--*)
            error "Unknown option $1"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            if [[ -z "$URL" ]]; then
                URL="$1"
            else
                error "Multiple URLs specified: $URL and $1"
                exit 1
            fi
            shift
            ;;
    esac
done

# Set default URL if not provided
if [[ -z "$URL" ]]; then
    URL="$DEFAULT_URL"
fi

# Load config file if it exists
if [[ -f "$CONFIG_FILE" ]]; then
    log "Loading configuration from $CONFIG_FILE"
    set -a  # Export all variables
    source "$CONFIG_FILE"
    set +a
else
    if [[ "$CONFIG_FILE" != ".env.verify" ]]; then
        error "Config file $CONFIG_FILE not found"
        exit 1
    fi
    warn "No config file found at $CONFIG_FILE (this is optional)"
fi

# Apply environment presets
case "$ENVIRONMENT" in
    local)
        export VERIFY_TIMEOUT=5000
        export HEALTH_CHECK_MAX_MS=1000
        export API_MAX_MS=3000
        export STREAMING_MAX_MS=5000
        log "Applied 'local' environment preset"
        ;;
    staging)
        export VERIFY_TIMEOUT=10000
        export HEALTH_CHECK_MAX_MS=2000
        export API_MAX_MS=5000
        export STREAMING_MAX_MS=10000
        log "Applied 'staging' environment preset"
        ;;
    production)
        export VERIFY_TIMEOUT=15000
        export HEALTH_CHECK_MAX_MS=3000
        export API_MAX_MS=8000
        export STREAMING_MAX_MS=15000
        log "Applied 'production' environment preset"
        ;;
    "")
        # No preset specified
        ;;
    *)
        error "Unknown environment preset: $ENVIRONMENT"
        error "Valid presets: local, staging, production"
        exit 1
        ;;
esac

# Override with command line options
if [[ -n "$TIMEOUT" ]]; then
    export VERIFY_TIMEOUT="$TIMEOUT"
fi

if [[ -n "$OUTPUT_JSON" ]]; then
    export OUTPUT_JSON="$OUTPUT_JSON"
fi

if [[ -n "$VERBOSE" ]]; then
    export DEBUG="*"
fi

# Validate URL format
if [[ ! "$URL" =~ ^https?:// ]]; then
    error "URL must start with http:// or https://"
    error "Got: $URL"
    exit 1
fi

# Check if Node.js and npm are available
if ! command -v node &> /dev/null; then
    error "Node.js is not installed or not in PATH"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    error "npm is not installed or not in PATH"
    exit 1
fi

# Check if tsx is available
if ! npm list tsx &> /dev/null && ! npx tsx --version &> /dev/null; then
    error "tsx is not installed. Run: npm install tsx"
    exit 1
fi

# Show configuration summary
log "Starting FlowReader Post-Deployment Verification"
echo "Configuration:"
echo "  URL: $URL"
echo "  Timeout: ${VERIFY_TIMEOUT:-10000}ms"
echo "  Config: $CONFIG_FILE"
echo "  JSON Output: ${OUTPUT_JSON:-false}"
if [[ -n "$ENVIRONMENT" ]]; then
    echo "  Environment: $ENVIRONMENT"
fi
echo ""

# Run the verification
log "Executing verification suite..."

# Check if we're in the correct directory
if [[ ! -f "scripts/post-deploy-verify.ts" ]]; then
    error "post-deploy-verify.ts not found in scripts/"
    error "Make sure you're running this from the project root directory"
    exit 1
fi

# Set up exit trap to capture results
EXIT_CODE=0

# Run the verification script
if npm run verify:post-deploy "$URL"; then
    success "✅ All verification tests passed!"
else
    EXIT_CODE=$?
    error "❌ Verification failed with exit code $EXIT_CODE"
fi

# Final status
echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
    success "🏁 Post-deployment verification completed successfully"
else
    error "🏁 Post-deployment verification failed"
    echo ""
    echo "Troubleshooting tips:"
    echo "  1. Check if the application is fully deployed and accessible"
    echo "  2. Verify environment variables and configuration"
    echo "  3. Review the detailed logs above for specific failures"
    echo "  4. Try increasing timeout with --timeout option"
    echo "  5. Check the README-verification.md for more help"
fi

exit $EXIT_CODE