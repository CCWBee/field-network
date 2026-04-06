#!/bin/bash
# =============================================================================
# Security Scan Script for Field Network
# =============================================================================
#
# Runs multiple security scans to identify vulnerabilities:
# - npm audit (dependency vulnerabilities)
# - Secret detection (prevent credential leaks)
# - OWASP dependency check (optional, requires Java)
# - License compliance check
#
# Usage:
#   ./scripts/security-scan.sh           # Run all scans
#   ./scripts/security-scan.sh --quick   # Quick scan (npm audit only)
#   ./scripts/security-scan.sh --ci      # CI mode (fail on issues)
#
# Exit codes:
#   0 - All scans passed
#   1 - Critical/High vulnerabilities found
#   2 - Medium vulnerabilities found (warning only in non-CI mode)
#   3 - Scan error
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Configuration
CI_MODE=false
QUICK_MODE=false
EXIT_CODE=0

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --ci) CI_MODE=true ;;
        --quick) QUICK_MODE=true ;;
        *) echo "Unknown parameter: $1"; exit 3 ;;
    esac
    shift
done

echo "=============================================="
echo "Field Network Security Scan"
echo "=============================================="
echo ""
echo "Mode: $([ "$CI_MODE" = true ] && echo "CI" || echo "Interactive")"
echo "Quick: $([ "$QUICK_MODE" = true ] && echo "Yes" || echo "No")"
echo ""

# -----------------------------------------------------------------------------
# 1. NPM Audit - Check for known vulnerabilities in dependencies
# -----------------------------------------------------------------------------
echo "=============================================="
echo "1. NPM Audit (Dependency Vulnerabilities)"
echo "=============================================="

# Run npm audit and capture output
set +e
AUDIT_OUTPUT=$(npm audit --json 2>/dev/null)
AUDIT_EXIT=$?
set -e

# Parse audit results
CRITICAL=$(echo "$AUDIT_OUTPUT" | grep -o '"critical":[0-9]*' | head -1 | cut -d: -f2 || echo "0")
HIGH=$(echo "$AUDIT_OUTPUT" | grep -o '"high":[0-9]*' | head -1 | cut -d: -f2 || echo "0")
MODERATE=$(echo "$AUDIT_OUTPUT" | grep -o '"moderate":[0-9]*' | head -1 | cut -d: -f2 || echo "0")
LOW=$(echo "$AUDIT_OUTPUT" | grep -o '"low":[0-9]*' | head -1 | cut -d: -f2 || echo "0")

# Default to 0 if parsing failed
CRITICAL=${CRITICAL:-0}
HIGH=${HIGH:-0}
MODERATE=${MODERATE:-0}
LOW=${LOW:-0}

echo ""
echo "Results:"
echo "  Critical: $CRITICAL"
echo "  High:     $HIGH"
echo "  Moderate: $MODERATE"
echo "  Low:      $LOW"
echo ""

if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
    echo -e "${RED}[FAIL] Critical/High vulnerabilities found!${NC}"
    echo ""
    echo "Run 'npm audit' for details and 'npm audit fix' to auto-fix"
    EXIT_CODE=1
elif [ "$MODERATE" -gt 0 ]; then
    echo -e "${YELLOW}[WARN] Moderate vulnerabilities found${NC}"
    if [ "$CI_MODE" = true ]; then
        EXIT_CODE=2
    fi
else
    echo -e "${GREEN}[PASS] No high/critical vulnerabilities${NC}"
fi

echo ""

# Exit early in quick mode
if [ "$QUICK_MODE" = true ]; then
    echo "Quick mode - skipping additional scans"
    exit $EXIT_CODE
fi

# -----------------------------------------------------------------------------
# 2. Secret Detection - Check for accidentally committed secrets
# -----------------------------------------------------------------------------
echo "=============================================="
echo "2. Secret Detection"
echo "=============================================="

# Patterns to detect
PATTERNS=(
    "PRIVATE_KEY.*=.*0x[a-fA-F0-9]{64}"
    "JWT_SECRET.*=.*[a-zA-Z0-9]{32,}"
    "password.*=.*['\"][^'\"]{8,}['\"]"
    "api[_-]?key.*=.*[a-zA-Z0-9]{20,}"
    "secret.*=.*[a-zA-Z0-9]{20,}"
    "AWS_SECRET_ACCESS_KEY"
    "BEGIN RSA PRIVATE KEY"
    "BEGIN OPENSSH PRIVATE KEY"
)

SECRETS_FOUND=0

echo ""
echo "Scanning for secrets in source code..."
echo ""

for pattern in "${PATTERNS[@]}"; do
    # Search in source files, excluding node_modules, .git, and this script
    MATCHES=$(grep -rin "$pattern" \
        --include="*.ts" \
        --include="*.js" \
        --include="*.json" \
        --include="*.env*" \
        --exclude-dir=node_modules \
        --exclude-dir=.git \
        --exclude="security-scan.sh" \
        . 2>/dev/null | grep -v "example" | grep -v ".example" | grep -v "process.env" || true)

    if [ -n "$MATCHES" ]; then
        echo -e "${RED}Potential secret found matching: $pattern${NC}"
        echo "$MATCHES"
        echo ""
        SECRETS_FOUND=$((SECRETS_FOUND + 1))
    fi
done

if [ "$SECRETS_FOUND" -gt 0 ]; then
    echo -e "${RED}[FAIL] $SECRETS_FOUND potential secret pattern(s) found!${NC}"
    echo "Review the matches above. If they are false positives, consider:"
    echo "  - Moving secrets to environment variables"
    echo "  - Adding .env files to .gitignore"
    echo "  - Using a secrets manager"
    EXIT_CODE=1
else
    echo -e "${GREEN}[PASS] No obvious secrets detected${NC}"
fi

echo ""

# -----------------------------------------------------------------------------
# 3. Sensitive File Check
# -----------------------------------------------------------------------------
echo "=============================================="
echo "3. Sensitive File Check"
echo "=============================================="

SENSITIVE_FILES=(
    ".env"
    ".env.local"
    ".env.production"
    "credentials.json"
    "serviceAccount.json"
    "*.pem"
    "*.key"
    "id_rsa"
    "id_ed25519"
)

SENSITIVE_FOUND=0

echo ""
echo "Checking for sensitive files that shouldn't be committed..."
echo ""

for pattern in "${SENSITIVE_FILES[@]}"; do
    # Check if files matching pattern exist and are tracked by git
    TRACKED=$(git ls-files "$pattern" 2>/dev/null || true)
    if [ -n "$TRACKED" ]; then
        echo -e "${RED}Sensitive file tracked by git: $TRACKED${NC}"
        SENSITIVE_FOUND=$((SENSITIVE_FOUND + 1))
    fi
done

if [ "$SENSITIVE_FOUND" -gt 0 ]; then
    echo -e "${RED}[FAIL] $SENSITIVE_FOUND sensitive file(s) tracked by git!${NC}"
    echo "Add these to .gitignore and remove from tracking:"
    echo "  git rm --cached <filename>"
    EXIT_CODE=1
else
    echo -e "${GREEN}[PASS] No sensitive files tracked${NC}"
fi

echo ""

# -----------------------------------------------------------------------------
# 4. Outdated Dependencies Check
# -----------------------------------------------------------------------------
echo "=============================================="
echo "4. Outdated Dependencies"
echo "=============================================="

echo ""
echo "Checking for outdated packages..."
echo ""

# Get outdated count
OUTDATED=$(npm outdated --json 2>/dev/null || echo "{}")
OUTDATED_COUNT=$(echo "$OUTDATED" | grep -c '"current"' || echo "0")

if [ "$OUTDATED_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[WARN] $OUTDATED_COUNT outdated package(s) found${NC}"
    echo ""
    echo "Run 'npm outdated' for details"
    echo ""
    # Not a failure, just a warning
else
    echo -e "${GREEN}[PASS] All packages up to date${NC}"
fi

echo ""

# -----------------------------------------------------------------------------
# 5. License Compliance
# -----------------------------------------------------------------------------
echo "=============================================="
echo "5. License Compliance"
echo "=============================================="

echo ""
echo "Checking for problematic licenses..."
echo ""

# Check for GPL/LGPL licenses which may require source disclosure
# This is a simplified check - consider using license-checker for production
PROBLEMATIC_LICENSES=("GPL" "LGPL" "AGPL")
LICENSE_ISSUES=0

for license in "${PROBLEMATIC_LICENSES[@]}"; do
    # Check package.json files for license fields
    MATCHES=$(find . -name "package.json" -not -path "*/node_modules/*" -exec grep -l "\"license\":.*$license" {} \; 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
        echo -e "${YELLOW}Found $license license in: $MATCHES${NC}"
        LICENSE_ISSUES=$((LICENSE_ISSUES + 1))
    fi
done

if [ "$LICENSE_ISSUES" -gt 0 ]; then
    echo -e "${YELLOW}[WARN] Copyleft licenses detected - review for compliance${NC}"
else
    echo -e "${GREEN}[PASS] No problematic licenses detected${NC}"
fi

echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo "=============================================="
echo "Security Scan Summary"
echo "=============================================="
echo ""

if [ "$EXIT_CODE" -eq 0 ]; then
    echo -e "${GREEN}All security checks passed!${NC}"
elif [ "$EXIT_CODE" -eq 2 ]; then
    echo -e "${YELLOW}Security scan completed with warnings${NC}"
    echo "Review the warnings above before deploying to production"
else
    echo -e "${RED}Security scan FAILED${NC}"
    echo "Fix the issues above before deploying"
fi

echo ""
echo "Recommendations:"
echo "  - Run 'npm audit fix' to auto-fix dependency issues"
echo "  - Review any flagged secrets and move to environment variables"
echo "  - Consider adding Snyk or similar to CI/CD pipeline"
echo "  - Schedule regular security scans (weekly recommended)"
echo ""

exit $EXIT_CODE
