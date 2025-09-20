#!/bin/bash

# Deployment Status and Rollback Helper Script
# Usage: ./deployment-status.sh [--project PROJECT_NAME] [--list-count NUMBER]
#
# This script provides information about current and previous deployments
# to assist with rollback decisions and deployment monitoring.

set -euo pipefail

# Configuration
DEFAULT_PROJECT="flowreader"
DEFAULT_LIST_COUNT=10
PROD_URL="https://flowreader.vercel.app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Global variables
PROJECT_NAME="$DEFAULT_PROJECT"
LIST_COUNT="$DEFAULT_LIST_COUNT"

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
}

bold() {
    echo -e "${BOLD}$1${NC}"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deployment status and rollback helper for FlowReader.

OPTIONS:
    -p, --project NAME      Project name [default: flowreader]
    -n, --count NUMBER      Number of deployments to list [default: 10]
    --current              Show only current deployment info
    --rollback-candidates  Show deployments suitable for rollback
    --health-check         Check current production health
    -h, --help             Show this help message

EXAMPLES:
    $0                                 # Show deployment status
    $0 --current                      # Show current deployment only
    $0 --rollback-candidates          # Show rollback options
    $0 --health-check                 # Check production health
    $0 -n 20                          # List last 20 deployments

EOF
}

# Function to parse command line arguments
parse_args() {
    local show_current_only=false
    local show_rollback_candidates=false
    local run_health_check=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -p|--project)
                PROJECT_NAME="$2"
                shift 2
                ;;
            -n|--count)
                LIST_COUNT="$2"
                shift 2
                ;;
            --current)
                show_current_only=true
                shift
                ;;
            --rollback-candidates)
                show_rollback_candidates=true
                shift
                ;;
            --health-check)
                run_health_check=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    # Execute specific actions if requested
    if [[ "$show_current_only" == true ]]; then
        show_current_deployment
        exit 0
    elif [[ "$show_rollback_candidates" == true ]]; then
        show_rollback_candidates
        exit 0
    elif [[ "$run_health_check" == true ]]; then
        run_production_health_check
        exit 0
    fi
}

# Function to check prerequisites
check_prerequisites() {
    if ! command -v vercel &> /dev/null; then
        error "Vercel CLI not found. Please install with: npm install -g vercel@latest"
        exit 1
    fi

    if [[ -z "${VERCEL_TOKEN:-}" ]]; then
        warning "VERCEL_TOKEN not set. Some operations may require login."
        if ! vercel whoami &> /dev/null; then
            error "Not logged in to Vercel. Please run: vercel login"
            exit 1
        fi
    fi
}

# Function to get deployment list
get_deployments() {
    local count="${1:-$LIST_COUNT}"

    log "Fetching deployments for project: $PROJECT_NAME"

    local deployments
    if [[ -n "${VERCEL_TOKEN:-}" ]]; then
        deployments=$(vercel ls "$PROJECT_NAME" --token="$VERCEL_TOKEN" 2>/dev/null || echo "")
    else
        deployments=$(vercel ls "$PROJECT_NAME" 2>/dev/null || echo "")
    fi

    if [[ -z "$deployments" ]]; then
        error "No deployments found or unable to fetch deployment list"
        return 1
    fi

    echo "$deployments" | head -n "$((count + 1))"  # +1 for header
}

# Function to get current production deployment
get_current_production() {
    local deployments
    deployments=$(get_deployments 1)

    if [[ -z "$deployments" ]]; then
        return 1
    fi

    echo "$deployments" | tail -n 1 | awk '{print $2}'
}

# Function to get deployment details
get_deployment_details() {
    local deployment_url="$1"

    if [[ -n "${VERCEL_TOKEN:-}" ]]; then
        vercel inspect "$deployment_url" --token="$VERCEL_TOKEN" 2>/dev/null || echo "Unable to fetch details"
    else
        vercel inspect "$deployment_url" 2>/dev/null || echo "Unable to fetch details"
    fi
}

# Function to check if deployment is healthy
check_deployment_health() {
    local url="$1"
    local health_endpoint="/api/health"

    local response_code
    response_code=$(curl -s -w "%{http_code}" -o /dev/null --max-time 10 "$url$health_endpoint" 2>/dev/null || echo "000")

    if [[ "$response_code" == "200" ]]; then
        return 0
    else
        return 1
    fi
}

# Function to show current deployment info
show_current_deployment() {
    bold "🚀 CURRENT PRODUCTION DEPLOYMENT"
    echo "================================="

    local current_deployment
    current_deployment=$(get_current_production)

    if [[ -z "$current_deployment" ]]; then
        error "Unable to determine current production deployment"
        return 1
    fi

    echo "Production URL: $PROD_URL"
    echo "Deployment URL: $current_deployment"
    echo ""

    # Health check
    if check_deployment_health "$PROD_URL"; then
        success "Health Status: HEALTHY"
    else
        error "Health Status: UNHEALTHY"
    fi

    # Response time check
    local response_time
    response_time=$(curl -w "%{time_total}" -s -o /dev/null --max-time 10 "$PROD_URL/api/health" 2>/dev/null || echo "999")
    echo "Response Time: ${response_time}s"

    # Get deployment details
    echo ""
    echo "Deployment Details:"
    echo "==================="
    get_deployment_details "$current_deployment" | head -20
}

# Function to show rollback candidates
show_rollback_candidates() {
    bold "🔄 ROLLBACK CANDIDATES"
    echo "======================"

    local deployments
    deployments=$(get_deployments 5)

    if [[ -z "$deployments" ]]; then
        error "Unable to fetch deployment list"
        return 1
    fi

    local current_line=1
    while IFS= read -r line; do
        if [[ $current_line -eq 1 ]]; then
            # Skip header
            ((current_line++))
            continue
        fi

        local deployment_url
        deployment_url=$(echo "$line" | awk '{print $2}')

        local age
        age=$(echo "$line" | awk '{print $3}')

        local status_icon
        if check_deployment_health "$deployment_url"; then
            status_icon="✅"
        else
            status_icon="❌"
        fi

        if [[ $current_line -eq 2 ]]; then
            echo "CURRENT → $status_icon $deployment_url ($age)"
        else
            echo "OPTION  → $status_icon $deployment_url ($age)"
        fi

        ((current_line++))
    done <<< "$deployments"

    echo ""
    echo "Legend:"
    echo "  ✅ = Deployment responds to health checks"
    echo "  ❌ = Deployment does not respond to health checks"
    echo ""
    echo "To rollback to a specific deployment:"
    echo "  vercel promote <DEPLOYMENT_URL> --token=\$VERCEL_TOKEN"
    echo ""
    echo "Or use the emergency rollback script:"
    echo "  ./scripts/emergency-rollback.sh --deployment-url <DEPLOYMENT_URL>"
}

# Function to run production health check
run_production_health_check() {
    bold "🔍 PRODUCTION HEALTH CHECK"
    echo "=========================="

    if [[ -f "./scripts/health-check.sh" ]]; then
        ./scripts/health-check.sh --environment production
    else
        warning "Health check script not found. Running basic checks..."

        echo "Testing: $PROD_URL"

        # Basic health check
        if check_deployment_health "$PROD_URL"; then
            success "Health endpoint: HEALTHY"
        else
            error "Health endpoint: UNHEALTHY"
        fi

        # Response time
        local response_time
        response_time=$(curl -w "%{time_total}" -s -o /dev/null --max-time 10 "$PROD_URL/api/health" 2>/dev/null || echo "999")

        if (( $(echo "$response_time <= 3.0" | bc -l 2>/dev/null || echo "0") )); then
            success "Response time: ${response_time}s"
        else
            warning "Response time slow: ${response_time}s"
        fi

        # Protected endpoint
        local protected_status
        protected_status=$(curl -s -w "%{http_code}" -o /dev/null "$PROD_URL/api/books" 2>/dev/null || echo "000")

        if [[ "$protected_status" == "401" ]]; then
            success "Security: Protected endpoints secured"
        else
            warning "Security: Unexpected response $protected_status"
        fi
    fi
}

# Function to show deployment timeline
show_deployment_timeline() {
    bold "📅 DEPLOYMENT TIMELINE"
    echo "======================"

    local deployments
    deployments=$(get_deployments "$LIST_COUNT")

    if [[ -z "$deployments" ]]; then
        error "Unable to fetch deployment timeline"
        return 1
    fi

    echo "Recent deployments (newest first):"
    echo ""

    local line_number=0
    while IFS= read -r line; do
        if [[ $line_number -eq 0 ]]; then
            # Header line
            echo "$line"
            echo "$(echo "$line" | sed 's/./=/g')"
        else
            local deployment_url
            deployment_url=$(echo "$line" | awk '{print $2}')

            local status_icon
            if check_deployment_health "$deployment_url"; then
                status_icon="✅"
            else
                status_icon="❌"
            fi

            if [[ $line_number -eq 1 ]]; then
                echo "$status_icon $line ← CURRENT"
            else
                echo "$status_icon $line"
            fi
        fi

        ((line_number++))
    done <<< "$deployments"

    echo ""
    echo "Note: ✅ = Healthy, ❌ = Unhealthy/Unreachable"
}

# Function to show quick commands reference
show_quick_commands() {
    bold "⚡ QUICK COMMANDS REFERENCE"
    echo "=========================="
    echo ""
    echo "Emergency Rollback:"
    echo "  ./scripts/emergency-rollback.sh"
    echo ""
    echo "Check Production Health:"
    echo "  ./scripts/health-check.sh --environment production"
    echo ""
    echo "List Recent Deployments:"
    echo "  vercel ls $PROJECT_NAME"
    echo ""
    echo "Promote Specific Deployment:"
    echo "  vercel promote <DEPLOYMENT_URL>"
    echo ""
    echo "View Deployment Logs:"
    echo "  vercel logs <DEPLOYMENT_URL>"
    echo ""
    echo "Current Script Options:"
    echo "  $0 --current                 # Current deployment info"
    echo "  $0 --rollback-candidates     # Show rollback options"
    echo "  $0 --health-check           # Run health checks"
}

# Main function
main() {
    parse_args "$@"

    echo "================================================="
    echo "📊 FLOWREADER DEPLOYMENT STATUS"
    echo "================================================="
    echo "Project: $PROJECT_NAME"
    echo "Production URL: $PROD_URL"
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "================================================="
    echo ""

    # Check prerequisites
    check_prerequisites

    # Show current deployment
    show_current_deployment
    echo ""
    echo ""

    # Show deployment timeline
    show_deployment_timeline
    echo ""
    echo ""

    # Show quick commands
    show_quick_commands
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi