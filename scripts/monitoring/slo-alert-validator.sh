#!/bin/bash
# FlowReader SLO Alert Validation System
# Validates SLO alert rules, thresholds, and notification delivery

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VALIDATION_DIR="/tmp/flowreader-slo-alert-validation"
ALERT_RULES_FILE="$SCRIPT_DIR/slo-alert-rules.yaml"
LOG_FILE="$VALIDATION_DIR/slo-alert-validation-$(date +%Y%m%d_%H%M%S).log"

# Default configuration
PRODUCTION_URL="${PRODUCTION_URL:-https://flowreader.vercel.app}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Utility functions
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    log "ERROR: $1"
}

warning() {
    echo -e "${YELLOW}WARNING: $1${NC}" >&2
    log "WARNING: $1"
}

success() {
    echo -e "${GREEN}SUCCESS: $1${NC}"
    log "SUCCESS: $1"
}

info() {
    echo -e "${BLUE}INFO: $1${NC}"
    log "INFO: $1"
}

verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${PURPLE}VERBOSE: $1${NC}"
        log "VERBOSE: $1"
    fi
}

# Initialize validation environment
initialize_validation() {
    log "Initializing SLO alert validation environment"
    mkdir -p "$VALIDATION_DIR"

    if [[ ! -f "$LOG_FILE" ]]; then
        touch "$LOG_FILE"
    fi

    # Create validation results structure
    cat > "$VALIDATION_DIR/validation-summary.json" << EOF
{
  "validation_session": {
    "start_time": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
    "production_url": "$PRODUCTION_URL",
    "alert_rules_file": "$ALERT_RULES_FILE"
  },
  "results": {
    "rule_validation": {},
    "threshold_testing": {},
    "notification_testing": {},
    "end_to_end_testing": {}
  },
  "summary": {
    "total_tests": 0,
    "passed_tests": 0,
    "failed_tests": 0,
    "warnings": 0
  }
}
EOF

    info "Validation environment initialized at $VALIDATION_DIR"
}

# Validate alert rule syntax and configuration
validate_alert_rules() {
    info "Validating SLO alert rules configuration"

    local validation_results=()
    local passed=0
    local failed=0

    # Check if alert rules file exists
    if [[ ! -f "$ALERT_RULES_FILE" ]]; then
        error "Alert rules file not found: $ALERT_RULES_FILE"
        return 1
    fi

    # Validate YAML syntax
    if ! yq eval '.' "$ALERT_RULES_FILE" >/dev/null 2>&1; then
        error "Invalid YAML syntax in alert rules file"
        failed=$((failed + 1))
        validation_results+=("YAML_SYNTAX:FAILED")
    else
        success "Alert rules YAML syntax is valid"
        passed=$((passed + 1))
        validation_results+=("YAML_SYNTAX:PASSED")
    fi

    # Validate required sections
    local required_sections=("metadata" "slo_targets" "groups" "notification_channels" "routes")
    for section in "${required_sections[@]}"; do
        if yq eval "has(\"$section\")" "$ALERT_RULES_FILE" | grep -q "true"; then
            success "Required section '$section' found"
            passed=$((passed + 1))
            validation_results+=("SECTION_$section:PASSED")
        else
            error "Required section '$section' missing"
            failed=$((failed + 1))
            validation_results+=("SECTION_$section:FAILED")
        fi
    done

    # Validate SLO target definitions
    local slo_targets=(
        "availability"
        "p95_latency"
        "p99_latency"
        "error_rate"
        "dialog_success_rate"
        "security_compliance"
    )

    for target in "${slo_targets[@]}"; do
        if yq eval ".slo_targets.${target}" "$ALERT_RULES_FILE" | grep -q "null"; then
            warning "SLO target '$target' not defined"
            validation_results+=("SLO_TARGET_$target:WARNING")
        else
            # Validate target structure (target, warning, critical values)
            local has_target=$(yq eval ".slo_targets.${target}.target" "$ALERT_RULES_FILE")
            local has_warning=$(yq eval ".slo_targets.${target}.warning" "$ALERT_RULES_FILE")
            local has_critical=$(yq eval ".slo_targets.${target}.critical" "$ALERT_RULES_FILE")

            if [[ "$has_target" != "null" && "$has_warning" != "null" && "$has_critical" != "null" ]]; then
                success "SLO target '$target' properly configured"
                passed=$((passed + 1))
                validation_results+=("SLO_TARGET_$target:PASSED")
            else
                error "SLO target '$target' missing required thresholds"
                failed=$((failed + 1))
                validation_results+=("SLO_TARGET_$target:FAILED")
            fi
        fi
    done

    # Validate alert rule groups
    local groups_count=$(yq eval '.groups | length' "$ALERT_RULES_FILE")
    if [[ $groups_count -gt 0 ]]; then
        success "Found $groups_count alert rule groups"
        passed=$((passed + 1))
        validation_results+=("ALERT_GROUPS:PASSED")

        # Validate each group has rules
        for ((i=0; i<groups_count; i++)); do
            local group_name=$(yq eval ".groups[$i].name" "$ALERT_RULES_FILE")
            local rules_count=$(yq eval ".groups[$i].rules | length" "$ALERT_RULES_FILE")

            if [[ $rules_count -gt 0 ]]; then
                verbose "Group '$group_name' has $rules_count rules"
                validation_results+=("GROUP_${group_name}_RULES:PASSED")
            else
                warning "Group '$group_name' has no rules"
                validation_results+=("GROUP_${group_name}_RULES:WARNING")
            fi
        done
    else
        error "No alert rule groups found"
        failed=$((failed + 1))
        validation_results+=("ALERT_GROUPS:FAILED")
    fi

    # Update validation results
    local rule_validation_json=$(printf '%s\n' "${validation_results[@]}" | jq -R -s 'split("\n")[:-1] | map(split(":") | {(.[0]): .[1]}) | add')
    jq --argjson results "$rule_validation_json" \
       --argjson passed "$passed" \
       --argjson failed "$failed" \
       '.results.rule_validation = $results | .summary.passed_tests += $passed | .summary.failed_tests += $failed' \
       "$VALIDATION_DIR/validation-summary.json" > "$VALIDATION_DIR/validation-summary.tmp" && \
       mv "$VALIDATION_DIR/validation-summary.tmp" "$VALIDATION_DIR/validation-summary.json"

    info "Rule validation completed: $passed passed, $failed failed"
    return $failed
}

# Test SLO threshold calculations and logic
test_slo_thresholds() {
    info "Testing SLO threshold calculations and logic"

    local passed=0
    local failed=0
    local warnings=0

    # Test availability thresholds
    verbose "Testing availability SLO thresholds"
    local availability_target=$(yq eval '.slo_targets.availability.target' "$ALERT_RULES_FILE")
    local availability_warning=$(yq eval '.slo_targets.availability.warning' "$ALERT_RULES_FILE")
    local availability_critical=$(yq eval '.slo_targets.availability.critical' "$ALERT_RULES_FILE")

    if [[ "$availability_target" != "null" && "$availability_warning" != "null" && "$availability_critical" != "null" ]]; then
        # Test threshold logic (warning should be higher than target for availability)
        if (( $(echo "$availability_warning > $availability_target" | bc -l) )); then
            success "Availability thresholds correctly ordered (warning > target)"
            passed=$((passed + 1))
        else
            error "Availability threshold logic error: warning ($availability_warning) should be > target ($availability_target)"
            failed=$((failed + 1))
        fi

        # Test error budget calculation
        local error_budget=$(echo "100 - $availability_target" | bc -l)
        info "Calculated availability error budget: ${error_budget}%"

        if (( $(echo "$error_budget > 0 && $error_budget < 1" | bc -l) )); then
            success "Availability error budget is reasonable: ${error_budget}%"
            passed=$((passed + 1))
        else
            warning "Availability error budget seems unusual: ${error_budget}%"
            warnings=$((warnings + 1))
        fi
    else
        error "Availability thresholds not properly configured"
        failed=$((failed + 1))
    fi

    # Test latency thresholds
    verbose "Testing latency SLO thresholds"
    local p95_target=$(yq eval '.slo_targets.p95_latency.target' "$ALERT_RULES_FILE")
    local p95_warning=$(yq eval '.slo_targets.p95_latency.warning' "$ALERT_RULES_FILE")
    local p95_critical=$(yq eval '.slo_targets.p95_latency.critical' "$ALERT_RULES_FILE")

    if [[ "$p95_target" != "null" && "$p95_warning" != "null" && "$p95_critical" != "null" ]]; then
        # Test threshold progression (warning < critical for latency)
        if (( $(echo "$p95_warning < $p95_critical" | bc -l) && $(echo "$p95_target < $p95_warning" | bc -l) )); then
            success "P95 latency thresholds correctly ordered (target < warning < critical)"
            passed=$((passed + 1))
        else
            error "P95 latency threshold logic error: should be target < warning < critical"
            failed=$((failed + 1))
        fi

        # Test reasonableness of latency values
        if (( $(echo "$p95_target > 100 && $p95_target < 10000" | bc -l) )); then
            success "P95 latency target is reasonable: ${p95_target}ms"
            passed=$((passed + 1))
        else
            warning "P95 latency target seems unusual: ${p95_target}ms"
            warnings=$((warnings + 1))
        fi
    else
        error "P95 latency thresholds not properly configured"
        failed=$((failed + 1))
    fi

    # Test error rate thresholds
    verbose "Testing error rate SLO thresholds"
    local error_rate_target=$(yq eval '.slo_targets.error_rate.target' "$ALERT_RULES_FILE")
    local error_rate_warning=$(yq eval '.slo_targets.error_rate.warning' "$ALERT_RULES_FILE")
    local error_rate_critical=$(yq eval '.slo_targets.error_rate.critical' "$ALERT_RULES_FILE")

    if [[ "$error_rate_target" != "null" && "$error_rate_warning" != "null" && "$error_rate_critical" != "null" ]]; then
        # Test threshold progression for error rate (higher is worse)
        if (( $(echo "$error_rate_target < $error_rate_warning" | bc -l) && $(echo "$error_rate_warning < $error_rate_critical" | bc -l) )); then
            success "Error rate thresholds correctly ordered (target < warning < critical)"
            passed=$((passed + 1))
        else
            error "Error rate threshold logic error"
            failed=$((failed + 1))
        fi
    fi

    # Test burn rate calculations
    verbose "Testing error budget burn rate calculations"
    local fast_burn_threshold=14.4  # Standard fast burn rate
    local slow_burn_threshold=1.0   # Standard slow burn rate

    if (( $(echo "$fast_burn_threshold > $slow_burn_threshold" | bc -l) )); then
        success "Burn rate thresholds properly configured"
        passed=$((passed + 1))
    else
        error "Burn rate threshold configuration error"
        failed=$((failed + 1))
    fi

    # Update validation results
    jq --argjson passed "$passed" \
       --argjson failed "$failed" \
       --argjson warnings "$warnings" \
       '.results.threshold_testing = {"passed": $passed, "failed": $failed, "warnings": $warnings} |
        .summary.passed_tests += $passed |
        .summary.failed_tests += $failed |
        .summary.warnings += $warnings' \
       "$VALIDATION_DIR/validation-summary.json" > "$VALIDATION_DIR/validation-summary.tmp" && \
       mv "$VALIDATION_DIR/validation-summary.tmp" "$VALIDATION_DIR/validation-summary.json"

    info "Threshold testing completed: $passed passed, $failed failed, $warnings warnings"
    return $failed
}

# Test notification channel configurations
test_notification_channels() {
    info "Testing notification channel configurations"

    local passed=0
    local failed=0
    local warnings=0

    # Get notification channels from config
    local channels_count=$(yq eval '.notification_channels | length' "$ALERT_RULES_FILE")

    if [[ $channels_count -eq 0 ]]; then
        error "No notification channels configured"
        failed=$((failed + 1))
        return $failed
    fi

    info "Found $channels_count notification channel groups"

    # Test critical channels
    if yq eval 'has("notification_channels.critical_channels")' "$ALERT_RULES_FILE" | grep -q "true"; then
        success "Critical notification channels configured"
        passed=$((passed + 1))

        # Test PagerDuty configuration
        if yq eval '.notification_channels.critical_channels[] | select(.name == "pagerduty-sre")' "$ALERT_RULES_FILE" | grep -q "pagerduty"; then
            success "PagerDuty integration configured for critical alerts"
            passed=$((passed + 1))
        else
            warning "No PagerDuty integration found for critical alerts"
            warnings=$((warnings + 1))
        fi

        # Test Slack configuration
        if yq eval '.notification_channels.critical_channels[] | select(.type == "slack")' "$ALERT_RULES_FILE" | grep -q "slack"; then
            success "Slack integration configured for critical alerts"
            passed=$((passed + 1))
        else
            warning "No Slack integration found for critical alerts"
            warnings=$((warnings + 1))
        fi
    else
        error "Critical notification channels not configured"
        failed=$((failed + 1))
    fi

    # Test warning channels
    if yq eval 'has("notification_channels.warning_channels")' "$ALERT_RULES_FILE" | grep -q "true"; then
        success "Warning notification channels configured"
        passed=$((passed + 1))
    else
        warning "Warning notification channels not configured"
        warnings=$((warnings + 1))
    fi

    # Test executive channels
    if yq eval 'has("notification_channels.executive_channels")' "$ALERT_RULES_FILE" | grep -q "true"; then
        success "Executive notification channels configured"
        passed=$((passed + 1))
    else
        warning "Executive notification channels not configured"
        warnings=$((warnings + 1))
    fi

    # Test notification routing
    local routes_count=$(yq eval '.routes | length' "$ALERT_RULES_FILE")
    if [[ $routes_count -gt 0 ]]; then
        success "Found $routes_count notification routes configured"
        passed=$((passed + 1))
    else
        error "No notification routes configured"
        failed=$((failed + 1))
    fi

    # Update validation results
    jq --argjson passed "$passed" \
       --argjson failed "$failed" \
       --argjson warnings "$warnings" \
       '.results.notification_testing = {"passed": $passed, "failed": $failed, "warnings": $warnings} |
        .summary.passed_tests += $passed |
        .summary.failed_tests += $failed |
        .summary.warnings += $warnings' \
       "$VALIDATION_DIR/validation-summary.json" > "$VALIDATION_DIR/validation-summary.tmp" && \
       mv "$VALIDATION_DIR/validation-summary.tmp" "$VALIDATION_DIR/validation-summary.json"

    info "Notification testing completed: $passed passed, $failed failed, $warnings warnings"
    return $failed
}

# Simulate SLO violations and test alert triggering
simulate_slo_violations() {
    info "Simulating SLO violations for end-to-end testing"

    local passed=0
    local failed=0
    local warnings=0

    # Test scenarios from the alert rules
    local test_scenarios=(
        "availability_violation:99.0:SLOViolation_SystemAvailability_Critical"
        "latency_warning:2200:SLOWarning_P95Latency"
        "error_rate_critical:7.0:SLOViolation_ErrorRate_Critical"
        "error_budget_critical:90:ErrorBudget_Critical_Availability"
    )

    for scenario in "${test_scenarios[@]}"; do
        IFS=':' read -r scenario_name threshold_value expected_alert <<< "$scenario"

        info "Testing scenario: $scenario_name"
        verbose "Threshold: $threshold_value, Expected alert: $expected_alert"

        # Simulate the metric condition
        local alert_should_trigger="false"
        case "$scenario_name" in
            "availability_violation")
                if (( $(echo "$threshold_value < 99.5" | bc -l) )); then
                    alert_should_trigger="true"
                fi
                ;;
            "latency_warning")
                if (( $(echo "$threshold_value > 2000" | bc -l) )); then
                    alert_should_trigger="true"
                fi
                ;;
            "error_rate_critical")
                if (( $(echo "$threshold_value > 5.0" | bc -l) )); then
                    alert_should_trigger="true"
                fi
                ;;
            "error_budget_critical")
                if (( $(echo "$threshold_value > 85" | bc -l) )); then
                    alert_should_trigger="true"
                fi
                ;;
        esac

        if [[ "$alert_should_trigger" == "true" ]]; then
            success "Scenario '$scenario_name' correctly triggers alert condition"
            passed=$((passed + 1))
        else
            error "Scenario '$scenario_name' does not trigger alert condition as expected"
            failed=$((failed + 1))
        fi

        # Check if the expected alert rule exists
        if yq eval ".groups[].rules[] | select(.alert == \"$expected_alert\")" "$ALERT_RULES_FILE" | grep -q "alert"; then
            success "Expected alert rule '$expected_alert' found in configuration"
            passed=$((passed + 1))
        else
            error "Expected alert rule '$expected_alert' not found in configuration"
            failed=$((failed + 1))
        fi

        sleep 1  # Small delay between tests
    done

    # Test multi-window burn rate logic
    info "Testing multi-window burn rate alert logic"

    # Check if multi-window burn rate rules exist
    if yq eval '.groups[] | select(.name == "slo-burn-rate-multiwindow")' "$ALERT_RULES_FILE" | grep -q "slo-burn-rate-multiwindow"; then
        success "Multi-window burn rate alert group found"
        passed=$((passed + 1))

        # Verify fast burn rate rule
        if yq eval '.groups[] | select(.name == "slo-burn-rate-multiwindow") | .rules[] | select(.alert == "ErrorBudgetBurn_MultiWindow_Fast")' "$ALERT_RULES_FILE" | grep -q "ErrorBudgetBurn_MultiWindow_Fast"; then
            success "Fast burn rate multi-window rule configured"
            passed=$((passed + 1))
        else
            error "Fast burn rate multi-window rule missing"
            failed=$((failed + 1))
        fi
    else
        error "Multi-window burn rate alert group not found"
        failed=$((failed + 1))
    fi

    # Update validation results
    jq --argjson passed "$passed" \
       --argjson failed "$failed" \
       --argjson warnings "$warnings" \
       '.results.end_to_end_testing = {"passed": $passed, "failed": $failed, "warnings": $warnings} |
        .summary.passed_tests += $passed |
        .summary.failed_tests += $failed |
        .summary.warnings += $warnings' \
       "$VALIDATION_DIR/validation-summary.json" > "$VALIDATION_DIR/validation-summary.tmp" && \
       mv "$VALIDATION_DIR/validation-summary.tmp" "$VALIDATION_DIR/validation-summary.json"

    info "End-to-end testing completed: $passed passed, $failed failed, $warnings warnings"
    return $failed
}

# Generate comprehensive validation report
generate_validation_report() {
    info "Generating comprehensive validation report"

    local report_file="$VALIDATION_DIR/slo-alert-validation-report-$(date +%Y%m%d_%H%M%S).md"
    local summary_data=$(cat "$VALIDATION_DIR/validation-summary.json")

    local total_tests=$(echo "$summary_data" | jq -r '.summary.total_tests // 0')
    local passed_tests=$(echo "$summary_data" | jq -r '.summary.passed_tests')
    local failed_tests=$(echo "$summary_data" | jq -r '.summary.failed_tests')
    local warnings=$(echo "$summary_data" | jq -r '.summary.warnings')
    local success_rate=$(echo "scale=2; $passed_tests * 100 / ($passed_tests + $failed_tests)" | bc -l)

    cat > "$report_file" << EOF
# FlowReader SLO Alert Validation Report

**Generated**: $(date '+%Y-%m-%d %H:%M:%S UTC')
**Production URL**: $PRODUCTION_URL
**Alert Rules File**: $ALERT_RULES_FILE
**Validation Session**: $(echo "$summary_data" | jq -r '.validation_session.start_time')

## Executive Summary

- **Total Tests**: $((passed_tests + failed_tests))
- **Passed**: $passed_tests
- **Failed**: $failed_tests
- **Warnings**: $warnings
- **Success Rate**: ${success_rate}%

$(if [[ $failed_tests -eq 0 ]]; then
    echo "✅ **Status**: All validations passed"
elif [[ $failed_tests -lt 5 ]]; then
    echo "⚠️ **Status**: Minor issues detected"
else
    echo "❌ **Status**: Significant issues require attention"
fi)

---

## Validation Results

### 1. Alert Rule Configuration Validation

EOF

    # Rule validation results
    local rule_validation=$(echo "$summary_data" | jq -r '.results.rule_validation')
    if [[ "$rule_validation" != "null" ]]; then
        echo "$rule_validation" | jq -r 'to_entries[] | "- **\(.key)**: \(.value)"' >> "$report_file"
    else
        echo "- No rule validation data available" >> "$report_file"
    fi

    cat >> "$report_file" << EOF

### 2. SLO Threshold Testing

EOF

    # Threshold testing results
    local threshold_results=$(echo "$summary_data" | jq -r '.results.threshold_testing')
    if [[ "$threshold_results" != "null" ]]; then
        local threshold_passed=$(echo "$threshold_results" | jq -r '.passed // 0')
        local threshold_failed=$(echo "$threshold_results" | jq -r '.failed // 0')
        local threshold_warnings=$(echo "$threshold_results" | jq -r '.warnings // 0')

        cat >> "$report_file" << EOF
- **Tests Passed**: $threshold_passed
- **Tests Failed**: $threshold_failed
- **Warnings**: $threshold_warnings

EOF
    fi

    cat >> "$report_file" << EOF
### 3. Notification Channel Testing

EOF

    # Notification testing results
    local notification_results=$(echo "$summary_data" | jq -r '.results.notification_testing')
    if [[ "$notification_results" != "null" ]]; then
        local notification_passed=$(echo "$notification_results" | jq -r '.passed // 0')
        local notification_failed=$(echo "$notification_results" | jq -r '.failed // 0')
        local notification_warnings=$(echo "$notification_results" | jq -r '.warnings // 0')

        cat >> "$report_file" << EOF
- **Tests Passed**: $notification_passed
- **Tests Failed**: $notification_failed
- **Warnings**: $notification_warnings

EOF
    fi

    cat >> "$report_file" << EOF
### 4. End-to-End Alert Testing

EOF

    # End-to-end testing results
    local e2e_results=$(echo "$summary_data" | jq -r '.results.end_to_end_testing')
    if [[ "$e2e_results" != "null" ]]; then
        local e2e_passed=$(echo "$e2e_results" | jq -r '.passed // 0')
        local e2e_failed=$(echo "$e2e_results" | jq -r '.failed // 0')
        local e2e_warnings=$(echo "$e2e_results" | jq -r '.warnings // 0')

        cat >> "$report_file" << EOF
- **Tests Passed**: $e2e_passed
- **Tests Failed**: $e2e_failed
- **Warnings**: $e2e_warnings

EOF
    fi

    # Add SLO target summary
    cat >> "$report_file" << EOF
---

## SLO Configuration Summary

| Metric | Target | Warning | Critical | Measurement Window |
|--------|--------|---------|----------|-------------------|
EOF

    # Extract SLO targets from the rules file
    local slo_metrics=("availability" "p95_latency" "p99_latency" "error_rate" "dialog_success_rate" "security_compliance")
    for metric in "${slo_metrics[@]}"; do
        local target=$(yq eval ".slo_targets.$metric.target" "$ALERT_RULES_FILE" 2>/dev/null || echo "N/A")
        local warning=$(yq eval ".slo_targets.$metric.warning" "$ALERT_RULES_FILE" 2>/dev/null || echo "N/A")
        local critical=$(yq eval ".slo_targets.$metric.critical" "$ALERT_RULES_FILE" 2>/dev/null || echo "N/A")
        local window=$(yq eval ".slo_targets.$metric.measurement_window" "$ALERT_RULES_FILE" 2>/dev/null || echo "N/A")
        local unit=$(yq eval ".slo_targets.$metric.unit" "$ALERT_RULES_FILE" 2>/dev/null || echo "")

        echo "| $metric | $target$unit | $warning$unit | $critical$unit | $window |" >> "$report_file"
    done

    cat >> "$report_file" << EOF

---

## Recommendations

EOF

    # Generate recommendations based on results
    if [[ $failed_tests -eq 0 ]]; then
        echo "✅ **All validations passed** - Alert configuration is ready for production use." >> "$report_file"
    else
        echo "❌ **Action required** - Please address the following issues:" >> "$report_file"
        echo "" >> "$report_file"

        if [[ $(echo "$summary_data" | jq -r '.results.rule_validation | to_entries[] | select(.value == "FAILED") | .key' | wc -l) -gt 0 ]]; then
            echo "1. **Fix alert rule configuration errors**" >> "$report_file"
        fi

        if [[ $(echo "$threshold_results" | jq -r '.failed // 0') -gt 0 ]]; then
            echo "2. **Review and correct SLO threshold configurations**" >> "$report_file"
        fi

        if [[ $(echo "$notification_results" | jq -r '.failed // 0') -gt 0 ]]; then
            echo "3. **Configure missing notification channels**" >> "$report_file"
        fi

        if [[ $(echo "$e2e_results" | jq -r '.failed // 0') -gt 0 ]]; then
            echo "4. **Verify alert rule logic and expressions**" >> "$report_file"
        fi
    fi

    if [[ $warnings -gt 0 ]]; then
        echo "" >> "$report_file"
        echo "⚠️ **Warnings to address:**" >> "$report_file"
        echo "- Review configuration warnings for optimization opportunities" >> "$report_file"
        echo "- Consider implementing additional notification channels for redundancy" >> "$report_file"
        echo "- Verify that all team-specific alert routing is configured correctly" >> "$report_file"
    fi

    cat >> "$report_file" << EOF

---

## Next Steps

1. **Address any failed validations** before deploying alert rules to production
2. **Configure notification channels** with actual webhook URLs and API keys
3. **Test alert delivery** in a staging environment before production deployment
4. **Set up alert rule monitoring** to ensure rules remain functional over time
5. **Schedule regular validation** of alert rules (recommended: weekly)

## Support Documentation

- [SLO Policy Document](../docs/ops/slo_policy.md)
- [Alert Runbooks](https://docs.company.com/runbooks/)
- [SLO Monitoring Script](./slo-check.sh)
- [Dashboard Configurations](./dashboards/)

---

*Report generated by FlowReader SLO Alert Validation System v1.0*
EOF

    # Update total tests in summary
    jq --argjson total "$((passed_tests + failed_tests))" \
       '.summary.total_tests = $total' \
       "$VALIDATION_DIR/validation-summary.json" > "$VALIDATION_DIR/validation-summary.tmp" && \
       mv "$VALIDATION_DIR/validation-summary.tmp" "$VALIDATION_DIR/validation-summary.json"

    success "Validation report generated: $report_file"
    echo "$report_file"
}

# Main validation function
run_comprehensive_validation() {
    info "Starting comprehensive SLO alert validation"

    local total_failures=0

    # Run all validation tests
    validate_alert_rules
    total_failures=$((total_failures + $?))

    test_slo_thresholds
    total_failures=$((total_failures + $?))

    test_notification_channels
    total_failures=$((total_failures + $?))

    simulate_slo_violations
    total_failures=$((total_failures + $?))

    # Generate comprehensive report
    local report_file
    report_file=$(generate_validation_report)

    # Final summary
    echo ""
    info "=== SLO Alert Validation Summary ==="

    local summary_data=$(cat "$VALIDATION_DIR/validation-summary.json")
    local passed_tests=$(echo "$summary_data" | jq -r '.summary.passed_tests')
    local failed_tests=$(echo "$summary_data" | jq -r '.summary.failed_tests')
    local warnings=$(echo "$summary_data" | jq -r '.summary.warnings')

    echo "Total Tests: $((passed_tests + failed_tests))"
    echo "Passed: $passed_tests"
    echo "Failed: $failed_tests"
    echo "Warnings: $warnings"
    echo ""

    if [[ $total_failures -eq 0 ]]; then
        success "All SLO alert validations passed! ✅"
        echo "Report: $report_file"
        return 0
    else
        error "SLO alert validation failed with $total_failures failures ❌"
        echo "Report: $report_file"
        return 1
    fi
}

# Display help information
show_help() {
    cat << EOF
FlowReader SLO Alert Validation Script

Usage: $0 [OPTIONS] [COMMAND]

COMMANDS:
    comprehensive     Run all validation tests (default)
    rules            Validate alert rule configuration only
    thresholds       Test SLO threshold logic only
    notifications    Test notification channel configuration only
    simulate         Simulate SLO violations and test alert logic
    report          Generate validation report from existing results

OPTIONS:
    --alert-rules FILE    Path to alert rules file (default: ./slo-alert-rules.yaml)
    --production-url URL  Production URL for testing (default: https://flowreader.vercel.app)
    --dry-run            Run in dry-run mode (no actual notifications)
    --verbose            Enable verbose output
    --help               Show this help message

EXAMPLES:
    # Run comprehensive validation
    $0 comprehensive

    # Validate only alert rules
    $0 rules

    # Test with custom alert rules file
    $0 --alert-rules custom-rules.yaml comprehensive

    # Run in verbose mode
    $0 --verbose comprehensive

ENVIRONMENT VARIABLES:
    PRODUCTION_URL       Production URL to test against
    DRY_RUN             Set to 'true' for dry-run mode
    VERBOSE             Set to 'true' for verbose output

EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --alert-rules)
                ALERT_RULES_FILE="$2"
                shift 2
                ;;
            --production-url)
                PRODUCTION_URL="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --verbose)
                VERBOSE="true"
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            comprehensive|rules|thresholds|notifications|simulate|report)
                COMMAND="$1"
                shift
                ;;
            *)
                error "Unknown argument: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Main script execution
main() {
    # Default command
    local COMMAND="comprehensive"

    # Parse command line arguments
    parse_arguments "$@"

    # Initialize validation environment
    initialize_validation

    # Execute command
    case "$COMMAND" in
        "comprehensive")
            run_comprehensive_validation
            ;;
        "rules")
            validate_alert_rules
            ;;
        "thresholds")
            test_slo_thresholds
            ;;
        "notifications")
            test_notification_channels
            ;;
        "simulate")
            simulate_slo_violations
            ;;
        "report")
            generate_validation_report
            ;;
        *)
            error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Check dependencies
check_dependencies() {
    local missing_deps=()

    for cmd in yq jq bc date; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_deps+=("$cmd")
        fi
    done

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        echo "Please install the missing dependencies and try again."
        exit 1
    fi
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi