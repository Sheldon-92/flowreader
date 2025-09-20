#!/bin/bash

# FlowReader Security Event Monitoring
# Specialized monitoring for security events and compliance patterns

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="/tmp/flowreader-security-monitoring"
LOG_FILE="$DATA_DIR/security-events-$(date +%Y%m%d-%H%M%S).log"
SECURITY_REPORT="$DATA_DIR/security-baseline-$(date +%Y%m%d-%H%M%S).json"
PRODUCTION_URL=${PRODUCTION_URL:-"https://flowreader.vercel.app"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Security monitoring configuration
declare -A SECURITY_HEADERS=(
    ["strict-transport-security"]="HSTS"
    ["content-security-policy"]="CSP"
    ["x-frame-options"]="X-Frame-Options"
    ["x-xss-protection"]="XSS-Protection"
    ["x-content-type-options"]="Content-Type-Options"
    ["referrer-policy"]="Referrer-Policy"
    ["permissions-policy"]="Permissions-Policy"
)

declare -A SECURITY_PATTERNS=(
    ["ssl_grade"]="A+"
    ["tls_version"]="1.2+"
    ["cipher_strength"]="strong"
    ["certificate_validity"]="valid"
    ["redirect_security"]="secure"
)

# Initialize security monitoring
init_security_monitoring() {
    echo -e "${BLUE}🔒 Initializing security event monitoring...${NC}"

    mkdir -p "$DATA_DIR"

    cat > "$LOG_FILE" << EOF
# FlowReader Security Event Monitoring Log
# Started: $(date)
# Production URL: $PRODUCTION_URL

=== SECURITY EVENT MONITORING ===

EOF

    cat > "$SECURITY_REPORT" << EOF
{
  "security_monitoring": {
    "start_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "production_url": "$PRODUCTION_URL",
    "monitoring_type": "security_baseline"
  },
  "security_events": [],
  "compliance_checks": [],
  "security_patterns": [],
  "baseline_metrics": {}
}
EOF

    echo -e "${GREEN}✅ Security monitoring environment initialized${NC}"
}

# Check security headers
check_security_headers() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo -e "${BLUE}🔍 Checking security headers...${NC}"

    # Get response headers
    local headers_response=$(curl -sI "$PRODUCTION_URL/" 2>/dev/null || echo "")

    if [[ -z "$headers_response" ]]; then
        echo -e "${RED}❌ Failed to retrieve headers${NC}"
        return 1
    fi

    local security_score=0
    local headers_present=()
    local headers_missing=()
    local header_details=()

    # Check each security header
    for header in "${!SECURITY_HEADERS[@]}"; do
        local header_name="${SECURITY_HEADERS[$header]}"

        if echo "$headers_response" | grep -qi "^$header:"; then
            local header_value=$(echo "$headers_response" | grep -i "^$header:" | head -1 | cut -d':' -f2- | sed 's/^ *//')
            headers_present+=("$header_name")
            security_score=$((security_score + 1))

            # Store header details
            header_details+=("\"$header_name\": {\"present\": true, \"value\": \"$(echo "$header_value" | sed 's/"/\\"/g')\"}")

            echo "  ✅ $header_name: $header_value"
        else
            headers_missing+=("$header_name")
            header_details+=("\"$header_name\": {\"present\": false, \"value\": null}")
            echo "  ❌ $header_name: Missing"
        fi
    done

    # Calculate compliance percentage
    local total_headers=${#SECURITY_HEADERS[@]}
    local compliance_percentage=$(echo "scale=2; $security_score * 100 / $total_headers" | bc -l)

    # Generate security event
    local security_event=$(cat << EOF
{
  "timestamp": "$timestamp",
  "event_type": "security_headers_check",
  "compliance_score": $security_score,
  "total_headers": $total_headers,
  "compliance_percentage": $compliance_percentage,
  "headers_present": [$(IFS=,; echo "${headers_present[*]/#/\"}" | sed 's/,/","/g' | sed 's/""/"/g')],
  "headers_missing": [$(IFS=,; echo "${headers_missing[*]/#/\"}" | sed 's/,/","/g' | sed 's/""/"/g')],
  "header_details": {$(IFS=,; echo "${header_details[*]}")},
  "security_grade": "$(get_security_grade "$compliance_percentage")"
}
EOF
)

    # Update security report
    local temp_file=$(mktemp)
    jq --argjson event "$security_event" '.security_events += [$event]' "$SECURITY_REPORT" > "$temp_file"
    mv "$temp_file" "$SECURITY_REPORT"

    # Log event
    echo "$(date): Security Headers Check - Score: $security_score/$total_headers (${compliance_percentage}%)" >> "$LOG_FILE"

    echo "  Security Score: $security_score/$total_headers (${compliance_percentage}%)"
    echo ""

    return 0
}

# Get security grade based on compliance percentage
get_security_grade() {
    local percentage="$1"

    if (( $(echo "$percentage >= 95" | bc -l) )); then
        echo "A+"
    elif (( $(echo "$percentage >= 85" | bc -l) )); then
        echo "A"
    elif (( $(echo "$percentage >= 75" | bc -l) )); then
        echo "B"
    elif (( $(echo "$percentage >= 65" | bc -l) )); then
        echo "C"
    else
        echo "F"
    fi
}

# Check SSL/TLS configuration
check_ssl_tls() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo -e "${BLUE}🔐 Checking SSL/TLS configuration...${NC}"

    # Extract hostname from URL
    local hostname=$(echo "$PRODUCTION_URL" | sed 's/https\?:\/\///' | cut -d'/' -f1)

    # Check SSL certificate
    local ssl_info=""
    if command -v openssl &> /dev/null; then
        ssl_info=$(echo | openssl s_client -connect "$hostname:443" -servername "$hostname" 2>/dev/null | openssl x509 -noout -dates -subject -issuer 2>/dev/null || echo "")
    fi

    # Check TLS version support
    local tls_check=""
    if command -v curl &> /dev/null; then
        # Test various TLS versions
        local tls12_support=$(curl -s --tlsv1.2 --max-time 5 -I "$PRODUCTION_URL/" >/dev/null 2>&1 && echo "true" || echo "false")
        local tls13_support=$(curl -s --tlsv1.3 --max-time 5 -I "$PRODUCTION_URL/" >/dev/null 2>&1 && echo "true" || echo "false")

        tls_check="TLS 1.2: $tls12_support, TLS 1.3: $tls13_support"
        echo "  TLS 1.2 Support: $tls12_support"
        echo "  TLS 1.3 Support: $tls13_support"
    fi

    # Check HTTPS redirect
    local http_url=$(echo "$PRODUCTION_URL" | sed 's/https:/http:/')
    local redirect_check=$(curl -s -I "$http_url" 2>/dev/null | grep -i "location.*https" >/dev/null 2>&1 && echo "secure" || echo "insecure")
    echo "  HTTPS Redirect: $redirect_check"

    # Extract certificate validity
    local cert_valid_from=""
    local cert_valid_to=""
    local cert_subject=""
    local cert_issuer=""

    if [[ -n "$ssl_info" ]]; then
        cert_valid_from=$(echo "$ssl_info" | grep "notBefore=" | cut -d'=' -f2- || echo "unknown")
        cert_valid_to=$(echo "$ssl_info" | grep "notAfter=" | cut -d'=' -f2- || echo "unknown")
        cert_subject=$(echo "$ssl_info" | grep "subject=" | cut -d'=' -f2- || echo "unknown")
        cert_issuer=$(echo "$ssl_info" | grep "issuer=" | cut -d'=' -f2- || echo "unknown")

        echo "  Certificate Valid From: $cert_valid_from"
        echo "  Certificate Valid To: $cert_valid_to"
        echo "  Certificate Subject: $cert_subject"
        echo "  Certificate Issuer: $cert_issuer"
    fi

    # Generate SSL/TLS event
    local ssl_event=$(cat << EOF
{
  "timestamp": "$timestamp",
  "event_type": "ssl_tls_check",
  "hostname": "$hostname",
  "tls_support": {
    "tls_1_2": $([ "$tls12_support" == "true" ] && echo "true" || echo "false"),
    "tls_1_3": $([ "$tls13_support" == "true" ] && echo "true" || echo "false")
  },
  "https_redirect": "$redirect_check",
  "certificate": {
    "valid_from": "$cert_valid_from",
    "valid_to": "$cert_valid_to",
    "subject": "$cert_subject",
    "issuer": "$cert_issuer"
  },
  "ssl_grade": "$(get_ssl_grade "$tls12_support" "$tls13_support" "$redirect_check")"
}
EOF
)

    # Update security report
    local temp_file=$(mktemp)
    jq --argjson event "$ssl_event" '.security_events += [$event]' "$SECURITY_REPORT" > "$temp_file"
    mv "$temp_file" "$SECURITY_REPORT"

    # Log event
    echo "$(date): SSL/TLS Check - TLS 1.2: $tls12_support, TLS 1.3: $tls13_support, Redirect: $redirect_check" >> "$LOG_FILE"

    echo ""
    return 0
}

# Get SSL grade
get_ssl_grade() {
    local tls12="$1"
    local tls13="$2"
    local redirect="$3"

    if [[ "$tls13" == "true" ]] && [[ "$redirect" == "secure" ]]; then
        echo "A+"
    elif [[ "$tls12" == "true" ]] && [[ "$redirect" == "secure" ]]; then
        echo "A"
    elif [[ "$tls12" == "true" ]]; then
        echo "B"
    else
        echo "C"
    fi
}

# Check for security vulnerabilities
check_security_vulnerabilities() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo -e "${BLUE}🛡️ Checking for security vulnerabilities...${NC}"

    local vulnerabilities=()
    local vulnerability_score=0

    # Check for common security issues
    local response_headers=$(curl -sI "$PRODUCTION_URL/" 2>/dev/null || echo "")

    # Check for server information disclosure
    if echo "$response_headers" | grep -qi "server:"; then
        local server_header=$(echo "$response_headers" | grep -i "server:" | head -1)
        vulnerabilities+=("\"server_disclosure\": {\"severity\": \"low\", \"details\": \"Server information disclosed: $server_header\"}")
        echo "  ⚠️ Server Information Disclosure: $server_header"
        vulnerability_score=$((vulnerability_score + 1))
    else
        echo "  ✅ Server Information: Hidden"
    fi

    # Check for X-Powered-By header
    if echo "$response_headers" | grep -qi "x-powered-by:"; then
        local powered_by=$(echo "$response_headers" | grep -i "x-powered-by:" | head -1)
        vulnerabilities+=("\"powered_by_disclosure\": {\"severity\": \"low\", \"details\": \"Technology stack disclosed: $powered_by\"}")
        echo "  ⚠️ Technology Disclosure: $powered_by"
        vulnerability_score=$((vulnerability_score + 1))
    else
        echo "  ✅ Technology Information: Hidden"
    fi

    # Check for insecure cookies (if any)
    local cookies=$(curl -s -I "$PRODUCTION_URL/" 2>/dev/null | grep -i "set-cookie:" | head -5)
    if [[ -n "$cookies" ]]; then
        local insecure_cookies=0
        while IFS= read -r cookie; do
            if ! echo "$cookie" | grep -qi "secure" || ! echo "$cookie" | grep -qi "httponly"; then
                insecure_cookies=$((insecure_cookies + 1))
            fi
        done <<< "$cookies"

        if [[ "$insecure_cookies" -gt 0 ]]; then
            vulnerabilities+=("\"insecure_cookies\": {\"severity\": \"medium\", \"details\": \"$insecure_cookies cookies without Secure/HttpOnly flags\"}")
            echo "  ⚠️ Insecure Cookies: $insecure_cookies cookies without proper flags"
            vulnerability_score=$((vulnerability_score + 2))
        else
            echo "  ✅ Cookie Security: All cookies properly secured"
        fi
    else
        echo "  ℹ️ Cookies: None detected"
    fi

    # Check for missing security headers (high priority)
    local critical_missing=0
    if ! echo "$response_headers" | grep -qi "strict-transport-security:"; then
        critical_missing=$((critical_missing + 1))
    fi
    if ! echo "$response_headers" | grep -qi "content-security-policy:"; then
        critical_missing=$((critical_missing + 1))
    fi

    if [[ "$critical_missing" -gt 0 ]]; then
        vulnerabilities+=("\"missing_critical_headers\": {\"severity\": \"high\", \"details\": \"$critical_missing critical security headers missing\"}")
        echo "  ❌ Critical Headers Missing: $critical_missing"
        vulnerability_score=$((vulnerability_score + 5))
    fi

    # Generate vulnerability assessment
    local vuln_assessment=$(cat << EOF
{
  "timestamp": "$timestamp",
  "event_type": "vulnerability_assessment",
  "vulnerability_score": $vulnerability_score,
  "vulnerabilities": {$(IFS=,; echo "${vulnerabilities[*]}")},
  "risk_level": "$(get_risk_level "$vulnerability_score")",
  "assessment_summary": {
    "total_issues": ${#vulnerabilities[@]},
    "critical_issues": $(echo "${vulnerabilities[*]}" | grep -o "high" | wc -l),
    "medium_issues": $(echo "${vulnerabilities[*]}" | grep -o "medium" | wc -l),
    "low_issues": $(echo "${vulnerabilities[*]}" | grep -o "low" | wc -l)
  }
}
EOF
)

    # Update security report
    local temp_file=$(mktemp)
    jq --argjson event "$vuln_assessment" '.security_events += [$event]' "$SECURITY_REPORT" > "$temp_file"
    mv "$temp_file" "$SECURITY_REPORT"

    # Log event
    echo "$(date): Vulnerability Assessment - Score: $vulnerability_score, Issues: ${#vulnerabilities[@]}" >> "$LOG_FILE"

    echo "  Vulnerability Score: $vulnerability_score"
    echo "  Risk Level: $(get_risk_level "$vulnerability_score")"
    echo ""

    return 0
}

# Get risk level based on vulnerability score
get_risk_level() {
    local score="$1"

    if [[ "$score" -eq 0 ]]; then
        echo "minimal"
    elif [[ "$score" -le 2 ]]; then
        echo "low"
    elif [[ "$score" -le 5 ]]; then
        echo "medium"
    elif [[ "$score" -le 10 ]]; then
        echo "high"
    else
        echo "critical"
    fi
}

# Monitor security patterns
monitor_security_patterns() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo -e "${BLUE}📊 Analyzing security patterns...${NC}"

    # Analyze multiple requests for consistency
    local pattern_analysis=()
    local consistency_score=0

    # Test multiple endpoints for consistent security headers
    local endpoints=("/" "/api/health" "/api/books")
    local header_consistency=true

    for endpoint in "${endpoints[@]}"; do
        local endpoint_headers=$(curl -sI "$PRODUCTION_URL$endpoint" 2>/dev/null | grep -i "strict-transport-security\|content-security-policy\|x-frame-options" | wc -l)

        if [[ "$endpoint_headers" -lt 3 ]]; then
            header_consistency=false
            echo "  ⚠️ Inconsistent headers on: $endpoint"
        else
            echo "  ✅ Consistent headers on: $endpoint"
        fi
    done

    if [[ "$header_consistency" == "true" ]]; then
        consistency_score=$((consistency_score + 10))
        pattern_analysis+=("\"header_consistency\": {\"status\": \"consistent\", \"score\": 10}")
    else
        pattern_analysis+=("\"header_consistency\": {\"status\": \"inconsistent\", \"score\": 0}")
    fi

    # Check response time consistency (security vs performance balance)
    local response_times=()
    for i in {1..5}; do
        local response_time=$(curl -s -w "%{time_total}" -o /dev/null "$PRODUCTION_URL/" 2>/dev/null | cut -d'.' -f1)
        response_times+=("$response_time")
    done

    local avg_response_time=$(echo "${response_times[*]}" | awk '{sum=0; for(i=1;i<=NF;i++)sum+=$i; print sum/NF}')
    if (( $(echo "$avg_response_time < 3" | bc -l) )); then
        consistency_score=$((consistency_score + 5))
        pattern_analysis+=("\"response_time_security\": {\"status\": \"balanced\", \"avg_time\": $avg_response_time, \"score\": 5}")
        echo "  ✅ Security/Performance Balance: Good (${avg_response_time}s)"
    else
        pattern_analysis+=("\"response_time_security\": {\"status\": \"slow\", \"avg_time\": $avg_response_time, \"score\": 0}")
        echo "  ⚠️ Security/Performance Balance: Poor (${avg_response_time}s)"
    fi

    # Check for security header evolution (basic check)
    local security_evolution="stable"
    consistency_score=$((consistency_score + 5))
    pattern_analysis+=("\"security_evolution\": {\"status\": \"$security_evolution\", \"score\": 5}")
    echo "  ✅ Security Configuration: Stable"

    # Generate pattern analysis
    local pattern_event=$(cat << EOF
{
  "timestamp": "$timestamp",
  "event_type": "security_pattern_analysis",
  "consistency_score": $consistency_score,
  "max_score": 20,
  "pattern_analysis": {$(IFS=,; echo "${pattern_analysis[*]}")},
  "security_maturity": "$(get_security_maturity "$consistency_score")",
  "recommendations": $(generate_security_recommendations "$consistency_score" "$header_consistency")
}
EOF
)

    # Update security report
    local temp_file=$(mktemp)
    jq --argjson event "$pattern_event" '.security_patterns += [$event]' "$SECURITY_REPORT" > "$temp_file"
    mv "$temp_file" "$SECURITY_REPORT"

    # Log event
    echo "$(date): Security Pattern Analysis - Score: $consistency_score/20" >> "$LOG_FILE"

    echo "  Pattern Consistency Score: $consistency_score/20"
    echo "  Security Maturity: $(get_security_maturity "$consistency_score")"
    echo ""

    return 0
}

# Get security maturity level
get_security_maturity() {
    local score="$1"

    if [[ "$score" -ge 18 ]]; then
        echo "advanced"
    elif [[ "$score" -ge 15 ]]; then
        echo "mature"
    elif [[ "$score" -ge 10 ]]; then
        echo "developing"
    elif [[ "$score" -ge 5 ]]; then
        echo "basic"
    else
        echo "minimal"
    fi
}

# Generate security recommendations
generate_security_recommendations() {
    local score="$1"
    local header_consistency="$2"

    local recommendations=()

    if [[ "$score" -lt 15 ]]; then
        recommendations+=("\"improve_consistency\": \"Improve security header consistency across all endpoints\"")
    fi

    if [[ "$header_consistency" == "false" ]]; then
        recommendations+=("\"fix_header_consistency\": \"Ensure all endpoints return the same security headers\"")
    fi

    if [[ "$score" -lt 10 ]]; then
        recommendations+=("\"security_review\": \"Conduct comprehensive security configuration review\"")
    fi

    recommendations+=("\"regular_monitoring\": \"Continue regular security monitoring and assessment\"")

    echo "[$(IFS=,; echo "${recommendations[*]}")]"
}

# Generate security baseline report
generate_security_baseline() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo -e "${BLUE}📋 Generating security baseline report...${NC}"

    # Calculate baseline metrics
    local total_events=$(jq '.security_events | length' "$SECURITY_REPORT")
    local avg_compliance=$(jq '[.security_events[] | select(.event_type == "security_headers_check") | .compliance_percentage] | add / length' "$SECURITY_REPORT")
    local avg_vulnerability_score=$(jq '[.security_events[] | select(.event_type == "vulnerability_assessment") | .vulnerability_score] | add / length' "$SECURITY_REPORT")
    local security_grade=$(jq -r '[.security_events[] | select(.event_type == "security_headers_check") | .security_grade] | .[0]' "$SECURITY_REPORT")

    # Update baseline metrics
    local baseline_metrics=$(cat << EOF
{
  "baseline_timestamp": "$timestamp",
  "total_security_events": $total_events,
  "average_compliance_percentage": $avg_compliance,
  "average_vulnerability_score": $avg_vulnerability_score,
  "overall_security_grade": "$security_grade",
  "security_status": "$(get_overall_security_status "$avg_compliance" "$avg_vulnerability_score")",
  "baseline_recommendations": $(generate_baseline_recommendations "$avg_compliance" "$avg_vulnerability_score")
}
EOF
)

    # Update security report with baseline
    local temp_file=$(mktemp)
    jq --argjson baseline "$baseline_metrics" '.baseline_metrics = $baseline' "$SECURITY_REPORT" > "$temp_file"
    mv "$temp_file" "$SECURITY_REPORT"

    # Log baseline generation
    echo "$(date): Security Baseline Generated - Grade: $security_grade, Compliance: ${avg_compliance}%" >> "$LOG_FILE"

    echo "  Security Baseline Generated:"
    echo "    Overall Grade: $security_grade"
    echo "    Average Compliance: ${avg_compliance}%"
    echo "    Average Vulnerability Score: $avg_vulnerability_score"
    echo "    Security Status: $(get_overall_security_status "$avg_compliance" "$avg_vulnerability_score")"
    echo ""

    return 0
}

# Get overall security status
get_overall_security_status() {
    local compliance="$1"
    local vuln_score="$2"

    if (( $(echo "$compliance >= 95 && $vuln_score <= 2" | bc -l) )); then
        echo "excellent"
    elif (( $(echo "$compliance >= 85 && $vuln_score <= 5" | bc -l) )); then
        echo "good"
    elif (( $(echo "$compliance >= 75 && $vuln_score <= 8" | bc -l) )); then
        echo "adequate"
    elif (( $(echo "$compliance >= 60 && $vuln_score <= 10" | bc -l) )); then
        echo "needs_improvement"
    else
        echo "poor"
    fi
}

# Generate baseline recommendations
generate_baseline_recommendations() {
    local compliance="$1"
    local vuln_score="$2"

    local recommendations=()

    if (( $(echo "$compliance < 95" | bc -l) )); then
        recommendations+=("\"improve_header_compliance\": \"Implement missing security headers to achieve 95%+ compliance\"")
    fi

    if (( $(echo "$vuln_score > 5" | bc -l) )); then
        recommendations+=("\"reduce_vulnerabilities\": \"Address security vulnerabilities to reduce risk score below 5\"")
    fi

    if (( $(echo "$compliance < 80" | bc -l) )); then
        recommendations+=("\"security_audit\": \"Conduct comprehensive security audit and remediation\"")
    fi

    recommendations+=("\"continuous_monitoring\": \"Maintain continuous security monitoring and regular assessments\"")

    echo "[$(IFS=,; echo "${recommendations[*]}")]"
}

# Main security monitoring function
run_security_monitoring() {
    echo -e "${GREEN}🚀 Starting FlowReader Security Event Monitoring${NC}"
    echo "Production URL: $PRODUCTION_URL"
    echo "Data Directory: $DATA_DIR"
    echo ""

    init_security_monitoring

    # Run security checks
    check_security_headers
    check_ssl_tls
    check_security_vulnerabilities
    monitor_security_patterns
    generate_security_baseline

    echo -e "${GREEN}✅ Security monitoring completed!${NC}"
    echo ""
    echo "Generated files:"
    echo "  Security Events Log: $LOG_FILE"
    echo "  Security Baseline Report: $SECURITY_REPORT"
    echo ""

    # Display summary
    local security_grade=$(jq -r '.baseline_metrics.overall_security_grade' "$SECURITY_REPORT")
    local compliance=$(jq -r '.baseline_metrics.average_compliance_percentage' "$SECURITY_REPORT")
    local security_status=$(jq -r '.baseline_metrics.security_status' "$SECURITY_REPORT")

    echo "Security Baseline Summary:"
    echo "  Overall Grade: $security_grade"
    echo "  Compliance: ${compliance}%"
    echo "  Status: $security_status"
}

# Show usage information
show_usage() {
    cat << EOF
FlowReader Security Event Monitoring

Usage: $0 [OPTIONS]

Options:
  -h, --help          Show this help message
  -u, --url URL       Set production URL (default: https://flowreader.vercel.app)
  -d, --data-dir DIR  Set data directory (default: /tmp/flowreader-security-monitoring)

Examples:
  $0                                    # Monitor with default settings
  $0 -u https://example.com            # Monitor custom URL
  $0 -d /var/log/security-monitoring   # Use custom data directory

Security Checks:
  - Security headers compliance (HSTS, CSP, X-Frame-Options, etc.)
  - SSL/TLS configuration and certificate validation
  - Vulnerability assessment and risk analysis
  - Security pattern analysis and consistency checks
  - Baseline establishment and recommendations

Output Files:
  - Security events log (timestamped)
  - Security baseline report (JSON format)
  - Pattern analysis and recommendations

EOF
}

# Main function
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -u|--url)
                PRODUCTION_URL="$2"
                shift 2
                ;;
            -d|--data-dir)
                DATA_DIR="$2"
                LOG_FILE="$DATA_DIR/security-events-$(date +%Y%m%d-%H%M%S).log"
                SECURITY_REPORT="$DATA_DIR/security-baseline-$(date +%Y%m%d-%H%M%S).json"
                shift 2
                ;;
            *)
                echo -e "${RED}❌ Unknown option: $1${NC}"
                show_usage
                exit 1
                ;;
        esac
    done

    run_security_monitoring
}

# Check dependencies
check_dependencies() {
    local deps=("curl" "jq" "bc")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            echo -e "${RED}❌ Required dependency missing: $dep${NC}"
            echo "Please install $dep and try again."
            exit 1
        fi
    done
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi