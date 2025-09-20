#!/bin/bash

# Rollback Decision Tree Script
# Usage: ./rollback-decision-tree.sh
#
# Interactive script to help determine if and how to perform a rollback

set -euo pipefail

# Configuration
PROD_URL="https://flowreader.vercel.app"
HEALTH_ENDPOINT="/api/health"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
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

prompt() {
    echo -e "${CYAN}[?]${NC} $1"
}

# Function to get user input with validation
get_user_choice() {
    local question="$1"
    local options="$2"  # Space-separated options
    local default="${3:-}"

    while true; do
        if [[ -n "$default" ]]; then
            read -p "$question [$options] (default: $default): " choice
            choice=${choice:-$default}
        else
            read -p "$question [$options]: " choice
        fi

        # Check if choice is valid
        for option in $options; do
            if [[ "$choice" == "$option" ]]; then
                echo "$choice"
                return 0
            fi
        done

        echo "Invalid choice. Please select from: $options"
    done
}

# Function to check current production health
check_production_health() {
    log "Checking current production health..."

    local health_status="unknown"
    local response_time="unknown"
    local http_status="unknown"

    # Health check
    local response
    response=$(curl -s -w "HTTPSTATUS:%{http_code};TIME:%{time_total}" \
                   --max-time 10 \
                   "$PROD_URL$HEALTH_ENDPOINT" 2>/dev/null || echo "HTTPSTATUS:000;TIME:999")

    http_status=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    response_time=$(echo "$response" | grep -o "TIME:[0-9.]*" | cut -d: -f2)

    if [[ "$http_status" == "200" ]]; then
        health_status="healthy"
        success "Production health: HEALTHY (${response_time}s)"
    else
        health_status="unhealthy"
        error "Production health: UNHEALTHY (Status: $http_status, Time: ${response_time}s)"
    fi

    # Return values via global variables for simplicity
    CURRENT_HEALTH_STATUS="$health_status"
    CURRENT_RESPONSE_TIME="$response_time"
    CURRENT_HTTP_STATUS="$http_status"
}

# Function to assess issue severity
assess_issue_severity() {
    bold "📊 ISSUE ASSESSMENT"
    echo "==================="

    prompt "What type of issue are you experiencing?"
    echo "1) Complete service outage (users cannot access the application)"
    echo "2) Critical functionality broken (core features not working)"
    echo "3) Performance degradation (slow response times)"
    echo "4) Security concern (potential vulnerability or breach)"
    echo "5) Partial functionality issues (some features affected)"
    echo "6) Minor issues (cosmetic or non-critical)"

    local issue_type
    issue_type=$(get_user_choice "Select issue type" "1 2 3 4 5 6")

    case $issue_type in
        1)
            ISSUE_SEVERITY="critical"
            ISSUE_DESCRIPTION="Complete service outage"
            RECOMMENDED_ACTION="immediate_rollback"
            ;;
        2)
            ISSUE_SEVERITY="high"
            ISSUE_DESCRIPTION="Critical functionality broken"
            RECOMMENDED_ACTION="assess_rollback"
            ;;
        3)
            ISSUE_SEVERITY="medium"
            ISSUE_DESCRIPTION="Performance degradation"
            RECOMMENDED_ACTION="monitor_then_decide"
            ;;
        4)
            ISSUE_SEVERITY="critical"
            ISSUE_DESCRIPTION="Security concern"
            RECOMMENDED_ACTION="immediate_rollback"
            ;;
        5)
            ISSUE_SEVERITY="medium"
            ISSUE_DESCRIPTION="Partial functionality issues"
            RECOMMENDED_ACTION="assess_rollback"
            ;;
        6)
            ISSUE_SEVERITY="low"
            ISSUE_DESCRIPTION="Minor issues"
            RECOMMENDED_ACTION="fix_forward"
            ;;
    esac

    echo ""
    log "Issue Classification:"
    echo "  Type: $ISSUE_DESCRIPTION"
    echo "  Severity: $ISSUE_SEVERITY"
    echo "  Recommended Action: $RECOMMENDED_ACTION"
}

# Function to assess timing and user impact
assess_timing_impact() {
    echo ""
    bold "⏰ TIMING AND IMPACT ASSESSMENT"
    echo "==============================="

    prompt "When did the issue start?"
    echo "1) Just now (< 5 minutes ago)"
    echo "2) Recently (5-30 minutes ago)"
    echo "3) Some time ago (30 minutes - 2 hours ago)"
    echo "4) Long standing (> 2 hours ago)"

    local timing
    timing=$(get_user_choice "Select timing" "1 2 3 4")

    case $timing in
        1) TIMING_FACTOR="immediate" ;;
        2) TIMING_FACTOR="recent" ;;
        3) TIMING_FACTOR="delayed" ;;
        4) TIMING_FACTOR="longstanding" ;;
    esac

    prompt "What is the user impact?"
    echo "1) All users affected"
    echo "2) Most users affected"
    echo "3) Some users affected"
    echo "4) Few users affected"
    echo "5) No user impact (internal issue)"

    local impact
    impact=$(get_user_choice "Select impact level" "1 2 3 4 5")

    case $impact in
        1) USER_IMPACT="all" ;;
        2) USER_IMPACT="most" ;;
        3) USER_IMPACT="some" ;;
        4) USER_IMPACT="few" ;;
        5) USER_IMPACT="none" ;;
    esac

    prompt "Is this a production environment?"
    local is_production
    is_production=$(get_user_choice "Production environment?" "yes no" "yes")

    IS_PRODUCTION="$is_production"

    echo ""
    log "Timing and Impact Assessment:"
    echo "  Issue Started: $TIMING_FACTOR"
    echo "  User Impact: $USER_IMPACT users affected"
    echo "  Environment: $(if [[ "$IS_PRODUCTION" == "yes" ]]; then echo "Production"; else echo "Non-Production"; fi)"
}

# Function to check rollback feasibility
check_rollback_feasibility() {
    echo ""
    bold "🔄 ROLLBACK FEASIBILITY CHECK"
    echo "============================="

    log "Checking rollback options..."

    # Check if we have Vercel access
    if ! command -v vercel &> /dev/null; then
        warning "Vercel CLI not found - rollback will require manual steps"
        ROLLBACK_FEASIBLE="manual"
    elif [[ -z "${VERCEL_TOKEN:-}" ]]; then
        warning "VERCEL_TOKEN not set - may require authentication"
        ROLLBACK_FEASIBLE="auth_required"
    else
        # Check if we can access deployment list
        if vercel ls flowreader --token="$VERCEL_TOKEN" &> /dev/null; then
            local deployment_count
            deployment_count=$(vercel ls flowreader --token="$VERCEL_TOKEN" 2>/dev/null | wc -l || echo "0")
            if [[ $deployment_count -gt 2 ]]; then
                success "Rollback feasible - Previous deployments available"
                ROLLBACK_FEASIBLE="available"
            else
                warning "No previous deployments found for rollback"
                ROLLBACK_FEASIBLE="no_target"
            fi
        else
            error "Cannot access deployment list - check permissions"
            ROLLBACK_FEASIBLE="no_access"
        fi
    fi

    echo ""
    log "Rollback Feasibility: $ROLLBACK_FEASIBLE"
}

# Function to generate rollback decision
generate_rollback_decision() {
    echo ""
    bold "🎯 ROLLBACK DECISION ANALYSIS"
    echo "============================"

    local decision="unknown"
    local reasoning=""
    local urgency="normal"
    local method="manual"

    # Decision logic based on multiple factors
    if [[ "$ISSUE_SEVERITY" == "critical" ]]; then
        if [[ "$IS_PRODUCTION" == "yes" ]]; then
            decision="rollback_immediately"
            urgency="immediate"
            reasoning="Critical issue in production requires immediate rollback"
        else
            decision="rollback_when_ready"
            urgency="high"
            reasoning="Critical issue in non-production - rollback after brief assessment"
        fi
    elif [[ "$ISSUE_SEVERITY" == "high" ]]; then
        if [[ "$USER_IMPACT" == "all" || "$USER_IMPACT" == "most" ]]; then
            decision="rollback_immediately"
            urgency="high"
            reasoning="High severity issue with broad user impact"
        else
            decision="assess_then_rollback"
            urgency="medium"
            reasoning="High severity but limited impact - assess briefly then rollback"
        fi
    elif [[ "$ISSUE_SEVERITY" == "medium" ]]; then
        if [[ "$TIMING_FACTOR" == "longstanding" ]]; then
            decision="investigate_first"
            urgency="low"
            reasoning="Medium severity, long-standing issue - investigate before rollback"
        elif [[ "$USER_IMPACT" == "all" || "$USER_IMPACT" == "most" ]]; then
            decision="assess_then_rollback"
            urgency="medium"
            reasoning="Medium severity with high impact - assess then consider rollback"
        else
            decision="monitor_and_decide"
            urgency="low"
            reasoning="Medium severity, limited impact - monitor and decide"
        fi
    else  # low severity
        decision="fix_forward"
        urgency="low"
        reasoning="Low severity issue - prefer fixing forward over rollback"
    fi

    # Adjust based on rollback feasibility
    if [[ "$decision" =~ rollback ]] && [[ "$ROLLBACK_FEASIBLE" != "available" ]]; then
        case $ROLLBACK_FEASIBLE in
            "manual")
                method="manual"
                reasoning="$reasoning (requires manual rollback process)"
                ;;
            "auth_required")
                method="auth_then_auto"
                reasoning="$reasoning (requires authentication first)"
                ;;
            "no_target")
                decision="fix_forward"
                reasoning="Rollback not possible - no previous deployments available"
                ;;
            "no_access")
                decision="escalate"
                reasoning="Cannot access deployment system - escalate for manual intervention"
                ;;
        esac
    elif [[ "$decision" =~ rollback ]] && [[ "$ROLLBACK_FEASIBLE" == "available" ]]; then
        method="automated"
    fi

    # Store decision
    ROLLBACK_DECISION="$decision"
    ROLLBACK_URGENCY="$urgency"
    ROLLBACK_METHOD="$method"
    ROLLBACK_REASONING="$reasoning"

    echo "Decision: $decision"
    echo "Urgency: $urgency"
    echo "Method: $method"
    echo "Reasoning: $reasoning"
}

# Function to provide action recommendations
provide_action_recommendations() {
    echo ""
    bold "📋 RECOMMENDED ACTIONS"
    echo "====================="

    case $ROLLBACK_DECISION in
        "rollback_immediately")
            error "🚨 IMMEDIATE ROLLBACK REQUIRED 🚨"
            echo ""
            echo "Execute rollback NOW:"
            echo "  1. Run: ./scripts/emergency-rollback.sh --confirm"
            echo "  OR"
            echo "  2. GitHub Actions: Trigger 'Emergency Rollback' workflow"
            echo "  OR"
            echo "  3. Manual: vercel promote <PREVIOUS_DEPLOYMENT> --token=\$VERCEL_TOKEN"
            echo ""
            echo "Time target: < 5 minutes"
            ;;

        "rollback_when_ready"|"assess_then_rollback")
            warning "⚠️ ROLLBACK RECOMMENDED"
            echo ""
            echo "Steps:"
            echo "  1. Gather additional information (max 5-10 minutes)"
            echo "  2. Execute rollback using:"
            echo "     ./scripts/emergency-rollback.sh"
            echo "  3. Verify rollback success"
            echo "  4. Begin incident investigation"
            echo ""
            echo "Time target: < 15 minutes"
            ;;

        "monitor_and_decide")
            warning "📊 MONITOR THEN DECIDE"
            echo ""
            echo "Steps:"
            echo "  1. Monitor production for 10-15 minutes"
            echo "  2. Run: ./scripts/health-check.sh --environment production"
            echo "  3. If issues worsen, execute rollback"
            echo "  4. If stable, consider fix-forward approach"
            echo ""
            echo "Decision point: 15 minutes"
            ;;

        "investigate_first")
            info "🔍 INVESTIGATE BEFORE ROLLBACK"
            echo ""
            echo "Steps:"
            echo "  1. Investigate root cause (max 30 minutes)"
            echo "  2. Assess if fix-forward is possible"
            echo "  3. If no quick fix, proceed with rollback"
            echo "  4. Document findings"
            ;;

        "fix_forward")
            success "🔧 FIX FORWARD RECOMMENDED"
            echo ""
            echo "Steps:"
            echo "  1. Develop fix in staging environment"
            echo "  2. Test thoroughly"
            echo "  3. Deploy fix to production"
            echo "  4. Monitor for improvement"
            echo ""
            echo "Rollback remains available as backup option"
            ;;

        "escalate")
            error "📞 ESCALATION REQUIRED"
            echo ""
            echo "Steps:"
            echo "  1. Escalate to senior DevOps/SRE immediately"
            echo "  2. Provide this analysis output"
            echo "  3. Consider manual intervention via Vercel dashboard"
            echo "  4. Document all actions taken"
            ;;
    esac

    echo ""
    bold "🔗 USEFUL COMMANDS"
    echo "=================="
    echo "Check production health:"
    echo "  ./scripts/health-check.sh --environment production"
    echo ""
    echo "View deployment status:"
    echo "  ./scripts/deployment-status.sh --current"
    echo ""
    echo "List rollback candidates:"
    echo "  ./scripts/deployment-status.sh --rollback-candidates"
    echo ""
    echo "Emergency rollback:"
    echo "  ./scripts/emergency-rollback.sh"
    echo ""
    echo "GitHub Actions rollback:"
    echo "  gh workflow run emergency-rollback.yml"
}

# Function to generate summary report
generate_summary_report() {
    echo ""
    bold "📋 ROLLBACK DECISION SUMMARY"
    echo "============================"

    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "Timestamp: $timestamp"
    echo "Assessed by: $(whoami)"
    echo ""
    echo "ISSUE DETAILS:"
    echo "  Description: $ISSUE_DESCRIPTION"
    echo "  Severity: $ISSUE_SEVERITY"
    echo "  User Impact: $USER_IMPACT users affected"
    echo "  Timing: $TIMING_FACTOR"
    echo "  Environment: $(if [[ "$IS_PRODUCTION" == "yes" ]]; then echo "Production"; else echo "Non-Production"; fi)"
    echo ""
    echo "PRODUCTION STATUS:"
    echo "  Health Status: $CURRENT_HEALTH_STATUS"
    echo "  Response Time: ${CURRENT_RESPONSE_TIME}s"
    echo "  HTTP Status: $CURRENT_HTTP_STATUS"
    echo ""
    echo "ROLLBACK ANALYSIS:"
    echo "  Decision: $ROLLBACK_DECISION"
    echo "  Urgency: $ROLLBACK_URGENCY"
    echo "  Method: $ROLLBACK_METHOD"
    echo "  Feasibility: $ROLLBACK_FEASIBLE"
    echo "  Reasoning: $ROLLBACK_REASONING"
    echo ""

    # Save to file
    local report_file
    report_file="rollback-decision-$(date '+%Y%m%d-%H%M%S').txt"

    {
        echo "Rollback Decision Analysis - $timestamp"
        echo "======================================"
        echo ""
        echo "Issue: $ISSUE_DESCRIPTION ($ISSUE_SEVERITY severity)"
        echo "Impact: $USER_IMPACT users affected"
        echo "Environment: $(if [[ "$IS_PRODUCTION" == "yes" ]]; then echo "Production"; else echo "Non-Production"; fi)"
        echo ""
        echo "Production Health: $CURRENT_HEALTH_STATUS (${CURRENT_RESPONSE_TIME}s response)"
        echo ""
        echo "DECISION: $ROLLBACK_DECISION"
        echo "URGENCY: $ROLLBACK_URGENCY"
        echo "REASONING: $ROLLBACK_REASONING"
        echo ""
        echo "Assessed by: $(whoami)"
        echo "Assessment tool: rollback-decision-tree.sh"
    } > "$report_file"

    log "Decision report saved to: $report_file"
}

# Function to ask for confirmation if immediate rollback recommended
confirm_immediate_action() {
    if [[ "$ROLLBACK_DECISION" == "rollback_immediately" ]]; then
        echo ""
        warning "⚠️ IMMEDIATE ACTION CONFIRMATION ⚠️"
        echo ""
        prompt "The analysis recommends IMMEDIATE ROLLBACK."
        local execute_now
        execute_now=$(get_user_choice "Do you want to execute the rollback now?" "yes no" "no")

        if [[ "$execute_now" == "yes" ]]; then
            echo ""
            log "Executing emergency rollback..."
            if [[ -f "./scripts/emergency-rollback.sh" ]]; then
                ./scripts/emergency-rollback.sh
            else
                error "Emergency rollback script not found!"
                echo "Please run manually:"
                echo "  vercel promote <PREVIOUS_DEPLOYMENT> --token=\$VERCEL_TOKEN"
            fi
        else
            warning "Rollback execution deferred - remember to execute manually!"
        fi
    fi
}

# Main function
main() {
    echo "================================================="
    echo "🚦 FLOWREADER ROLLBACK DECISION TREE"
    echo "================================================="
    echo ""
    echo "This tool will help you decide if and how to perform"
    echo "a rollback based on current conditions and issue severity."
    echo ""

    # Initialize global variables
    ISSUE_SEVERITY=""
    ISSUE_DESCRIPTION=""
    RECOMMENDED_ACTION=""
    TIMING_FACTOR=""
    USER_IMPACT=""
    IS_PRODUCTION=""
    CURRENT_HEALTH_STATUS=""
    CURRENT_RESPONSE_TIME=""
    CURRENT_HTTP_STATUS=""
    ROLLBACK_FEASIBLE=""
    ROLLBACK_DECISION=""
    ROLLBACK_URGENCY=""
    ROLLBACK_METHOD=""
    ROLLBACK_REASONING=""

    # Step 1: Check current production health
    check_production_health
    echo ""

    # Step 2: Assess issue severity
    assess_issue_severity
    echo ""

    # Step 3: Assess timing and impact
    assess_timing_impact
    echo ""

    # Step 4: Check rollback feasibility
    check_rollback_feasibility
    echo ""

    # Step 5: Generate decision
    generate_rollback_decision
    echo ""

    # Step 6: Provide recommendations
    provide_action_recommendations
    echo ""

    # Step 7: Generate summary
    generate_summary_report
    echo ""

    # Step 8: Confirm immediate action if needed
    confirm_immediate_action

    echo ""
    bold "🎯 DECISION COMPLETE"
    echo "==================="
    echo "Review the recommendations above and take appropriate action."
    echo "Keep this analysis for incident documentation."
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi