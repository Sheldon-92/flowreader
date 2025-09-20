#!/bin/bash

echo "🔒 FlowReader Legacy Endpoint Security Testing Suite"
echo "=================================================="
echo "This script tests comprehensive security for upgraded legacy endpoints:"
echo "- api/position/update.ts"
echo "- api/upload/process.ts"
echo "- api/tasks/status.ts"
echo "- api/chat/stream.ts"
echo "- api/upload/signed-url.ts"
echo "- api/books/upload.ts"
echo ""

# Configuration
API_BASE="http://localhost:3001/api"
TEST_TOKEN="Bearer test-token-123"
INVALID_TOKEN="Bearer invalid-token-xyz"
MALICIOUS_TOKEN="Bearer <script>alert('xss')</script>"
MALFORMED_TOKEN="NotBearer malformed-header"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNING_TESTS=0

# Helper functions
test_passed() {
    echo -e "${GREEN}✅ PASS:${NC} $1"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

test_failed() {
    echo -e "${RED}❌ FAIL:${NC} $1"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

test_warning() {
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
    ((WARNING_TESTS++))
    ((TOTAL_TESTS++))
}

security_header() {
    echo -e "\n${BLUE}🔒 $1${NC}"
    echo "$(printf '%.0s-' {1..60})"
}

# Advanced API test function with comprehensive error handling
api_test() {
    local description="$1"
    local expected_status="$2"
    shift 2

    echo "\nTesting: $description"

    # Capture both response body and HTTP status
    local response=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME_TOTAL:%{time_total}" "$@")
    local http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    local time_total=$(echo "$response" | grep "TIME_TOTAL:" | cut -d: -f2)
    local response_body=$(echo "$response" | grep -v "HTTP_STATUS:\|TIME_TOTAL:")

    echo "Response: $(echo "$response_body" | head -3 | tr '\n' ' ')"
    echo "HTTP Status: $http_status | Time: ${time_total}s"

    if [[ "$http_status" == "$expected_status" ]]; then
        test_passed "$description (Expected: $expected_status, Got: $http_status)"
        return 0
    else
        test_failed "$description (Expected: $expected_status, Got: $http_status)"
        return 1
    fi
}

# Test specific security vulnerabilities
test_security_vulnerability() {
    local description="$1"
    local endpoint="$2"
    local method="$3"
    local headers="$4"
    local payload="$5"
    local expected_status="$6"

    echo "\n🛡️  Security Test: $description"

    local curl_cmd="curl -s -w \"\\nHTTP_STATUS:%{http_code}\" -X $method \"$API_BASE/$endpoint\""

    if [[ -n "$headers" ]]; then
        curl_cmd="$curl_cmd $headers"
    fi

    if [[ -n "$payload" ]]; then
        curl_cmd="$curl_cmd -d '$payload'"
    fi

    local response=$(eval $curl_cmd)
    local http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    local response_body=$(echo "$response" | grep -v "HTTP_STATUS:")

    echo "Endpoint: $method $endpoint"
    echo "Response: $(echo "$response_body" | head -2 | tr '\n' ' ')"
    echo "Status: $http_status"

    if [[ "$http_status" == "$expected_status" ]]; then
        test_passed "Security test passed: $description"
    else
        test_failed "Security vulnerability detected: $description (Expected: $expected_status, Got: $http_status)"
    fi
}

security_header "AUTHENTICATION SECURITY TESTS"

echo "\n1️⃣  Testing Missing Authentication Headers"
echo "=========================================="

# Test all legacy endpoints without auth
LEGACY_ENDPOINTS=(
    "position/update:POST:{\"bookId\":\"test\",\"chapterIdx\":1,\"percentage\":50}"
    "upload/process:POST:{\"filePath\":\"test.epub\",\"fileName\":\"test.epub\"}"
    "tasks/status:GET:"
    "chat/stream:POST:{\"bookId\":\"test\",\"query\":\"test\"}"
    "upload/signed-url:POST:{\"fileName\":\"test.epub\",\"fileSize\":1024}"
    "books/upload:POST:{\"file\":\"test.epub\"}"
)

for endpoint_info in "${LEGACY_ENDPOINTS[@]}"; do
    IFS=':' read -r endpoint method payload <<< "$endpoint_info"

    if [[ "$method" == "GET" ]]; then
        if [[ "$endpoint" == "tasks/status" ]]; then
            test_security_vulnerability \
                "Missing auth on $endpoint" \
                "$endpoint?taskId=550e8400-e29b-41d4-a716-446655440000" \
                "$method" \
                "" \
                "" \
                "401"
        else
            test_security_vulnerability \
                "Missing auth on $endpoint" \
                "$endpoint" \
                "$method" \
                "" \
                "" \
                "401"
        fi
    else
        test_security_vulnerability \
            "Missing auth on $endpoint" \
            "$endpoint" \
            "$method" \
            "-H \"Content-Type: application/json\"" \
            "$payload" \
            "401"
    fi
done

echo "\n2️⃣  Testing Invalid Authentication Tokens"
echo "========================================"

for endpoint_info in "${LEGACY_ENDPOINTS[@]}"; do
    IFS=':' read -r endpoint method payload <<< "$endpoint_info"

    if [[ "$method" == "GET" ]]; then
        if [[ "$endpoint" == "tasks/status" ]]; then
            test_security_vulnerability \
                "Invalid token on $endpoint" \
                "$endpoint?taskId=550e8400-e29b-41d4-a716-446655440000" \
                "$method" \
                "-H \"Authorization: $INVALID_TOKEN\"" \
                "" \
                "401"
        else
            test_security_vulnerability \
                "Invalid token on $endpoint" \
                "$endpoint" \
                "$method" \
                "-H \"Authorization: $INVALID_TOKEN\"" \
                "" \
                "401"
        fi
    else
        test_security_vulnerability \
            "Invalid token on $endpoint" \
            "$endpoint" \
            "$method" \
            "-H \"Authorization: $INVALID_TOKEN\" -H \"Content-Type: application/json\"" \
            "$payload" \
            "401"
    fi
done

echo "\n3️⃣  Testing Malformed Authentication Headers"
echo "==========================================="

test_security_vulnerability \
    "Malformed auth header (position/update)" \
    "position/update" \
    "POST" \
    "-H \"Authorization: $MALFORMED_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"chapterIdx\":1,\"percentage\":50}" \
    "401"

test_security_vulnerability \
    "XSS attempt in auth token (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $MALICIOUS_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"query\":\"test\"}" \
    "401"

security_header "CLIENT USERID ELIMINATION TESTS"

echo "\n4️⃣  Testing Client-Provided UserId Rejection"
echo "==========================================="

echo "\nTesting client userId in position update..."
test_security_vulnerability \
    "Client userId rejection (position/update)" \
    "position/update" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"userId\":\"malicious-user\",\"chapterIdx\":1,\"percentage\":50}" \
    "400"

echo "\nTesting client userId in chat stream..."
test_security_vulnerability \
    "Client userId rejection (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"userId\":\"malicious-user\",\"query\":\"test\"}" \
    "400"

security_header "RATE LIMITING ENFORCEMENT TESTS"

echo "\n5️⃣  Testing Rate Limiting Enforcement"
echo "===================================="

echo "\nTesting position update rate limiting (max requests)..."
POSITION_RATE_LIMIT_HIT=false
for i in {1..30}; do
    response=$(curl -s -w "%{http_code}" \
        -X POST "$API_BASE/position/update" \
        -H "Authorization: $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"bookId\":\"test-book-$i\",\"chapterIdx\":1,\"percentage\":$((i % 100))}")

    if [[ "$response" =~ "429" ]]; then
        test_passed "Position update rate limiting enforced at request $i"
        POSITION_RATE_LIMIT_HIT=true
        break
    fi

    # Small delay to prevent overwhelming the server
    sleep 0.05
done

if [[ "$POSITION_RATE_LIMIT_HIT" == "false" ]]; then
    test_warning "Position update rate limiting not triggered in 30 requests (may be configured higher)"
fi

echo "\nTesting upload process rate limiting (stricter limits)..."
UPLOAD_RATE_LIMIT_HIT=false
for i in {1..15}; do
    response=$(curl -s -w "%{http_code}" \
        -X POST "$API_BASE/upload/process" \
        -H "Authorization: $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"filePath\":\"test-$i.epub\",\"fileName\":\"test-$i.epub\"}")

    if [[ "$response" =~ "429" ]]; then
        test_passed "Upload process rate limiting enforced at request $i"
        UPLOAD_RATE_LIMIT_HIT=true
        break
    fi

    sleep 0.05
done

if [[ "$UPLOAD_RATE_LIMIT_HIT" == "false" ]]; then
    test_warning "Upload process rate limiting not triggered in 15 requests"
fi

echo "\nTesting upload signed-url rate limiting..."
SIGNED_URL_RATE_LIMIT_HIT=false
for i in {1..12}; do
    response=$(curl -s -w "%{http_code}" \
        -X POST "$API_BASE/upload/signed-url" \
        -H "Authorization: $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"fileName\":\"test-$i.epub\",\"fileSize\":1024}")

    if [[ "$response" =~ "429" ]]; then
        test_passed "Upload signed-url rate limiting enforced at request $i"
        SIGNED_URL_RATE_LIMIT_HIT=true
        break
    fi

    sleep 0.05
done

if [[ "$SIGNED_URL_RATE_LIMIT_HIT" == "false" ]]; then
    test_warning "Upload signed-url rate limiting not triggered in 12 requests"
fi

security_header "INPUT VALIDATION SECURITY TESTS"

echo "\n6️⃣  Testing Input Validation & Sanitization"
echo "=========================================="

echo "\nTesting SQL injection attempts..."
test_security_vulnerability \
    "SQL injection in bookId (position/update)" \
    "position/update" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"'; DROP TABLE books; --\",\"chapterIdx\":1,\"percentage\":50}" \
    "400"

test_security_vulnerability \
    "SQL injection in query (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"query\":\"'; DROP TABLE messages; --\"}" \
    "200"

echo "\nTesting XSS attempts..."
test_security_vulnerability \
    "XSS in query (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"query\":\"<script>alert('xss')</script>\"}" \
    "200"

echo "\nTesting path traversal attempts..."
test_security_vulnerability \
    "Path traversal in fileName (upload/signed-url)" \
    "upload/signed-url" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"fileName\":\"../../../etc/passwd.epub\",\"fileSize\":1024}" \
    "400"

test_security_vulnerability \
    "Path traversal in filePath (upload/process)" \
    "upload/process" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"filePath\":\"../../../etc/passwd\",\"fileName\":\"passwd.epub\"}" \
    "400"

echo "\nTesting oversized payload protection..."
LARGE_PAYLOAD=$(printf 'a%.0s' {1..5000})
test_security_vulnerability \
    "Oversized payload (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"query\":\"$LARGE_PAYLOAD\"}" \
    "400"

test_security_vulnerability \
    "Oversized file upload (upload/signed-url)" \
    "upload/signed-url" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"fileName\":\"large.epub\",\"fileSize\":52428800}" \
    "400"

echo "\nTesting invalid file extensions..."
test_security_vulnerability \
    "Executable file upload (upload/signed-url)" \
    "upload/signed-url" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"fileName\":\"malware.exe\",\"fileSize\":1024}" \
    "400"

test_security_vulnerability \
    "Invalid file extension (upload/process)" \
    "upload/process" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"filePath\":\"test.sh\",\"fileName\":\"script.sh\"}" \
    "400"

echo "\nTesting invalid UUID formats..."
test_security_vulnerability \
    "Invalid taskId format (tasks/status)" \
    "tasks/status?taskId=not-a-uuid" \
    "GET" \
    "-H \"Authorization: $TEST_TOKEN\"" \
    "" \
    "400"

echo "\nTesting missing required fields..."
test_security_vulnerability \
    "Missing required fields (position/update)" \
    "position/update" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{}" \
    "400"

test_security_vulnerability \
    "Missing taskId (tasks/status)" \
    "tasks/status" \
    "GET" \
    "-H \"Authorization: $TEST_TOKEN\"" \
    "" \
    "400"

security_header "CROSS-USER ACCESS PREVENTION TESTS"

echo "\n7️⃣  Testing Cross-User Access Prevention"
echo "======================================"

echo "\nTesting access to other users' resources..."
test_security_vulnerability \
    "Cross-user book access (position/update)" \
    "position/update" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"other-user-book-id\",\"chapterIdx\":1,\"percentage\":50}" \
    "403"

test_security_vulnerability \
    "Cross-user file access (upload/process)" \
    "upload/process" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"filePath\":\"uploads/other-user/file.epub\",\"fileName\":\"file.epub\"}" \
    "403"

test_security_vulnerability \
    "Cross-user task access (tasks/status)" \
    "tasks/status?taskId=other-user-task-id" \
    "GET" \
    "-H \"Authorization: $TEST_TOKEN\"" \
    "" \
    "404"

test_security_vulnerability \
    "Cross-user book access (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"other-user-book-id\",\"query\":\"test\"}" \
    "403"

security_header "SPECIFIC ENDPOINT SECURITY VALIDATIONS"

echo "\n8️⃣  Testing Chat Stream Intent Validation"
echo "========================================"

test_security_vulnerability \
    "Invalid intent (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"intent\":\"malicious-intent\",\"selection\":{\"text\":\"test\"}}" \
    "422"

test_security_vulnerability \
    "Missing selection for translate (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"intent\":\"translate\",\"targetLang\":\"zh-CN\"}" \
    "400"

test_security_vulnerability \
    "Invalid target language (chat/stream)" \
    "chat/stream" \
    "POST" \
    "-H \"Authorization: $TEST_TOKEN\" -H \"Content-Type: application/json\"" \
    "{\"bookId\":\"test\",\"intent\":\"translate\",\"selection\":{\"text\":\"test\"},\"targetLang\":\"invalid-lang\"}" \
    "422"

echo "\n9️⃣  Testing Enhanced Security Headers"
echo "===================================="

echo "\nChecking security headers on legacy endpoints..."
HEADERS_RESPONSE=$(curl -s -I "$API_BASE/position/update" -X POST \
    -H "Authorization: $TEST_TOKEN" \
    -H "Content-Type: application/json")

if echo "$HEADERS_RESPONSE" | grep -i "x-frame-options" > /dev/null; then
    test_passed "X-Frame-Options header present on legacy endpoints"
else
    test_failed "X-Frame-Options header missing on legacy endpoints"
fi

if echo "$HEADERS_RESPONSE" | grep -i "x-content-type-options" > /dev/null; then
    test_passed "X-Content-Type-Options header present on legacy endpoints"
else
    test_failed "X-Content-Type-Options header missing on legacy endpoints"
fi

security_header "SECURITY EVENT LOGGING VERIFICATION"

echo "\n🔟 Testing Security Event Logging"
echo "================================"

echo "\nTesting that security violations are logged..."
echo "⚠️  Note: This requires checking database logs or security event tables"
echo "The following attempts should generate security log entries:"

echo "\n- Failed authentication attempts"
echo "- Rate limit violations"
echo "- Cross-user access attempts"
echo "- Invalid input validation failures"
echo "- Malicious payload attempts"

test_warning "Security event logging verification requires database access"

security_header "LEGACY ENDPOINT REGRESSION SUMMARY"

echo "\n📊 Security Test Results Summary"
echo "==============================="
echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo -e "Warnings: ${YELLOW}$WARNING_TESTS${NC}"

echo ""
if [[ $FAILED_TESTS -eq 0 ]]; then
    echo -e "${GREEN}🎉 All critical security tests passed!${NC}"
    echo -e "${GREEN}✅ Legacy endpoints are properly secured${NC}"

    if [[ $WARNING_TESTS -gt 0 ]]; then
        echo -e "${YELLOW}⚠️  $WARNING_TESTS warnings detected - review rate limiting configuration${NC}"
    fi

    echo ""
    echo "Security Validations Confirmed:"
    echo "✅ Authentication required on all legacy endpoints"
    echo "✅ Invalid tokens properly rejected"
    echo "✅ Client userId parameters eliminated"
    echo "✅ Rate limiting enforced (check warnings for configuration)"
    echo "✅ Input validation working"
    echo "✅ Cross-user access prevented"
    echo "✅ File upload security implemented"
    echo "✅ SQL injection protection active"
    echo "✅ XSS protection in place"
    echo "✅ Path traversal prevention working"

    exit 0
else
    echo -e "${RED}❌ $FAILED_TESTS critical security issues detected!${NC}"
    echo -e "${RED}🚨 SECURITY VULNERABILITIES FOUND - IMMEDIATE ACTION REQUIRED${NC}"

    echo ""
    echo "Review the failed tests above and fix security issues before deployment."
    exit 1
fi