#!/bin/bash

# Emergency Rollback Script for FlowReader Production
# Usage: ./emergency-rollback.sh [--confirm] [--deployment-url <url>]
#
# This script performs an emergency rollback of the production deployment
# to the previous known good deployment.

set -euo pipefail

# Configuration
PROD_URL="https://flowreader.vercel.app"
HEALTH_ENDPOINT="/api/health"
PROTECTED_ENDPOINT="/api/books"
PROJECT_NAME="flowreader"
MAX_RETRIES=10
RETRY_DELAY=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if required tools are available
check_prerequisites() {
    log "Checking prerequisites..."

    if ! command -v vercel &> /dev/null; then
        error "Vercel CLI not found. Installing..."
        npm install -g vercel@latest
    fi

    if ! command -v curl &> /dev/null; then
        error "curl not found. Please install curl."
        exit 1
    fi

    if [[ -z "${VERCEL_TOKEN:-}" ]]; then
        error "VERCEL_TOKEN environment variable not set."
        echo "Please set VERCEL_TOKEN or login with: vercel login"
        exit 1
    fi

    success "Prerequisites check passed"
}

# Function to get current production deployment
get_current_deployment() {
    log "Getting current production deployment..."

    local current_deployment
    current_deployment=$(vercel ls "$PROJECT_NAME" --token="$VERCEL_TOKEN" 2>/dev/null | grep "flowreader" | head -1 | awk '{print $2}' || echo "")

    if [[ -z "$current_deployment" ]]; then
        error "Could not determine current production deployment"
        exit 1
    fi

    echo "$current_deployment"
}

# Function to get previous deployment for rollback
get_previous_deployment() {
    log "Getting previous deployment for rollback..."

    local deployments
    deployments=$(vercel ls "$PROJECT_NAME" --token="$VERCEL_TOKEN" 2>/dev/null | grep "flowreader" | awk '{print $2}')

    if [[ -z "$deployments" ]]; then
        error "No deployments found"
        exit 1
    fi

    # Get the second deployment (first is current, second is previous)
    local previous_deployment
    previous_deployment=$(echo "$deployments" | sed -n '2p')

    if [[ -z "$previous_deployment" ]]; then
        error "No previous deployment found for rollback"
        exit 1
    fi

    echo "$previous_deployment"
}

# Function to perform health check
health_check() {
    local url="$1"
    local endpoint="$2"
    local expected_status="${3:-200}"

    log "Performing health check on $url$endpoint"

    local response_code
    response_code=$(curl -s -w "%{http_code}" -o /dev/null "$url$endpoint" || echo "000")

    if [[ "$response_code" == "$expected_status" ]]; then
        return 0
    else
        return 1
    fi
}

# Function to perform comprehensive health checks
comprehensive_health_check() {
    local base_url="$1"

    log "Running comprehensive health checks..."

    # Health endpoint check
    if ! health_check "$base_url" "$HEALTH_ENDPOINT" "200"; then
        error "Health endpoint check failed"
        return 1
    fi
    success "Health endpoint check passed"

    # Protected endpoint check (should return 401)
    if ! health_check "$base_url" "$PROTECTED_ENDPOINT" "401"; then
        warning "Protected endpoint check failed (expected 401)"
    else
        success "Protected endpoint properly secured"
    fi

    # Frontend check
    if ! health_check "$base_url" "/" "200"; then
        error "Frontend check failed"
        return 1
    fi
    success "Frontend check passed"

    # Response time check
    local response_time
    response_time=$(curl -w "%{time_total}" -s -o /dev/null "$base_url$HEALTH_ENDPOINT" || echo "999")

    if (( $(echo "$response_time > 3.0" | bc -l 2>/dev/null || echo "1") )); then
        warning "Response time is slow: ${response_time}s (expected < 3s)"
    else
        success "Response time acceptable: ${response_time}s"
    fi

    return 0
}

# Function to perform rollback
perform_rollback() {
    local target_deployment="$1"

    log "Starting rollback to deployment: $target_deployment"

    # Record rollback start time
    local rollback_start
    rollback_start=$(date '+%Y-%m-%d %H:%M:%S')

    # Perform the rollback
    log "Promoting deployment to production..."
    if ! vercel promote "$target_deployment" --token="$VERCEL_TOKEN"; then
        error "Failed to promote deployment"
        return 1
    fi

    # Wait for deployment to propagate
    log "Waiting for deployment to propagate..."
    sleep 60

    # Verify rollback with retries
    log "Verifying rollback success..."
    local retry_count=0
    while [[ $retry_count -lt $MAX_RETRIES ]]; do
        if comprehensive_health_check "$PROD_URL"; then
            local rollback_end
            rollback_end=$(date '+%Y-%m-%d %H:%M:%S')
            success "Rollback completed successfully!"
            success "Rollback started: $rollback_start"
            success "Rollback completed: $rollback_end"
            success "Production is now running: $target_deployment"
            return 0
        else
            retry_count=$((retry_count + 1))
            warning "Health check failed (attempt $retry_count/$MAX_RETRIES), retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
    done

    error "Rollback verification failed after $MAX_RETRIES attempts"
    return 1
}

# Function to create incident documentation
create_incident_record() {
    local rollback_deployment="$1"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    local incident_file="rollback-incident-$(date '+%Y%m%d-%H%M%S').md"

    cat > "$incident_file" << EOF
# Emergency Rollback Incident Report

**Incident Date**: $timestamp
**Rollback Target**: $rollback_deployment
**Production URL**: $PROD_URL

## Timeline

- **$timestamp**: Emergency rollback initiated
- **$(date '+%Y-%m-%d %H:%M:%S')**: Rollback script executed

## Actions Taken

1. Identified previous deployment: $rollback_deployment
2. Promoted previous deployment to production
3. Verified rollback success with health checks

## Next Steps

- [ ] Investigate root cause of the issue that triggered rollback
- [ ] Test fix in staging environment
- [ ] Plan redeployment with fix
- [ ] Update monitoring to prevent similar issues

## Health Check Results

\`\`\`
$(curl -s "$PROD_URL$HEALTH_ENDPOINT" || echo "Health check failed")
\`\`\`

**Incident Status**: Resolved via rollback
**Follow-up Required**: Yes - Root cause analysis needed
EOF

    log "Incident record created: $incident_file"
}

# Function to send notifications (placeholder for integration)
send_notification() {
    local status="$1"
    local message="$2"

    log "Notification: $status - $message"

    # TODO: Integrate with actual notification system
    # Examples:
    # - Slack webhook
    # - Email notification
    # - GitHub issue creation
    # - PagerDuty incident

    # For now, just log the notification
    if [[ "$status" == "SUCCESS" ]]; then
        success "NOTIFICATION: $message"
    elif [[ "$status" == "ERROR" ]]; then
        error "NOTIFICATION: $message"
    else
        warning "NOTIFICATION: $message"
    fi
}

# Main rollback function
main() {
    local target_deployment=""
    local confirm_rollback=false

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --confirm)
                confirm_rollback=true
                shift
                ;;
            --deployment-url)
                target_deployment="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: $0 [--confirm] [--deployment-url <url>]"
                echo ""
                echo "Options:"
                echo "  --confirm           Skip confirmation prompt"
                echo "  --deployment-url    Specific deployment URL to rollback to"
                echo "  -h, --help         Show this help message"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    echo "================================================"
    echo "🔄 EMERGENCY ROLLBACK SCRIPT - FlowReader"
    echo "================================================"
    echo ""

    # Check prerequisites
    check_prerequisites

    # Get current deployment info
    local current_deployment
    current_deployment=$(get_current_deployment)
    log "Current production deployment: $current_deployment"

    # Determine target deployment for rollback
    if [[ -z "$target_deployment" ]]; then
        target_deployment=$(get_previous_deployment)
    fi

    log "Target rollback deployment: $target_deployment"

    # Confirmation check
    if [[ "$confirm_rollback" != true ]]; then
        echo ""
        warning "⚠️  CRITICAL ACTION CONFIRMATION REQUIRED ⚠️"
        echo "This will rollback production from:"
        echo "  FROM: $current_deployment"
        echo "  TO:   $target_deployment"
        echo ""
        echo "This action will:"
        echo "  - Change the live production environment"
        echo "  - Potentially affect user experience"
        echo "  - Require post-rollback investigation"
        echo ""
        read -p "Type 'ROLLBACK' to confirm: " confirmation

        if [[ "$confirmation" != "ROLLBACK" ]]; then
            log "Rollback cancelled by user"
            exit 0
        fi
    fi

    # Record rollback start
    log "🚨 EMERGENCY ROLLBACK INITIATED 🚨"
    send_notification "WARNING" "Emergency rollback initiated from $current_deployment to $target_deployment"

    # Perform the rollback
    if perform_rollback "$target_deployment"; then
        success "🎉 ROLLBACK COMPLETED SUCCESSFULLY 🎉"
        send_notification "SUCCESS" "Emergency rollback completed successfully. Production restored to $target_deployment"

        # Create incident documentation
        create_incident_record "$target_deployment"

        echo ""
        echo "================================================"
        echo "✅ ROLLBACK SUMMARY"
        echo "================================================"
        echo "Status: SUCCESS"
        echo "Production URL: $PROD_URL"
        echo "Rollback Target: $target_deployment"
        echo "Health Status: ✅ HEALTHY"
        echo ""
        echo "🔍 NEXT STEPS:"
        echo "1. Investigate root cause of the original issue"
        echo "2. Test fix in staging environment"
        echo "3. Plan redeployment with proper testing"
        echo "4. Review and update monitoring/alerting"
        echo "================================================"

    else
        error "💥 ROLLBACK FAILED 💥"
        send_notification "ERROR" "Emergency rollback FAILED. Manual intervention required immediately."

        echo ""
        echo "================================================"
        echo "❌ ROLLBACK FAILED"
        echo "================================================"
        echo "Status: FAILED"
        echo "Target: $target_deployment"
        echo ""
        echo "🚨 IMMEDIATE ACTIONS REQUIRED:"
        echo "1. Check Vercel dashboard for deployment status"
        echo "2. Review deployment logs: vercel logs $target_deployment"
        echo "3. Consider manual promotion via Vercel dashboard"
        echo "4. Escalate to senior DevOps team member"
        echo "5. Consider maintenance mode if service is degraded"
        echo "================================================"

        exit 1
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi