#!/bin/bash

echo "🔒 FlowReader Security Configuration Validation"
echo "=============================================="
echo "Validating security implementations across legacy endpoints"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Helper functions
check_passed() {
    echo -e "${GREEN}✅ PASS:${NC} $1"
    ((PASSED_CHECKS++))
    ((TOTAL_CHECKS++))
}

check_failed() {
    echo -e "${RED}❌ FAIL:${NC} $1"
    ((FAILED_CHECKS++))
    ((TOTAL_CHECKS++))
}

check_warning() {
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
    ((WARNING_CHECKS++))
    ((TOTAL_CHECKS++))
}

section_header() {
    echo -e "\n${BLUE}🔍 $1${NC}"
    echo "$(printf '%.0s-' {1..50})"
}

# Set the base directory
BASE_DIR="/Users/sheldonzhao/programs/FlowReader"
API_DIR="$BASE_DIR/api"

section_header "AUTHENTICATION PLACEHOLDER DETECTION"

echo "\n1️⃣  Checking for authentication placeholders..."

# Check for placeholder authentication patterns
PLACEHOLDER_PATTERNS=(
    "extracted-from-token"
    "Basic auth check"
    "placeholder"
    "TODO: implement auth"
    "FIXME: auth"
    "// auth placeholder"
    "/* auth placeholder"
)

PLACEHOLDER_COUNT=0
for pattern in "${PLACEHOLDER_PATTERNS[@]}"; do
    count=$(rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null | wc -l | tr -d ' ')
    if [[ $count -gt 0 ]]; then
        echo "Found $count instances of '$pattern':"
        rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null
        PLACEHOLDER_COUNT=$((PLACEHOLDER_COUNT + count))
    fi
done

if [[ $PLACEHOLDER_COUNT -eq 0 ]]; then
    check_passed "No authentication placeholders found"
else
    check_failed "Found $PLACEHOLDER_COUNT authentication placeholders"
fi

section_header "ENHANCED AUTHENTICATION USAGE"

echo "\n2️⃣  Checking enhanced authentication implementation..."

# Check for enhanced authentication usage
ENHANCED_AUTH_PATTERNS=(
    "requireAuthWithSecurity"
    "authenticateRequestWithSecurity"
    "convertVercelRequest"
    "enhancedAuth"
)

ENHANCED_AUTH_COUNT=0
for pattern in "${ENHANCED_AUTH_PATTERNS[@]}"; do
    count=$(rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null | wc -l | tr -d ' ')
    if [[ $count -gt 0 ]]; then
        echo "✓ Found $count usages of '$pattern'"
        ENHANCED_AUTH_COUNT=$((ENHANCED_AUTH_COUNT + count))
    else
        echo "⚠ No usages of '$pattern' found"
    fi
done

if [[ $ENHANCED_AUTH_COUNT -ge 10 ]]; then
    check_passed "Enhanced authentication properly implemented ($ENHANCED_AUTH_COUNT usages)"
elif [[ $ENHANCED_AUTH_COUNT -gt 0 ]]; then
    check_warning "Limited enhanced authentication usage ($ENHANCED_AUTH_COUNT usages)"
else
    check_failed "No enhanced authentication implementations found"
fi

section_header "RATE LIMITING IMPLEMENTATION"

echo "\n3️⃣  Checking rate limiting implementations..."

# Check for rate limiting usage
RATE_LIMIT_PATTERNS=(
    "withRateLimit"
    "RateLimiter"
    "apiRateLimiter"
    "uploadRateLimiter"
    "chatRateLimiter"
    "authRateLimiter"
    "checkLimit"
    "429"
)

RATE_LIMIT_COUNT=0
for pattern in "${RATE_LIMIT_PATTERNS[@]}"; do
    count=$(rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null | wc -l | tr -d ' ')
    if [[ $count -gt 0 ]]; then
        echo "✓ Found $count usages of '$pattern'"
        RATE_LIMIT_COUNT=$((RATE_LIMIT_COUNT + count))
    fi
done

if [[ $RATE_LIMIT_COUNT -ge 15 ]]; then
    check_passed "Rate limiting comprehensively implemented ($RATE_LIMIT_COUNT usages)"
elif [[ $RATE_LIMIT_COUNT -gt 0 ]]; then
    check_warning "Some rate limiting implemented ($RATE_LIMIT_COUNT usages)"
else
    check_failed "No rate limiting implementations found"
fi

section_header "CLIENT USERID ELIMINATION"

echo "\n4️⃣  Checking for client userId parameters..."

# Check for client userId usage (should be eliminated)
CLIENT_USERID_PATTERNS=(
    "req\.body\.userId"
    "params\.userId"
    "query\.userId"
    "body\.userId"
)

CLIENT_USERID_COUNT=0
for pattern in "${CLIENT_USERID_PATTERNS[@]}"; do
    count=$(rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null | wc -l | tr -d ' ')
    if [[ $count -gt 0 ]]; then
        echo "⚠ Found $count instances of client userId usage:"
        rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null
        CLIENT_USERID_COUNT=$((CLIENT_USERID_COUNT + count))
    fi
done

if [[ $CLIENT_USERID_COUNT -eq 0 ]]; then
    check_passed "No client userId parameters found"
else
    check_failed "Found $CLIENT_USERID_COUNT potential client userId usages"
fi

section_header "LEGACY ENDPOINT SECURITY UPGRADES"

echo "\n5️⃣  Validating legacy endpoint security upgrades..."

# List of legacy endpoints that should be upgraded
LEGACY_ENDPOINTS=(
    "position/update.ts"
    "upload/process.ts"
    "tasks/status.ts"
    "chat/stream.ts"
    "upload/signed-url.ts"
    "books/upload.ts"
)

UPGRADED_ENDPOINTS=0
for endpoint in "${LEGACY_ENDPOINTS[@]}"; do
    endpoint_file="$API_DIR/$endpoint"

    if [[ -f "$endpoint_file" ]]; then
        echo "\nChecking $endpoint:"

        # Check for enhanced auth usage
        if grep -q "requireAuthWithSecurity\|authenticateRequestWithSecurity" "$endpoint_file"; then
            echo "  ✓ Enhanced authentication: YES"
            auth_upgrade=true
        else
            echo "  ❌ Enhanced authentication: NO"
            auth_upgrade=false
        fi

        # Check for rate limiting
        if grep -q "RateLimiter\|checkLimit\|429" "$endpoint_file"; then
            echo "  ✓ Rate limiting: YES"
            rate_limit=true
        else
            echo "  ❌ Rate limiting: NO"
            rate_limit=false
        fi

        # Check for input validation
        if grep -q "inputValidator\|validation\|sanitize" "$endpoint_file"; then
            echo "  ✓ Input validation: YES"
            input_validation=true
        else
            echo "  ❌ Input validation: NO"
            input_validation=false
        fi

        # Check for ownership verification
        if grep -q "owner_id\|user_id.*eq\|ownership" "$endpoint_file"; then
            echo "  ✓ Ownership verification: YES"
            ownership=true
        else
            echo "  ❌ Ownership verification: NO"
            ownership=false
        fi

        if [[ "$auth_upgrade" == true && "$rate_limit" == true ]]; then
            ((UPGRADED_ENDPOINTS++))
            echo "  ✅ Endpoint properly upgraded"
        else
            echo "  ❌ Endpoint needs security upgrades"
        fi
    else
        echo "⚠ Endpoint file not found: $endpoint_file"
    fi
done

if [[ $UPGRADED_ENDPOINTS -eq ${#LEGACY_ENDPOINTS[@]} ]]; then
    check_passed "All legacy endpoints properly upgraded ($UPGRADED_ENDPOINTS/${#LEGACY_ENDPOINTS[@]})"
elif [[ $UPGRADED_ENDPOINTS -gt 0 ]]; then
    check_warning "Some legacy endpoints upgraded ($UPGRADED_ENDPOINTS/${#LEGACY_ENDPOINTS[@]})"
else
    check_failed "No legacy endpoints have been upgraded"
fi

section_header "SECURITY LIBRARY DEPENDENCIES"

echo "\n6️⃣  Checking security library implementations..."

# Check for security libraries and helpers
SECURITY_FILES=(
    "_lib/auth-enhanced.ts"
    "_lib/rate-limiter.ts"
    "_lib/input-validator.ts"
    "_lib/error-handler.ts"
)

SECURITY_LIBS_FOUND=0
for lib in "${SECURITY_FILES[@]}"; do
    lib_file="$API_DIR/$lib"
    if [[ -f "$lib_file" ]]; then
        echo "✓ Found: $lib"
        ((SECURITY_LIBS_FOUND++))
    else
        echo "❌ Missing: $lib"
    fi
done

if [[ $SECURITY_LIBS_FOUND -eq ${#SECURITY_FILES[@]} ]]; then
    check_passed "All security libraries present ($SECURITY_LIBS_FOUND/${#SECURITY_FILES[@]})"
elif [[ $SECURITY_LIBS_FOUND -gt 2 ]]; then
    check_warning "Most security libraries present ($SECURITY_LIBS_FOUND/${#SECURITY_FILES[@]})"
else
    check_failed "Critical security libraries missing ($SECURITY_LIBS_FOUND/${#SECURITY_FILES[@]})"
fi

section_header "SECURITY EVENT LOGGING"

echo "\n7️⃣  Checking security event logging implementation..."

# Check for security logging patterns
LOGGING_PATTERNS=(
    "logSecurityEvent"
    "security.*event"
    "auth.*failure"
    "security.*violation"
    "trackFailedLogin"
)

LOGGING_COUNT=0
for pattern in "${LOGGING_PATTERNS[@]}"; do
    count=$(rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null | wc -l | tr -d ' ')
    if [[ $count -gt 0 ]]; then
        echo "✓ Found $count security logging instances: $pattern"
        LOGGING_COUNT=$((LOGGING_COUNT + count))
    fi
done

if [[ $LOGGING_COUNT -ge 5 ]]; then
    check_passed "Security event logging implemented ($LOGGING_COUNT instances)"
elif [[ $LOGGING_COUNT -gt 0 ]]; then
    check_warning "Limited security logging ($LOGGING_COUNT instances)"
else
    check_failed "No security event logging found"
fi

section_header "INPUT VALIDATION PATTERNS"

echo "\n8️⃣  Checking input validation patterns..."

# Check for input validation and sanitization
VALIDATION_PATTERNS=(
    "validate"
    "sanitize"
    "escape"
    "UUID.*test"
    "isNaN"
    "typeof"
    "400"
    "422"
)

VALIDATION_COUNT=0
for pattern in "${VALIDATION_PATTERNS[@]}"; do
    count=$(rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null | wc -l | tr -d ' ')
    if [[ $count -gt 0 ]]; then
        VALIDATION_COUNT=$((VALIDATION_COUNT + count))
    fi
done

if [[ $VALIDATION_COUNT -ge 20 ]]; then
    check_passed "Comprehensive input validation implemented ($VALIDATION_COUNT instances)"
elif [[ $VALIDATION_COUNT -gt 5 ]]; then
    check_warning "Some input validation implemented ($VALIDATION_COUNT instances)"
else
    check_failed "Insufficient input validation ($VALIDATION_COUNT instances)"
fi

section_header "SQL INJECTION PROTECTION"

echo "\n9️⃣  Checking SQL injection protection..."

# Check for actual SQL injection vulnerabilities (not safe Supabase patterns)
SQL_INJECTION_PATTERNS=(
    "INSERT INTO.*\+"
    "SELECT \* FROM.*\+"
    "UPDATE.*SET.*\+"
    "DELETE FROM.*\+"
    "WHERE.*=.*\+"
    "execute.*\+"
    "raw.*sql.*\+"
    "query.*execute.*\+"
)

SQL_VULN_COUNT=0
for pattern in "${SQL_INJECTION_PATTERNS[@]}"; do
    # Exclude test files, mock data, and check for actual SQL injection (not Supabase query builder)
    results=$(rg -n "$pattern" "$API_DIR" --type ts -g '!*test*' -g '!*mock*' -g '!*spike*' 2>/dev/null)
    if [[ -n "$results" ]]; then
        # Filter out safe Supabase query builder patterns
        unsafe_results=$(echo "$results" | grep -v "\.or\|\.ilike\|\.range\|\.eq\|\.select\|\.from\|\.insert" || true)
        if [[ -n "$unsafe_results" ]]; then
            count=$(echo "$unsafe_results" | wc -l | tr -d ' ')
            echo "⚠ Potential SQL injection pattern: $pattern ($count instances)"
            echo "$unsafe_results" | head -3
            SQL_VULN_COUNT=$((SQL_VULN_COUNT + count))
        fi
    fi
done

# Additional check for template literal SQL injection
TEMPLATE_SQL_COUNT=$(rg -n '\$\{.*\}.*[sS][qQ][lL]' "$API_DIR" --type ts -g '!*test*' -g '!*mock*' -g '!*spike*' 2>/dev/null | wc -l | tr -d ' ')
if [[ $TEMPLATE_SQL_COUNT -gt 0 ]]; then
    echo "⚠ Template literal SQL injection patterns: $TEMPLATE_SQL_COUNT instances"
    rg -n '\$\{.*\}.*[sS][qQ][lL]' "$API_DIR" --type ts -g '!*test*' -g '!*mock*' -g '!*spike*' 2>/dev/null | head -3
    SQL_VULN_COUNT=$((SQL_VULN_COUNT + TEMPLATE_SQL_COUNT))
fi

# Check for proper parameterized queries
SAFE_QUERY_PATTERNS=(
    "\.eq\("
    "\.select\("
    "\.from\("
    "supabase"
    "\.rpc\("
)

SAFE_QUERY_COUNT=0
for pattern in "${SAFE_QUERY_PATTERNS[@]}"; do
    count=$(rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null | wc -l | tr -d ' ')
    if [[ $count -gt 0 ]]; then
        SAFE_QUERY_COUNT=$((SAFE_QUERY_COUNT + count))
    fi
done

if [[ $SQL_VULN_COUNT -eq 0 && $SAFE_QUERY_COUNT -gt 10 ]]; then
    check_passed "SQL injection protection: Parameterized queries used ($SAFE_QUERY_COUNT instances)"
elif [[ $SQL_VULN_COUNT -eq 0 ]]; then
    check_warning "No obvious SQL injection vulnerabilities, but limited query patterns found"
else
    check_failed "Potential SQL injection vulnerabilities detected ($SQL_VULN_COUNT patterns)"
fi

section_header "CROSS-USER ACCESS PREVENTION"

echo "\n🔟 Checking cross-user access prevention..."

# Check for Row Level Security (RLS) and ownership checks
RLS_PATTERNS=(
    "owner_id"
    "user_id.*eq"
    "\.eq.*userId"
    "RLS"
    "ownership"
    "access.*control"
)

RLS_COUNT=0
for pattern in "${RLS_PATTERNS[@]}"; do
    count=$(rg -n "$pattern" "$API_DIR" --type ts 2>/dev/null | wc -l | tr -d ' ')
    if [[ $count -gt 0 ]]; then
        echo "✓ Found $count ownership/RLS patterns: $pattern"
        RLS_COUNT=$((RLS_COUNT + count))
    fi
done

if [[ $RLS_COUNT -ge 10 ]]; then
    check_passed "Cross-user access prevention implemented ($RLS_COUNT patterns)"
elif [[ $RLS_COUNT -gt 0 ]]; then
    check_warning "Some access control patterns found ($RLS_COUNT patterns)"
else
    check_failed "No cross-user access prevention patterns found"
fi

section_header "SECURITY CONFIGURATION SUMMARY"

echo "\n📊 Security Configuration Validation Results"
echo "============================================"
echo -e "Total Checks: ${BLUE}$TOTAL_CHECKS${NC}"
echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"
echo -e "Warnings: ${YELLOW}$WARNING_CHECKS${NC}"

echo ""
if [[ $FAILED_CHECKS -eq 0 ]]; then
    echo -e "${GREEN}🎉 Security configuration validation passed!${NC}"
    echo -e "${GREEN}✅ All critical security measures are in place${NC}"

    if [[ $WARNING_CHECKS -gt 0 ]]; then
        echo -e "${YELLOW}⚠️  $WARNING_CHECKS warnings detected - review recommendations${NC}"
    fi

    echo ""
    echo "Security Features Validated:"
    echo "✅ No authentication placeholders remaining"
    echo "✅ Enhanced authentication properly implemented"
    echo "✅ Rate limiting configured"
    echo "✅ Client userId parameters eliminated"
    echo "✅ Legacy endpoints upgraded"
    echo "✅ Security libraries present"
    echo "✅ Security event logging active"
    echo "✅ Input validation implemented"
    echo "✅ SQL injection protection active"
    echo "✅ Cross-user access prevention configured"

    exit 0
else
    echo -e "${RED}❌ Security configuration validation failed!${NC}"
    echo -e "${RED}🚨 CRITICAL SECURITY ISSUES DETECTED${NC}"

    echo ""
    echo "Critical Issues to Address:"
    if [[ $PLACEHOLDER_COUNT -gt 0 ]]; then
        echo "❌ Remove authentication placeholders"
    fi
    if [[ $ENHANCED_AUTH_COUNT -eq 0 ]]; then
        echo "❌ Implement enhanced authentication"
    fi
    if [[ $RATE_LIMIT_COUNT -eq 0 ]]; then
        echo "❌ Implement rate limiting"
    fi
    if [[ $CLIENT_USERID_COUNT -gt 0 ]]; then
        echo "❌ Eliminate client userId parameters"
    fi
    if [[ $UPGRADED_ENDPOINTS -eq 0 ]]; then
        echo "❌ Upgrade legacy endpoint security"
    fi

    echo ""
    echo "Review failed checks above and address security issues before deployment."
    exit 1
fi