#!/bin/bash

# =============================================================================
# Pre-commit Environment Security Check
# =============================================================================
# 
# This script runs before each commit to prevent accidental exposure of
# sensitive environment variables and credentials.
# 
# Usage:
#   1. Make executable: chmod +x scripts/pre-commit-env-check.sh
#   2. Install as git hook: ln -sf ../../scripts/pre-commit-env-check.sh .git/hooks/pre-commit
#   3. Or run manually: ./scripts/pre-commit-env-check.sh
# 
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMP_DIR="/tmp/env-security-check-$$"
EXIT_CODE=0

# Create temporary directory
mkdir -p "$TEMP_DIR"

# Cleanup function
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo -e "${CYAN}${BOLD}🔒 Pre-commit Environment Security Check${NC}\n"

# =============================================================================
# Check for sensitive patterns in staged files
# =============================================================================

echo -e "${BLUE}🔍 Checking staged files for sensitive patterns...${NC}"

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
    echo -e "${YELLOW}⚠️  No staged files found${NC}"
    exit 0
fi

# Patterns that should never be committed
SENSITIVE_PATTERNS=(
    # API Keys and Secrets
    "sk_live_[a-zA-Z0-9]+"                    # Stripe live secret key
    "sk_test_[a-zA-Z0-9]+"                    # Stripe test secret key
    "rk_live_[a-zA-Z0-9]+"                    # Stripe restricted key
    "pk_live_[a-zA-Z0-9]+"                    # Stripe live publishable key (in wrong context)
    
    # Supabase secrets
    "eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+" # JWT tokens (but allow in examples)
    "supabase_[a-zA-Z0-9_]+"                  # Supabase service keys
    
    # Generic secrets
    "password\s*=\s*['\"][^'\"]{8,}['\"]"     # Passwords
    "secret\s*=\s*['\"][^'\"]{16,}['\"]"      # Secrets
    "private.*key\s*=\s*['\"][^'\"]+['\"]"    # Private keys
    "api.*key\s*=\s*['\"][^'\"]{20,}['\"]"    # API keys
    
    # Database URLs with credentials
    "postgres://[^:]+:[^@]+@"                 # PostgreSQL URLs with credentials
    "mysql://[^:]+:[^@]+@"                    # MySQL URLs with credentials
    
    # AWS credentials
    "AKIA[0-9A-Z]{16}"                        # AWS Access Key ID
    "aws_secret_access_key\s*=\s*['\"][^'\"]{40}['\"]" # AWS Secret Access Key
    
    # Other cloud provider keys
    "AIza[0-9A-Za-z_-]{35}"                   # Google API Key
    "ya29\.[0-9A-Za-z_-]+"                   # Google OAuth Access Token
    
    # Common weak patterns
    "password.*=.*(password|123456|admin|test)" # Weak passwords
)

# Files that are allowed to contain sensitive patterns (examples, documentation)
ALLOWED_FILES=(
    "\.example$"
    "\.md$"
    "\.txt$"
    "README"
    "CHANGELOG"
    "LICENSE"
    "/docs/"
    "/documentation/"
    "\.template$"
)

VIOLATIONS_FOUND=false

for file in $STAGED_FILES; do
    # Skip binary files
    if file "$PROJECT_ROOT/$file" | grep -q "binary"; then
        continue
    fi
    
    # Skip deleted files
    if [ ! -f "$PROJECT_ROOT/$file" ]; then
        continue
    fi
    
    # Check if file is in allowed list
    SKIP_FILE=false
    for allowed_pattern in "${ALLOWED_FILES[@]}"; do
        if echo "$file" | grep -qE "$allowed_pattern"; then
            SKIP_FILE=true
            break
        fi
    done
    
    if [ "$SKIP_FILE" = true ]; then
        echo -e "  ${YELLOW}⏭️  Skipping allowed file: $file${NC}"
        continue
    fi
    
    echo -e "  ${BLUE}🔍 Checking: $file${NC}"
    
    # Check each sensitive pattern
    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
        if grep -qE "$pattern" "$PROJECT_ROOT/$file"; then
            echo -e "  ${RED}❌ SENSITIVE PATTERN DETECTED in $file${NC}"
            echo -e "     ${RED}Pattern: $pattern${NC}"
            
            # Show the matching lines (with line numbers, but mask the actual values)
            grep -nE "$pattern" "$PROJECT_ROOT/$file" | while read -r line; do
                line_num=$(echo "$line" | cut -d: -f1)
                content=$(echo "$line" | cut -d: -f2- | sed 's/[a-zA-Z0-9_-]\{8,\}/***MASKED***/g')
                echo -e "     ${RED}Line $line_num: $content${NC}"
            done
            
            VIOLATIONS_FOUND=true
            EXIT_CODE=1
        fi
    done
done

if [ "$VIOLATIONS_FOUND" = false ]; then
    echo -e "  ${GREEN}✅ No sensitive patterns detected${NC}"
fi

echo ""

# =============================================================================
# Check environment files for security issues
# =============================================================================

echo -e "${BLUE}🔧 Checking environment files...${NC}"

# Check if .env.local is in .gitignore
if [ -f "$PROJECT_ROOT/.gitignore" ]; then
    if ! grep -q "\.env\.local" "$PROJECT_ROOT/.gitignore"; then
        echo -e "  ${YELLOW}⚠️  .env.local should be in .gitignore${NC}"
        EXIT_CODE=1
    else
        echo -e "  ${GREEN}✅ .env.local is properly ignored${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠️  .gitignore file not found${NC}"
fi

# Check if any .env files (except examples) are being committed
ENV_FILES_STAGED=$(echo "$STAGED_FILES" | grep -E "^\.env" | grep -v "example" || true)
if [ -n "$ENV_FILES_STAGED" ]; then
    echo -e "  ${RED}❌ Environment files should not be committed:${NC}"
    for env_file in $ENV_FILES_STAGED; do
        echo -e "     ${RED}$env_file${NC}"
    done
    EXIT_CODE=1
else
    echo -e "  ${GREEN}✅ No environment files being committed${NC}"
fi

echo ""

# =============================================================================
# Run environment health check
# =============================================================================

echo -e "${BLUE}🏥 Running environment health check...${NC}"

if [ -f "$SCRIPT_DIR/env-health-check.cjs" ]; then
    if node "$SCRIPT_DIR/env-health-check.cjs" > "$TEMP_DIR/health-check.log" 2>&1; then
        echo -e "  ${GREEN}✅ Environment health check passed${NC}"
    else
        echo -e "  ${RED}❌ Environment health check failed${NC}"
        echo -e "  ${YELLOW}Health check output:${NC}"
        cat "$TEMP_DIR/health-check.log" | head -20
        if [ $(wc -l < "$TEMP_DIR/health-check.log") -gt 20 ]; then
            echo -e "  ${YELLOW}... (output truncated, run 'npm run env:check' for full output)${NC}"
        fi
        EXIT_CODE=1
    fi
else
    echo -e "  ${YELLOW}⚠️  Environment health check script not found${NC}"
fi

echo ""

# =============================================================================
# Check for hardcoded localhost URLs in production files
# =============================================================================

echo -e "${BLUE}🌐 Checking for hardcoded localhost URLs...${NC}"

LOCALHOST_VIOLATIONS=false
for file in $STAGED_FILES; do
    if [ ! -f "$PROJECT_ROOT/$file" ]; then
        continue
    fi
    
    # Skip certain file types
    if echo "$file" | grep -qE "\.(md|txt|json|example)$"; then
        continue
    fi
    
    # Check for localhost URLs in non-development contexts
    if grep -qE "https?://localhost|127\.0\.0\.1" "$PROJECT_ROOT/$file"; then
        # Check if it's in a development context
        if ! grep -qE "(development|dev|test)" "$PROJECT_ROOT/$file"; then
            echo -e "  ${YELLOW}⚠️  Hardcoded localhost URL found in $file${NC}"
            LOCALHOST_VIOLATIONS=true
        fi
    fi
done

if [ "$LOCALHOST_VIOLATIONS" = false ]; then
    echo -e "  ${GREEN}✅ No hardcoded localhost URLs detected${NC}"
fi

echo ""

# =============================================================================
# Final results
# =============================================================================

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 Pre-commit security check passed!${NC}"
    echo -e "${GREEN}All staged files are safe to commit.${NC}"
else
    echo -e "${RED}${BOLD}🚨 Pre-commit security check failed!${NC}"
    echo -e "${RED}Please fix the issues above before committing.${NC}"
    echo ""
    echo -e "${YELLOW}Common fixes:${NC}"
    echo -e "  • Remove sensitive values and use environment variables instead"
    echo -e "  • Add .env.local to .gitignore"
    echo -e "  • Use placeholder values in example files"
    echo -e "  • Run 'npm run env:check' for detailed environment validation"
    echo ""
    echo -e "${YELLOW}To bypass this check (NOT RECOMMENDED):${NC}"
    echo -e "  git commit --no-verify"
fi

exit $EXIT_CODE