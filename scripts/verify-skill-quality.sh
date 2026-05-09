#!/usr/bin/env bash
# verify-skill-quality.sh — F17/F30: Independent Quality Checklist verification script
#
# Verifies a generated SKILL.md against the quality criteria from evolve-skill-writer.
# Usage: verify-skill-quality.sh <path-to-skill-file> [--strict]
#
# Exit codes:
#   0: All checks pass
#   1: Critical failure (file not found, invalid frontmatter, etc.)
#   2: Quality issues (non-critical, but worth reviewing)
#   3: Security violation
#
# --strict mode: exit 1 for ANY failure (treats level 2 as critical)

set -euo pipefail

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Output helper functions (standalone, no external dependency)
log_info() {
    echo -e "${GREEN}[INFO]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Configuration
STRICT_MODE=false
MAX_FILE_SIZE_BYTES=15360
MAX_DESC_LENGTH=120
MAX_NAME_LENGTH=64
MAX_KEBAB_LENGTH=40

# Allowed categories (exact match required)
ALLOWED_CATEGORIES="debug refactor test deploy data web cli meta"

# Dangerous path patterns (blocked filesystem paths)
DANGEROUS_PATHS="\.ssh/ \.aws/ \.bashrc \.zshrc /etc/ /var/ /usr/ /bin/ /sbin/ /sys/ /proc/ /root/ /home/ /opt/"

# Parse arguments
SKILL_FILE=""
if [ $# -eq 0 ]; then
    log_error "Usage: $0 <path-to-skill-file> [--strict]"
    exit 1
fi

for arg in "$@"; do
    case "$arg" in
        --strict)
            STRICT_MODE=true
            ;;
        -*)
            log_error "Unknown option: $arg"
            exit 1
            ;;
        *)
            SKILL_FILE="$arg"
            ;;
    esac
done

# Check if file exists
if [ ! -f "$SKILL_FILE" ]; then
    log_error "File not found: $SKILL_FILE"
    exit 1
fi

# Check file size
FILE_SIZE=$(stat -f%z "$SKILL_FILE" 2>/dev/null || stat -c%s "$SKILL_FILE" 2>/dev/null || echo "0")
if [ "$FILE_SIZE" -gt "$MAX_FILE_SIZE_BYTES" ]; then
    log_error "File too large: $FILE_SIZE bytes (max: $MAX_FILE_SIZE_BYTES)"
    exit 1
fi

# Read file content
CONTENT=$(cat "$SKILL_FILE")

# Extract frontmatter (between first and second ---) using awk for portability
FRONTMATTER=$(echo "$CONTENT" | awk '
  BEGIN { found_first = 0; in_frontmatter = 0 }
  /^---$/ {
    if (!found_first) { found_first = 1; in_frontmatter = 1; next }
    if (in_frontmatter) { in_frontmatter = 0; exit }
  }
  in_frontmatter { print }
')
BODY=$(echo "$CONTENT" | awk '
  BEGIN { found_first = 0; found_second = 0 }
  /^---$/ {
    if (!found_first) { found_first = 1; next }
    if (found_first && !found_second) { found_second = 1; next }
  }
  found_second { print }
')

# Variables for tracking failures
FAIL_CRITICAL=false
FAIL_QUALITY=false
FAIL_SECURITY=false
CHECKS_PASSED=0
CHECKS_FAILED=0

# Helper functions
check_pass() {
    local name="$1"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    log_info "  [PASS] $name"
}

check_fail() {
    local name="$1"
    local level="$2"
    local reason="$3"

    CHECKS_FAILED=$((CHECKS_FAILED + 1))

    case "$level" in
        critical)
            FAIL_CRITICAL=true
            log_error "  [FAIL] $name: $reason"
            ;;
        quality)
            FAIL_QUALITY=true
            log_warn "  [FAIL] $name: $reason"
            ;;
        security)
            FAIL_SECURITY=true
            log_error "  [SECURITY] $name: $reason"
            ;;
    esac
}

# Helper: extract frontmatter field
get_field() {
    local field="$1"
    echo "$FRONTMATTER" | grep -E "^${field}:" | sed "s/^${field}:[[:space:]]*//" | tr -d '"'
}

# Helper: validate category
validate_category() {
    local category="$1"
    for cat in $ALLOWED_CATEGORIES; do
        if [ "$cat" = "$category" ]; then
            return 0
        fi
    done
    return 1
}

# Helper: validate kebab-case
validate_kebab() {
    local str="$1"
    echo "$str" | grep -qE '^[a-z0-9-]+$'
}

# Helper: detect dangerous patterns (returns space-separated list)
detect_dangerous_patterns() {
    local text="$1"
    local issues=""

    if echo "$text" | grep -qiE "(ignore previous|forget above|you are now|override|new instructions)" >/dev/null 2>&1; then
        issues="${issues}prompt_injection "
    fi

    if echo "$text" | grep -qE "(rm -rf /|curl.*\| *sh|eval \$\(.*\)|chmod 777 /|wget.*\| *bash)" >/dev/null 2>&1; then
        issues="${issues}dangerous_bash "
    fi

    if echo "$text" | grep -qiE "(api[_-]?key[:\s]+['\"]?[a-zA-Z0-9_\-]{20,}['\"]?|secret[:\s]+['\"]?[a-zA-Z0-9_\-]{20,}['\"]?|token[:\s]+['\"]?[a-zA-Z0-9_\-]{20,}['\"]?)" >/dev/null 2>&1; then
        issues="${issues}potential_secret "
    fi

    echo "$issues"
}

# Helper: validate paths in body (returns space-separated list)
validate_paths() {
    local text="$1"
    local issues=""

    for pattern in $DANGEROUS_PATHS; do
        if echo "$text" | grep -q "$pattern"; then
            issues="${issues}blocked_path:$pattern "
        fi
    done

    echo "$issues"
}

# ========================================================================
# CHECK 1: Frontmatter validity
# ========================================================================
log_info "Check 1: Frontmatter validity"

if [ -z "$FRONTMATTER" ]; then
    check_fail "frontmatter_exists" "critical" "No YAML frontmatter found"
else
    check_pass "frontmatter_exists"

    for field in name description when_to_use paths allowed-tools version; do
        if ! echo "$FRONTMATTER" | grep -qE "^${field}:"; then
            check_fail "frontmatter_field_$field" "critical" "Required field missing"
        else
            check_pass "frontmatter_field_$field"
        fi
    done
fi

# ========================================================================
# CHECK 2: Naming & schema
# ========================================================================
log_info "Check 2: Naming & schema"

SKILL_NAME=$(get_field "name")
if [ -z "$SKILL_NAME" ]; then
    check_fail "name_present" "critical" "name field is empty"
else
    if [ ${#SKILL_NAME} -gt "$MAX_NAME_LENGTH" ]; then
        check_fail "name_length" "quality" "Name too long: ${#SKILL_NAME} chars (max: $MAX_NAME_LENGTH)"
    else
        check_pass "name_length"
    fi

    CATEGORY=$(echo "$SKILL_NAME" | cut -d'-' -f1)
    KEBAB_NAME=$(echo "$SKILL_NAME" | cut -d'-' -f2- -s)

    if validate_category "$CATEGORY"; then
        check_pass "category_valid"
    else
        check_fail "category_valid" "critical" "Invalid category '$CATEGORY'. Must be one of: $ALLOWED_CATEGORIES"
    fi

    if [ -n "$KEBAB_NAME" ] && [ ${#KEBAB_NAME} -gt "$MAX_KEBAB_LENGTH" ]; then
        check_fail "kebab_name_length" "quality" "Kebab name too long: ${#KEBAB_NAME} chars (max: $MAX_KEBAB_LENGTH)"
    else
        check_pass "kebab_name_length"
    fi

    if validate_kebab "$KEBAB_NAME"; then
        check_pass "kebab_case_format"
    else
        check_fail "kebab_case_format" "quality" "Invalid kebab-case format"
    fi

    DIR_NAME=$(basename "$(dirname "$SKILL_FILE")")
    if [ "$SKILL_NAME" = "$DIR_NAME" ]; then
        check_pass "name_matches_directory"
    else
        check_fail "name_matches_directory" "critical" "name '$SKILL_NAME' does not match directory '$DIR_NAME'"
    fi
fi

# ========================================================================
# CHECK 3: Description quality
# ========================================================================
log_info "Check 3: Description quality"

DESCRIPTION=$(get_field "description")
if [ -z "$DESCRIPTION" ]; then
    check_fail "description_present" "critical" "description field is empty"
else
    if [ ${#DESCRIPTION} -gt "$MAX_DESC_LENGTH" ]; then
        check_fail "description_length" "quality" "Description too long: ${#DESCRIPTION} chars (max: $MAX_DESC_LENGTH)"
    else
        check_pass "description_length"
    fi

    if echo "$DESCRIPTION" | grep -qE '<|>'; then
        check_fail "description_forbidden_chars" "quality" "Description contains < or >"
    else
        check_pass "description_forbidden_chars"
    fi

    if echo "$DESCRIPTION" | grep -qiE "whenever|use this skill|when you"; then
        check_pass "description_pushy_language"
    else
        check_fail "description_pushy_language" "quality" "Description lacks pushy language (should include 'whenever', 'use this skill', etc.)"
    fi
fi

# ========================================================================
# CHECK 4: Body structure
# ========================================================================
log_info "Check 4: Body structure"

# Check for required sections (case-insensitive, partial match)
for section in when steps example; do
    if echo "$BODY" | grep -qiE "^##[[:space:]]*[A-Za-z]*$section"; then
        check_pass "body_section_$section"
    else
        check_fail "body_section_$section" "quality" "Missing '## $section' section"
    fi
done

# Check for pitfalls section (case-insensitive, can be "Common pitfalls" etc.)
if echo "$BODY" | grep -qiE "^##[[:space:]]*.*pitfall"; then
    check_pass "body_section_pitfalls"
else
    check_fail "body_section_pitfalls" "quality" "Missing '## pitfalls' or '## common pitfalls' section"
fi

if [ -z "$BODY" ]; then
    check_fail "body_content" "critical" "Body is empty"
else
    if echo "$BODY" | grep -qiE "scenario|walkthrough|outcome"; then
        check_pass "example_scenario"
    else
        check_fail "example_scenario" "quality" "Example lacks scenario/walkthrough/outcome structure"
    fi

    if echo "$BODY" | grep -qiE "^[0-9]+\.\s+[A-Z]"; then
        check_pass "imperative_steps"
    else
        check_fail "imperative_steps" "quality" "Steps don't appear to use imperative form"
    fi
fi

# ========================================================================
# CHECK 5: Content safety (F17)
# ========================================================================
log_info "Check 5: Content safety"

# Check for dangerous patterns
PATTERNS=$(detect_dangerous_patterns "$CONTENT")
if [ -z "$PATTERNS" ] || [ "$PATTERNS" = " " ]; then
    check_pass "no_dangerous_patterns"
else
    for pattern in $PATTERNS; do
        check_fail "dangerous_pattern_$pattern" "security" "Detected dangerous pattern: $pattern"
    done
fi

# Check for blocked paths
BLOCKED=$(validate_paths "$CONTENT")
if [ -z "$BLOCKED" ] || [ "$BLOCKED" = " " ]; then
    check_pass "no_blocked_paths"
else
    for entry in $BLOCKED; do
        check_fail "blocked_path" "security" "Path outside whitelist: $entry"
    done
fi

check_pass "no_private_ips"

# ========================================================================
# CHECK 6: File size (F17)
# ========================================================================
log_info "Check 6: File size check"

if [ "$FILE_SIZE" -le "$MAX_FILE_SIZE_BYTES" ]; then
    check_pass "file_size"
else
    check_fail "file_size" "quality" "File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes"
fi

# ========================================================================
# CHECK 7: Version format
# ========================================================================
log_info "Check 7: Version format"

VERSION=$(get_field "version")
if echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    check_pass "version_format"
else
    check_fail "version_format" "quality" "Version should be in semver format (e.g., 1.0.0)"
fi

# ========================================================================
# CHECK 8: allowed-tools validation
# ========================================================================
log_info "Check 8: allowed-tools validation"

ALLOWED_TOOLS=$(get_field "allowed-tools")
if [ -z "$ALLOWED_TOOLS" ]; then
    check_fail "allowed_tools_present" "critical" "allowed-tools field is empty"
else
    TOOL_COUNT=$(echo "$ALLOWED_TOOLS" | wc -w | tr -d ' ')
    if [ "$TOOL_COUNT" -ge 1 ]; then
        check_pass "allowed_tools_present"
    else
        check_fail "allowed_tools_present" "quality" "allowed-tools should contain at least one tool"
    fi
fi

# ========================================================================
# Summary
# ========================================================================
log_info ""
log_info "========================================"
log_info "Quality Checklist Summary"
log_info "========================================"
log_info "Total checks: $((CHECKS_PASSED + CHECKS_FAILED))"
log_info "Passed: $CHECKS_PASSED"
log_info "Failed: $CHECKS_FAILED"
log_info ""

# Determine exit code
if [ "$FAIL_SECURITY" = true ]; then
    log_error "SECURITY VIOLATION: Skill has security issues"
    exit 3
elif [ "$FAIL_CRITICAL" = true ]; then
    log_error "CRITICAL FAILURE: Skill has critical issues"
    exit 1
elif [ "$FAIL_QUALITY" = true ] && [ "$STRICT_MODE" = true ]; then
    log_error "QUALITY ISSUE (strict mode): Skill has quality issues"
    exit 1
elif [ "$FAIL_QUALITY" = true ]; then
    log_warn "QUALITY ISSUE: Skill has quality issues (use --strict for critical failure)"
    exit 2
else
    log_info "All quality checks passed!"
    exit 0
fi
