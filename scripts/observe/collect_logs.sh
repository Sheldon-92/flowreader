#!/bin/bash
set -euo pipefail

# FlowReader Log Collection Script
# Purpose: Aggregate local logs and recent GitHub issues for observation
# Usage: ./collect_logs.sh [LOG_DIR] [OUTPUT_FILE]
# Example: ./collect_logs.sh . logs_summary.txt

# Configuration
DEFAULT_LOG_DIR="."
DEFAULT_OUTPUT="flowreader_logs_$(date +%Y%m%d_%H%M%S).txt"
GITHUB_REPO="Sheldon-92/flowreader"
MAX_LOG_LINES=100
MAX_ISSUE_COUNT=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Help function
show_help() {
    cat << EOF
FlowReader Log Collection Helper
=================================
Aggregates local running logs and recent GitHub issues for observation.
Note: This script does NOT send data anywhere - output stays local.

Usage:
  $0 [LOG_DIR] [OUTPUT_FILE]

Arguments:
  LOG_DIR     - Directory to search for logs (default: current directory)
  OUTPUT_FILE - Output file name (default: flowreader_logs_TIMESTAMP.txt)

Examples:
  $0                           # Use defaults
  $0 /var/log                 # Custom log directory
  $0 . my_logs.txt            # Custom output file

Privacy Notice:
  - This script only collects local logs
  - No data is sent to external services
  - Please review and redact sensitive info before sharing

Log Sources Checked:
  - npm-debug.log / npm-error.log
  - *.log files in the specified directory
  - Terminal output if running (manual check)
  - GitHub issues (if gh CLI available)

EOF
    exit 0
}

# Parse arguments
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    show_help
fi

LOG_DIR="${1:-$DEFAULT_LOG_DIR}"
OUTPUT_FILE="${2:-$DEFAULT_OUTPUT}"

# Validate directory
if [[ ! -d "$LOG_DIR" ]]; then
    echo -e "${RED}Error: Directory '$LOG_DIR' does not exist${NC}"
    exit 1
fi

# Check for tools
HAS_GH=false
if command -v gh &> /dev/null; then
    HAS_GH=true
fi

# Start collection
echo -e "${BLUE}========================================"
echo "FlowReader Log Collection"
echo "========================================"
echo -e "${NC}"
echo "Log Directory: $LOG_DIR"
echo "Output File: $OUTPUT_FILE"
echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "----------------------------------------"

# Initialize output file
cat > "$OUTPUT_FILE" << EOF
=====================================
FlowReader Log Collection Report
=====================================
Generated: $(date '+%Y-%m-%d %H:%M:%S')
Version: v0.9-personal-ready
Log Directory: $LOG_DIR

Privacy Reminder:
- Review and redact API keys before sharing
- Remove any personal data or file contents
- Mask email addresses and usernames
=====================================

EOF

# Section 1: Error Summary
echo -e "\n${YELLOW}[1/5] Collecting error summary...${NC}"
cat >> "$OUTPUT_FILE" << EOF

SECTION 1: ERROR SUMMARY
========================

EOF

# Count different error types
ERROR_COUNT=0
if [[ -f "$LOG_DIR/npm-debug.log" ]] || [[ -f "$LOG_DIR/npm-error.log" ]]; then
    for log in npm-debug.log npm-error.log; do
        if [[ -f "$LOG_DIR/$log" ]]; then
            count=$(grep -c "ERROR\|ERR!\|FATAL" "$LOG_DIR/$log" 2>/dev/null || echo 0)
            ERROR_COUNT=$((ERROR_COUNT + count))
            echo "- $log: $count errors found" >> "$OUTPUT_FILE"
        fi
    done
fi

# Check all .log files
LOG_FILES=$(find "$LOG_DIR" -maxdepth 1 -name "*.log" -type f 2>/dev/null | head -20)
if [[ -n "$LOG_FILES" ]]; then
    while IFS= read -r logfile; do
        basename_log=$(basename "$logfile")
        count=$(grep -c "ERROR\|error\|Error\|FAIL\|fail" "$logfile" 2>/dev/null || echo 0)
        if [[ $count -gt 0 ]]; then
            ERROR_COUNT=$((ERROR_COUNT + count))
            echo "- $basename_log: $count error entries" >> "$OUTPUT_FILE"
        fi
    done <<< "$LOG_FILES"
fi

echo "Total Error Count: $ERROR_COUNT" >> "$OUTPUT_FILE"

# Section 2: Recent Errors
echo -e "${YELLOW}[2/5] Extracting recent errors...${NC}"
cat >> "$OUTPUT_FILE" << EOF

SECTION 2: RECENT ERROR SAMPLES
================================
(Last $MAX_LOG_LINES lines with errors)

EOF

# Collect recent errors from logs
TEMP_ERRORS=$(mktemp)
for logfile in $(find "$LOG_DIR" -maxdepth 1 -name "*.log" -type f 2>/dev/null); do
    grep -n "ERROR\|error\|Error\|FAIL\|fail" "$logfile" 2>/dev/null | \
        tail -$MAX_LOG_LINES | \
        sed "s/^/$(basename "$logfile"): /" >> "$TEMP_ERRORS" || true
done

if [[ -s "$TEMP_ERRORS" ]]; then
    tail -$MAX_LOG_LINES "$TEMP_ERRORS" >> "$OUTPUT_FILE"
else
    echo "No recent errors found in log files." >> "$OUTPUT_FILE"
fi
rm -f "$TEMP_ERRORS"

# Section 3: Performance Metrics
echo -e "${YELLOW}[3/5] Checking performance indicators...${NC}"
cat >> "$OUTPUT_FILE" << EOF

SECTION 3: PERFORMANCE INDICATORS
==================================

EOF

# Check for slow queries or timeouts
SLOW_COUNT=$(grep -c "slow\|timeout\|TIMEOUT\|took [0-9]\+ms" "$LOG_DIR"/*.log 2>/dev/null || echo 0)
echo "Slow query/timeout mentions: $SLOW_COUNT" >> "$OUTPUT_FILE"

# Memory-related issues
MEM_COUNT=$(grep -c "memory\|heap\|OOM\|ENOMEM" "$LOG_DIR"/*.log 2>/dev/null || echo 0)
echo "Memory-related mentions: $MEM_COUNT" >> "$OUTPUT_FILE"

# Connection issues
CONN_COUNT=$(grep -c "ECONNREFUSED\|ETIMEDOUT\|connection\sfailed" "$LOG_DIR"/*.log 2>/dev/null || echo 0)
echo "Connection issues: $CONN_COUNT" >> "$OUTPUT_FILE"

# Section 4: GitHub Issues
echo -e "${YELLOW}[4/5] Fetching GitHub issues...${NC}"
cat >> "$OUTPUT_FILE" << EOF

SECTION 4: RECENT GITHUB ISSUES
================================

EOF

if [[ "$HAS_GH" == true ]]; then
    # Try to get issues with gh CLI
    if gh issue list --repo "$GITHUB_REPO" --limit "$MAX_ISSUE_COUNT" 2>/dev/null; then
        gh issue list --repo "$GITHUB_REPO" --limit "$MAX_ISSUE_COUNT" \
            --json number,title,state,labels,createdAt \
            --template '{{range .}}#{{.number}} [{{.state}}] {{.title}} ({{.createdAt}}){{"\n"}}{{end}}' \
            >> "$OUTPUT_FILE" 2>/dev/null || {
                echo "Failed to fetch issues with gh CLI" >> "$OUTPUT_FILE"
            }
    else
        echo "GitHub CLI available but not authenticated." >> "$OUTPUT_FILE"
        echo "To fetch issues, run: gh auth login" >> "$OUTPUT_FILE"
    fi
else
    cat >> "$OUTPUT_FILE" << EOF
GitHub CLI (gh) not installed.
To view recent issues manually, visit:
https://github.com/$GITHUB_REPO/issues

To install gh CLI:
- macOS: brew install gh
- Linux: See https://github.com/cli/cli#installation
- Then run: gh auth login
EOF
fi

# Section 5: System Status
echo -e "${YELLOW}[5/5] Checking system status...${NC}"
cat >> "$OUTPUT_FILE" << EOF

SECTION 5: SYSTEM STATUS
========================

EOF

# Check if FlowReader is running
if pgrep -f "npm.*dev\|node.*flowreader" > /dev/null 2>&1; then
    echo "FlowReader Status: RUNNING" >> "$OUTPUT_FILE"

    # Get process info
    echo "" >> "$OUTPUT_FILE"
    echo "Process Information:" >> "$OUTPUT_FILE"
    ps aux | grep -E "npm.*dev|node.*flowreader" | grep -v grep | head -3 >> "$OUTPUT_FILE" 2>/dev/null || true
else
    echo "FlowReader Status: NOT RUNNING" >> "$OUTPUT_FILE"
fi

# Disk usage in current directory
echo "" >> "$OUTPUT_FILE"
echo "Disk Usage (current directory):" >> "$OUTPUT_FILE"
du -sh "$LOG_DIR" 2>/dev/null >> "$OUTPUT_FILE" || echo "Unable to determine" >> "$OUTPUT_FILE"

# Node.js version
echo "" >> "$OUTPUT_FILE"
echo "Node.js Version:" >> "$OUTPUT_FILE"
node --version 2>/dev/null >> "$OUTPUT_FILE" || echo "Node.js not found" >> "$OUTPUT_FILE"

# Port 5173 status
echo "" >> "$OUTPUT_FILE"
echo "Port 5173 Status:" >> "$OUTPUT_FILE"
if lsof -i :5173 > /dev/null 2>&1; then
    echo "Port 5173 is in use" >> "$OUTPUT_FILE"
else
    echo "Port 5173 is free" >> "$OUTPUT_FILE"
fi

# Finalize report
cat >> "$OUTPUT_FILE" << EOF

=====================================
END OF REPORT
=====================================
Collection completed: $(date '+%Y-%m-%d %H:%M:%S')

Next Steps:
1. Review this file for sensitive information
2. Redact any API keys, passwords, or personal data
3. Use relevant sections for troubleshooting
4. Share sanitized version if requesting help

Manual Checks Recommended:
- Browser console errors (F12 → Console)
- Network tab for failed requests
- Supabase dashboard logs (if using cloud)
- OpenAI API usage dashboard

For support, visit:
https://github.com/$GITHUB_REPO/issues
=====================================
EOF

# Summary
echo ""
echo -e "${GREEN}========================================"
echo "Collection Complete!"
echo "========================================"
echo -e "${NC}"
echo "Output saved to: $OUTPUT_FILE"
echo "File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""

# Summary statistics
echo "Summary:"
echo "- Total errors found: $ERROR_COUNT"
echo "- Log files analyzed: $(echo "$LOG_FILES" | wc -l)"
if [[ "$HAS_GH" == true ]]; then
    echo "- GitHub integration: Available"
else
    echo "- GitHub integration: Not available (install gh CLI)"
fi

echo ""
echo -e "${YELLOW}⚠ Privacy Reminder:${NC}"
echo "  Please review and redact sensitive information before sharing!"
echo ""
echo "To view the report:"
echo "  cat $OUTPUT_FILE | less"
echo ""
echo "========================================"

exit 0